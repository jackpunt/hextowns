import { C, Constructor, stime } from "@thegraid/common-lib";
import { AuctionTile } from "./auction-tile";
import { GP, GamePlay } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { DragContext } from "./table";
import { PlayerColor, TP } from "./table-params";
import { AuctionBonus, Token, Tile, BonusMark } from "./tile";
import { TileSource } from "./tile-source";
import { CenterText, HexShape, InfShape, Paintable } from "./shapes";
import { NumCounter, NumCounterBox } from "./counters";
import { UID } from "@thegraid/easeljs-module";

type TileInf = 0 | 1;

/** TileSource with TokenCounter, which adds/deletes Units to match counter value. */
export class TokenSource extends TileSource<BonusToken> {

  constructor(type: Constructor<BonusToken>, player: Player, hex: Hex2, counter?: NumCounter) {
    super(type, player, hex, counter);
    if (counter instanceof NumCounter) {
      // Here we edit the existing Counter so it will do the right things:
      // new TokenCounter(this, 'temp', 0, C.WHITE, 15).mixinTo(counter);
      TokenCounter.mixin2(this, counter);
    } // else use makeCounter(...);
  }

  override makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    // Note: this counter is not visible.
    const counter = new TokenCounter(this, name, initValue, color, fontSize, fontName, textColor);
    return counter;
  }
}

/** TokenCounter controls the (non-negative) number of items in source.numAvailable */
class TokenCounter extends NumCounterBox {

  /** mixin static & methods from the prototype */
  static mixin2(source: TokenSource, target: NumCounter) {
    if (!target) return target;
    target['source'] = source;
    const meths = ['makeUnit', 'setValue'];
    meths.forEach(meth => target[meth] = TokenCounter.prototype[meth]);
    return target;

  }

  /** mixin static & methods from an instance: */
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
    const unit = new source.type(source, player); // (source, player, inf, vp, cost, econ)
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
        this.source.deleteUnit(this.source.hex.tile as BonusToken);
      }
    }
  }
}

// in theory, Debt could be a SourcedTile...
/** Tokens [half-size], dispensed from a TileSource */
class SourcedToken extends Token {

  protected static makeSource0<TS extends TileSource<SourcedToken>, T extends SourcedToken>(
    stype: new(type: Constructor<T>, p: Player, hex: Hex, counter?: NumCounter) => TS,
    type: Constructor<T>,
    useCounter: NumCounter,
    player: Player, hex: Hex2, n = 0
  ) {
    const source = new stype(type, player, hex, useCounter);  // useCounter or stype.makeCounter(...)
    for (let i = 0; i < n; i++) source.newUnit(new type(source, player));
    source.nextUnit();  // unit.moveTo(source.hex)
    return source;
  }

  constructor(
    readonly source: TileSource<SourcedToken>,
    Aname: string, player?: Player, inf?: TileInf, vp?: number, cost?: number, econ?: number
  ) {
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

/** Half-size Tokens that confer their bonusType: AuctionBonus to the Tile they are dropped on. */
class BonusToken extends SourcedToken {
  static Bname(bonusType: AuctionBonus, player: Player) {
    // UID+1 will be this.id
    return `${bonusType}:${player?.index ?? ''}-${UID.get() + 1}`
  }

  constructor(
    public bonusType: AuctionBonus,
    source: TileSource<BonusToken>,
    player?: Player, inf?: TileInf, vp?: number, cost?: number, econ?: number
  ) {
    super(source, BonusToken.Bname(bonusType, player), player, inf, vp, cost, econ);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return toHex.isOnMap
      && (toHex.tile instanceof AuctionTile)
      && (toHex.tile.player === ctx.curPlayer)
      && (toHex.tile.bonusCount === 0);
  }

  /** Do not offer to recycle a placement Token */
  override isLegalRecycle(ctx: DragContext): boolean {
      return false;
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    if (hex?.isLegal) {
      this.addToken(this.bonusType, hex.tile);
      ctx.curPlayer.updateCounters();
      return;
    }
    super.dropFunc(hex, ctx);
  }

  /** this token has been dropped (from source.hex) on tile. */
  addToken(type: AuctionBonus, tile: Tile) {
    console.log(stime(this, `.dropFunc: addToken('${type}')! ${this} --> ${tile}`))
    if (GP.gamePlay.addBonus(type, tile)) {
      this.source.counter.incValue(-1);  // delete source.hex.tile === this
      if (!this.source.hex.tile) this.source.nextUnit();
    } else {
      this.sendHome();
    }
    return;
  }
}


export class InflToken extends BonusToken {
  static colorn = C.nameToRgbaString(C.grey, .8);

  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BonusToken.makeSource0(TokenSource, InflToken, player.inflCounter, player, hex, n);
  }

  constructor(source: TokenSource, player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('infl', source, player, inf, vp, cost, econ);
  }

  override makeShape(): Paintable {
    const shape = new InfShape();
    shape.scaleX = shape.scaleY = .5;
    return shape;
  }

  override paint(pColor?: PlayerColor, colorn = InflToken.colorn): void {
    super.paint(pColor, colorn);
  }

  override addToken(type: AuctionBonus, tile: Tile): void {
    super.addToken(type, tile);
    GP.gamePlay.placeEither(tile, tile.hex); // propagateInfl()
  }
}

export class EconToken extends BonusToken {

  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BonusToken.makeSource0(TokenSource, EconToken, player.econCounter, player, hex, n);
  }

