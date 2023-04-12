import { C, F, stime } from "@thegraid/common-lib";
import { Container, MouseEvent, Shape, Text } from "@thegraid/easeljs-module";
import { TP } from "./table-params";

export class Tile extends Container {

  gShape = new Shape()

  constructor(
    public readonly Aname: string,
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
  static tiles: Tile[]
  static remake() {
    Tile.tiles = [
      new Tile('p0'),
      new Tile('p1'),
      new Tile('p2'),
      new Tile('p3'),
      new Tile('p4'),
      new Tile('p5'),
      new Tile('p6'),
    ]
  }
}
