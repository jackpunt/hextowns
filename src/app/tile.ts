import { C, F, className, stime } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, Graphics, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { PlayerColor, TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, Hex2, HexMap, HexShape } from "./hex";
import { ImageLoader } from "./image-loader";
import { Player } from "./player";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Table } from "./table";
import { Meeple } from "./meeple";

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

class StarMark extends Shape {
  constructor(size = TP.hexRad/3, tilt = -90) {
    super()
    this.graphics.f(C.briteGold).dp(0, 0, size, 5, 2, tilt)
  }
}

class CoinMark extends Shape {
  constructor(rad = TP.hexRad / 4) {
    super()
    this.graphics.f(C.coinGold).dc(0, 0, rad)
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
  paint(pColor?: PlayerColor) {
    let colorn = pColor ? TP.colorScheme[pColor] : C1.grey;
    this.childShape.paint(colorn)
    this.updateCache()
  }

  removeChildType(type: new() => DisplayObject ) {
    let mark = this.children.find(c => c instanceof type)
    this.removeChild(mark)
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

  get vp() { return this.star ? this._vp + 1 : this._vp; }

  // Tile
  constructor(
    /** the owning Player. */
    public player: Player,
    public readonly Aname?: string,
    public readonly cost: number = 1,
    public readonly inf: number = 0,
    private readonly _vp: number = 0,
    public readonly econ: number = 1,
  ) {
    super()
    let radius = this.radius
    Tile.allTiles.push(this);
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`.replace('Star', '*');
    this.cache(-radius, -radius, 2 * radius, 2 * radius)
    this.addChild(this.childShape)// index = 0
    this.addNameText()            // index = 1
    if (inf > 0) this.setInfMark(inf)
    this.paint()
  }

  star = false;  // extra VP at end of game
  coin = false;  // gain coin when placed
  pinf = false;  // provides positive inf (Civic does this, bonus on AuctionTile)
  ninf = false;  // provides negative inf (slum does this: permanent Criminal on Tile)

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

  addStar(size = this.radius / 3, y = 1.2 * size) {
    let star = new StarMark(size)
    star.y = y
    this.star = true;
    this.addChildAt(star, this.children.length - 1)
    this.updateCache()
  }

  addCoin() {
    this.coin = true;
    let size = this.radius / 4, coin = new CoinMark(size)
    coin.x = +1.3 * size;
    coin.y = -1.3 * size;
    this.addChildAt(coin, this.children.length - 1)
    this.updateCache()
  }
  removeCoin() {
    this.coin = false;
    this.removeChildType(CoinMark)
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

  moveTo(hex: Hex) {
    this.hex = hex;     // INCLUDES: hex.tile = tile
    return hex;
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
    this.moveTo(this.targetHex);
    this.lastShift = undefined;
    if (this.hex instanceof Hex2 && this.hex.isOnMap && !(this instanceof Meeple)) this.mouseEnabled = false;
  }

  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc0(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2;  // player.meepleHex[]
      this.targetHex = this.originHex;
      this.lastShift = undefined;
      this.dragStart(hex);
    }
    this.targetHex = this.isLegalTarget(hex) ? hex : this.originHex;
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
  constructor(player: Player, type: string, image: string, cost = 2, inf = 1, vp = 1, econ = 1) {
    super(player, `${type}-${player.index}`, cost, inf, vp, econ);
    this.player = player;
    this.addImageBitmap(image);
    player.civicTiles.push(this);
  }

  override isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.tile) return false;
    // if insufficient influence(hex) return false;
    return true;
  }

  override dropFunc(hex: Hex2, ctx: DragInfo): void {
    super.dropFunc(hex, ctx)
    this.mouseEnabled = false; // stop dragging...
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
    addTiles(16, Resi)
    addTiles(16, Busi)
    addTiles(4, ResiStar)
    addTiles(4, BusiStar)
    addTiles(10, PS)
    addTiles(10, Lake)
  }

  constructor(player: Player, ...rest) {
    super(player, ...rest)
    if (!this.star && (Math.random() < .10)) {
      this.addCoin()
      this.paint()
    }
  }

  recycle() {
    this.removeCoin();
    this.hex = undefined;
    this.x = this.y = 0;
    this.parent.removeChild(this);
    AuctionTile.tileBag.unshift(this)
  }
  get table() { return (this.hex instanceof Hex2) && Table.stageTable(this.hex.cont); }

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

  override dropFunc(hex: Hex2, ctx: DragInfo) {
    let table = this.table, curNdx = table.gamePlay.curPlayerNdx;
    let tiles = table.auctionCont.tiles;
    // remove from Auction:
    let auctionNdx = tiles.indexOf(this); // if from auctionTiles
    if (auctionNdx >= 0) tiles[auctionNdx] = undefined
    // deposit Coins with Player; ASSERT is from auctionTiles...
    if (this.coin) {
      let player = this.player || table.gamePlay.curPlayer
      player.coins += 1;
      this.removeCoin();
    }
    // recycle underlying reserve tile:
    let reserveNdx = table.reserveHexes[curNdx].indexOf(this.targetHex)
    if (reserveNdx >= 0) (this.targetHex.tile as AuctionTile)?.recycle();

    super.dropFunc(hex, ctx)
  }
}

export class Resi extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addImageBitmap('Resi')
  }
}

export class Busi extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addImageBitmap('Busi')
  }
}

export class ResiStar extends Resi {
  constructor(player?: Player, Aname?: string, cost = 2, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addStar(); // ++vp
  }
}

export class BusiStar extends Busi {
  constructor(player?: Player, Aname?: string, cost = 2, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addStar()
  }
}
export class PS extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addImageBitmap('Pstation')
  }
}
export class Lake extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addImageBitmap('Lake')
  }
}
