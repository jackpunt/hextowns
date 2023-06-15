import { C, stime } from "@thegraid/common-lib";
import { AuctionTile } from "./auction-tile";
import { GP } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { DragContext } from "./table";
import { PlayerColor, TP } from "./table-params";
import { AuctionBonus, HalfTile } from "./tile";
import { TileSource } from "./tile-source";

type TileInf = 0 | 1;
class SourcedTile extends HalfTile {

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
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);  // may invoke this.overSet(source.hex.tile)
    const source = this.source;
    if (fromHex === source.hex && fromHex !== toHex) {
      source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return toHex;
  }

  override sendHome(): void { // Infl
    super.sendHome();         // this.resetTile(); moveTo(this.homeHex = undefined)
    const source = this.source;
    source.availUnit(this);
    if (!source.hex.tile) source.nextUnit();
  }
}

class SourcedToken extends SourcedTile {
  /** Do not offer to recycle a placement Token */
  override isLegalRecycle(ctx: DragContext): boolean {
      return false;
  }

  /** Tile is a placement Token; drop & disappear when used. */
  dismiss() {
    this.parent.removeChild(this);
    const source = this.source;
    source.hex.tile = undefined;
    source.nextUnit();
  }
}

/** Infl token can be applied to a Hex to raise the Player's influence on that hex. */
export class InflSource extends TileSource<Infl> {
  constructor(player: Player, hex: Hex2) {
    super(Infl, player, hex);
  }
}
export class Infl extends SourcedToken {
  static source: InflSource[] = [];
  static inflGrey = C.nameToRgbaString(C.RED, .8);

  static makeSource(player: Player, hex: Hex2, n = TP.policePerPlayer) {
    return SourcedTile.makeSource0(TileSource, Infl, player, hex, n);
  }

  bonusType: AuctionBonus = 'brib';

  constructor(player: Player, serial: number) {
    super(Infl.source[player.index], `Infl:${player?.index}-${serial}`, player, 0, 0, 10, 0);
  }

  // override makeShape(): PaintableShape {
  //   return new InfShape()
  // }

  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, Infl.inflGrey); // TODO: show InfTokens on Player mat
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return toHex.isOnMap
      && toHex.tile?.player === this.player
      && (toHex.tile instanceof AuctionTile)
      && (toHex.tile.bonusCount === 0);
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    if (hex && hex !== this.source.hex) {
      const tile = hex.tile;
      console.log(stime(this, `.dropFunc: addBonus! ${this} --> ${hex.tile}`))
      if (GP.gamePlay.addBonus(this.bonusType , tile)) {
        this.dismiss();   // drop & disappear
      } else {
        this.sendHome();
      }
      return;
    }
    super.dropFunc(hex, ctx);
  }
}
