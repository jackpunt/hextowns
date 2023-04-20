import { C, F, className, stime } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, Graphics, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { PlayerColor, TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, Hex2, HexMap, HexShape } from "./hex";
import { ImageLoader } from "./image-loader";
import { Player } from "./player";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Table } from "./table";
import { EwDir } from "./hex-intfs";

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

export type Bonus = 'star' | 'coin' | 'actn' | 'lstar'
type BonusInfo = {
  type: Bonus, x: number, y: number, size: number,
  paint?: (s: Shape, info: BonusInfo) => void
}

class BonusMark extends Shape {
  static star = 'star'
  static coin = 'coin'
  static action = 'actn'
  static bonusInfo: BonusInfo[] = [
    {
      type: 'lstar', x: 0, y: -3.1, size: TP.hexRad / 4, paint: (s, info, tilt = 90) => {
        s.graphics.f(C.briteGold).dp(info.x*info.size, info.y*info.size, info.size, 5, 2, tilt)
      }
    },
    {
      type: 'star', x: 0, y: 1.2, size: TP.hexRad / 3, paint: (s, info, tilt = -90) => {
        s.graphics.f(C.briteGold).dp(info.x * info.size, info.y * info.size, info.size, 5, 2, tilt)
      }
    },
    {
      type: 'coin', x: 1.3, y: -1.3, size: TP.hexRad / 4, paint: (s, info) => {
        s.graphics.f(C.coinGold).dc(info.x * info.size, info.y * info.size, info.size)
      }
    },
    {
      type: 'actn', x: -1.4, y: -1.3, size: TP.hexRad / 4, paint: (s, info) => {
        s.scaleX = s.scaleY = info.size / 4
        let path: [x: number, y: number][] = [[-1, 4], [2, -1], [-2, 1], [1, -4]].map(([x, y]) => [x + info.x*4, y + info.y*4])
        let g = s.graphics.ss(1).s(C.YELLOW).mt(...path.shift())
        path.map((xy) => g.lt(...xy))
        g.es()
      }
    },
  ];
  static bonusMap = new Map<Bonus, BonusInfo>()
  static ignore = BonusMark.bonusInfo.map(info => BonusMark.bonusMap.set(info.type, info));

  constructor(
    public type?: Bonus,
    public info = BonusMark.bonusMap.get(type),
  ) {
    super()
    this.info.paint(this, this.info);
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
export class Cardboard extends Container {

  static Uname = ['Univ0', 'Univ1'];
  static imageMap = new Map<string, HTMLImageElement>()
  static imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Lake', 'TownStart', 'TownHall', 'Temple', ...Cardboard.Uname],
    ext: 'png',
  };

  /** use ImageLoader to load images, THEN invoke callback. */
  static loadImages(cb: () => void) {
    new ImageLoader(Tile.imageArgs, (imap) => {
      Tile.setImageMap(imap);
      cb()
    })
  }

  static setImageMap(imap: Map<string, HTMLImageElement>) {
    Tile.imageMap = imap;
    imap.forEach((img, fn) => {
      let bm = new Bitmap(img), width = TP.hexRad
      bm.scaleX = bm.scaleY = width / Math.max(img.height, img.width);
      bm.x = bm.y = -width / 2;
      bm.y -= Tile.textSize / 2
    })
  }
  readonly childShape: PaintableShape = this.makeShape();
  /** abstract: subclass should override. */
  makeShape(): PaintableShape {
    return new TileShape();
  }
  /** paint with PlayerColor; updateCache() */
  paint(pColor?: PlayerColor, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.childShape.paint(colorn)
    this.updateCache()
  }

  readonly bonus = { star: false, coin: false, actn: false, lstar: false }
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
}

export class Tile extends Cardboard {
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
  get table() { return (this.hex instanceof Hex2) && Table.stageTable(this.hex.cont); }

  // Tile
  constructor(
    /** the owning Player. */
    public player: Player,
    public readonly Aname?: string,
    public readonly inf: number = 0,
    private readonly _vp: number = 0,
    public readonly cost: number = 1,
    public readonly econ: number = 1,
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

  get vp() { return this._vp + (this.bonus.star ? 1 : 0); }

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
    let img = Tile.imageMap.get(name);
    let bm = new Bitmap(img), width = TP.hexRad
    bm.scaleX = bm.scaleY = width / Math.max(img.height, img.width);
    bm.x = bm.y = -width / 2;
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, 1)
    this.updateCache()
  }

