import { C } from "@thegraid/common-lib";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { PlayerColor } from "./table-params";
import { HalfTile, Tile } from "./tile";
import { TileSource } from "./tile-source";

type TileInf = 0 | 1;
class SourcedTile extends Tile {

  static makeSource0<TS extends TileSource<SourcedTile>, T extends SourcedTile>(stype: new(type, p, hex) => TS, type: new(p: Player, n: number) => T, player: Player, hex: Hex2, n = 0) {
    const source = new stype(type, player, hex);
    type['source'][player.index] = source; // static source: TS = [];
    for (let i = 0; i < n; i++) source.newUnit(new type(player, i + 1))
    source.nextUnit();  // unit.moveTo(source.hex)
    return source;
  }

  constructor(readonly source: TileSource<SourcedTile>,
    Aname: string, player?: Player, inf?: TileInf, vp?: number, cost?: number, econ?: number) {
    super(Aname, player, inf, vp, cost, econ);
  }

  override moveTo(hex: Hex) {
    const source = this.source;
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);  // collides with source.hex.meep
    if (fromHex === this.source.hex && fromHex !== toHex) {
      source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  override sendHome(): void { // Criminal
    super.sendHome();         // this.resetTile(); moveTo(this.homeHex = undefined)
    const source = this.source;
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}

/** Infl token can be applied to a Hex to raise the Player's influence on that hex. */
export class InflSource extends TileSource<Infl> {
  constructor(player: Player, hex: Hex2) {
    super(Infl, player, hex);
  }
}
export class Infl extends HalfTile {
  static source: InflSource;
  static inflGrey = C.nameToRgbaString(C.RED, .8);

  static makeSource(player: Player, hex: Hex2, n = 0) {
    const source = Infl.source = new InflSource(player, hex);
    for (let i = 0; i < n; i++) {
      source.newUnit(new Infl(player, i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
    return source;
  }

  constructor(player: Player, serial: number) {
    super(`Infl:${player?.index}-${serial}`, player, 0, 0, 10, 0);
  }

  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, Infl.inflGrey); // TODO: show InfTokens on Player mat
  }
  // nextUnit() --> unit.moveTo(source.hex)
  override moveTo(toHex: Hex | undefined) {
    const fromHex = this.hex
    super.moveTo(toHex);
    const source = Infl.source; //[this.player.index]
    if (fromHex === source.hex) {
      source.nextUnit();
    }
    return toHex;
  }

  override sendHome(): void {
    const source = Infl.source; //[this.player.index]
    super.sendHome();       // resetTile; moveTo(homeHex)
    source.availUnit(this);
    if (!source.hex.tile) source.nextUnit();
    source.hex.map.update();
  }
}
