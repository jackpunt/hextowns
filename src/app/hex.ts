import { C, F, RC, S, stime } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, MouseEvent, Point, Shape, Text } from "@thegraid/easeljs-module";
import { EwDir, H, HexDir, InfDir, NsDir } from "./hex-intfs";
import { Tile } from "./tile";
import { Meeple } from "./meeple";
import { PlayerColor, TP } from "./table-params";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip '
export type IHex = { Aname: string, row: number, col: number }

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS = { [key in InfDir]?: Hex }
type INF   = { [key in InfDir]?: number }
type DCR    = { [key in "dc" | "dr"]: number }  // Delta for Col & Row
type TopoEW = { [key in EwDir]: DCR }
type TopoNS = { [key in NsDir]: DCR }
type Topo = TopoEW | TopoNS

export type HSC = { hex: Hex, sc: PlayerColor, Aname: string }
export function newHSC(hex: Hex, sc: PlayerColor, Aname = hex.Aname) { return { Aname, hex, sc } }

/** to recognize this class in hexUnderPoint and obtain the contained Hex. */
class HexCont extends Container {
  // useCache = false;
  // override cache(x, y, w, h) {
  //   this.useCache && super.cache(x, y, w, h);
  // }
  // override updateCache() {
  //   this.useCache && super.updateCache()
  // }
  constructor(public hex: Hex2) {
    super()
  }
}

/** Base Hex, has no connection to graphics.
 * topological links to adjacent hex objects.
 *
 * each Hex may contain a Planet [and?] or a Ship.
 *
 * non-Planet Hex is unexplored or contains a AfHex.
 */
export class Hex {
  static capColor = H.capColor1 // dynamic set
  /** return indicated Hex from otherMap */
  static ofMap(ihex: IHex, otherMap: HexMap) {
    try {
      return (ihex.Aname === S_Skip) ? otherMap.skipHex
        : (ihex.Aname === S_Resign) ? otherMap.resignHex
          : otherMap[ihex.row][ihex.col]
    } catch (err) {
      console.warn(`ofMap failed:`, err, { ihex, otherMap }) // eg: otherMap is different (mh,nh)
      throw err
    }
  }
  static aname(row: number, col: number) {
    return (row >= 0) ? `Hex@[${row},${col}]` : col == -1 ? S_Skip : S_Resign
  }
  constructor(map: HexMap, row: number, col: number, name = Hex.aname(row, col)) {
    this.Aname = name
    this.map = map
    this.row = row
    this.col = col
    this.links = {}
  }
  /** (x,y): center of hex; (width,height) of hex; scaled by radius if supplied
   * @param radius [1] radius used in drawPolyStar(radius,,, H.dirRot[tiltDir])
   * @param nsAxis [true] suitable for nsTopo (long axis of hex is N/S)
   * @param row [this.row]
   * @param col [this.col]
   * @returns [x, y, w, h] of cell at [row, col]
   */
  xywh(radius = TP.hexRad, nsAxis = true, row = this.row, col = this.col) {
    if (nsAxis) { // tiltDir = 'NE'; tilt = 30-degrees; nsTOPO
      let h = 2 * radius, w = radius * H.sqrt3;  // h height of hexagon (long-vertical axis)
      let x = (col + Math.abs(row % 2) / 2) * w;
      let y = row * 1.5 * radius;   // dist between rows
      return [x, y, w, h]
    } else { // tiltdir == 'N'; tile = 0-degrees; ewTOPO
      let w = 2 * radius, h = radius * H.sqrt3 // radius * 1.732
      let x = (col) * 1.5 * radius;
      let y = (row + Math.abs(col % 2) / 2) * h;
      return [x, y, w, h]
    }
  }
  readonly Aname: string
  _tile: Tile; // Tile?
  get tile() { return this._tile; }
  set tile(tile: Tile) { this._tile = tile; }

