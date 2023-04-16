import { C, F, className, stime } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { PlayerColor, TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, HexMap, HexShape } from "./hex";
import { ImageLoader } from "./image-loader";
import { Player } from "./player";

class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey = 'lightgrey'
}
class Star extends Shape {
  constructor(size = TP.hexRad/3, tilt = -90) {
    super()
    this.graphics.f(C.briteGold).dp(0, 0, size, 5, 2, tilt)
  }
}
interface PaintableShape extends Shape {
  paint(color: string): void;
}
export class Tile extends Container {
  static allTiles: Tile[] = [];
  static serial = 0;    // serial number of each Tile created
  static imageMap = new Map<string, HTMLImageElement>()
  static imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Lake', 'TownStart', 'TownHall', 'University', 'Temple'],
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
  get radius() { return TP.hexRad};
  readonly childShape: PaintableShape = this.makeShape();
  makeShape(): HexShape {
    return new HexShape(this.radius)
  }

  paint(pColor = this.player?.color) {
    let color = pColor ? TP.colorScheme[pColor] : C1.grey;
    let r3 = this.radius * H.sqrt3 / 2 - 2, r2 = r3 - 3, r0 = r2 / 3, r1 = (r2 + r0) / 2
    let g = this.childShape.graphics.c(), pi2 = Math.PI * 2
    this.childShape.paint(color)
    //g.f(C.BLACK).dc(0, 0, r3)
    g.f(C.white).dc(0, 0, r2)
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
    let size = TP.hexRad/3, star = new Star(size)
    star.y += 1.2 * size
    this.addChildAt(star, this.children.length - 1)
    this.updateCache()
    return star
  }

  addNameText() {
    let nameText = this.nameText = new Text(this.Aname, F.fontSpec(Tile.textSize))
    nameText.textAlign = 'center'
    nameText.y = (TP.hexRad - Tile.textSize) / 2;
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
    player.civicTiles.push(this);
  }
}

type TownSpec = string
export type AuctionTile = Resi | ResiStar | Busi | BusiStar | PS | Lake;

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
    super(player, 'U', 'University')
  }
}
export class Church extends Civic {
  constructor(player: Player) {
    super(player, 'C', 'Temple')
  }
}
export class Resi extends Tile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Resi')
  }
}
export class Busi extends Tile {
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
export class PS extends Tile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Pstation')
  }
}
export class Lake extends Tile {
  constructor(player?: Player, Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(player, Aname, cost, inf, vp, econ);
    this.addBitmap('Lake')
  }
}
