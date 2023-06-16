import { C, Constructor, stime } from "@thegraid/common-lib";
import { AuctionTile } from "./auction-tile";
import { GP, GamePlay } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { DragContext } from "./table";
import { PlayerColor, TP } from "./table-params";
import { AuctionBonus, HalfTile, Tile } from "./tile";
import { TileSource } from "./tile-source";
import { CenterText, HexShape, InfShape, Paintable } from "./shapes";
import { NumCounter, NumCounterBox } from "./counters";
import { UID } from "@thegraid/easeljs-module";

type TileInf = 0 | 1;

class SourcedTile extends HalfTile {

  static makeSource0<TS extends TileSource<SourcedTile>, T extends SourcedTile>(
    stype: new(type: Constructor<T>, p: Player, hex: Hex, counter?: NumCounter) => TS,
    type: Constructor<T>,
    bonus: AuctionBonus,
    player: Player, hex: Hex2, n = 0
  ) {
    const useCounter = player[`${bonus}Counter`] as NumCounter;
    const source = new stype(type, player, hex, useCounter);
    for (let i = 0; i < n; i++) source.newUnit(new type(source, player, i + 1))
    source.nextUnit();  // unit.moveTo(source.hex)
    return source;
  }

  constructor(
    readonly source: TileSource<SourcedTile>,
    public bonusType: AuctionBonus,
    player?: Player, inf?: TileInf, vp?: number, cost?: number, econ?: number
  ) {
    // UID+1 will be this.id
    super(`${bonusType}:${player?.index ?? ''}-${UID.get() + 1}`, player, inf, vp, cost, econ);
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

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return toHex.isOnMap
      && (toHex.tile instanceof AuctionTile)
      && (toHex.tile.player === this.player)
      && (toHex.tile.bonusCount === 0);
  }

  /** Do not offer to recycle a placement Token */
  override isLegalRecycle(ctx: DragContext): boolean {
      return false;
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    if (hex && hex !== this.source.hex) {
      this.addToken(this.bonusType, hex.tile);
      this.player.updateCounters();
      return;
    }
    super.dropFunc(hex, ctx);
  }

  /** this token has been dropped (from source.hex) on tile. */
  addToken(type: AuctionBonus, tile: Tile) {
    console.log(stime(this, `.dropFunc: addToken('${type}')! ${this} --> ${tile}`))
    if (GP.gamePlay.addBonus(type, tile)) {
      //this.player.inflCounter.incValue(-1);
      this.source.counter.incValue(-1);  // delete source.hex.tile === this
      if (!this.source.hex.tile) this.source.nextUnit();
    } else {
      this.sendHome();
    }
    return;
  }
}

export class Infl extends SourcedToken {
  static inflGrey = C.nameToRgbaString(C.grey, .8);

  static makeSource(player: Player, hex: Hex2, n = 0) {
    return SourcedTile.makeSource0(TokenSource, Infl, 'infl', player, hex, n);
  }

  constructor(source: TokenSource, player: Player, serial: number) { // , inf=0, vp=0, cost=0, econ=0
    super(source, 'infl', player, 0, 0, 0, 0);
  }

  override makeShape(): Paintable {
    const shape = new InfShape(Infl.inflGrey);
    shape.scaleX = shape.scaleY = .5;
    return shape;
  }

  override paint(pColor?: PlayerColor, colorn = Infl.inflGrey): void {
    super.paint(pColor, colorn);
  }
}

export class Econ extends SourcedToken {
  static green = C.GREEN;

  static makeSource(player: Player, hex: Hex2, n = 0) {
    return SourcedTile.makeSource0(TokenSource, Econ, 'econ', player, hex, n);
  }

  constructor(source: TokenSource, player: Player, serial: number) { // , inf=0, vp=0, cost=0, econ=0
    super(source, `econ`, player, 0, 0, 0, 0);
    this.addChild(new CenterText('$', this.radius * .8, C.GREEN));
    this.updateCache();
  }

  override makeShape(): Paintable {
    return new HexShape(TP.hexRad * .5);
  }

  override paint(pColor?: PlayerColor, colorn = Econ.green): void {
    this.baseShape.paint(C.WHITE); //super.paint(pColor, colorn);
  }
}


/** Token can be applied to a Hex to raise the Player's influence on that hex. */
export class TokenSource extends TileSource<SourcedToken> {

  constructor(type: Constructor<SourcedToken>, player: Player, hex: Hex2, counter?: NumCounter) {
    super(type, player, hex, counter);
    const tcounter = new TokenCounter(this, 'temp', 0, C.WHITE, 15);
    tcounter.mixinTo(counter);
  }

  override makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    // Note: this counter is not visible, not actually used!
    // Here we edit the player.inflCounter so IT will do the right things:
    const counter = new TokenCounter(this, name, initValue, color, fontSize, fontName, textColor);
    return counter;
  }
}

/** TokenCounter controls the (non-negative) number of items in source.numAvailable */
class TokenCounter extends NumCounterBox {

  mixinTo(target: NumCounter) {
    if (!target) return target;
    const meths = ['source', 'makeUnit', 'setValue'];
    meths.forEach(meth => {
      target[meth] = this[meth];
    })
    return target;
  }

  constructor(
    public readonly source: TokenSource,
    name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string
  ) {
    super(name, initValue, color, fontSize, fontName, textColor);
  }

  makeUnit(source: TokenSource) {
    const table = (GP.gamePlay as GamePlay).table;
    const player = source.player;
    const unit = new source.type(source, player, source.numAvailable);
    table.makeDragable(unit);
    source.newUnit(unit);
    if (!source.hex.tile) source.nextUnit();
  }

  override setValue(value: number): void {
    const v = Math.max(0, value);
    super.setValue(v);
    while (this.source && v !== this.source.numAvailable) { // in this case: === source.allUnits.length
      if (v > this.source.numAvailable) {
        this.makeUnit(this.source);
      } else {
        this.source.deleteUnit(this.source.hex.tile as SourcedToken);
      }
    }
  }
}