  _meep: Meeple;     // Meeple?
  get meep() { return this._meep; }
  set meep(meep: Meeple) { this._meep = meep }

  get occupied() { return this.meep || this.tile }

  /** reduce to serializable IHex (removes map, inf, links, etc) */
  get iHex(): IHex { return { Aname: this.Aname, row: this.row, col: this.col } }
  /** [row,col] OR S_Resign OR S_Skip */
  get rcs(): string { return (this.row >= 0) ? `[${this.row},${this.col}]` : this.Aname.substring(4)}
  get rowsp() { return (this.row?.toString() || '-1').padStart(2) }
  get colsp() { return (this.col?.toString() || '-1').padStart(2) } // col== -1 ? S_Skip; -2 ? S_Resign
  // json(sc = this.ship?.player.color) { return `{"p":"${sc || 'u'}","r":${this.rowsp},"c":${this.colsp}}` }
  /** [row,col] OR S_Resign OR S_Skip */
  get rcsp(): string { return (this.row >= 0) ? `[${this.rowsp},${this.colsp}]` : this.Aname.substring(4).padEnd(7)}
  /** compute ONCE, *after* HexMap is populated with all the Hex! */
  get rc_linear(): number { return this._rcLinear || (this._rcLinear = this.map.rcLinear(this.row, this.col))}
  _rcLinear: number | undefined = undefined
  /** accessor so Hex2 can override-advise */
  _district: number | undefined // district ID
  get district() { return this._district }
  set district(d: number) {
    this._district = d
  }
  readonly map: HexMap;  // Note: this.parent == this.map.hexCont [cached]
  readonly row: number
  readonly col: number
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS = {}

