import { C, F, className, stime, ImageLoader } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, Graphics, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap, HexShape } from "./hex";
import { H } from "./hex-intfs";
import { Player } from "./player";
import { PlayerColor, TP } from "./table-params";
import { DragContext, Table } from "./table";
import { Leader, Meeple } from "./meeple";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey2 = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
  static lightgrey_8 = 'rgb(225,225,225,.8)' // needs to contrast with WHITE influence lines
}

export interface PaintableShape extends Shape {
  /** paint with new player color; updateCache() */
  paint(colorn: string): Graphics;
}

class TileShape extends HexShape implements PaintableShape {
  static fillColor = C1.lightgrey_8;// 'rgba(200,200,200,.8)'
  /** colored HexShape filled with very-lightgrey disk: */
  override paint(colorn: string) {
    super.paint(colorn)
    return this.paint2(colorn)
  }
  paint0(colorn: string) {
    let r2 = this.radius * H.sqrt3 * .5 * (55 / 60);
    return this.graphics.f(TileShape.fillColor).dc(0, 0, r2)
  }
  paint2(colorn: string) {
    let r = this.radius, g = this.graphics, tilt = H.dirRot[this.tiltDir];
    let r2 = this.radius * H.sqrt3 * .5 * (55 / 60);
    // dp(...6), so tilt: 30 | 0; being nsAxis or ewAxis;
    let w = r * Math.cos(Hex2.degToRadians * tilt)
    let h = r * Math.cos(Hex2.degToRadians * (tilt - 30))
    this.cache(-w, -h, 2 * w, 2 * h);    // solid hexagon
    g.c().f(C.BLACK).dc(0, 0, r2)
    this.updateCache("destination-out"); // hole in hexagon
    g.c(); this.paint0(colorn)
    this.updateCache("source-over");     // translucent circle
    return g;
  }
}

/** lines showing influence of a Tile. */
export class InfRays extends Container {
  /**
   * draw 6 rays (around a HexShape)
   * @param inf number of rays to draw
   * @param infColor color of ray
   * @param y0 start of ray (ends at .9) X TP.hexRad
   * @param xw width of each ray
   */
  constructor(inf = 1, infColor?: PlayerColor, y0 = .7, xw = 3) {
    super()
    let color = infColor ? TP.colorScheme[infColor] : C.WHITE;
    let rad = TP.hexRad, y1 = y0 * rad, y2 = .9 * rad;
    let xs = [[0], [-.1 * rad, +.1 * rad], [-.1 * rad, 0, +.1 * rad]][Math.abs(inf) - 1];
    H.ewDirs.forEach(dir => {
      let sl = new Shape(), gl = sl.graphics
      gl.ss(xw).s(color)
      xs.forEach(x => gl.mt(x, y1).lt(x, y2))
      sl.rotation = H.dirRot[dir]
      this.addChild(sl)
    })
    this.cache(-rad, -rad, 2 * rad, 2 * rad)
  }
}

export class InfShape extends Container {
  /** hexagon scaled by TP.hexRad/4 */
  constructor(bgColor = 'grey') {
    super()
    let s = new Shape(), c = this;
    s.graphics.f(bgColor).dp(0, 0, TP.hexRad, 6, 0, 30)
    c.addChild(s)
    c.addChild(new InfRays(1, undefined, .3, 10)) // short & wide; it gets scaled down
    c.scaleX = c.scaleY = 1 / 4;
  }
}

export type Bonus = 'star' | 'brib' | 'actn' | 'econ' | 'Bank' | 'Lake'
export type AuctionBonus = Exclude<Bonus, 'Bank' | 'Lake'>;
export type BonusObj = { [key in AuctionBonus]: boolean}

type BonusInfo<T extends DisplayObject> = {
  type: Bonus, dtype: new () => T,
  x: number, y: number, size: number,
  paint?: (s: T, info: BonusInfo<T>) => void
}