  constructor(source: TokenSource, player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('econ', source, player, inf, vp, cost, econ);
    this.addChild(new CenterText('$', this.radius * .8, C.GREEN));
    this.updateCache();
  }

  override makeShape(): Paintable {
    return new HexShape(TP.hexRad * .5);
  }

  override paint(pColor?: PlayerColor, colorn?: string): void {
    this.baseShape.paint(C.WHITE);
  }
}

export class StarToken extends BonusToken {
  static source: TokenSource;
  static dragToken() {
    const source = StarToken.source;
    if (!source.hex.tile) source.counter.incValue(1);
    const player = GP.gamePlay.curPlayer;
    const star = new StarToken(StarToken.source, player, 0, 0, 0, 0);
    const table = (GP.gamePlay as GamePlay).table;
    table.hexMap.mapCont.addChild(star);
    table.makeDragable(star);
    table.dragTarget(star);
  }

  static makeSource(player: Player, hex: Hex2, n = 0) {
    const source = BonusToken.makeSource0(TokenSource, StarToken, undefined, player, hex, n);
    source.counter.visible = false;
    return source;
  }

  // invoked from TokenSource.newUnit(source, player)
  constructor(source: TokenSource, player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('star', source, player, inf, vp, cost, econ);
    this.updateCache();
    this.homeHex = source.hex;
  }

  override makeShape(): Paintable {
    return new HexShape(TP.hexRad * .5);
  }

  override paint(pColor?: PlayerColor, colorn?: string ): void {
    this.baseShape.paint(C.WHITE);
    this.drawStar('star');
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return super.isLegalTarget(toHex, ctx);
  }

  override addToken(type: AuctionBonus, tile: Tile): void {
    console.log(stime(this, `.dropFunc: addToken('${type}')! ${this} --> ${tile}`), this);
    GP.gamePlay.addBonus(type, tile);
    this.sendHome();
  }
}


export function BuyTokenMixin(Base: Constructor<BonusToken>) {
  return class BuyToken extends Base {
  static makeSource1(claz: Constructor<BuyToken>, player: Player, hex: Hex2, n = 0) {
    const source = BonusToken.makeSource0(TokenSource, claz, undefined, player, hex, n);
    source.counter.visible = false;
    return source;
  }

  // make this look like
  constructor(source: TokenSource, player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super(source, player, inf, vp, cost, econ); // new Infl(source, player, serial, inf, ...)
    this.homeHex = source.hex;
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!GP.gamePlay.reserveHexes[GP.gamePlay.curPlayerNdx].includes(toHex)) return false;
    if (GP.gamePlay.failToPayCost(this, toHex, false)) return false;
    return true;
  }

  get bonusCounter() {
    return GP.gamePlay.curPlayer[`${this.bonusType}Counter`] as NumCounter;
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    if (hex?.isLegal) {
      GP.gamePlay.failToPayCost(this, hex, true);
      this.bonusCounter.incValue(1);
      this.sendHome();
      return;
    }
    super.dropFunc(hex, ctx);
  }
}

}

export class BuyInfl extends BuyTokenMixin(InflToken) {
  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BuyInfl.makeSource1(BuyInfl, player, hex, n);
  }
  // invoked from source.newUnit()
  constructor(source: TokenSource, player: Player) {
    super(source, player, 0, 0, 10, 0); // new BuyToken(source, player, inf,...)
  }
}

export class BuyEcon extends BuyTokenMixin(EconToken) {
  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BuyInfl.makeSource1(BuyEcon, player, hex, n);
  }
  // invoked from source.newUnit()
  constructor(source: TokenSource, player: Player) {
    super(source, player, 0, 0, 10, 0); // new BuyToken(source, player, inf,...)
  }
}
