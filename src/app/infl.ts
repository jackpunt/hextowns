import { C, stime } from "@thegraid/common-lib";
import { AuctionTile } from "./auction-tile";
import { GP, GamePlay } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { DragContext } from "./table";
import { PlayerColor, TP } from "./table-params";
import { AuctionBonus, HalfTile } from "./tile";
import { TileSource } from "./tile-source";
import { InfShape, PaintableShape } from "./shapes";
import { NumCounter, NumCounterBox } from "./counters";

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
    super.moveTo(hex);    // may invoke this.overSet(source.hex.tile)?
    const source = this.source;
    if (fromHex === source.hex && fromHex !== hex) {
      source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return hex;
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
}

/** Infl token can be applied to a Hex to raise the Player's influence on that hex. */
export class InflSource extends TileSource<Infl> {
  constructor(type: new (p: Player, n: number) => Infl, player: Player, hex: Hex2) {
    super(type, player, hex);
  }
  override makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    // Note: this counter is not visible, not actually used!
    // Here we edit the player.bribCounter so IT will do the right things:
    return new InflCounter(this, name, initValue, color, fontSize, fontName, textColor);
  }
}

class InflCounter extends NumCounterBox {

  mixinTo(target: NumCounter) {
    const meths = ['source', 'makeUnit', 'setValue'];
    meths.forEach(meth => {
      target[meth] = this[meth];
    })
    return target;
  }

  constructor(public readonly source: InflSource, name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    super(name, initValue, color, fontSize, fontName, textColor);
    this.mixinTo(source.player.bribCounter);
  }

  makeUnit(source: InflSource) {
    const table = (GP.gamePlay as GamePlay).table;
    const player = source.player;
    const unit = new Infl(player, source.numAvailable);
    table.makeDragable(unit);
    source.newUnit(unit);
    if (!source.hex.tile) source.nextUnit();
  }

  override setValue(value: string | number): void {
    super.setValue(value);
    const v = value as number;
    while (this.source && v !== this.source.numAvailable) {
      if (v > this.source.numAvailable) {
        this.makeUnit(this.source);
      } else {
        this.source.deleteUnit(this.source.hex.tile as Infl);
      }
    }
  }
}

export class Infl extends SourcedToken {
  static source: InflSource[] = [];
  static inflGrey = C.nameToRgbaString(C.grey, .8);

  static makeSource(player: Player, hex: Hex2, n = 0) {
    const source = SourcedTile.makeSource0(InflSource, Infl, player, hex, n);
    source.counter.visible = false;
    return source;
  }

  bonusType: AuctionBonus = 'brib';

  constructor(player: Player, serial: number) { // , inf=0, vp=0, cost=0, econ=0
    super(Infl.source[player.index], `Infl:${player?.index}-${serial}`, player, 0, 0, 0, 0);
  }

  override makeShape(): PaintableShape {
    const shape = new InfShape(Infl.inflGrey);
    shape.scaleX = shape.scaleY = .5;
    return shape;
  }

  override paint(pColor?: PlayerColor, colorn = Infl.inflGrey): void {
    super.paint(pColor, colorn);
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
        this.player.bribCounter.incValue(-1);
        this.source.deleteUnit(this);   // drop & disappear
        if (!this.source.hex.tile) this.source.nextUnit();
      } else {
        this.sendHome();
      }
      return;
    }
    super.dropFunc(hex, ctx);
  }
}
