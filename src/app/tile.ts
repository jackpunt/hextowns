import { C, F, stime } from "@thegraid/common-lib";
import { Container, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { TP } from "./table-params";

export class Tile extends Container {

  gShape = new Shape()

  // TODO: construct image from TileSpec: { R/B/PS/CH/C/U/TS }
  // TS - TownStart has bonus info
  constructor(
    public readonly Aname: string,
    public readonly cost: number = 1,
    public readonly inf: number = 0,
    public readonly vp: number = 0,
    public readonly econ: number = 1,
  ) {
    super()

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
}

class Civic extends Tile {
  constructor(Aname: string, cost = 2, inf = 1, vp = 1, econ = 1) {
    super(Aname, cost, inf, vp, econ);
  }
}

class TownStart extends Civic {
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
