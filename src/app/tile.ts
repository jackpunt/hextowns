import { C, F, className, stime } from "@thegraid/common-lib";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Bitmap, Container, DisplayObject, Graphics, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexShape } from "./hex";
import { EwDir, H } from "./hex-intfs";
import { ImageLoader } from "./image-loader";
import { Player } from "./player";
import { PlayerColor, TP } from "./table-params";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightergrey = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
}

export interface PaintableShape extends Shape {
  /** paint with new player color; updateCache() */
  paint(colorn: string): Graphics;
}

class TileShape extends HexShape implements PaintableShape {
  /** HexShape filled with colored disk: */
  override paint(colorn: string) {
    let r2 = this.radius * H.sqrt3 * .5 * (55 / 60);
    super.paint(colorn).f(C1.lightergrey).dc(0, 0, r2)
    return this.graphics
  }
}

export type Bonus = 'star' | 'coin' | 'actn' | 'econ' | 'Bank' | 'Lake'
type BonusInfo<T extends DisplayObject> = {
  type: Bonus, dtype: new () => T,
  x: number, y: number, size: number,
  paint?: (s: T, info: BonusInfo<T>) => void
}

class BonusMark extends Container {

  static bonusInfo: BonusInfo<DisplayObject>[] = [
    {
      type: 'Bank', dtype: Text, x: 0, y: -2.6, size: TP.hexRad / 3, paint: (t: Text, info, tilt = 90) => {
        t.text = '$'
        t.color = C.GREEN
        t.textAlign = 'center'
        t.font = F.fontSpec(info.size)
        t.x = info.x * info.size
        t.y = info.y * info.size
      }
    },
    {
      type: 'econ', dtype: Text, x: 0, y: -2.6, size: TP.hexRad / 3, paint: (t: Text, info, tilt = 90) => {
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
        s.graphics.f(C.briteGold).dp(info.x*info.size, info.y*info.size, info.size, 5, 2, tilt)
      }
    },
    {
      type: 'star', dtype: Shape, x: 0, y: 1.2, size: TP.hexRad / 3, paint: (s: Shape, info, tilt = -90) => {
        s.graphics.f(C.briteGold).dp(info.x * info.size, info.y * info.size, info.size, 5, 2, tilt)
      }
    },
    {
      type: 'coin', dtype: Shape, x: 1.3, y: -1.3, size: TP.hexRad / 4, paint: (s: Shape, info) => {
        s.graphics.f(C.coinGold).dc(info.x * info.size, info.y * info.size, info.size)
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
    public info = BonusMark.bonusMap.get(type),
    public mark = new info.dtype(),
  ) {
    super()
    this.addChild(mark)
    this.info.paint(this.mark, this.info);
  }
}

export class InfMark extends Container {
  constructor(inf = 1) {
    super()
    let color = (inf > 0) ? C.WHITE : C.BLACK;
    let rad = TP.hexRad, xs = [[0], [-.1, +.1], [-.1, 0, +.1]][Math.abs(inf) - 1];
    H.ewDirs.forEach(dir => {
      let sl = new Shape(), gl = sl.graphics
      gl.ss(3).s(color)
      xs.forEach(x => gl.mt(rad * x, rad * .7).lt(rad * x, rad * .9))
      sl.rotation = H.dirRot[dir]
      this.addChild(sl)
    })
    this.cache(-rad, -rad, 2 * rad, 2 * rad)
  }
}

/** Someday refactor: all the cardboard bits (Tiles, Meeples & Coins) */
export class Tile0 extends Container {

  static Uname = ['Univ0', 'Univ1'];
  static imageMap = new Map<string, HTMLImageElement>()
  static imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Bank', 'Lake', 'TownStart', 'TownHall', 'Temple', ...Tile0.Uname],
    ext: 'png',
  };

  /** use ImageLoader to load images, THEN invoke callback. */
  static loadImages(cb: () => void) {
    new ImageLoader(Tile0.imageArgs, Tile0.imageMap, (imap) => cb())
  }

  readonly childShape: PaintableShape = this.makeShape();
  /** abstract: subclass should override. */
  makeShape(): PaintableShape {
    return new TileShape();
  }
  /** paint with PlayerColor; updateCache() */
  paint(pColor?: PlayerColor, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.childShape.paint(colorn); // recache childShape
    this.updateCache()
  }

  readonly bonus = { star: false, coin: false, actn: false, econ: false }
  addBonus(type: Bonus) {
    let mark = new BonusMark(type);
    this.bonus[type] = true;
    this.addChildAt(mark, this.numChildren -1);
    this.paint();
    return mark
  }

  removeBonus(type?: Bonus) {
    if (!type) {
      BonusMark.bonusInfo.forEach(info => this.removeBonus(info.type))
      return
    }
    this.bonus[type] = false;
    this.removeChildType(BonusMark, (c: BonusMark) => (c.info.type == type))
    this.paint();
  }

  removeChildType(type: new() => DisplayObject, pred = (dobj: DisplayObject) => true ) {
    let mark: DisplayObject;
    while (mark = this.children.find(c => (c instanceof type) && pred(c))) {
      this.removeChild(mark)
    }
    this.updateCache()
  }

  updateCounters(player: Player) {
    // need to [always] update these after Action...
    // also: Shift-Drop to put Tile back in Auction [Reserve]
    player.econCounter.updateValue(player.econs)
    player.expenseCounter.updateValue(player.expenses)
    player.vpCounter.updateValue(player.vps)
    player.gamePlay.hexMap.update()
  }
}

export class Tile extends Tile0 {
  static allTiles: Tile[] = [];
  static serial = 0;    // serial number of each Tile created

