import { C, stime } from "@thegraid/common-lib";
import { NoZeroCounter } from "./counters";
import { GP } from "./game-play";
import type { Hex, Hex2 } from "./hex";
import { HexShape, PaintableShape } from "./shapes";
import type { DragContext } from "./table";
import { PlayerColor } from "./table-params";
import { Tile, Token } from "./tile";
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

/** for solid circle Debt token when makePages */
export class DebtCircle extends Tile {
  constructor() {
    super('', undefined, 0, 0, 0, 0);
  }

  override makeShape(): PaintableShape {
    return new HexShape(); // rather than a TileShape, which has hollow center...
  }

  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, C.debtRust);
  }

}

/**
 * Debt is 'sourced'; Debt moved to a hex is attached to the Tile on that hex.
 */
export class Debt extends Token {
  static source: DebtSource;
  static debtRust = C.nameToRgbaString(C.debtRust, .8);

  static makeSource(hex: Hex2, n = 30) {
    const source = Debt.source = new DebtSource(hex)
    for (let i = 0; i < n; i++) {
      source.availUnit(new Debt(i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
    return source;
  }

  constructor(serial: number) {
    super(`Debt-${serial}`, undefined, 0, 0, 0, 0);
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

  override get recycleVerb() { return 'paid-off'; }

  override makeShape(): PaintableShape {
    const shape = super.makeShape();
    shape.y += this.radius * .3
    return shape;
  }
  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, Debt.debtRust);
  }

  override toString(): string {
    return `${super.toString()}-$${this.balance}`;
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

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx);
    this.tile?.updateCache();  // erase Debt from originating tile
  }

  /** show loanLimit of Tile under Debt. */
  override dragFunc0(hex: Hex2, ctx: DragContext): void {
    if (!this.player) {
      const loan = (hex?.tile?.player === GP.gamePlay.curPlayer && !hex.tile.debt) ? hex.tile.loanLimit : 0;
      if (this.balance !== loan) this.balance = loan; // updateCache(); tile?.updateCache();
    }
    super.dragFunc0(hex, ctx);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (!this.player) this.balance = 0; // reset temporary loanLimit
    super.dropFunc(targetHex, ctx);
  }

  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  override isLegalRecycle(ctx: DragContext) {
    if (this.tile?.player) return (this.tile.player.coins >= this.balance) || ctx?.lastShift;
    return this.hex.isOnMap;
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext): boolean {
    if (!hex.isOnMap) return false;
    if (this.balance > 0) return false;
    if (hex?.tile?.player !== GP.gamePlay.curPlayer) return false;
    if (hex.tile.loanLimit <= 0) return false; // no first mortgage.
    if (hex.tile.debt) return false;           // no second mortgage.
    return true;
  }

  override noLegal() {
    if (!GP.gamePlay.recycleHex.isLegal) {
      GP.gamePlay.logText(`Need ${this.balance} coins`);
    }
   }

  // nextUnit() --> unit.moveTo(source.hex)
  override moveTo(toHex: Hex | undefined) {
    const source = Debt.source; // [this.player.index]
    const fromHex = this.hex, fromTile = this.tile;
    this.tile = toHex?.tile;    // moveTo new Tile
    const tile = this.tile, player = tile?.player; // undefined when recycle/sendHome;
    if (tile !== fromTile) {
      if (!!player) {
        this.balance = tile.loanLimit ?? 0;
        player.coins += this.balance;
        this.player = player;
        GP.gamePlay.logText(`Debt: ${this.balance} ${toHex.Aname} ${toHex.tile.Aname}`, `Debt.moveTo`);
      }
      if (fromHex === source.hex) {
        source.nextUnit();
      }
    }
    return toHex;
  }

  override sendHome(): void {
    const source = Debt.source, player = this.player;
    if (player) {
      player.coins -= this.balance;
      console.log(stime(this, `.sendHome: ${player.Aname} paid-off: $${this.balance} -> ${player.coins}`));
    }
    this.balance = 0;
    this.player = undefined;
    super.sendHome();       // resetTile; moveTo(homeHex)
    source.availUnit(this);
    if (!source.hex.tile.debt) source.nextUnit();
  }
}
