import { C, F, ImageLoader, S, className, stime } from "@thegraid/common-lib";
import { ValueEvent } from "@thegraid/easeljs-lib";
import { Bitmap, Container, DisplayObject, EventDispatcher, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import type { Debt } from "./debt";
import { GP } from "./game-play";
import { Hex, Hex2, HexMap } from "./hex";
import { H } from "./hex-intfs";
import type { Player } from "./player";
import { C1, CapMark, CenterText, InfRays, InfShape, PaintableShape, TileShape } from "./shapes";
import { DragContext } from "./table";
import { PlayerColor, PlayerColorRecord, TP, playerColorRecord, playerColorsC } from "./table-params";

export type Bonus = 'star' | 'brib' | 'actn' | 'econ' | 'Bank' | 'Lake' | 'Star';
export type AuctionBonus = Exclude<Bonus, 'Bank' | 'Lake' | 'Star'>;
type BonusObj = { [key in AuctionBonus]: boolean}

type BonusInfo<T extends DisplayObject> = {
  type: Bonus, dtype: new () => T,
  x: number, y: number, size: number,
  paint?: (s: T, info: BonusInfo<T>) => void
}

export class BonusMark extends Container {

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
      type: 'Lake', dtype: Shape, x: 0, y: -2.7, size: TP.hexRad / 4, paint: (s: Shape, info, tilt = 90) => {
        s.graphics.f(C.briteGold).dp(info.x, info.y, 1, 5, 2, tilt)
        s.scaleX = s.scaleY = info.size;
      }
    },
    {
      type: 'Star', dtype: Shape, x: 0, y: 1.2, size: TP.hexRad / 3, paint: (s: Shape, info, tilt = -90) => {
        s.graphics.f(C.briteGold).dp(info.x, info.y, 1, 5, 2, tilt)
        s.scaleX = s.scaleY = info.size;
      }
    },
    {
      type: 'star', dtype: Shape, x: 0, y: 0, size: TP.hexRad / 3, paint: (s: Shape, info, tilt = -90) => {
        s.graphics.f(C.briteGold).dp(info.x, info.y, 1, 5, 2, tilt)
        s.scaleX = s.scaleY = info.size;
      }
    },
    {
      type: 'econ', dtype: Text, x: 0, y: -1.6, size: TP.hexRad / 2, paint: (t: Text, info) => {
        t.text = '$'
        t.color = C.GREEN
        t.textAlign = 'center'
        t.font = F.fontSpec(info.size)
        t.x = info.x * info.size
        t.y = info.y * info.size
      }
    },
    {
      type: 'brib', dtype: InfShape, x: 1.3, y: -1.3, size: TP.hexRad/4, paint: (c: Container, info) => {
        c.scaleX = c.scaleY = .25;
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
    const info = BonusMark.bonusMap.get(type); // has a paint() function
    const dobj = new info.dtype();             // Shape or Text
    this.addChild(dobj) // dobj is a Shape or Text or other info.dtype()
    info.paint(dobj, info); // paint dobj with polystar(tilt) or Text(...)
    this.rotation = rotation;
  }
}

class TileLoader {
  static imageNames: string[] = [];
  Uname = ['Univ0', 'Univ1'];
  Monu = [0,1].map(k => `Monument${k}`)
  imageMap = new Map<string, HTMLImageElement>()
  imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Bank', 'Lake', 'Recycle',
      'TownStart', 'Courthouse', 'TownHall', 'Temple',
      ...this.Monu, ...this.Uname],
    ext: 'png',
  };

  /** use ImageLoader to load images, THEN invoke callback. */
  loadImages(cb: () => void) {
    new ImageLoader(this.imageArgs, this.imageMap, (imap) => cb())
  }
}

/** Someday refactor: all the cardboard bits (Tiles, Meeples & Coins) */
class Tile0 extends Container {
  static loader = new TileLoader();
  // constructor() { super(); }

  public player: Player;
  get infColor() { return this.player?.color }
  get recycleVerb(): string { return 'demolished'; }

