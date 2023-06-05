import { C, F, XY, stime } from "@thegraid/common-lib";
import { DisplayObject, Shape, Text } from "@thegraid/easeljs-module";
import { GP } from "./game-play";
import type { Hex2 } from "./hex";
import { H } from "./hex-intfs";
import { TP } from "./table-params";
import { InfShape } from "./shapes";
import { ValueCounter } from "@thegraid/easeljs-lib"; // "./value-counter";
import type { Player } from "./player";

/** ValueCounter in a Rectangle. */
export class ValueCounterBox extends ValueCounter {

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }

  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    let shape = new Shape()
    shape.graphics.c().f(color).drawRect(-wide/2, -high/2, wide, high); // change from ellispe
    return shape
  }
}

export class ButtonBox extends ValueCounterBox {

}

/** ValueCounter specifically for number values (not string) */
export class NumCounter extends ValueCounter {
  override setValue(value: number | string) {
    super.setValue(value);
  }
  override getValue(): number {
    return super.getValue() as number ?? 0;
  }
  incValue(incr: number) {
    this.updateValue(this.getValue() + incr);
  }
}

/**
 * NumCounterBoxLabeled: larger box to include the label.
 */
export class NumCounterBox extends NumCounter {
  labelH = 0;
  override setLabel(label: string | Text, offset?: XY, fontSize?: number): void {
    super.setLabel(label, offset, fontSize);
    this.labelH = this.label?.text ? this.labelFontSize ?? 0 : 0;
    this.wide = -1; // force new box
    this.setBoxWithValue(this.value);
  }

  protected makeBox0(color: string, high: number, wide: number): DisplayObject {
    let shape = new Shape()
    shape.graphics.c().f(color).drawRect(-wide / 2, -high / 2, wide, high); // change from ellispe
    return shape
  }

  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    const yinc = this.label ? this.labelFontSize / 2 : 0; // dubious math; but works for now...
    const shape = this.makeBox0(color, high + yinc, wide); // 4 px beneath for label
    shape.y += yinc / 2;
    return shape;
  }

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }
}

export class NoZeroCounter extends NumCounter {
  protected override setBoxWithValue(value: string | number): void {
    super.setBoxWithValue(value || '');
  }
}

export class DecimalCounter extends NumCounterBox {
  decimal = 0;
  constructor(name: string, initValue?: string | number, color?: string, fontSize?: number, fontName?: string) {
    super(name, initValue, color, fontSize, fontName);
  }

  override setBoxWithValue(value: number): void {
    super.setBoxWithValue(value.toFixed(this.decimal));
  }
}

export class PerRoundCounter extends DecimalCounter {
  override decimal = 1;
  get perRound() { return (this.value as number) / Math.max(1, Math.floor(GP.gamePlay.turnNumber / 2)); }
  override setBoxWithValue(value: number): void {
    super.setBoxWithValue(this.perRound);
  }
}

export class CostIncCounter extends NumCounter {

  constructor(
    public hex: Hex2,
    name = `costInc`,
    public ndx?: number,
    public repaint: boolean | Player = true
  ) {
    super(name, 0, 'grey', TP.hexRad / 2)
    const counterCont = hex.mapCont.counterCont;
    const xy = hex.cont.localToLocal(0, TP.hexRad * H.sqrt3_2, counterCont);
    this.attachToContainer(counterCont, xy);
  }
  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    let box = new InfShape('lightgrey');
    let size = Math.max(high, wide)
    box.scaleX = box.scaleY = .5 * size / TP.hexRad;
    return box
  }

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    let width = text.getMeasuredWidth();
    let height = text.getMeasuredLineHeight();
    let high = height * 1.1;
    let wide = Math.max(width * 1.1, high);
    let rv = { width: wide, height: high };
    return rv;
  }
}

class CostTotalCounter extends CostIncCounter {
  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    let box = new Shape();
    let size = Math.max(high, wide)
    box.graphics.c().f(C.coinGold).dc(0, 0, TP.hexRad);
    box.scaleX = box.scaleY = .5 * size / TP.hexRad;
    return box
  }
}
