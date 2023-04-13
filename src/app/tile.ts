import { C, F, className, stime } from "@thegraid/common-lib";
import { Container, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { TP } from "./table-params";
import { H } from "./hex-intfs";
import { Hex, HexMap } from "./hex";

export class Tile extends Container {
  static serial = 0;    // serial number of each Tile created

  gShape = new Shape()
  _hex: Hex = undefined;
  get hex() { return this._hex; }
  set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.tile = undefined
    this._hex = hex
    if (hex !== undefined) hex.tile = this;
   }
  get width() { return 100; }

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
    if (!Aname) this.Aname = `${className(this)}-${Tile.serial++}`
    this.addChild(this.gShape)
    let textSize = 16, nameText = new Text(this.Aname, F.fontSpec(textSize))
    nameText.textAlign = 'center'
    nameText.y = -textSize/2;
    this.addChild(nameText)
    this.paint()
  }

  paint() {
    let r3 = TP.hexRad - 9, r2 = r3 - 2, r0 = r2 / 3, r1 = (r2 + r0) / 2
    let g = this.gShape.graphics.c(), pi2 = Math.PI * 2

    g.f(C.BLACK).dc(0, 0, r3)
    g.f('lightgrey').dc(0, 0, r2)
    this.cache(-r3, -r3, 2 * r3, 2 * r3); // Container of Shape & Text
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
  static tileBag: Tile[];
  static fillBag() {
    let addTiles = (n: number, type: new () => Tile) => {
      for (let i = 0; i < n; i++) {
        let tile = new type();
        Tile.tileBag.push(tile)
      }
    }
    Tile.tileBag = [];
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
  }
}
class Busi extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 1, econ = 1) {
    super(Aname, cost, inf, vp, econ);
  }
}
class ResiStar extends Tile {
  constructor(Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(Aname, cost, inf, vp, econ);
  }
}
class BusiStar extends Tile {
  constructor(Aname?: string, cost = 2, inf = 1, vp = 2, econ = 1) {
    super(Aname, cost, inf, vp, econ);
  }
}
class PS extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(Aname, cost, inf, vp, econ);
  }
}
class Lake extends Tile {
  constructor(Aname?: string, cost = 1, inf = 0, vp = 0, econ = 0) {
    super(Aname, cost, inf, vp, econ);
  }
}