class BonusMark extends Container {

  static bonusInfo: BonusInfo<DisplayObject>[] = [
    {
      type: 'Bank', dtype: Text, x: 0, y: -2.6, size: TP.hexRad / 3, paint: (t: Text, info) => {
        t.text = '$'
        t.color = C.GREEN
        t.textAlign = 'center'
        t.font = F.fontSpec(info.size)
        t.x = info.x * info.size
        t.y = info.y * info.size
      }
    },
    {
      type: 'econ', dtype: Text, x: 0, y: -2.6, size: TP.hexRad / 3, paint: (t: Text, info) => {
        t.text = '$'
        t.color = C.GREEN
        t.textAlign = 'center'
        t.font = F.fontSpec(info.size)
        t.x = info.x * info.size
        t.y = info.y * info.size
      }
    },
    {
      type: 'Lake', dtype: Shape, x: 0, y: -2.7, size: TP.hexRad / 4, paint: (s: Shape, info, tilt = 90) => {
        s.graphics.f(C.briteGold).dp(info.x, info.y, 1, 5, 2, tilt)
        s.scaleX = s.scaleY = info.size;
      }
    },
    {
      type: 'star', dtype: Shape, x: 0, y: 1.2, size: TP.hexRad / 3, paint: (s: Shape, info, tilt = -90) => {
        s.graphics.f(C.briteGold).dp(info.x, info.y, 1, 5, 2, tilt)
        s.scaleX = s.scaleY = info.size;
      }
    },
    {
      type: 'brib', dtype: InfShape, x: 1.3, y: -1.3, size: TP.hexRad/4, paint: (c: Container, info) => {
        c.scaleX = c.scaleY = 1/4;
        c.x = info.x * info.size;
        c.y = info.y * info.size;
      }
    },
    {
      type: 'actn', dtype: Shape, x: -1.4, y: -1.3, size: TP.hexRad / 4, paint: (s: Shape, info) => {
        s.scaleX = s.scaleY = info.size / 4
        let path: [x: number, y: number][] = [[-1, 4], [2, -1], [-2, 1], [1, -4]].map(([x, y]) => [x + info.x*4, y + info.y*4])
        let g = s.graphics.ss(1).s(C.YELLOW).mt(...path.shift())
        path.map((xy) => g.lt(...xy))
        g.es()
      }
    },
  ];
  static bonusMap = new Map<Bonus, BonusInfo<DisplayObject>>()
  static ignore = BonusMark.bonusInfo.map(info => BonusMark.bonusMap.set(info.type, info));

  constructor(
    public type?: Bonus,
    rotation = 0,
    ) {
    super();            // this is a Container
    let info = BonusMark.bonusMap.get(type); // has a paint() function
    let dobj = new info.dtype();             // Shape or Text
    this.addChild(dobj) // dobj is a Shape or Text or other info.dtype()
    info.paint(dobj, info); // paint dobj with polystar(tilt) or Text(...)
    this.rotation = rotation;
  }
}

/** Someday refactor: all the cardboard bits (Tiles, Meeples & Coins) */
export class Tile0 extends Container {

