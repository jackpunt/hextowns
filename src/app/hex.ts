import { C, F, RC, S } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Point, Shape, Text } from "@thegraid/easeljs-module";
import { EwDir, H, HexAxis, HexDir, InfDir, NsDir } from "./hex-intfs";
import type { Meeple } from "./meeple";
import { CapMark, HexShape, LegalMark, MeepCapMark } from "./shapes";
import { PlayerColor, PlayerColorRecord, TP, playerColorRecord, playerColorRecordF, playerColorsC } from "./table-params";
import { BonusTile, Tile } from "./tile";
import { GP } from "./game-play";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip '
export type IHex = { Aname: string, row: number, col: number }

// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS = { [key in InfDir]?: Hex }
type INF   = { [key in InfDir]?: number }
type INFM   = { [key in HexAxis]?: InfMark }
type DCR    = { [key in "dc" | "dr"]: number }  // Delta for Col & Row
type TopoEW = { [key in EwDir]: DCR }
type TopoNS = { [key in NsDir]: DCR }
type Topo = TopoEW | TopoNS

export type HSC = { hex: Hex, sc: PlayerColor, Aname: string }
export function newHSC(hex: Hex, sc: PlayerColor, Aname = hex.Aname) { return { Aname, hex, sc } }

/** Lines showing influence on the HexMap. */
export class InfMark extends Shape {
  static wxoAry = playerColorRecord([5, 2.5], [5, -2.5], [6, 0]); // [width, xoffset]
  /** Note: requires a Canvas for nameToRgbaString() */
  static gColor(sc: PlayerColor, g: Graphics = new Graphics()) {
    let alpha = '.85'
    let lightgreyA = C.nameToRgbaString('lightgrey', '.5')
    let c = C.nameToRgbaString(TP.colorScheme[sc], alpha)
    let r = TP.hexRad * H.sqrt3_2 - 1, [w, xo] = InfMark.wxoAry[sc];

    let gStroke = (color: string, w: number) => {
      return g.ss(w).s(color).mt(xo, r).lt(xo, -r)
    }
    g.clear()
    if (C.dist(c, C.WHITE) < 10) gStroke(lightgreyA, w + 2) // makes 'white' more visible
    if (C.dist(c, C.BLACK) < 10) w -= 1 // makes 'black' less bold
    gStroke(c, w)
    return g
  }
  /** 2 Graphics, one is used by each InfMark */
  static setInfGraphics(): PlayerColorRecord<Graphics> {
    return InfMark.infG = playerColorRecordF<Graphics>(sc => InfMark.gColor(sc, InfMark.infG[sc]))
  }
  static infG = playerColorRecordF<Graphics>(sc => InfMark.gColor(sc))
  /** @param ds show Influence on Axis */
  constructor(sc: PlayerColor, ds: HexAxis, x: number, y: number) {
    super(InfMark.infG[sc])
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this.x = x; this.y = y
    this[S.Aname] = `Inf[${TP.colorScheme[sc]},${ds},${this.id}]`  // for debug, not production
  }
}