  /** colorScheme(playerColor)@rcs */
  toString(sc = this.meep?.player.color) {
    return `${TP.colorScheme[sc]}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** hex.rcspString => COLOR@[ r, c] | 'COLOR@Skip   ' , 'COLOR@Resign ' */
  rcspString(sc = this.meep?.player.color) {
    return `${TP.colorScheme[sc]}@${this.rcsp}`
  }

  nextHex(ds: HexDir, ns: number = 1) {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds]) && ns-- > 0) { hex = nhex }
    return hex
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: InfDir): Hex {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex
  }
  /** distance between Hexes: adjacent = 1, based on row, col, sqrt3 */
  radialDist(hex: Hex): number {
    let unit = 1 / H.sqrt3 // so w = delta(col) = 1
    let [tx, ty] = this.xywh(unit), [hx, hy] = hex.xywh(unit)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy);
  }
}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex2 extends Hex {
  // cont holds hexShape(color), rcText, distText, capMark
  cont: HexCont = new HexCont(this) // Hex IS-A Hex0, HAS-A Container

  get x() { return this.cont.x}
  set x(v: number) { this.cont.x = v}
  get y() { return this.cont.y}
  set y(v: number) { this.cont.y = v}
  get scaleX() { return this.cont.scaleX}
  get scaleY() { return this.cont.scaleY}

  // if override set, then must override get!
  override get district() { return this._district }
  override set district(d: number) {
    this._district = d    // cannot use super.district = d [causes recursion, IIRC]
    this.distText.text = `${d}`
  }
  readonly radius: number;   // determines width & height
  hexShape: HexShape   // shown on this.cont: colored hexagon
  distColor: string // district color of hexShape (paintHexShape)
  distText: Text    // shown on this.cont
  rcText: Text      // shown on this.cont
  stoneIdText: Text     // shown on this.map.markCont

  override get tile() { return super.tile; }
  override set tile(tile: Tile) {
    let cont: Container = this.map.mapCont.tileCont
    // if (this.tile !== undefined) cont.removeChild(this.tile)
    super.tile = tile  // this._tile = tile
    if (tile !== undefined) {
      tile.x = this.x; tile.y = this.y;
      cont.addChild(tile)
      if (this.meep) cont.addChildAt(tile, cont.getChildIndex(this.meep))
    }
  }

  override get meep() { return super.meep; }
  override set meep(meep: Meeple) {
    let cont: Container = this.map.mapCont.tileCont
    //if (this.meep !== undefined) cont.removeChild(this.meep) // remove meep [from prior location]
    super.meep = meep // this._meep = meep    super.meep = meep
    if (meep !== undefined) {
      meep.x = this.x; meep.y = this.y;
      cont.addChild(meep)
      // then put tile under meep
      if (this.tile) cont.addChildAt(this.tile, cont.getChildIndex(meep) - 1)
    }
  }

  /** Hex2 cell with graphics; shown as a polyStar Shape of radius @ (XY=0,0) */
  constructor(map: HexMap, row: number, col: number, name?: string) {
    super(map, row, col, name);
    map.mapCont.hexCont.addChild(this.cont)
    this.radius = TP.hexRad;

    //if (row === undefined || col === undefined) return // args not supplied: nextHex
    let [x, y, w, h] = this.xywh(this.radius, undefined, this.row || 0, this.col || 0); // include margin space between hexes
    this.x += x
    this.y += y
    // initialize cache bounds:
    this.cont.setBounds(-w / 2, -h / 2, w, h)
    let b = this.cont.getBounds();
    this.cont.cache(b.x, b.y, b.width, b.height);

    this.setHexColor("grey")  // new Hex2: until setHexColor(by district)
    this.hexShape.name = this.Aname

    this.stoneIdText = new Text('', F.fontSpec(26))
    this.stoneIdText.textAlign = 'center'; this.stoneIdText.regY = -20

    let rc = `${row||''},${col||''}`, tdy = -25
    let rct = this.rcText = new Text(rc, F.fontSpec(26), 'white'); // radius/2 ?
    rct.textAlign = 'center'; rct.y = tdy // based on fontSize? & radius
    this.cont.addChild(rct)

    this.distText = new Text(``, F.fontSpec(20));
    this.distText.textAlign = 'center'; this.distText.y = tdy + 46 // yc + 26+20
    this.cont.addChild(this.distText)
    this.showText(true); // & this.cache()
  }

  /** set visibility of rcText & distText */
  showText(vis = !this.rcText.visible) {
    this.rcText.visible = this.distText.visible = vis
    this.cont.updateCache()
  }

  /** set hexShape using color: draw border and fill
   * @param color
   * @param district if supplied, set this.district
   */
  setHexColor(color: string, district?: number | undefined) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.distColor = color
    let hexShape = this.hexShape || new HexShape()
    hexShape.paint(color)
    if (hexShape !== this.hexShape) {
      this.cont.removeChild(this.hexShape)
      this.cont.addChildAt(hexShape, 0)
      this.cont.hitArea = hexShape
      this.hexShape = hexShape
      this.cont.updateCache()
    }
  }

  /** unit distance between Hexes: adjacent = 1; see also: radialDist */
  metricDist(hex: Hex): number {
    let [tx, ty] = this.xywh(1), [hx, hy] = hex.xywh(1)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy); // tw == H.sqrt3
  }
  /** location of corner between dir0 and dir1; in parent coordinates. */
  cornerPoint(dir0: HexDir, dir1: HexDir) {
    let d0 = H.dirRot[dir0], d1 = H.dirRot[dir1]
    let a2 = (d0 + d1) / 2, h = this.radius
    if (Math.abs(d0 - d1) > 180) a2 += 180
    let a = a2 * this.degToRadians
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
  readonly degToRadians = Math.PI/180;
  /** location of edge point in dir; in parent coordinates. */
  edgePoint(dir: HexDir) {
    let a = H.dirRot[dir] * this.degToRadians, h = this.radius * H.sqrt3 / 2
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
}

/**
 * The colored PaintableShape that fills a Hex.
 * @param radius in call to drawPolyStar()
 */
export class HexShape extends Shape {
  constructor(
    readonly radius = TP.hexRad,
    readonly tiltDir: HexDir = 'NE',
  ) {
    super()
  }

  /** draw a Hexagon 1/60th inside the given radius */
  paint(color: string) {
    let g = this.graphics.c(), tilt = H.dirRot[this.tiltDir];
    return g.f(color).dp(0, 0, Math.floor(this.radius * 59 / 60), 6, 0, tilt);
  }
}
export class MapCont extends Container {
  constructor() {
    super()
  }
  static cNames = ['hexCont', 'tileCont', 'markCont', 'pathCont0', 'pathCont1'];
  hexCont: Container     // hex shapes on bottom stats: addChild(dsText), parent.rotation
  tileCont: Container    // Tiles & Meeples on Hex2/HexMap.
  markCont: Container    // showMark over Stones new CapMark [localToLocal]
  pathCont0: Container   // ship paths on top
  pathCont1: Container   // ship paths on top
  pathConts: Container[]  // [pathCont0, pathCont1]
}

export interface HexM {
  readonly allStones: HSC[]       // all the Hex with a Stone/Color
  readonly district: Hex[][]      // all the Hex in a given district
  readonly mapCont: MapCont
  rcLinear(row: number, col: number): number
  forEachHex<K extends Hex>(fn: (hex: K) => void): void // stats forEachHex(incCounters(hex))
  //used by GamePlay:
  readonly skipHex: Hex
  readonly resignHex: Hex
  update(): void
  showMark(hex: Hex): void

}
/**
 * Collection of Hex *and* Graphics-Containers for Hex2
 * allStones: HSC[] and districts: Hex[]
 *
 * HexMap[row][col]: Hex or Hex2 elements.
 * If mapCont is set, then populate with Hex2
 *
 * (TP.mh X TP.nh) hexes in districts; allStones: HSC[]
 *
 * With a Mark and off-map: skipHex & resignHex
 *
 */
export class HexMap extends Array<Array<Hex>> implements HexM {
  // A color for each District:
  static readonly distColor = ["lightgrey","limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  /** Each occupied Hex, with the occupying PlayerColor  */
  readonly allStones: HSC[] = []                    // aka hexStones in Board (readonly when we stop remove/filter)
  readonly district: Array<Hex[]> = []
  readonly mapCont: MapCont = new MapCont()   // if using Hex2
  readonly skipHex: Hex;
  readonly resignHex: Hex;
  rcLinear(row: number, col: number): number { return col + row * (1 + (this.maxCol || 0) - (this.minCol||0)) }

  //
  //                         |
  //         2        .      |  1
  //            .            |
  //      .                  |
  //  -----------------------+
  //         sqrt3
  //
  //                         |
  //         1        .      |  .5
  //            .            |
  //      .                  |
  //  -----------------------+
  //         sqrt3/2
  //
  //                         |
  //      2/sqrt3     .      |  1 / sqrt3
  //            .            |
  //      .                  |
  //  -----------------------+
  //
  //         1
  //
  //                         |
  //      1/sqrt3     .      |  .5 / sqrt3
  //            .            |
  //      .                  |
  //  -----------------------+
  //         .5
  //
  //

  readonly radius = TP.hexRad
  /** height per row of cells with NS axis */
  get rowHeight() { return this.radius * 1.5 };
  /** height of hexagonal cell with NS axis */
  get cellHeight() { return this.radius * 2 }
  /** width per col of cells with NS axis */
  get colWidth() { return this.radius * H.sqrt3 }
  /** width of hexagonal cell with NS axis */
  get cellWidth() { return this.radius * H.sqrt3 }

  mark: DisplayObject | undefined                              // a cached DisplayObject, used by showMark
  private minCol: number | undefined = undefined               // Array.forEach does not look at negative indices!
  private maxCol: number | undefined = undefined               // used by rcLinear
  private minRow: number | undefined = undefined               // to find center
  private maxRow: number | undefined = undefined               // to find center

  readonly metaMap = Array<Array<Hex>>()           // hex0 (center Hex) of each MetaHex, has metaLinks to others.

  /** bounding box of HexMap: XYWH = {0, 0, w, h} */
  get wh() {
    let hexRect = this.mapCont.hexCont.getBounds()
    let wh = { width: hexRect.width + 2 * this.colWidth, height: hexRect.height + 2 * this.rowHeight }
    return wh
  }
  /** for contrast paint it black AND white, leave a hole in the middle unpainted. */
  makeMark(radius: number, radius0: number = 0) {
    let mark = new Shape(), cb = "rgba(0,0,0,.3)", cw="rgba(255,255,255,.3)"
    mark.mouseEnabled = false
    mark.graphics.f(cb).dp(0, 0, radius, 6, 0, 30)
    mark.graphics.f(cw).dp(0, 0, radius, 6, 0, 30)
    mark.cache(-radius, -radius, 2*radius, 2*radius)
    mark.graphics.c().f(C.BLACK).dc(0, 0, radius0)
    mark.updateCache("destination-out")
    return mark
  }

  /**
   * HexMap: TP.nRows X TP.nCols hexes.
   *
   * Basic map is non-GUI, addToMapCont uses Hex2 elements to enable GUI interaction.
   * @param addToMapCont use Hex2 for Hex, make Containers: hexCont, infCont, markCont, stoneCont
   */
  constructor(radius: number = TP.hexRad, addToMapCont = false) {
    super(); // Array<Array<Hex>>()
    this.radius = radius
    //this.height = radius * H.sqrt3
    //this.width = radius * 1.5
    this.skipHex = new Hex(this, -1, -1, S_Skip)
    this.resignHex = new Hex(this, -1, -2, S_Resign)
    if (addToMapCont) this.addToMapCont()
  }

  /** create/attach Graphical components for HexMap */
  addToMapCont(): this {
    this.mark = this.makeMark(this.radius, this.radius/2.5)
    let mapCont = this.mapCont
    MapCont.cNames.forEach(cname => {
      let cont = new Container()
      mapCont[cname] = cont
      cont[S.Aname] = cont.name = cname;
      mapCont.addChild(cont)
    })
    mapCont.pathConts = [mapCont.pathCont0, mapCont.pathCont1]
    return this
  }

  /** ...stage.update() */
  update() {
    this.mapCont.hexCont.updateCache()  // when toggleText: hexInspector
    this.mapCont.hexCont.parent?.stage.update()
  }

  /** to build this HexMap: create Hex (or Hex2) and link it to neighbors. */
  addHex(row: number, col: number, district: number ): Hex {
    // If we have an on-screen Container, then use Hex2: (addToCont *before* makeAllDistricts)
    let hex = !!this.mapCont.hexCont ? new Hex2(this, row, col) : new Hex(this, row, col)
    hex.district = district // and set Hex2.districtText
    if (this[row] === undefined) {  // create new row array
      this[row] = new Array<Hex>()
      if (this.minRow === undefined || row < this.minRow) this.minRow = row
      if (this.maxRow === undefined || row > this.maxRow) this.maxRow = row
    }
    if (this.minCol === undefined || col < this.minCol) this.minCol = col
    if (this.maxCol === undefined || col > this.maxCol) this.maxCol = col
    this[row][col] = hex   // addHex to this Array<Array<Hex>>
    this.link(hex)   // link to existing neighbors
    return hex
  }
  /** Array.forEach does not use negative indices: ASSERT [row,col] is non-negative (so 'of' works) */
  forEachHex<K extends Hex>(fn: (hex: K) => void) {
    // minRow generally [0 or 1] always <= 5, so not worth it
    //for (let ir = this.minRow || 0; ir < this.length; ir++) {
    for (let ir of this) {
      // beginning and end of this AND ir may be undefined
      if (ir !== undefined) for (let hex of ir) { hex !== undefined && fn(hex as K) }
    }
  }
  /** find first Hex matching the given predicate function */
  findHex<K extends Hex>(fn: (hex: K) => boolean): K {
    let found: K
    for (let ir of this) {
      if (ir === undefined) continue
      found = ir.find((hex: K) => hex && fn(hex)) as K
      if (found !== undefined) return found
    }
    return found // undefined
  }
  /** return array of results of mapping fn over each Hex */
  mapEachHex<K extends Hex,T>(fn: (hex: K) => T): T[] {
    let rv: T[] = []
    this.forEachHex<K>(hex => rv.push(fn(hex)))
    return rv
  }
  /** find all Hexes matching given predicate */
  filterEachHex<K extends Hex>(fn: (hex: K) => boolean): K[] {
    let rv: K[] = []
    this.forEachHex<K>(hex => fn(hex) && rv.push(hex))
    return rv
  }
  /** make this.mark visible above this Hex */
  showMark(hex?: Hex) {
    let mark = this.mark
    if (!hex || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      mark.visible = false
    } else if (hex instanceof Hex2) {
      mark.x = hex.x
      mark.y = hex.y
      mark.visible = true
      this.mapCont.markCont.addChild(mark) // show mark *below* Stone & infMark
    }
  }
  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  ewEvenRow: TopoEW = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  ewOddRow: TopoEW = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: 0, dr: -1 }}
  nsOddCol: TopoNS = {
    NE: { dc: 1, dr: -1 }, SE: { dc: 1, dr: 0 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }}
  nsEvenCol: TopoNS = {
    NE: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 }, S: { dc: 0, dr: 1 }, N: { dc: 0, dr: -1 },
    SW: { dc: -1, dr: 1}, NW: { dc: -1, dr: 0 }}
  nsTopo(rc: RC): TopoNS { return (rc.col % 2 == 0) ? this.nsEvenCol : this.nsOddCol }
  ewTopo(rc: RC): TopoEW { return (rc.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow}

  nextRowCol(hex: RC, dir: HexDir, nt: Topo = this.ewTopo(hex)): RC {
    let row = hex.row + nt[dir].dr, col = hex.col + nt[dir].dc
    return {row, col}
  }

  /** link hex to/from each extant neighor */
  link(hex: Hex, rc: RC = hex, map: Hex[][] = this, nt: Topo = this.ewTopo(rc), lf: (hex: Hex) => LINKS = (hex) => hex.links) {
    let topoDirs = Object.keys(nt) as Array<HexDir>
    topoDirs.forEach(dir => {
      let nr = rc.row + nt[dir].dr, nc = rc.col + nt[dir].dc //let {row, col} = this.nextRowCol(hex, dir, nt)
      let nHex = map[nr] && map[nr][nc]
      if (!!nHex) {
        lf(hex)[dir] = nHex
        lf(nHex)[H.dirRev[dir]] = hex
      }
    });
  }
  /**
   * The Hex under the given x,y coordinates.
   * If on the line, then the top (last drawn) Hex.
   * @param x in local coordinates of this HexMap.cont
   * @param y
   * @returns the Hex under mouse or false, if not a Hex (background)
   */
  hexUnderPoint(x: number, y: number): Hex2 {
    let obj = this.mapCont.hexCont.getObjectUnderPoint(x, y, 1) // 0=all, 1=mouse-enabled (Hex, not Stone)
    return (obj instanceof HexCont) ? obj.hex : undefined
  }
  /**
   *
   * @param dbp Distance Between Planets; determines size of main map meta-hex (~4)
   * @param dop Distance Outside Planets; extra hexes beyond planets (~2)
   */
  makeAllDistricts(dbp = TP.dbp, dop = TP.dop) {
    this.makeDistrict(dbp + 2 + dop, 0, 1, 0);    // dop hexes on outer ring; single meta-hex
    this.mapCont.hexCont && this.centerOnContainer()
  }
  centerOnContainer() {
    let mapCont = this.mapCont
    let hexRect = mapCont.hexCont.getBounds()
    let x0 = hexRect.x + hexRect.width/2, y0 = hexRect.y + hexRect.height/2
    MapCont.cNames.forEach(cname => {
      mapCont[cname].x = -x0
      mapCont[cname].y = -y0
    })
  }

  get centerHex() {
    let cr = Math.floor((this.maxRow + this.minRow) / 2)
    let cc = Math.floor((this.minCol + this.maxCol) / 2);
    return this[cr][cc] as Hex2
  }
  getCornerHex(dn: InfDir) {
    return this.centerHex.lastHex(dn)
  }

  pickColor(hexAry: Hex2[]): string {
    let hex = hexAry[0]
    let adjColor: string[] = [HexMap.distColor[0]] // colors not to use
    H.dirs.forEach(hd => {
      let nhex: Hex2 = hex
      while (!!(nhex = nhex.nextHex(hd) as Hex2)) {
        if (nhex.district != hex.district) { adjColor.push(nhex.distColor); return }
      }
    })
    return HexMap.distColor.find(ci => !adjColor.includes(ci))
  }
  /**
   * @param nh order of inner-hex: number hexes on side of meta-hex
   * @param mr make new district on meta-row
   * @param mc make new district on meta-col
   */
  makeDistrict(nh: number, district: number, mr: number, mc: number): Hex[] {
    let mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2 * nh - 1
    // irow-icol define topology of MetaHex composed of HexDistrict
    let irow = (mr: number, mc: number) => {
      let ir = mr * dia - nh * (mcp + 1) + 1
      ir -= Math.floor((mc) / 2)              // - half a row for each metaCol
      return ir
    }
    let icol = (mr: number, mc: number, row: number) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh * 3 - 1) / 2))
      ic += (nh - 1)                        // from left edge to center
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    let row0 = irow(mr, mc), col0 = icol(mr, mc, row0), hex: Hex;
    let hexAry = Array<Hex>(); hexAry['Mr'] = mr; hexAry['Mc'] = mc;
    hexAry.push(hex = this.addHex(row0, col0, district)) // The *center* hex
    let rc: RC = { row: row0, col: col0 } // == {hex.row, hex.col}
    //console.groupCollapsed(`makelDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    //console.log(`.makeDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    for (let ring = 1; ring < nh; ring++) {
      rc = this.nextRowCol(rc, 'W') // step West to start a ring
      // place 'ring' hexes along each axis-line:
      H.infDirs.forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, hexAry))
    }
    //console.groupEnd()
    this.district[district] = hexAry
    if (hexAry[0] instanceof Hex2) {
      let hex2Ary = hexAry as Hex2[]
      let dcolor = district == 0 ? HexMap.distColor[0] : this.pickColor(hex2Ary)
      hex2Ary.forEach(hex => hex.setHexColor(dcolor)) // makeDistrict: dcolor=lightgrey
    }
    return hexAry
  }
  /**
   *
   * @param n number of Hex to create
   * @param hex start with a Hex to the West of this Hex
   * @param dir after first Hex move this Dir for each other hex
   * @param district
   * @param hexAry push created Hex(s) on this array
   * @returns RC of next Hex to create (==? RC of original hex)
   */
  newHexesOnLine(n: number, rc: RC, dir: InfDir, district: number, hexAry: Hex[]): RC {
    let hex: Hex
    for (let i = 0; i < n; i++) {
      hexAry.push(hex = this.addHex(rc.row, rc.col, district))
      rc = this.nextRowCol(hex, dir)
    }
    return rc
  }

}
/** Marker class for HexMap used by GamePlayD */
export class HexMapD extends HexMap {

}