  static Uname = ['Univ0', 'Univ1'];
  static imageMap = new Map<string, HTMLImageElement>()
  static imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Bank', 'Lake', 'Recycle', 'TownStart', 'TownHall', 'Temple', ...Tile0.Uname],
    ext: 'png',
  };

  /** use ImageLoader to load images, THEN invoke callback. */
  static loadImages(cb: () => void) {
    new ImageLoader(Tile0.imageArgs, Tile0.imageMap, (imap) => cb())
  }

  // constructor() { super(); }

  public player: Player;
  get infColor() { return this.player?.color }

  /** name in set of filenames loaded in GameSetup */
  addImageBitmap(name: string) {
    let img = Tile.imageMap.get(name), bm = new Bitmap(img);
    let width = TP.hexRad
    bm.scaleX = bm.scaleY = width / Math.max(img.height, img.width);
    bm.x = bm.y = -width / 2;
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, 1)
    return bm;
  }

  get radius() { return TP.hexRad};
  readonly childShape: PaintableShape = this.makeShape();
  /** abstract: subclass should override. */
  makeShape(): PaintableShape {
    return new TileShape(this.radius)
  }

  /** override for Meeple's xy offset. */
  hexUnderObj(hexMap: HexMap) {
    let dragObj = this;
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, hexMap.mapCont.hexCont)
    return hexMap.hexUnderPoint(pt.x, pt.y)
  }

  /** paint with PlayerColor; updateCache() */
  paint(pColor?: PlayerColor, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.childShape.paint(colorn); // recache childShape
    this.updateCache()
  }

  readonly bonus: BonusObj = { star: false, brib: false, actn: false, econ: false }
  addBonus(type: AuctionBonus) {
    let mark = new BonusMark(type);
    this.bonus[type] = true;
    this.addChildAt(mark, this.numChildren -1);
    this.paint();
    return mark
  }

  get bonusCount() {
    let rv = 0;
    Object.keys(this.bonus).forEach(key => rv += this.bonus[key] ? 1 : 0);
    return rv;
  }

  removeBonus(type?: Bonus) {
    if (!type) {
      BonusMark.bonusInfo.forEach(info => this.removeBonus(info.type))
      return
    }
    this.bonus[type] = false;
    this.removeChildType(BonusMark, (c: BonusMark) => (c.type == type))
    this.paint();
  }

  removeChildType(type: new() => DisplayObject, pred = (dobj: DisplayObject) => true ) {
    let mark: DisplayObject;
    while (mark = this.children.find(c => (c instanceof type) && pred(c))) {
      this.removeChild(mark)
    }
    this.updateCache()
  }

}

export class Tile extends Tile0 {
  static allTiles: Tile[] = [];
  static serial = 0;    // serial number of each Tile created

  static textSize = 20;
  nameText: Text;
  get nB() { return 0; }
  get nR() { return 0; }
  get fB() { return 0; }
  get fR() { return 0; }