/** to recognize this class in hexUnderPoint and obtain the associated Hex2. */
class HexCont extends Container {
  constructor(public hex2: Hex2) {
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
   * @returns \{ x, y, w, h } of cell at [row, col]
   */
  xywh(radius = TP.hexRad, nsAxis = true, row = this.row, col = this.col) {
    if (nsAxis) { // tiltDir = 'NE'; tilt = 30-degrees; nsTOPO
      const h = 2 * radius, w = radius * H.sqrt3;  // h height of hexagon (long-vertical axis)
      const x = (col + Math.abs(row % 2) / 2) * w;
      const y = row * 1.5 * radius;   // dist between rows
      return { x, y, w, h }
    } else { // tiltdir == 'N'; tile = 0-degrees; ewTOPO
      const w = 2 * radius, h = radius * H.sqrt3 // radius * 1.732
      const x = (col) * 1.5 * radius;
      const y = (row + Math.abs(col % 2) / 2) * h;
      return { x, y, w, h }
    }
  }

  _tile: Tile;
  get tile() { return this._tile; }
  set tile(tile: Tile) { this._tile = tile; } // override in Hex2!
  // Note: set hex.tile mostly invoked from: tile.hex = hex;

  _meep: Meeple;
  get meep() { return this._meep; }
  set meep(meep: Meeple) { this._meep = meep }

  get occupied(): [Tile, Meeple] { return (this.tile || this.meep) ? [this.tile, this.meep] : undefined; }

  readonly Aname: string
  /** reduce to serializable IHex (removes map, inf, links, etc) */
  get iHex(): IHex { return { Aname: this.Aname, row: this.row, col: this.col } }
  /** [row,col] OR S_Resign OR S_Skip */
  get rcs(): string { return (this.row >= 0) ? `[${this.row},${this.col}]` : this.Aname.substring(4)}
  get rowsp() { return (this.row?.toString() || '-1').padStart(2) }
  get colsp() { return (this.col?.toString() || '-1').padStart(2) } // col== -1 ? S_Skip; -2 ? S_Resign
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
  get isOnMap() { return this.district !== undefined; } // also: (row !== undefined) && (col !== undefined)

  _isLegal: boolean;
  get isLegal() { return this._isLegal; }
  set isLegal(v: boolean) { this._isLegal = v; }

  readonly map: HexMap;  // Note: this.parent == this.map.hexCont [cached]
  readonly row: number;
  readonly col: number;
  /** influence of color passing through this hex; see also getInfT() */
  readonly inf = playerColorRecord<INF>({},{},{})
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS = {}

  /** colorScheme(playerColor)@rcs */
  toString(sc = this.tile?.player?.color || this.meep?.player?.color) {
    return `${TP.colorScheme[sc] || 'Empty'}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** hex.rcspString => COLOR@[ r, c] | 'COLOR@Skip   ' , 'COLOR@Resign ' */
  rcspString(sc = this.tile?.player.color || this.meep?.player?.color) {
    return `${TP.colorScheme[sc] || 'Empty'}@${this.rcsp}`
  }

  /**
   * Is this Hex [already] influenced by color/dn? [for skipAndSet()]
   * @param color PlayerColor
   * @param dn dir of Influence: ds | revDir[ds]
   * @returns true if Hex is PlayerColor or has InfMark(color, dn)
   */
  isInf(color: PlayerColor, dn: InfDir) { return this.inf[color][dn] > 0}
  getInf(color: PlayerColor, dn: InfDir) { return this.inf[color] ? (this.inf[color][dn] ?? 0) : 0 }
  setInf(color: PlayerColor, dn: InfDir, inf: number) { return this.inf[color][dn] = inf }

  // Presence of Tile and/or Meeple may provide influence to adjacent cells
  // that propagates along the axies, decrementing on non-presence cells,
  // boosting on presence/occupied cells.
  /** influence from presence of Tile/Meeple. */
  getInfP(color: PlayerColor) {
    const tileInf = this.tile?.infColor === color ? this.tile.infP : 0;
    const meepInf = this.meep?.infColor === color ? this.meep.infP : 0;
    return tileInf + meepInf;
  }
  /** Total external inf on this Hex. */
  getInfX(color: PlayerColor) {
    let tinf = 0;
    H.infDirs.forEach(dn => tinf += this.getInf(color, dn))
    return tinf;
  }
  /** Total inf on this Hex. */
  getInfT(color: PlayerColor) {
    let infP = this.getInfP(color)
    return infP + this.getInfX(color);
  }

  get infStr() {
    let infc = playerColorsC; // red, blue, criminal
    let rv = infc.reduce((pv, cv, ci) => `${pv}${ci > 0 ? ':' : ''}${this.getInfT(cv as PlayerColor)}`, '');
    return rv;
  }

  /**
   * @param inf is influence *passed-in* to Hex; *next* gets [inf+infP or inc-1]
   * @param test after hex.setInf(inf) and hex.propagateIncr(nxt), apply test(hex); [a visitor]
   */
  propagateIncr(color: PlayerColor, dn: InfDir, inf: number, test: ((hex: Hex) => void) = (hex) => hex.assessThreats()) {
    let infP = this.getInfP(color), inf0 = this.getInf(color, dn);
    this.setInf(color, dn, inf)
    let nxt = infP > 0 ? inf + infP : inf - 1;
    if (nxt > 0) this.links[dn]?.propagateIncr(color, dn, nxt, test)
    if (test) test(this);
  }

  /**
   * Afer removing tileInf, set inf of this hex AND set inf of next in line to reduced value.
   * Pass on based on *orig/current* inf, not the new/decremented inf.
   * @param inf for hex, without infP
   * @param test after hex.setInf(infn) and hex.propagateDecr(nxt), apply test(hex)
   */
  propagateDecr(color: PlayerColor, dn: InfDir, inf: number, tileInf: number, test: ((hex: Hex) => void) = (hex) => hex.assessThreats()) {
    // if *this* has inf, then next may also have propagated inf.
    let infP = this.getInfP(color)
    let inf0 = this.getInf(color, dn) + infP + tileInf; // original, largest inf
    this.setInf(color, dn, inf);
    let nxt = infP > 0 ? inf + infP : Math.max(0, inf - 1);
    if (inf0 > 0) this.links[dn]?.propagateDecr(color, dn, nxt, 0, test) // pass-on a smaller number
    if (test) test(this);
  }

  assessThreats() {
    this.tile?.assessThreats();    // playerColorsC.forEach(pc => this.assessThreat(pc));
    this.meep?.assessThreats();
  }

  /** convert LINKS object to Array */
  get linkHexes() {
    return Object.keys(this.links).map((dir: InfDir) => this.links[dir])
  }
  forEachLinkHex(func: (hex: Hex, dir: InfDir, hex0: Hex) => unknown, inclCenter = false) {
    if (inclCenter) func(this, undefined, this);
    Object.keys(this.links).forEach((dir: InfDir) => func(this.links[dir], dir, this));
  }
  findLinkHex(pred: (hex: Hex, dir: InfDir, hex0: Hex) => boolean) {
    return Object.keys(this.links).find((dir: InfDir) => pred(this.links[dir], dir, this));
  }

  hexesInDir(dir: InfDir, rv: Hex[] = []) {
    let hex: Hex = this;
    while (!!(hex = hex.links[dir])) rv.push(hex);
    return rv;
  }

  nextHex(ds: HexDir, ns: number = 1) {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds]) && ns-- > 0) { hex = nhex }
    return hex
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: HexDir): Hex {
    let hex: Hex = this, nhex: Hex
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex
  }
  /** distance between Hexes: adjacent = 1, based on row, col, sqrt3 */
  radialDist(hex: Hex): number {
    let unit = 1 / H.sqrt3 // so w = delta(col) = 1
    let { x: tx, y: ty } = this.xywh(unit), { x: hx, y: hy } = hex.xywh(unit)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy);
  }
}
/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex2 extends Hex {
  // cont holds hexShape(color), rcText, distText, capMark
  readonly cont: HexCont = new HexCont(this); // Hex IS-A Hex0, HAS-A HexCont Container
  readonly radius = TP.hexRad;                // determines width & height
  readonly hexShape = this.makeHexShape();    // shown on this.cont: colored hexagon
  get mapCont() { return this.map.mapCont; }
  get markCont() { return this.mapCont.markCont; }

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
  distColor: string // district color of hexShape (paintHexShape)
  distText: Text    // shown on this.cont
  rcText: Text      // shown on this.cont
  infm: Record<PlayerColor, INFM> = playerColorRecord({}, {}, {})

  override get tile() { return super.tile; }
  override set tile(tile: Tile) {
    const cont: Container = this.map.mapCont.tileCont, x = this.x, y = this.y;
    const res = GP.gamePlay.playerReserveHexes.includes(this);
    const k = !(this.tile instanceof BonusTile || res);      // debug double tile; TODO: remove these checks
    if (k && tile !== undefined && this.tile !== undefined) debugger;
    if (this.tile !== undefined) cont.removeChild(this.tile);
    super.tile = tile  // this._tile = tile
    if (tile !== undefined) {
      tile.x = x; tile.y = y;
      cont.addChildAt(tile, 0); // under hex.meep (and various Text)
    }
  }

  override get meep() { return super.meep; }
  override set meep(meep: Meeple) {
    const cont: Container = this.map.mapCont.tileCont, x = this.x, y = this.y;
    let k = true;     // debug double meep
    if (k && meep !== undefined && this.meep !== undefined) debugger;
    super.meep = meep // this._meep = meep    super.meep = meep
    if (meep !== undefined) {
      meep.x = x; meep.y = y;
      cont.addChild(meep);      // tile will go under meep
    }
  }

  /** Hex2 in hexMap.mapCont.hexCont; hex.cont contains:
   * - polyStar Shape of radius @ (XY=0,0)
   * - stoneIdText (user settable stoneIdText.text)
   * - rcText (r,c)
   * - distText (d)
   */
  constructor(map: HexMap, row: number, col: number, name?: string) {
    super(map, row, col, name);
    this.initCont(row, col);
    map?.mapCont.hexCont.addChild(this.cont);
    this.hexShape.name = this.Aname

    const rc = `${row!=undefined?row:''},${col!=undefined?col:''}`, tdy = -25;
    const rct = this.rcText = new Text(rc, F.fontSpec(26), 'white'); // radius/2 ?
    rct.textAlign = 'center'; rct.y = tdy; // based on fontSize? & radius
    this.cont.addChild(rct);

    this.distText = new Text(``, F.fontSpec(20));
    this.distText.textAlign = 'center'; this.distText.y = tdy + 46 // yc + 26+20
    this.cont.addChild(this.distText);
    this.legalMark.setOnHex(this);
    this.showText(true); // & this.cache()
  }

  /** set visibility of rcText & distText */
  showText(vis = this.rcText.visible) {
    if (this.isOnMap) {
      this.distText.text = this.infStr;
      this.tile?.setInfText(this.infStr);
    }
    this.rcText.visible = this.distText.visible = vis
    this.cont.updateCache()
  }

  readonly legalMark = new LegalMark();
  override get isLegal() { return this._isLegal; }
  override set isLegal(v: boolean) {
    super.isLegal = v;
    this.legalMark.visible = v;
  }

  initCont(row: number, col: number) {
    const cont = this.cont;
    const { x, y, w, h } = this.xywh(this.radius, undefined, row, col); // include margin space between hexes
    cont.x = x;
    cont.y = y;
    // initialize cache bounds:
    cont.setBounds(-w / 2, -h / 2, w, h);
    const b = cont.getBounds();
    cont.cache(b.x, b.y, b.width, b.height);
  }

  makeHexShape() {
    const hs = new HexShape(this.radius);
    this.cont.addChildAt(hs, 0);
    this.cont.hitArea = hs;
    hs.paint('grey');
    return hs;
  }

  /** set hexShape using color: draw border and fill
   * @param color
   * @param district if supplied, set this.district
   */
  setHexColor(color: string, district?: number | undefined) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.distColor = color;
    this.hexShape.paint(color);
    this.cont.updateCache();
  }

  override setInf(color: PlayerColor, dn: InfDir, inf: number): number {
    super.setInf(color, dn, inf)
    this.showInf(color, dn, inf + this.getInf(color, H.dirRevEW[dn]) > 0)
    return inf
  }

  showInf(color: PlayerColor, dn: InfDir, show = true) {
    let ds: HexAxis = H.dnToAxis[dn], infMark = this.infm[color][ds]  // infm only on [ds]
    if (this.isOnMap) this.showText(); // update infStr
    if (show && !infMark) {
      infMark = this.infm[color][ds] = new InfMark(color, ds, this.x, this.y)
      this.map.mapCont.infCont.addChild(infMark)
    }
    if (infMark) { infMark.visible = show; }
  }

  override assessThreats(): void {
    super.assessThreats();
    playerColorsC.forEach(pc => {
      this.tile?.setCapMark(pc, CapMark);
      this.meep?.setCapMark(pc, MeepCapMark);
    });
  }

  // The following were created for the map in hexmarket:
  /** unit distance between Hexes: adjacent = 1; see also: radialDist */
  metricDist(hex: Hex): number {
    let { x: tx, y: ty } = this.xywh(1), { x: hx, y: hy } = hex.xywh(1)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy); // tw == H.sqrt3
  }
  /** location of corner between dir0 and dir1; in parent coordinates. */
  cornerPoint(dir0: HexDir, dir1: HexDir) {
    let d0 = H.dirRot[dir0], d1 = H.dirRot[dir1]
    let a2 = (d0 + d1) / 2, h = this.radius
    if (Math.abs(d0 - d1) > 180) a2 += 180
    let a = a2 * H.degToRadians
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
  /** location of edge point in dir; in parent coordinates. */
  edgePoint(dir: HexDir) {
    let a = H.dirRot[dir] * H.degToRadians, h = this.radius * H.sqrt3_2
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
}

export class EventHex extends Hex2 {
  constructor(map: HexMap, row: number, col: number, name?: string, scale = 2) {
    super(map, row, col, name);
    this.showText(false);
    this.setHexColor('transparent');
    // show Mark and Tile enlarged:
    this.mapCont.eventCont.scaleX = this.mapCont.eventCont.scaleY = scale;
  }
  override get markCont() { return this.mapCont.eventCont; }
  override get tile() { return super.tile; }
  override set tile(tile: Tile) {
    super.tile = tile  // this._tile = tile; tile.x/y = this.x/y;
    tile?.parent.localToLocal(this.x, this.y, this.mapCont.eventCont, tile);
    this.mapCont.eventCont.addChild(tile); // to top
  }
}

export class MapCont extends Container {
  constructor(public hexMap: HexMap) {
    super()
  }
  static cNames = ['hexCont', 'infCont', 'tileCont', 'markCont', 'capCont', 'counterCont', 'eventCont'];
  hexCont: Container     // hex shapes on bottom stats: addChild(dsText), parent.rotation
  infCont: Container     // infMark below tileCont; Hex2.showInf
  tileCont: Container    // Tiles & Meeples on Hex2/HexMap.
  markCont: Container    // showMark over Hex2; LegalMark
  capCont: Container     // for tile.capMark
  counterCont: Container // counters for AuctionCont
  eventCont: Container   // the eventHex & and whatever Tile is on it...
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
  // A color for each District: 'rgb(198,198,198)'
  static readonly distColor = ['lightgrey',"limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  /** Each occupied Hex, with the occupying PlayerColor  */
  readonly allStones: HSC[] = []                    // aka hexStones in Board (readonly when we stop remove/filter)
  readonly district: Array<Hex[]> = []
  readonly mapCont: MapCont = new MapCont(this)   // if using Hex2
  readonly skipHex: Hex;
  readonly resignHex: Hex;
  rcLinear(row: number, col: number): number { return col + row * (1 + (this.maxCol || 0) - (this.minCol||0)) }

  //
  //                         |    //                         |    //                         |
  //         2        .      |  1 //         1        .      | .5 //         2/sqrt3  .      |  1/sqrt3
  //            .            |    //            .            |    //            .            |
  //      .                  |    //      .                  |    //      .                  |
  //  -----------------------+    //  -----------------------+    //  -----------------------+
  //         sqrt3                //         sqrt3/2              //         1
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
  /** find first Hex matching the given predicate function */
  findHex<K extends Hex>(fn: (hex: K) => boolean): K {
    for (let hexRow of this) {
      if (hexRow === undefined) continue
      const found = hexRow.find((hex: K) => hex && fn(hex)) as K
      if (found !== undefined) return found
    }
    return undefined;
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

  /** make this.mark visible above the given Hex */
  showMark(hex?: Hex) {
    const mark = this.mark
    if (!hex) {  // || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      mark.visible = false;
    } else if (hex instanceof Hex2) {
      mark.visible = true;
      hex.cont.localToLocal(0, 0, hex.markCont, mark);
      hex.markCont.addChild(mark);
      this.update();
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
    return (obj instanceof HexCont) ? obj.hex2 : undefined
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
  getCornerHex(dn: HexDir) {
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
