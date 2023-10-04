import { C, Constructor, stime } from "@thegraid/common-lib";
import { UID } from "@thegraid/easeljs-module";
import { AuctionTile } from "./auction-tile";
import { NumCounter, NumCounterBox } from "./counters";
import { GP } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { Player } from "./player";
import { CenterText, HexShape, InfShape, PaintableShape } from "./shapes";
import { DragContext } from "./table";
import { PlayerColor, TP } from "./table-params";
import { AuctionBonus, Tile, Token } from "./tile";
import { TileSource } from "./tile-source";

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

  /**
   * Construct new instance, and make it draggable.
   * - Generally: n=1; homeHex=source.hex; so a single unit recirculates...
   */
  protected makeUnit(source: TokenSource) {
    const table = GP.gamePlay.table;
    const player = source.player;
    const unit = new source.type(player); // (player, inf, vp, cost, econ)
    table.makeDragable(unit);
    source.availUnit(unit);
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

/** Half-size Tokens that confer their bonusType: AuctionBonus to the Tile they are dropped on. */
export class BonusToken extends Token {
  static Bname(bonusType: AuctionBonus, player: Player) {
    // UID+1 will be this.id
    return `${bonusType}:${player?.index ?? ''}-${UID.get() + 1}`
  }

  constructor(
    public bonusType: AuctionBonus,
    player?: Player, inf?: TileInf, vp?: number, cost?: number, econ?: number
  ) {
    super(BonusToken.Bname(bonusType, player), player, inf, vp, cost, econ);
  }

  override makeShape(): PaintableShape {
    return new HexShape(TP.hexRad * .5);
  }

  override paint(pColor?: PlayerColor, colorn = C.WHITE): void {
    super.paint(pColor, colorn);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return toHex.isOnMap
      && (toHex.tile instanceof AuctionTile)
      && (toHex.tile.player === GP.gamePlay.curPlayer)
      && (toHex.tile.bonusCount === 0);
  }

  /** Do not offer to recycle a placement Token */
  override isLegalRecycle(ctx: DragContext): boolean {
      return false;
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    if (hex?.isLegal) {
      this.addToken(this.bonusType, hex.tile);
      GP.gamePlay.updateCounters();
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
    return InflToken.makeSource0(TokenSource, InflToken, player, hex, n, player.InflCounter);
  }

  constructor(player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('infl', player, inf, vp, cost, econ);
  }

  override makeShape(): PaintableShape {
    const shape = new InfShape(InflToken.colorn);
    shape.scaleX = shape.scaleY = .5; // <--- move to better place
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
    return EconToken.makeSource0(TokenSource, EconToken, player, hex, n, player.EconCounter);
  }

  constructor(player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('econ', player, inf, vp, cost, econ);
    this.addChild(new CenterText('$', this.radius * .8, C.GREEN));
    this.updateCache();
  }
}

export class EconToken2 extends EconToken {
  constructor() {
    super(undefined, undefined);
    const text = this.getChildAt(this.numChildren - 1);
    text.scaleX = text.scaleY = text.scaleX * 1.8;
  }
}
export class ActnToken2 extends BonusToken {
  constructor() {
    super('actn', undefined, 0, 0, 0, 0);
    this.drawStar('actn');
    const actn = this.getChildAt(4); // HexShape, BalMark, text, text, ActnShape
    actn.scaleX = actn.scaleY = actn.scaleX * 2;
    actn.x += this.radius * .7; actn.y += this.radius * .6;
    this.updateCache();
  }
}

export class StarToken2 extends BonusToken {
  constructor(player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('star', player, inf, vp, cost, econ);
    const star =this.drawStar('star');
    star.scaleX = star.scaleY = star.scaleX * 1.8;
    this.updateCache();
  }
}
export class StarToken extends BonusToken {
  static source: TokenSource;
  static targetClaz: Constructor<AuctionTile>;
  static dragToken(targetClaz?: Constructor<AuctionTile>) {
    StarToken.targetClaz = targetClaz;
    const source = StarToken.source;
    if (!source.hex.tile) source.counter.incValue(1);
    GP.gamePlay.table.dragTarget(source.hex.tile, { x: 10, y: 10 });
  }

  static makeSource(player: Player, hex: Hex2, n = 0) {
    const source = BonusToken.makeSource0(TokenSource, StarToken, player, hex, n, undefined);
    source.counter.visible = false;
    StarToken.source = source;
    return source;
  }

  // invoked from TokenSource.newUnit(source, player)
  constructor(player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
    super('star', player, inf, vp, cost, econ);
    this.drawStar('star');
    this.updateCache();
    this.homeHex = this.source?.hex;
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    const allowClaz = StarToken.targetClaz ? (toHex.tile instanceof StarToken.targetClaz) : true;
    return allowClaz && super.isLegalTarget(toHex, ctx);
  }

  override dropFunc(hex: Hex2, ctx: DragContext): void {
    super.dropFunc(hex, ctx);
    StarToken.targetClaz = undefined;
  }

  override addToken(type: AuctionBonus, tile: Tile): void {
    console.log(stime(this, `.dropFunc: addToken('${type}')! ${this} --> ${tile}`), this);
    GP.gamePlay.addBonus(type, tile);
    this.sendHome();
  }
}

// https://www.typescriptlang.org/docs/handbook/mixins.html
export function BuyTokenMixin(Base: Constructor<BonusToken>) {
  const buyTokenWithBase = class BuyToken extends Base {
    static makeSource1(claz: Constructor<Token>, player: Player, hex: Hex2, n = 0) {
      const source = BonusToken.makeSource0(TokenSource, claz, player, hex, n, undefined);
      source.counter.visible = false;
      return source;
    };

    static counterName = { infl: 'InflCounter', econ: 'EconCounter' };

    // make this look like
    constructor(player: Player, inf: TileInf = 0, vp = 0, cost = 0, econ = 0) {
      super(player, inf, vp, cost, econ); // new Infl(source, player, serial, inf, ...)
      // this.homeHex = source.hex;
    }

    override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
      if (!GP.gamePlay.reserveHexes[GP.gamePlay.curPlayerNdx].includes(toHex)) return false;
      if (GP.gamePlay.failToPayCost(this, toHex, false)) return false;
      return true;
    }

    get bonusCounter() {
      return GP.gamePlay.curPlayer[`${BuyToken.counterName[this.bonusType]}`] as NumCounter;
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
  return buyTokenWithBase;
}

export class BuyInfl extends BuyTokenMixin(InflToken) {
  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BuyInfl.makeSource1(BuyInfl, player, hex, n);
  }
  // invoked from source.newUnit()
  constructor(player: Player) {
    super(player, 0, 0, 10, 0); // new BuyToken(player, inf,...)
  }
}

export class BuyEcon extends BuyTokenMixin(EconToken) {
  static makeSource(player: Player, hex: Hex2, n = 0) {
    return BuyEcon.makeSource1(BuyEcon, player, hex, n);
  }
  // invoked from source.availUnit()
  constructor(player: Player) {
    super(player, 0, 0, 10, 0); // new BuyToken(source, player, inf,...)
  }
}
