import { C, F, className, stime } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, Graphics, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { PlayerColor, TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, Hex2, HexMap, HexShape } from "./hex";
import { ImageLoader } from "./image-loader";
import { Player } from "./player";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Table } from "./table";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey = 'lightgrey'
}
class StarMark extends Shape {
  constructor(size = TP.hexRad/3, tilt = -90) {
    super()
    this.graphics.f(C.briteGold).dp(0, 0, size, 5, 2, tilt)
  }
}

class CoinMark extends Shape {
  constructor() {
    super()
    let rad = TP.hexRad * .4;
    this.graphics.f(C.coinGold).dc(0, 0, rad)
  }
}

class InfMark extends Container {
  constructor(color = C.white) {
    super()
    let rad = TP.hexRad;
    H.ewDirs.forEach(dir => {
      let sl = new Shape(), gl = sl.graphics
      gl.ss(3).mt(rad * .8, 0).lt(rad, 0);
      sl.rotation = H.dirRot[dir]
      this.addChild(sl)
    })
    let w = rad * H.sqrt3, h = rad * 2;
    this.cache(-w / 2, -h / 2, w, h)
  }
}

export interface PaintableShape extends Shape {
  paint(color: string): Graphics;
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

  // TS - TownStart has bonus info...? NO: BonusTile [private] has bonus info.
  constructor(
    /** the owning Player. */
    public player: Player,
    public readonly Aname?: string,
    public readonly cost: number = 1,
    public readonly inf: number = 0,
    public readonly vp: number = 0,
    public readonly econ: number = 1,
  ) {
    super()
    let radius = this.radius
    Tile.allTiles.push(this);
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`.replace('Star', '*');
    this.addChild(this.childShape)// index = 0
    this.addNameText()            // index = 1
    this.cache(-radius, -radius, 2 * radius, 2 * radius)
    this.paint()
  }
  star: false;  // extra VP at end of game
  coin: false;  // gain coin when placed
  pinf: false;  // provides positive inf (Civic does this, bonus on AuctionTile)
  ninf: false;  // provides negative inf (slum does this: permanent Criminal on Tile)

  get radius() { return TP.hexRad};
  readonly childShape: PaintableShape = this.makeShape();
  makeShape(): PaintableShape {
    return new HexShape(this.radius)
  }

  paint(pColor = this.player?.color) {
    let color = pColor ? TP.colorScheme[pColor] : C1.grey;
    let r3 = this.radius * H.sqrt3 / 2 - 2, r2 = r3 - 3, r0 = r2 / 3, r1 = (r2 + r0) / 2
    let g = this.childShape.graphics.c();
    this.childShape.paint(color)
    g.f(C1.lightgrey).dc(0, 0, r2)
    this.updateCache()
    return g;
  }

  /** name in set of filenames loaded in GameSetup */
  addBitmap(name: string) {
    let img = Tile.imageMap.get(name);
    let bm = new Bitmap(img), width = TP.hexRad
    bm.scaleX = bm.scaleY = width / Math.max(img.height, img.width);
    bm.x = bm.y = -width / 2;
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, 1)
    this.updateCache()
    return bm
  }

  addStar() {
    let size = TP.hexRad/3, star = new StarMark(size)
    star.y += 1.2 * size
    this.addChildAt(star, this.children.length - 1)
    this.updateCache()
    return star
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
    this.hex = hex;
    // hex.tile = this; // tile: set hex(hex) INCLUDES hex.tile = tile
    return hex;
  }
  originHex: Hex2;      // where meeple was picked [dragStart]
  targetHex: Hex2;      // where meeple was placed [dropFunc] (if legal dropTarget; else originHex)
  lastShift: boolean;

  isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.tile) return false;
    return true;
  }
  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc0(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2  // player.meepleHex[]
      this.targetHex = this.originHex;
      this.lastShift = undefined
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

  dropFunc(hex: Hex2, ctx: DragInfo) {
    this.moveTo(this.targetHex)
    this.lastShift = undefined
  }

  static selectOne(tiles: Tile[], remove = true) {
    let index = Math.floor(Math.random() * tiles.length)
    let tile = tiles.splice(index, 1)[0];
    if (!remove) tiles.push(tile);
    return tile;
  }
  static tileBag: AuctionTile[] = [];
  static fillBag() {
    let addTiles = (n: number, type: new () => Tile) => {
      for (let i = 0; i < n; i++) {
        let tile = new type();
        Tile.tileBag.push(tile);
      }
    }
    Tile.tileBag.length = 0;
    addTiles(16, Resi)
    addTiles(16, Busi)
    addTiles(4, ResiStar)
    addTiles(4, BusiStar)
    addTiles(10, PS)
    addTiles(10, Lake)
  }
}

// Leader.civicTile -> Civic; Civic does not point to its leader...
export class Civic extends Tile {
  constructor(player: Player, type: string, image: string, cost = 2, inf = 1, vp = 1, econ = 1) {
    super(player, `${type}-${player.index}`, cost, inf, vp, econ);
    this.player = player;
    this.addBitmap(image);
    this.addStar();
    player.civicTiles.push(this);
  }
  override isLegalTarget(hex: Hex2) {
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
  override dropFunc(hex: Hex2, ctx: DragInfo) {
    let table = Table.stageTable(hex.cont);
    let tiles = table.auctionCont.tiles, hexes = table.auctionCont.hexes, index: number;
    // delete and repaint if removed from auction tiles:
    tiles.find((tile, ndx) => {
      if ((tile == this) && (hex !== hexes[ndx])) {
        tiles[ndx] = undefined;
        this.player = table.gamePlay.curPlayer;
        this.paint();
        return true;
      } else {
        return false;
      }
    })
    super.dropFunc(hex, ctx)
  }
}

export class Resi extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Resi')
  }
}

export class Busi extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Busi')
  }
}

export class ResiStar extends Resi {
  constructor(player?: Player, Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addStar()
  }
}

export class BusiStar extends Busi {
  constructor(player?: Player, Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addStar()
  }
}
export class PS extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Pstation')
  }
}
export class Lake extends AuctionTile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Lake')
  }
}