  _hex: Hex = undefined;
  /** the map Hex on which this Tile sits. */
  get hex() { return this._hex; }
  /** only one Tile on a Hex, Tile on only one Hex */
  set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.tile = undefined
    this._hex = hex
    if (hex !== undefined) hex.tile = this;
  }
  get table() { return (GamePlay.gamePlay as GamePlay).table as Table; }

  homeHex: Hex = undefined;

  get infP() { return this.inf }

  get vp() { return this._vp + (this.bonus.star ? 1 : 0); } // override in Lake
  get econ() { return this._econ + (this.bonus.econ ? 1 : 0); } // override in Bank

  // Tile
  constructor(
    /** the owning Player. */
    player: Player,
    public readonly Aname?: string,
    public readonly inf: number = 0,
    private readonly _vp: number = 0,
    public readonly cost: number = 1,
    public readonly _econ: number = 1,
  ) {
    super()
    this.player = player;
    let radius = this.radius
    Tile.allTiles.push(this);
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`;
    this.cache(-radius, -radius, 2 * radius, 2 * radius)
    this.addChild(this.childShape)       // index = 0
    this.nameText = this.addNameText()   // index = 1
    this.infText = this.addNameText('', TP.hexRad)
    if (inf > 0) this.setInfRays(inf)
    this.paint()
  }

  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.childShape.paint(colorn)
    this.updateCache(); // draw other children and re-cache.
  }

  /** name in set of filenames loaded in GameSetup */
  override addImageBitmap(name: string) {
    let bm = super.addImageBitmap(name)
    this.updateCache()
    return bm;
  }

  /** add influence rays to Tile (for infP).
   * @inf this.hex.getInfP(this.infColor)
   */
  setInfRays(inf = this.inf, rad = this.radius) {
    this.removeChildType(InfRays)
    if (inf !== 0) {
      this.addChildAt(new InfRays(inf, this.infColor), this.children.length - 1)
    }
    this.cache(-rad, -rad, 2 * rad, 2 * rad)
  }

  infText: Text
  setInfText(text: string) {
    this.infText.text = text;
    this.updateCache()
  }

  addNameText(name = this.Aname, y0 = TP.hexRad / 2) {
    let nameText = new Text(name, F.fontSpec(Tile.textSize))
    nameText.textAlign = 'center'
    nameText.y = (y0 - Tile.textSize) * .55;
    nameText.visible = false
    this.addChild(nameText);
    return nameText;
  }

  textVis(vis = !this.nameText.visible) {
    this.nameText.visible = vis
    this.infText.visible = vis
    this.updateCache()
  }

  onRightClick(evt: MouseEvent) {
    console.log(stime(this, `.rightclick:`), this.Aname, evt)

  }

  // Tile
  /** Post-condition: tile.hex == hex; */
  moveTo(hex: Hex) {
    this.hex = hex;     // INCLUDES: hex.tile = tile
    return hex;
  }

  // Tile: AuctionTile, Civic, Meeple
  // isFromMap --> capture Opp Tile/Meeple OR dismiss Own Meeple
  // isFromAuction --> to tileBag
  // isFromReserve --> to tileBag
  // Meeple:
  // Leader --> homeHex, Police/Criminal --> UnitSource.
  /** Post-condition: !tile.hex.isOnMap; tile.hex may be undefined [UnitSource] */
  recycle() {
    this.isCapture();
    this.sendHome();
  }

  /** after recycle or capture. */
  sendHome() {
    this.moveTo(this.homeHex) // override for AucionTile.tileBag & UnitSource<Meeple>
  }

  // TODO: belongs to GamePlay
  isCapture() {
    let cp = GamePlay.gamePlay.curPlayer
    let info = { name: this.Aname, fromHex: this.hex?.Aname, cp: cp.colorn, caps: cp.captures, tile: this }
    if (this.hex?.isOnMap) {
      if (this.player !== cp) {
        cp.captures++;
        console.log(stime(this, `.isCapture[onMap]: captured`), info);
        return true;
      } else {
        let verb = (this instanceof Meeple) ? 'dismiss' : 'demolish'
        cp.coins -= this.econ;  // dismiss Meeple, claw-back salary.
        console.log(stime(this, `.isCapture[onMap]: ${verb}:`), info);
        return false
      }
    } else {
      let verb = (this instanceof Meeple) ? 'dismiss' : 'demolish'
      console.log(stime(this, `.isCapture[offMap]: ${verb}:`), info);
      return false
    }
  }

  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc0(hex: Hex2, ctx: DragContext) {
    let isCapture = (hex == GamePlay.gamePlay.recycleHex); // dev/test: use manual capture.
    ctx.targetHex = (isCapture || this.isLegalTarget(hex)) ? hex : ctx.originHex;
    ctx.targetHex.map.showMark(ctx.targetHex);
  }

  dropFunc0(hex: Hex2, ctx: DragContext) {
    this.dropFunc(ctx.targetHex, ctx)
    ctx.targetHex.map.showMark(undefined)
  }

  /** override as necessary. */
  dragStart(hex: Hex2, ctx: DragContext) {
    // when lifting a Tile from map, remove its influence?
  }

  /** state of shiftKey has changed during drag */
  dragShift(shiftKey: boolean, ctx: DragContext) { }

  /**
   * Override in AuctionTile, Civic, Meeple/Leader
   * @param hex a potential targetHex (table.hexUnderPoint(dragObj.xy))
   */
  isLegalTarget(hex: Hex) {
    if (!hex) return false;
    if (hex.tile) return false;
    // TODO: when auto-capture is working, re-assert no dragging.
    // if ((this.hex as Hex2).isOnMap) return false;
    return true;
  }

  /**
   * Tile.dropFunc; Override in AuctionTile, Civic, Meeple/Leader.
   * @param targetHex Hex2 this Tile is over when dropped (may be undefined; see also: ctx.targetHex)
   * @param ctx DragContext
   */
  dropFunc(targetHex: Hex2, ctx: DragContext) {
    this.table.gamePlay.placeTile(this, targetHex);
  }
}

// Leader.civicTile -> Civic; Civic does not point to its leader...
export class Civic extends Tile {
  constructor(player: Player, type: string, image: string, inf = 1, vp = 1, cost = 2, econ = 1) {
    super(player, `${type}:${player.index}`, inf, vp, cost, econ);
    this.player = player;
    this.addImageBitmap(image);
    this.addBonus('star').y += this.radius / 12;
    player.civicTiles.push(this);
  }

  override get infP() {
    let meep = this.hex.meep;
    let leaderInf = (meep instanceof Leader) && meep.civicTile === this ? TP.infOnCivic : 0;
    return super.infP + leaderInf;
  }

  // also paint the InfRays
  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor);
    this.setInfRays()
  }

  override isLegalTarget(hex: Hex) {
    if (!super.isLegalTarget(hex)) return false;
    if (!hex.isOnMap) return false;
    // if insufficient influence(hex) return false;
    return true;
  }

  override recycle() {   // Civic - put under Leader
    super.recycle();
    this.table.hexMap.mapCont.tileCont.addChildAt(this, 1); // under meeple
  }
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
      super.dropFunc(targetHex, ctx);
      (GamePlay.gamePlay as GamePlay).showPlayerPrices();
  }
}

type TownSpec = string

export class TownRules {
  static rulesText: Array<Array<TownSpec>> = [
    ['2nd build from TC', '+6 Econ (fast start)'],
    ['+1 to each R/B in 37 meta-hex around TC, -1 each empty/non-econ tile'],
    ['+1 per R/B*, R/B* are Level-1 (compact)',
    '+2 for each adj TC, H, M, C', '+1 per edge of TC,H,M,C meta-triad (tactical)'],
    ['+1 per tile in longest 1-connected strip of R & B', '+6 per strip >= length 5 (strip)'],
    ['+1 to each business triad', '+4 for 3 business triads (triads)'],
    ['+4 to each residential hex', '+10 for 2 residential hex (hexes)'],
    ['+1 VP for Police & Station & Prisoner (police state)'],
    ['+10, -1 per Police & Station (libertarian)'],
    ['+1 for each Criminal placed', '+1 for each tile corrupted (crime lord)'],
  ];
  rulesBag: TownSpec[] = [];
  fillRulesBag() {
    this.rulesBag = TownRules.rulesText.slice(0)[0];
  }
  selectOne(bag = this.rulesBag) {
    return bag.splice(Math.floor(Math.random() * bag.length), 1);
  }
  static inst = new TownRules();
}

export class TownStart extends Civic {
  override get fB() { return 1; } // TS
  override get fR() { return 1; } // TS

  rule: TownSpec;
  constructor(player: Player) {
    super(player, 'TS', 'TownStart')
  }
}

export class TownHall extends Civic {
  constructor(player: Player) {
    super(player, 'TH', 'TownHall')
  }
}

export class University extends Civic {
  override get fB() { return 1; } // Univ
  override get fR() { return 1; } // Univ
  constructor(player: Player) {
    super(player, 'U', Tile.Uname[player.index])
  }
}

export class Church extends Civic {
  override get fR() { return 1; } // Church
  constructor(player: Player) {
    super(player, 'C', 'Temple')
  }
}

export class AuctionTile extends Tile {

  /** take specific tile from tileBag */
  static takeTile(tile: AuctionTile, tiles = AuctionTile.tileBag) {
    let index = tiles.indexOf(tile)
    if (index < 0) return undefined;
    tiles.splice(index, 1)
    return tile;
  }

  /** select random tile from tileBag */
  static selectOne(tiles = AuctionTile.tileBag, remove = true) {
    let index = Math.floor(Math.random() * tiles.length)
    let tile = tiles.splice(index, 1)[0];
    if (!remove) tiles.push(tile);
    return tile;
  }
  static tileBag: AuctionTile[] = [];
  static fillBag() {
    let addTiles = (n: number, type: new () => AuctionTile) => {
      for (let i = 0; i < n; i++) {
        let tile = new type();
        AuctionTile.tileBag.push(tile);
      }
    }
    AuctionTile.tileBag.length = 0;
    addTiles(TP.resiPerPlayer * 2, Resi)
    addTiles(TP.busiPerPlayer * 2, Busi)
    addTiles(TP.psPerPlayer * 2, PS)
    addTiles(TP.bankPerPlayer * 2, Bank)
    addTiles(TP.lakePerPlayer * 2, Lake)
  }

  static inTheBag() {
    const counts = {}
    const tileNames = AuctionTile.tileBag.map(tile => className(tile)).sort()
    tileNames.forEach(name => counts[name] = (counts[name] ?? 0) + 1)
    return counts;
  }

  /** AuctionTile */
  constructor(player: Player, Aname?: string, inf?, vp?, cost?, econ?) {
    super(player, Aname, inf, vp, cost, econ)
  }

  override sendHome(): void {  // AuctionTile: removeBonus; to tileBag
    super.sendHome();
    this.removeBonus();
    this.parent.removeChild(this);
    console.log(stime(this, `.recycle: to tileBag`), this.Aname, this.player?.colorn, this)
    this.player = undefined;
    this.x = this.y = 0;
    AuctionTile.tileBag.unshift(this)
    this.table.auctionCont.tileCounter.setValue(AuctionTile.tileBag.length);
    this.table.hexMap.update();
  }

  indexInAuction() {
    return GamePlay.gamePlay.auctionTiles.indexOf(this);
  }

  override isLegalTarget(hex: Hex): boolean {
    if (!hex) return false;
    const gamePlay = GamePlay.gamePlay;
    let curPlayer = gamePlay.curPlayer, curNdx = curPlayer.index;
    if (hex.isOnMap && !hex.tile && (!hex.meep || hex.meep.player == curPlayer)) return true;
    if (gamePlay.reserveHexes[curNdx].includes(hex as Hex2)) return true;
    // TODO: during dev/testing: allow return to auction, using shift key:
    if (gamePlay.reserveHexes[curNdx].includes(this.hex as Hex2)
      && this.table.auctionCont.hexes.includes(hex as Hex2)) return true;
    return false
  }

  // AuctionTile
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    if ((targetHex == ctx.originHex)) return super.dropFunc(targetHex, ctx);

    let gamePlay = GamePlay.gamePlay;
    let player = gamePlay.curPlayer, pIndex = player.index;
    let info = [ctx.targetHex.Aname, this.Aname, this.bonus];
    let reserveTiles = gamePlay.reserveTiles[pIndex];
    let reserveHexes = gamePlay.reserveHexes[pIndex];
    let auctionTiles = this.table.auctionCont.tiles;
    let auctionHexes = this.table.auctionCont.hexes;

    // remove from reserveTiles:
    let rIndex = reserveTiles.indexOf(this)
    if (rIndex >= 0) {
      reserveTiles[rIndex] = undefined;
    }
    // remove from auctionTiles:
    let auctionNdx = auctionTiles.indexOf(this); // if from auctionTiles
    if (auctionNdx >= 0) {
      auctionTiles[auctionNdx] = undefined
      this.player = player;
    }

    super.dropFunc(targetHex, ctx); // set this.hex = targetHex, ctx.originHex.tile = undefined;
    let toHex = this.hex as Hex2;   // where GamePlay.placeTile() put it (could be back to orig.hex)
    if (toHex === undefined) return; // recycled...

    // add TO auctionTiles (from reserveHexes; see isLegalHex) FOR TEST & DEV
    let auctionNdx2 = auctionHexes.indexOf(toHex);
    if (auctionNdx2 >= 0) {
      auctionTiles[auctionNdx2]?.moveTo(ctx.originHex)
      auctionTiles[auctionNdx2] = this;
      this.player = undefined;
      this.paint(player.color); this.updateCache()
    }
    // add to reserveTiles:
    let rIndex2 = reserveHexes.indexOf(toHex)
    if (rIndex2 >= 0) {
      console.log(stime(this, `.dropFunc: Reserve[${rIndex2}]`), ...info);
      player.gamePlay.reserveAction(this, rIndex2)
    }

    if (toHex === ctx.originHex) return;

    // from market source:
    let type = className(this) as 'Busi' | 'Resi';
    if (ctx.originHex.distText.text == type) {
      this.player = player;  // set player (already painted)
      let tile = GamePlay.gamePlay.getMarketSource(type)?.nextUnit()
      tile?.paint(player.color)
    }
    if (toHex.isOnMap) {
      console.log(stime(this, `.dropFunc: Build`), ...info);
      // deposit Bribs & Actns with Player; ASSERT was from auctionTiles or reserveTiles
      if (this.bonus.brib) {
        this.removeBonus('brib');
        player.bribs += 1;        // triggers coinCounter.updateValue
      }
      if (this.bonus.actn) {
        this.removeBonus('actn');
        player.actions += 1;      // triggers actionCounter.updateValue
      }
    }
  }
}

export class Resi extends AuctionTile {
  override get nR() { return 1; } // Resi
  constructor(player?: Player, Aname?: string, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Resi')
  }
}

export class Busi extends AuctionTile {
  override get nB() { return 1; } // Busi
  constructor(player?: Player, Aname?: string, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Busi')
  }
}
export class PS extends AuctionTile {
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Pstation')
  }
}

class AdjBonusTile extends AuctionTile {

  /** dodgy? merging Bonus.type with asset/image name */
  constructor(
    public type: Bonus,
    public bonusTile = (tile: Tile) => false,
    public anyPlayer = false,
    player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap(type)        // addChild(...myMarks) sometimes FAILS to add! [or get re-added?]
    this.addChild(...this.myMarks);  // add all the stars; will tweak visibility during draw
  }

  myMarks = H.ewDirs.map(dir => {
    let mark = new BonusMark(this.type, H.dirRot[dir]);
    mark.rotation = H.dirRot[dir];
    return mark;
  });
  isBonus(tile: Tile | undefined) {
    return !!tile && this.bonusTile(tile) && (this.anyPlayer || tile.player == this.player);
  }
  get bonusTiles() { return this.hex.linkHexes.filter(hex => this.isBonus(hex.tile)).length; }

  override draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
    this.myMarks?.forEach((m, ndx) => {
      m.visible = this.hex?.isOnMap && this.isBonus(this.hex.nextHex(H.ewDirs[ndx]).tile);
    })
    return super.draw(ctx, true); // ignoreCache! draw with new visiblity (still: cache in HexMap)
  }

  override removeBonus(type?: Bonus): void {
    super.removeBonus(type);
    this.addChild(...this.myMarks);  // reinsert *these* bonus marks.
  }
}

export class Bank extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (TP.bankAdjBank || !(t instanceof Bank)) && (t.nB + t.fB) > 0;
  }
  override get nB() { return 1; }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Bank', Bank.isAdj, true, player, Aname, inf, vp, cost, econ);
  }
  override get econ() { return super.econ + this.bonusTiles }
}

export class Lake extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (t.nR + t.fR) > 0;
  }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Lake', Lake.isAdj, false, player, Aname, inf, vp, cost, econ);
  }
  override get vp() { return super.vp + this.bonusTiles; }
}
