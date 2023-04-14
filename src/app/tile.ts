import { C, F, className, stime } from "@thegraid/common-lib";
import { Bitmap, Container, DisplayObject, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { PlayerColor, TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, HexMap, HexShape } from "./hex";
import { ImageLoader } from "./image-loader";

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
export class Tile extends Container {
  static serial = 0;    // serial number of each Tile created
  static imageMap = new Map<string, HTMLImageElement>()
  static imageArgs = {
    root: 'assets/images/',
    fnames: ['Resi', 'Busi', 'Pstation', 'Lake'],
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

  hexShape = new HexShape();
  nameText: Text;

  _hex: Hex = undefined;
  get hex() { return this._hex; }
  set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.tile = undefined
    this._hex = hex
    if (hex !== undefined) hex.tile = this;
   }

  // TODO: construct image from TileSpec: { R/B/PS/CH/C/U/TS }
  // TS - TownStart has bonus info
  constructor(
    public readonly Aname?: string,
    public readonly cost: number = 1,
    public readonly inf: number = 0,
    public readonly vp: number = 0,
    public readonly econ: number = 1,
  ) {
    super()
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`.replace('Star', '*');
    this.addChild(this.hexShape)  // index = 0
    this.addNameText()            // index = 1
    this.cache(-TP.hexRad, -TP.hexRad, 2 * TP.hexRad, 2 * TP.hexRad)
    this.paint()
  }

  paint(pColor?: PlayerColor) {
    let color = pColor ? TP.colorScheme[pColor] : C1.grey;
    let r3 = TP.hexRad * H.sqrt3 / 2 - 2, r2 = r3 - 3, r0 = r2 / 3, r1 = (r2 + r0) / 2
    let g = this.hexShape.graphics.c(), pi2 = Math.PI * 2
    this.hexShape.paint(color)
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
    console.log(stime(this, `.addBitmap ${this.Aname}`), this.children, this)
    this.updateCache()
    return bm
  }

  addStar() {
    let size = TP.hexRad/3, star = new Star(size)
    star.y += 1.2 * size
    this.addChildAt(star, this.children.length - 1)
    console.log(stime(this, `.addStar ${this.Aname}`), this.children, this)
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
  static townStarts: Tile[]
  static makeTowns() {
    Tile.townStarts = TownStart.remakeTowns();
  }

  static selectOne(tiles: Tile[], remove = true) {
    let index = Math.floor(Math.random() * tiles.length)
    let tile = tiles.splice(index, 1)[0];
    if (!remove) tiles.push(tile);
    return tile;
  }
  static allTiles: Tile[] = [];
  static tileBag: Tile[] = [];
  static fillBag() {
    let addTiles = (n: number, type: new () => Tile) => {
      for (let i = 0; i < n; i++) {
        let tile = new type();
        Tile.allTiles.push(tile);
        Tile.tileBag.push(tile);
      }
    }
    Tile.allTiles.length = 0;
    Tile.tileBag.length = 0;
    addTiles(16, Resi)
    addTiles(16, Busi)
    addTiles(4, ResiStar)
    addTiles(4, BusiStar)
    addTiles(10, PS)
    addTiles(10, Lake)
  }
}

export class Civic extends Tile {
  constructor(Aname = `Civic-${Tile.serial++}`, cost = 2, inf = 1, vp = 1, econ = 1) {
    super(Aname, cost, inf, vp, econ);
  }
}

export class TownStart extends Civic {
  static remakeTowns() {
    return [
      new Tile('TS0'),
      new Tile('TS1'),
      new Tile('TS2'),
      new Tile('TS3'),
      new Tile('TS4'),
      new Tile('TS5'),
      new Tile('TS6'),
      new Tile('TS7'),
      new Tile('TS8'),
    ]
  }
}
class Resi extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(Aname, cost, inf, vp, econ);
    this.addBitmap('Resi')
  }
}
class Busi extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(Aname, cost, inf, vp, econ);
    this.addBitmap('Busi')
  }
}
class ResiStar extends Resi {
  constructor(Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(Aname, cost, inf, vp, econ);
    this.addStar()
  }
}
class BusiStar extends Busi {
  constructor(Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(Aname, cost, inf, vp, econ);
    this.addStar()
  }
}
class PS extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(Aname, cost, inf, vp, econ);
    this.addBitmap('Pstation')
  }
}
class Lake extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(Aname, cost, inf, vp, econ);
    this.addBitmap('Lake')
  }
}