  /** name in set of filenames loaded in GameSetup */
  addImageBitmap(name: string) {
    const img = Tile0.loader.imageMap.get(name), bm = new Bitmap(img);
    const width = TP.hexRad, scale = width / Math.max(img.height, img.width);
    bm.scaleX = bm.scaleY = scale;
    const sw = img.width * scale, sh = img.height * scale;
    bm.x = -sw / 2;
    bm.y = -sh / 2;
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, 1)
    return bm;
  }

  get radius() { return TP.hexRad};
  readonly baseShape: PaintableShape = this.makeShape();

  /** Default is TileShape; a HexShape with translucent disk.
   * add more graphics with paint(colorn)
   * also: addBitmapImage()
   */
  makeShape(): PaintableShape {
    return new TileShape(this.radius)
  }

  /** will override for Meeple's xy offset. */
  hexUnderObj(hexMap: HexMap) {
    let dragObj = this;
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, hexMap.mapCont.hexCont)
    return hexMap.hexUnderPoint(pt.x, pt.y)
  }

  lastColor: PlayerColor;
  /** paint with PlayerColor; updateCache()
   * @param pColor the 'short' PlayerColor
   * @param colorn the actual color (default = TP.colorScheme[pColor])
   */
  paint(pColor = this.lastColor, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.lastColor = pColor;
    this.baseShape.paint(colorn); // recache baseShape
    this.updateCache()
  }

  // Looks just like the Bonus star!
  drawStar() {
    const star = this.addChildAt(new Shape(), 1);
    const info = BonusMark.bonusMap.get('Star');
    info.paint(star, info);
    this.updateCache();
    return star;
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
    Object.values(this.bonus).forEach(value => rv += (value ? 1 : 0));
    return rv;
  }

  forEachBonus(f: (b: AuctionBonus, v: boolean) => void) {
    Object.keys(this.bonus).forEach((k: AuctionBonus) => f(k, this.bonus[k]));
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

  loanLimit = 0;
  _debt: Debt;
  get debt() { return this._debt; }
  set debt(debt: Debt) { this._debt = debt; } // Hmm... if (debt === undefined) recycleTile(_debt) ?

  homeHex: Hex = undefined;

  get infP() { return this.inf }

  get vp() { return this.debt ? 0 : this._vp + (this.bonus.star ? 1 : 0); } // override in Lake
  get econ() { return this._econ + (this.bonus.econ ? 1 : 0); } // override in Bank
  get cost() { return this._cost; }

  static costMark: Text = new CenterText('$ 0');
  showCostMark(show = true, dy = .5) {
    const mark = Tile.costMark;
    if (!show) {
      this.removeChild(mark);
    } else {
      const [infR, costR] = GP.gamePlay.getInfR(this);
      mark.text = `$ ${costR}`;
      mark.y = TP.hexRad * dy;
      this.addChild(mark);
    }
    this.updateCache();
  }

  // Tile
  constructor(
    /** the owning Player. */
    player: Player,
    public readonly Aname?: string,
    public readonly inf: number = 0,
    private readonly _vp: number = 0,
    public readonly _cost: number = 1,
    public readonly _econ: number = 1,
  ) {
    super()
    this.player = player;
    Tile.allTiles.push(this);
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`;
    const rad = this.radius;
    this.cache(-rad, -rad, 2 * rad, 2 * rad);
    this.addChild(this.baseShape);        // index = 0
    this.nameText = this.addNameText();   // index = 1
    this.infText = this.addNameText('', rad / 2)
    if (inf > 0) this.setInfRays(inf);
    if (_vp > 0) this.drawStar();
    this.paint();
  }

  override toString(): string {
    return `${this.Aname}@${this.hex?.Aname ?? '?'}`;
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
  setInfText(text = '') {
    this.infText.text = text;
    this.updateCache()
  }

  isThreat: PlayerColorRecord<boolean> = playerColorRecord(false, false, false);

  clearThreats() {
    this.isThreat = playerColorRecord(false, false, false);
    Object.values(this.capMarks).forEach(cm => cm && (cm.visible = false))
  }

  assessThreat(atkr: PlayerColor) {
    this.isThreat[atkr] = this.infColor && (this.hex.getInfT(this.infColor) < this.hex.getInfT(atkr));
  }
  assessThreats() {
    playerColorsC.forEach(pc => this.assessThreat(pc) )
  }
  capMarks: PlayerColorRecord<CapMark> = playerColorRecord()

  setCapMark(pc: PlayerColor, capMark = CapMark) {
    const vis = this.isThreat[pc];
    let mark = this.capMarks[pc]
    if (vis && !mark) {
      mark = this.capMarks[pc] = new capMark(pc);
    }
    if (mark) {
      this.addChild(mark);
      mark.visible = vis;
      this.updateCache()
    };
  }

  addNameText(name = this.Aname, y0 = this.radius / 2) {
    let nameText = new CenterText(name, Tile.textSize);
    nameText.y = y0;         // Meeple overrides in constructor!
    nameText.visible = false
    this.addChild(nameText);
    return nameText;
  }

  textVis(vis = !this.nameText.visible) {
    this.nameText.visible = vis
    this.infText.visible = vis
    this.updateCache()
  }

  rightClickable() {
    this.on(S.click, (evt: MouseEvent) => {
      const nevt = evt.nativeEvent;
      if (nevt.button != 2) return;
      this.onRightClick(evt);
      nevt.preventDefault();           // evt is non-cancelable, but stop the native event...
      nevt.stopImmediatePropagation(); // TODO: prevent Dragger.clickToDrag() when button !== 0
    }, this, false, {}, true);
  }

  onRightClick(evt: MouseEvent) {
    console.log(stime(this, `.rightclick: ${this}`), this);
  }

  // Tile
  /** Post-condition: tile.hex == hex; */
  moveTo(hex: Hex) {
    this.hex = hex;     // INCLUDES: hex.tile = tile
    return hex;
  }

  resetTile() {
    this.clearThreats();
    this.removeBonus();
    this.x = this.y = 0;
    this.setInfText();
    this.setInfRays(0);
    this.debt?.sendHome(); // sets this.debt = undefined;
  }

  /**
   * After Capture or Recycle/Replace.
   * Post-condition: !tile.hex.isOnMap; tile.hex = this.homeHex may be undefined [UnitSource, AuctionTile, BonusTile]
   */
  sendHome() {
    this.resetTile();
    this.moveTo(this.homeHex) // override for AucionTile.tileBag & UnitSource<Meeple>
    if (!this.homeHex) this.parent.removeChild(this);
  }

  /**
   * Augment Table.dragFunc0().
   *
   * isLegal already set;
   * record ctx.targetHex & showMark() when Tile is over a legal targetHex.
   */
  dragFunc0(hex: Hex2, ctx: DragContext) {
    ctx.targetHex = hex?.isLegal ? hex : ctx.originHex;
    ctx.targetHex.map.showMark(ctx.targetHex);
  }

  /** entry point from Table.dropFunc; delegate to this.dropFunc() */
  dropFunc0(hex: Hex2, ctx: DragContext) {
    this.dropFunc(ctx.targetHex, ctx);
    ctx.targetHex.map.showMark(undefined);
    this.showCostMark(false); // QQQ: should this be in dropFunc() ??
  }

  canBeMovedBy(player: Player, ctx: DragContext) {
    return (ctx.lastShift || this.player === undefined || this.player === player);
  }

  /** override as necessary. */
  dragStart(hex: Hex2, ctx: DragContext) {
    this.clearThreats();  // when lifting a Tile from map, hide the CapMarks
  }

  /** state of shiftKey has changed during drag */
  dragShift(shiftKey: boolean, ctx: DragContext) { }

  /**
   * Override in AuctionTile, Civic, Meeple/Leader
   * @param hex a potential targetHex (table.hexUnderPoint(dragObj.xy))
   */
  isLegalTarget(hex: Hex) {
    if (!hex) return false;
    if (hex.tile
      && !(hex.tile instanceof BonusTile)
      && !(GP.gamePlay.reserveHexesP.includes(hex))
    ) return false; // note: from AuctionHexes to Reserve overrides this.
    if (hex.meep && (hex.meep.player !== GP.gamePlay.curPlayer)) return false;
    if (GP.gamePlay.failToPayCost(this, hex, false)) return false;
    // if (hex.isLegalTarget)
    // TODO: when auto-capture is working, re-assert no dragging.
    // if ((this.hex as Hex2).isOnMap) return false;
    return true;
  }

  isLegalRecycle(ctx: DragContext) {
    return true;
  }

  /**
   * Tile.dropFunc; Override in AuctionTile, Civic, Meeple/Leader.
   * @param targetHex Hex2 this Tile is over when dropped (may be undefined; see also: ctx.targetHex)
   * @param ctx DragContext
   */
  dropFunc(targetHex: Hex2, ctx: DragContext) {
    GP.gamePlay.placeTile(this, targetHex);
  }
}

/** Marker class: a Tile that is not draggable */
export class NoDragTile extends Tile {}

/**
 * Tiles placed on map (preGame) when replaced by another AuctionTile,
 * The placing player receives the bonus indicated (as if that bonus was on the newly placed tile)
 * econ & star bonus transfer to the newly placed Tile;
 * actn & brib bonus transfer to the Player.
 *
 * BonusTile.isOnMap but tile.player === undefined!
 */
export class BonusTile extends Tile {
  constructor(
    public type: AuctionBonus | undefined,
  ) {
    super(undefined, undefined, 0, 0, 0, 0);
    if (type) this.addBonus(type);
  }
  // Maybe augment sendHome to transfer Bonus to hex.tile??
}

// Leader.civicTile -> Civic; Civic does not point to its leader...
export class Civic extends Tile {
  constructor(player: Player, type: string, image: string, inf = 1, vp = 1, cost = 2, econ = 1) {
    super(player, `${type}:${player.index}`, inf, vp, cost, econ);
    this.player = player;
    this.loanLimit = 10;
    this.addImageBitmap(image);
    player.civicTiles.push(this);
  }

  override isLegalTarget(hex: Hex) { // Civic
    if (!super.isLegalTarget(hex)) return false; // check cost & influence (& balance)
    if (hex == GP.gamePlay.recycleHex) return true;
    if (!hex.isOnMap) return false;
    return true;
  }

  override sendHome() {   // Civic - put under Leader
    super.sendHome();
    this.parent.addChildAt(this, 1); // under meeple
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
      super.dropFunc(targetHex, ctx);
      // placing a Civic changes the cost of Auction Tiles:
      GP.gamePlay.updateCostCounters();
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

export class Courthouse extends Civic {
  constructor(player: Player) {
    super(player, 'CH', 'Courthouse')
  }
}

export class University extends Civic {
  override get fB() { return 1; } // Univ
  override get fR() { return 1; } // Univ
  constructor(player: Player) {
    super(player, 'U', Tile.loader.Uname[player.index])
  }
}

export class Church extends Civic {
  override get fR() { return 1; } // Church
  constructor(player: Player) {
    super(player, 'T', 'Temple')
  }
}

export class TileBag<T extends Tile> extends Array<T> {
  static event = 'event';
  constructor() {
    super()
    EventDispatcher.initialize(this);  // so 'this' implements EventDispatcher
  }

  get asDispatcher() { return this as any as EventDispatcher; }

  /** dispatch a ValueEvent to this EventDispatcher. */
  dispatch(type: string = TileBag.event, value: number = this.length) {
    ValueEvent.dispatchValueEvent(this as any as EventDispatcher, type, value)
  }

  inTheBag() {
    const counts = {};
    const inBagNames = this.map(tile => className(tile)).sort();
    inBagNames.forEach(name => counts[name] = (counts[name] ?? 0) + 1);
    return counts;
  }

  takeType(type: new () => T) {
    let index = -1;
    const tile = this.find((t, i) => (t instanceof type) && (index = i, true));
    if (!tile) return undefined;
    this.splice(index, 1)
    this.dispatch();
    return tile;
  }

  /** take specific tile from tileBag */
  takeTile(tile: T) {
    let index = this.indexOf(tile)
    if (index < 0) return undefined;
    this.splice(index, 1)
    this.dispatch();
    return tile;
  }

  selectOne(remove = true) {
    let index = Math.floor(Math.random() * this.length)
    let tile = this.splice(index, 1)[0];
    if (!remove) this.push(tile);
    this.dispatch();
    return tile;
  }

  // TODO: also push, pop, shift?
  override unshift(...items: T[]): number {
    const rv = super.unshift(...items);
    this.dispatch();
    return rv
  }
}
export class AuctionTile extends Tile {

  static fillBag(tileBag: TileBag<AuctionTile>) {
    let addTiles = (n: number, type: new () => AuctionTile) => {
      for (let i = 0; i < n; i++) {
        let tile = new type();
        tileBag.push(tile);
      }
    }
    tileBag.length = 0;
    addTiles(TP.busiPerPlayer * 2 - TP.inMarket['Busi'], Busi)
    addTiles(TP.resiPerPlayer * 2 - TP.inMarket['Resi'], Resi)
    addTiles(TP.pstaPerPlayer * 2, PS)
    addTiles(TP.bankPerPlayer * 2, Bank)
    addTiles(TP.lakePerPlayer * 2, Lake)
    tileBag.dispatch();
  }

  /** AuctionTile */
  constructor(player: Player, Aname?: string, inf?: number, vp?: number, cost?: number, econ?: number) {
    super(player, Aname, inf, vp, cost, econ)
  }

  sendToBag() {
    console.log(stime(this, `.sendHome: tileBag.unshift()`), this.Aname, this.player?.colorn, this);
    GP.gamePlay.shifter.tileBag.unshift(this);
  }

  // from map: capture/destroy; from auction: outShift; from Market: recycle [unlikely]
  override sendHome(): void {  // AuctionTile: removeBonus; to tileBag
    super.sendHome();          // resetTile(); this.hex = undefined
    this.player = undefined;
    this.sendToBag();
    GP.gamePlay.hexMap.update();
  }

  override canBeMovedBy(player: Player, ctx: DragContext): boolean {
    if (!super.canBeMovedBy(player, ctx)) return false;
    // exclude opponent's [unowned] private auction Tiles:
    const gamePlay = GP.gamePlay;
    const ndx = gamePlay.auctionTiles.indexOf(this);
    const plyr = gamePlay.shifter.getPlayer(ndx, true);
    return (plyr === true) ? true : (plyr === player);
  }

  override addBonus(type: AuctionBonus): BonusMark {
    if (GP.gamePlay.auctionTiles.includes(this)) {
      console.log(stime(this, `.addBonus`), { tile: this, type })
    }
    return super.addBonus(type);
  }


  override isLegalTarget(toHex: Hex): boolean { // AuctionTile
    if (!super.isLegalTarget(toHex)) return false; // allows dropping on occupied reserveHexes
    const gamePlay = GP.gamePlay;
    if (!toHex.isOnMap) {
      if (gamePlay.recycleHex === toHex) return true; // && this.hex.isOnMap (OH! recycle from AuctionHexes)
      const reserveHexes = gamePlay.reserveHexesP;
      // AuctionTile can go toReserve:
      if (reserveHexes.includes(toHex)) return true;
      // TODO: during dev/testing: allow return to auctionHexes, if fromReserve
      if (gamePlay.auctionHexes.includes(toHex as Hex2)
        && reserveHexes.includes(this.hex)) return true;
      return false;
    }
    // cannot place on Tile (unless BonusTile) or other's meep (AuctionTile can go under out meep)
    if (toHex.tile && !(toHex.tile instanceof BonusTile)) return false;
    if (toHex.meep && toHex.meep.player !== gamePlay.curPlayer) return false;
    if (gamePlay.failToBalance(this)) return false;
    return true
  }

  flipOwner(player: Player, gamePlay = GP.gamePlay) {
    gamePlay.logText(`Flip ${this} to ${player.colorn}`)
    this.debt?.sendHome(); // foreclose any mortgage
    if (this.infP > 0) {
      gamePlay.decrInfluence(this.hex, this.infP, this.player.color)
      gamePlay.decrInfluence(this.hex, this.infP, player.color)
    }
    this.player = player;  // Flip ownership
    this.paint(player.color);
    player.updateCounters();
    gamePlay.hexMap.update();
  }

  // AuctionTile
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    let gamePlay = GP.gamePlay;
    let player = gamePlay.curPlayer, pIndex = player.index;

    if ((targetHex === ctx.originHex)) {
      // flip if Infl:
      if (targetHex.isOnMap && targetHex.getInfT(player.color) > targetHex.getInfT(this.player.color)) {
        this.flipOwner(player, gamePlay);
      }
      // flip if ctrlKey:
      if (targetHex.isOnMap && ctx.lastCtrl) {
        this.flipOwner(this.player.otherPlayer, gamePlay);
      }
      return super.dropFunc(targetHex, ctx);
    }

    const targetTile = targetHex.tile; // generally undefined; except BonusTile (or ReserveHexes.tile)
    const info = [this.Aname, ctx.targetHex.Aname, this.bonus];
    const reserveTiles = gamePlay.reserveTiles[pIndex];
    const reserveHexes = gamePlay.reserveHexes[pIndex];
    const auctionTiles = gamePlay.auctionTiles;

    // remove from reserveTiles:
    const rIndex = reserveTiles.indexOf(this)
    if (rIndex >= 0) {
      reserveTiles[rIndex] = undefined;
    }
    // remove from auctionTiles:
    const auctionNdx = auctionTiles.indexOf(this); // if from auctionTiles
    if (auctionNdx >= 0) {
      auctionTiles[auctionNdx] = undefined;
      this.player = player;
    }

    // placeTile(this, targetHex); moveTo(targetHex);
    super.dropFunc(targetHex, ctx);  // set this.hex = targetHex, ctx.originHex.tile = undefined;
    const toHex = this.hex as Hex2;  // where GamePlay.placeTile() put it (could be back to orig.hex)

    // add TO auctionTiles (from reserveHexes; see isLegalTarget) FOR TEST & DEV
    const auctionNdx2 = gamePlay.auctionHexes.indexOf(toHex);
    if (auctionNdx2 >= 0) {
      auctionTiles[auctionNdx2]?.moveTo(ctx.originHex);  // if something there, swap it to fromHex
      auctionTiles[auctionNdx2] = this;
      this.player = undefined;
      this.paint(player.color);
      this.updateCache();
    }
    // add to reserveTiles:
    const rIndex2 = reserveHexes.indexOf(toHex)
    if (rIndex2 >= 0) {
      console.log(stime(this, `.dropFunc: Reserve[${rIndex2}]`), ...info);
      player.gamePlay.reserveAction(this, rIndex2)
    }

    if (toHex === ctx.originHex) return;

    // from market source:
    gamePlay.fromMarket(ctx.originHex)?.nextUnit();
    gamePlay.updateCostCounters(); // update if fromMarket (or toMarket!)

    if (this.player && this.inf) this.setInfRays();

    // (toHex === undefined) when this Tile is recycled
    if (toHex?.isOnMap) {
      if (targetTile instanceof BonusTile) {
        targetTile.forEachBonus((b, v) => v && this.addBonus(b) )
        targetTile.sendHome();
      }

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
export class Monument extends AuctionTile {
  static inst = [0,0];
  static fibcost = [1, 1, 2, 3, 5, 8, 13, 21];
  static tricost = [1, 3, 6, 10, 15, 21, 28, 36];
  static lincost = [2, 4, 7, 11, 16, 22, 29];
  static ln2cost = [2, 2, 4, 4, 7, 7, 11, 11];
  static cost = Monument.lincost; // + 1 for this.inf
  static costs = Monument.cost.slice(0, TP.inMarket['Monument']).reverse();
  constructor(player?: Player, Aname = `Mnt:${player?.index ?? '?'}-${Monument.inst[player?.index ?? 0]}`, inf = 1, vp = 1, cost = 0, econ = -1) {
    super(player, Aname, inf, vp, cost, econ);
    //this.addImageBitmap(`Monument${Monument.inst % Tile0.loader.Monu.length}`);
    this.addImageBitmap(`Monument1`);
    Monument.inst[player?.index ?? 0]++;
  }
  override sendToBag(): void {}
  override get cost(): number {
    return Monument.costs[GP.gamePlay.marketSource[this.player.index]['Monument'].counter.getValue()];
  }
}


export class Resi extends AuctionTile {
  override get nR() { return 1; } // Resi
  constructor(player?: Player, Aname?: string, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Resi');
    this.loanLimit = 6;
  }
}

export class Busi extends AuctionTile {
  override get nB() { return 1; } // Busi
  constructor(player?: Player, Aname?: string, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Busi');
    this.loanLimit = 7;
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
    public isAdjFn = (tile: Tile) => false,
    public anyPlayer = TP.anyPlayerAdj, // true -> bonus for adj tile, even if owner is different
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
    return !!tile && this.isAdjFn(tile) && (this.anyPlayer || tile.player === this.player);
  }

  get adjBonus() { return this.hex.linkHexes.filter(hex => this.isBonus(hex.tile)).length; }

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
    this.loanLimit = 8;
  }
  override get econ() { return super.econ + this.adjBonus }
}

export class Lake extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (t.nR + t.fR) > 0;
  }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Lake', Lake.isAdj, false, player, Aname, inf, vp, cost, econ);
  }
  override get vp() { return super.vp + this.adjBonus; }
}