  setInfMark(inf = 1, rad = this.radius) {
    this.removeChildType(InfMark)
    let infMark = new InfMark(inf)
    this.addChildAt(infMark, this.children.length - 1)
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

  recycle() {
    // TODO: place in curPlayer.capturedHexes
    if (this.player) {
      console.log(stime(this, `.recycle: captured`), this.Aname, this.player?.colorn, this)
      let op = this.player.otherPlayer();
      op.captures.push(this)
      op.captureCounter.updateValue(op.captures.length)
    } else {
      console.log(stime(this, `.recycle: destoryed`), this.Aname, this.player?.colorn, this)
    }
    this.moveTo(undefined);
    this.parent.removeChild(this);
  }

  originHex: Hex2;      // where meeple was picked [dragStart]
  targetHex: Hex2;      // where meeple was placed [dropFunc] (if legal dropTarget; else originHex)
  lastShift: boolean;

  /**
   * Override in AuctionTile, Civic, Meeple/Leader
   * @param hex a potential targetHex (table.hexUnderPoint(dragObj.xy))
   */
  isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.tile) return false;
    return true;
  }

  /** override as necessary. */
  dragStart(hex: Hex2) {

  }

  /**
   * Override in AuctionTile, Civic, Meeple/Leader.
   * @param hex Hex2 this Tile is over when dropped (may be undefined; see also: TargetHex)
   * @param ctx DragInfo
   */
  dropFunc(hex: Hex2, ctx: DragInfo) {
    if (this.targetHex == this.table.recycleHex) {
      this.recycle();
      return
    }
    // this.player = this.table.gamePlay.curPlayer; // Civic *already* has player
    this.moveTo(this.targetHex);
    this.lastShift = undefined;
    // TODO: when auto-capture is working, re-assert no dragging.
    //if (this.hex instanceof Hex2 && this.hex.isOnMap && !(this instanceof Meeple)) this.mouseEnabled = false;
  }

  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc0(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2;  // player.meepleHex[]
      this.targetHex = this.originHex;
      this.lastShift = undefined;
      this.dragStart(hex);
    }
    let isRecycle = (hex == this.table.recycleHex);
    this.targetHex = (isRecycle || this.isLegalTarget(hex)) ? hex : this.originHex;
    //hex.showMark(true);

    // const shiftKey = ctx?.event?.nativeEvent?.shiftKey
    // if (shiftKey === this.lastShift && !ctx?.first && this.targetHex === hex) return;   // nothing new (unless/until ShiftKey)
    // this.lastShift = shiftKey
    // do shift-down/shift-up actions...
  }

  dropFunc0(hex: Hex2, ctx: DragInfo) {
    this.dropFunc(hex || this.targetHex, ctx)
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

  override isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.tile) return false;
    // if insufficient influence(hex) return false;
    return true;
  }

  // Civic
  override dropFunc(hex: Hex2, ctx: DragInfo): void {
    super.dropFunc(hex, ctx)
    // TODO: when auto-capture is working, re-assert no dragging.
    //this.mouseEnabled = false; // prevent dragging...
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
    addTiles(10, PS)
    addTiles(10, Lake)
  }

  /** AuctionTile */
  constructor(player: Player, ...rest) {
    super(player, ...rest)
  }

  override recycle() {
    let table = this.table; // before removeChild()
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
    table.auctionCont.tileCounter.setValue(AuctionTile.tileBag.length);
    table.hexMap.update();
  }

  indexInAuction() {
    if (!(this.hex instanceof Hex2 )) return -1;
    let table = this.table;
    let tiles = table?.auctionCont.tiles;
    return tiles ? tiles.indexOf(this) : -1;
  }

  override isLegalTarget(hex: Hex2): boolean {
    if (!hex) return false;
    if (hex.isOnMap && !hex.occupied) return true;
    let table = this.table, curNdx = table.gamePlay.curPlayerNdx;
    if (table.reserveHexes[curNdx].includes(hex)) return true;
    return false
  }

  // AuctionTile
  override dropFunc(hex: Hex2, ctx: DragInfo) {
    if (this.targetHex == this.originHex) {
      super.dropFunc(hex, ctx);
      return;
    }
    let table = this.table, player = table.gamePlay.curPlayer, curNdx = player.index;
    let tiles = table.auctionCont.tiles;
    let info = [this.targetHex.Aname, this.Aname, this.bonus, this];
    // remove from Auction:
    let auctionNdx = tiles.indexOf(this); // if from auctionTiles
    if (auctionNdx >= 0) {
      tiles[auctionNdx] = undefined
      this.player = player;
    }
    if (this.targetHex.isOnMap) {
      console.log(stime(this, `.dropFunc: Build`), ...info);
      // deposit Coins with Player; ASSERT was from auctionTiles...
      if (this.bonus.coin) {
        player.coins += 1;
        this.removeBonus('coin');
      }
      if (this.bonus.actn) {
        player.actions += 1;
        this.removeBonus('actn');
      }
    } else if (table.reserveHexes[curNdx].indexOf(this.targetHex) >= 0) {
      console.log(stime(this, `.dropFunc: Reserve`), ...info);
      // recycle underlying reserve tile:
      (this.targetHex.tile as AuctionTile)?.recycle()
    };
    super.dropFunc(hex, ctx)
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

class LakeStar extends BonusMark {
  static lStarInfo = (() => {
    let { type, size: size0, paint } = BonusMark.bonusMap.get('star')
    return { type, x: 0, y: -2, size: size0, paint }
  })();

  constructor(dir: EwDir) {
    super('lstar')//, LakeStar.lStarInfo);
    this.rotation = H.dirRot[dir]
    this.dir = dir;
  }

  dir: EwDir;
  // override draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
  //   this.visible = ((this.parent as Lake).hex?.links[this.dir]?.tile instanceof Resi) || true
  //   return super.draw(ctx, true);
  // }
}
export class Lake extends AuctionTile {

  myStars = H.ewDirs.map(dir => new LakeStar(dir));

  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(player, Aname, inf, vp, cost, econ);
    this.addImageBitmap('Lake')
    this.addChild(...this.myStars);  // add all the stars; will tweak visibility during draw
    //this.uncache()
  }

  //override updateCache(compositeOperation?: string): void { }

  override draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
      return super.draw(ctx, ignoreCache);
  }

  override get vp() {
    return this.hex.neighbors.filter(hex => hex.tile instanceof Resi).length
  }
}
