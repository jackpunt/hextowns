import { C, stime } from "@thegraid/common-lib";
import { NoZeroCounter } from "./counters";
import { GP } from "./game-play";
import type { Hex2, Hex } from "./hex";
import { PaintableShape, HexShape } from "./shapes";
import type { DragContext } from "./table";
import { PlayerColor } from "./table-params";
import { Tile } from "./tile";
import { TileSource } from "./tile-source";

export class DebtSource extends TileSource<Debt> {
  constructor(hex: Hex2) {
    super(Debt, undefined, hex)
  }
  // availUnit(unit) -> unit.hex = undefined

  override nextUnit(): Debt {
    const debt = super.nextUnit();
    this.hex.tile.debt = debt;  // put Debt on Tile, not on Hex.
    return debt;
  }
}

/**
 * Debt is 'sourced'; Debt moved to a hex is attached to the Tile on that hex.
 */
export class Debt extends Tile {
  static source: DebtSource;
  static debtRust = C.nameToRgbaString(C.debtRust, .8);

  static makeSource(hex: Hex2, n = 30) {
    const source = Debt.source = new DebtSource(hex)
    for (let i = 0; i < n; i++) {
      source.newUnit(new Debt(i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
    return source;
  }

  constructor(serial: number) {
    super(undefined, `Debt-${serial}`, 0, 0, 0, 0);
    this.counter.attachToContainer(this, {x: 0, y: this.baseShape.y});
  }

  // transparent background
  counter = new NoZeroCounter(`${this.Aname}C`, 0, 'rgba(0,0,0,0)', this.radius * .7);
  get balance() { return this.counter.getValue(); }
  set balance(v: number) {
    this.counter.stage ? this.counter.updateValue(v) : this.counter.setValue(v);
    this.updateCache();
    this.tile?.updateCache();
  }

  override makeShape(): PaintableShape {
    const shape = new HexShape(this.radius * .5);
    shape.y += this.radius * .3
    return shape;
  }
  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, Debt.debtRust); // TODO: override paint() --> solid hexagon (also: with Counter)
  }
  override textVis(vis?: boolean): void {
    super.textVis(vis);
    this.tile?.updateCache();
  }

  override get hex() { return this._tile?.hex; }
  override set hex(hex: Hex) { this.tile = hex?.tile; }

  _tile: Tile;
  get tile() { return this._tile; }
  set tile(tile: Tile) {
    if (this._tile && this._tile !== tile) {
      this._tile.removeChild(this);
      this._tile.debt = undefined;
      // expect this.balance === 0;?
      // expect [new] tile is undefined or debtSource
    }
    this._tile = tile;
    if (tile) {
      tile.debt = this;
      tile.addChild(this);
      this.x = this.y = 0;
      tile.paint();
    }
  }

  /** show loanLimit of Tile under Debt. */
  override dragFunc0(hex: Hex2, ctx: DragContext): void {
    const loan = (hex?.tile?.player === GP.gamePlay.curPlayer) && hex?.tile?.loanLimit;
    this.balance = loan ?? 0;
    super.dragFunc0(hex, ctx);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    this.balance = 0;
    super.dropFunc(targetHex, ctx);
  }
  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  override isLegalRecycle(ctx: DragContext) {
    return this.hex.isOnMap;
  }

  override isLegalTarget(hex: Hex): boolean {
    if (!hex.isOnMap) return false;
    if (this.balance > 0) return false;
    if (hex?.tile?.player !== GP.gamePlay.curPlayer) return false;
    if (hex.tile.loanLimit <= 0) return false; // no first mortgage.
    if (hex.tile.debt) return false;           // no second mortgage.
    return true;
  }

  // nextUnit() --> unit.moveTo(source.hex)
  override moveTo(toHex: Hex) {
    const source = Debt.source; //[this.player.index]
    const fromHex = this.hex;
    if (toHex === fromHex) {
      this.tile = toHex.tile;
      return toHex;
    }
    const tile = toHex.tile;
    if (!tile) debugger;        // sendHome...?
    this.tile = tile;           // super.moveTo(hex);    // super.moveTo(hex);
    if (this.tile?.player) {
      this.balance = tile?.loanLimit ?? 0;
      this.tile.player.coins += this.balance;
    }
    if (fromHex === source.hex) {
      source.nextUnit();
    }
    return toHex;
  }

  override sendHome(): void {
    let source = Debt.source; //[this.player.index]
    if (this.tile) {
      this.tile.player.coins -= this.balance;
      console.log(stime(this, `.sendHome: ${this.tile.player} foreclosed:`), this.balance);
    }
    this.balance = 0;
    this.tile = undefined;
    super.sendHome();
    source.availUnit(this);
    if (!source.hex.tile) source.nextUnit();
  }
}