  static textSize = 14;
  nameText: Text;

  _hex: Hex = undefined;
  /** the map Hex on which this Tile sits. */
  get hex() { return this._hex; }
  /** only one Tile on a Hex, Tile on only one Hex */
  set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.tile = undefined
    this._hex = hex
    if (hex !== undefined) hex.tile = this;
  }
  get table() { return (GamePlay.gamePlay as GamePlay).table; }

  // Tile
  constructor(
    /** the owning Player. */
    public player: Player,
    public readonly Aname?: string,
    public readonly inf: number = 0,
    private readonly _vp: number = 0,
    public readonly cost: number = 1,
    public readonly _econ: number = 1,
  ) {
    super()
    let radius = this.radius
    Tile.allTiles.push(this);
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`;
    this.cache(-radius, -radius, 2 * radius, 2 * radius)
    this.addChild(this.childShape)// index = 0
    this.addNameText()            // index = 1
    if (inf > 0) this.setInfMark(inf)
    this.paint()
  }

  pinf = false;  // provides positive inf (Civic does this, bonus on AuctionTile)
  ninf = false;  // provides negative inf (slum does this: permanent Criminal on Tile)

  get vp() { return this._vp + (this.bonus.star ? 1 : 0); } // override in Lake
  get econ() { return this._econ + (this.bonus.econ ? 1 : 0); } // override in Bank

  get radius() { return TP.hexRad};
  override makeShape(): PaintableShape {
    return new TileShape(this.radius)
  }

  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.childShape.paint(colorn)
    this.updateCache(); // draw other children and re-cache.
  }

  /** name in set of filenames loaded in GameSetup */
  addImageBitmap(name: string) {
    let img = Tile.imageMap.get(name), bm = new Bitmap(img);
    let width = TP.hexRad
    bm.scaleX = bm.scaleY = width / Math.max(img.height, img.width);
    bm.x = bm.y = -width / 2;
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, 1)
    this.updateCache()
  }

  setInfMark(inf = 1, rad = this.radius) {
    this.removeChildType(InfMark)
    if (inf !== 0) {
      this.addChildAt(new InfMark(inf), this.children.length - 1)
    }
    this.cache(-rad, -rad, 2 * rad, 2 * rad)
  }

  addNameText() {
    let nameText = this.nameText = new Text(this.Aname, F.fontSpec(Tile.textSize))
    nameText.textAlign = 'center'
    nameText.y = (this.radius - Tile.textSize) * .55;
    nameText.visible = false
    this.addChild(nameText);
  }

  textVis(vis = !this.nameText.visible) {
    this.nameText.visible = vis
    this.updateCache()
  }

  onRightClick(evt: MouseEvent) {
    console.log(stime(this, `.rightclick:`), this.Aname, evt)

  }

  // Tile
  moveTo(hex: Hex) {
    this.hex = hex;     // INCLUDES: hex.tile = tile
    return hex;
  }

  // Tile
  recycle() {
    let cp = GamePlay.gamePlay.curPlayer
    if (this.player) {
      cp.capture_push(this);
      console.log(stime(this, `.recycle: captured`), this.Aname, cp.colorn, this.hex.Aname)
    } else {
      console.log(stime(this, `.recycle: destroyed`), this.Aname, cp.colorn, this.hex.Aname)
    }
    this.moveTo(undefined);
    this.parent.removeChild(this);
  }

  originHex: Hex2;      // where meeple was picked [dragStart]
  targetHex: Hex2;      // where meeple was placed [dropFunc] (if legal dropTarget; else originHex)
  lastShift: boolean;

  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc0(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2;  // player.meepleHex[]
      this.targetHex = this.originHex;
      this.lastShift = undefined;
      this.dragStart(hex);
    }
    let isCapture = (hex == this.table.recycleHex); // dev/test: use manual capture.
    this.targetHex = (isCapture || this.isLegalTarget(hex)) ? hex : this.originHex;
    //hex.showMark(true);

    // track shiftKey because we don't pass 'event' to isLegalTarget(hex)
    const shiftKey = ctx?.event?.nativeEvent?.shiftKey
    if (ctx?.first || shiftKey !== this.lastShift || this.targetHex !== hex) {
      this.lastShift = shiftKey
      // do shift-down/shift-up actions...
      this.dragShift(shiftKey);
    }
  }

  dropFunc0(hex: Hex2, ctx: DragInfo) {
    this.dropFunc(hex || this.targetHex, ctx)
    this.lastShift = undefined;
  }

  /** override as necessary. */
  dragStart(hex: Hex2) {}

  /** state of shiftKey has changed during drag */
  dragShift(shiftKey: boolean) {}

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
   * @param hex Hex2 this Tile is over when dropped (may be undefined; see also: TargetHex)
   * @param ctx DragInfo
   */
  dropFunc(hex: Hex2, ctx: DragInfo) {
    if (this.targetHex == this.table.recycleHex) {
      this.recycle();
      return
    }
    this.moveTo(this.targetHex);
  }
}

// Leader.civicTile -> Civic; Civic does not point to its leader...
export class Civic extends Tile {
  constructor(player: Player, type: string, image: string, inf = 1, vp = 1, cost = 2, econ = 1) {
    super(player, `${type}-${player.index}`, inf, vp, cost, econ);
    this.player = player;
    this.addImageBitmap(image);
    this.addBonus('star').y += this.radius/12;
    player.civicTiles.push(this);
  }

  override isLegalTarget(hex: Hex) {
    if (!hex) return false;
    if (hex.tile) return false;
    // if insufficient influence(hex) return false;
    return true;
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
  constructor(player: Player) {
    super(player, 'U', Tile.Uname[player.index])
  }
}

export class Church extends Civic {
  constructor(player: Player) {
    super(player, 'C', 'Temple')
  }
}

export class AuctionTile extends Tile {

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
    addTiles(20, Resi)
    addTiles(20, Busi)
    addTiles(5, PS)
    addTiles(5, Bank)
    addTiles(5, Lake)
  }

  /** AuctionTile */
  constructor(player: Player, Aname?: string, inf?, vp?, cost?, econ?) {
    super(player, Aname, inf, vp, cost, econ)
  }

  override recycle() {
    this.removeBonus();
    if ((this.hex as Hex2)?.isOnMap) {
      super.recycle();  // treat as Capture, not recycle to tilebag.
      return;
    }
    console.log(stime(this, `.recycle: to tileBag`), this.Aname, this.player?.colorn, this)
    this.hex = undefined;
    this.x = this.y = 0;
    this.parent.removeChild(this);
    AuctionTile.tileBag.unshift(this)
    this.table.auctionCont.tileCounter.setValue(AuctionTile.tileBag.length);
    this.table.hexMap.update();
  }

  indexInAuction() {
    return GamePlay.gamePlay.auctionTiles.indexOf(this);
  }

  override isLegalTarget(hex: Hex): boolean {
    if (!hex) return false;
    let curPlayer = GamePlay.gamePlay.curPlayer, curNdx = curPlayer.index;
    if (hex.isOnMap && !hex.tile && (!hex.meep || hex.meep.player == curPlayer)) return true;
    if (this.table.reserveHexes[curNdx].includes(hex as Hex2)) return true;
    // TODO: during dev/testing: allow return to auction, using shift key:
    if (this.table.auctionCont.hexes.includes(hex as Hex2) && this.lastShift) return true;
    return false
  }

  // AuctionTile
  override dropFunc(hex: Hex2, ctx: DragInfo) {
    let player = GamePlay.gamePlay.curPlayer, pIndex = player.index;
    let info = [this.targetHex.Aname, this.Aname, this.bonus, this];
    if (this.targetHex !== this.originHex) {
      let tiles = this.table.auctionCont.tiles;
      // remove from Auction:
      let auctionNdx = tiles.indexOf(this); // if from auctionTiles
      if (auctionNdx >= 0) {
        tiles[auctionNdx] = undefined
        this.player = player;
      }
      let rIndex = this.table.reserveHexes[pIndex].indexOf(this.targetHex)
      if (rIndex >= 0) {
        console.log(stime(this, `.dropFunc: Reserve`), ...info);
        player.gamePlay.reserve(this, rIndex)
      }
    }
    super.dropFunc(hex, ctx)
    if (this.targetHex.isOnMap) {
      console.log(stime(this, `.dropFunc: Build`), ...info);
      // deposit Coins with Player; ASSERT was from auctionTiles...
      if (this.bonus.coin) {
        this.removeBonus('coin');
        player.coins += 1;        // triggers coinCounter.updateValue
      }
      if (this.bonus.actn) {
        this.removeBonus('actn');
        player.actions += 1;      // triggers actionCounter.updateValue
      }
    }
    this.updateCounters(player)
  }
}

export class Resi extends AuctionTile {
  constructor(player?: Player, Aname?: string, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Resi')
  }
}

export class Busi extends AuctionTile {
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
    public claz: new () => AuctionTile,
     player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap(type)
    this.addChild(...this.myMarks);  // add all the stars; will tweak visibility during draw
  }

  myMarks = H.ewDirs.map(dir => {
    let mark = new BonusMark(this.type);
    mark.rotation = H.dirRot[dir];
    return mark;
  });

  override draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
    this.myMarks?.forEach((m, ndx) => {
      let tile = this.hex?.nextHex(H.ewDirs[ndx]).tile; // may be undefined
      m.visible = ((tile instanceof this.claz) && tile.player == this.player);
    })
    return super.draw(ctx, true); // ignoreCache! draw with new visiblity (still: cache in HexMap)
  }
  get clazCount() {
    return this.hex.neighbors.filter(hex => (hex.tile instanceof this.claz) && (hex.tile?.player == this.player)).length
  }
}

export class Bank extends AdjBonusTile {
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Bank', Busi, player, Aname, inf, vp, cost, econ);
  }
  override get econ() { return super.econ + this.clazCount }
}

export class Lake extends AdjBonusTile {
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Lake', Resi, player, Aname, inf, vp, cost, econ);
  }
  override get vp() { return super.vp + this.clazCount; }
}
