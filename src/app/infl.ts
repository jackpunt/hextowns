import { C } from "@thegraid/common-lib";
import { NoZeroCounter } from "./counters";
import { Hex2 } from "./hex";
import { Player } from "./player";
import { PaintableShape, HexShape } from "./shapes";
import { PlayerColor } from "./table-params";
import { Tile } from "./tile";
import { TileSource } from "./tile-source";

/** Infl token can be applied to a Hex to raise the Player's influence on that hex. */
export class InflSource extends TileSource<Infl> {
  constructor(player: Player, hex: Hex2) {
    super(Infl, player, hex);
  }
}
export class Infl extends Tile {
  static source: InflSource;
  static inflGrey = C.nameToRgbaString(C.grey, .8);

  static makeSource(player: Player, hex: Hex2, n = 0) {
    const source = Infl.source = new InflSource(player, hex);
    for (let i = 0; i < n; i++) {
      source.newUnit(new Infl(player, i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
    return source;
  }

  constructor(player: Player, serial: number) {
    super(player, `Infl:${player?.index}-${serial}`, 0, 0, 0, 0);
    this.counter.attachToContainer(this, {x: 0, y: this.baseShape.y});
  }

  // transparent background
  counter = new NoZeroCounter(`${this.Aname}C`, 0, 'rgba(0,0,0,0)', this.radius * .7);
  get balance() { return this.counter.getValue(); }
  set balance(v: number) {
    this.counter.stage ? this.counter.updateValue(v) : this.counter.setValue(v);
    this.updateCache();
  }

  override makeShape(): PaintableShape {
    const shape = new HexShape(this.radius * .5);
    shape.y += this.radius * .3
    return shape;
  }
  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, Infl.inflGrey); // TODO: show InfTokens on Player mat
  }
}
