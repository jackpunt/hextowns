import { C } from "@thegraid/common-lib";
import { DisplayObject, Shape, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex2 } from "./hex";
import { H } from "./hex-intfs";
import { TP } from "./table-params";
import { InfShape } from "./tile";
import { ValueCounter } from "@thegraid/easeljs-lib";
import { Player } from "./player";

/** ValueCounter in a Rectangle. */
export class ValueCounterBox extends ValueCounter {

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    let width = text.getMeasuredWidth();
    let height = text.getMeasuredLineHeight();
    let high = height * 1.1;                   // change from ellispe margins
    let wide = Math.max(width * 1.1, high);    // change from ellispe margins
    let rv = { width: wide, height: high, text: text };
    text.x = 0 - (width / 2);
    text.y = 1 - (height / 2); // -1 fudge factor, roundoff?
    return rv;
  }

  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    let shape = new Shape()
    shape.graphics.c().f(color).drawRect(0, 0, wide, high); // change from ellispe
    shape.x = -wide/2; shape.y = -high/2
    return shape
  }
}

export class ButtonBox extends ValueCounterBox {

}

/** ValueCounter specifically for number values (not string) */
export class NumCounter extends ValueCounterBox {
  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    const shape = super.makeBox(color, high + 4, wide)
    shape.y += 4;
    return shape;
  }
  // breaks the setting of value?!
  // override setValue(value: number) {
  //   super.setValue(value)
  // }
  override getValue(): number {
    return super.getValue() as number
  }
  incValue(incr: number) {
    this.updateValue(this.getValue() + incr);
  }
}

export class NoZeroCounter extends NumCounter {
  protected override setBoxWithValue(value: string | number): void {
    super.setBoxWithValue(value || '');
  }
}

export class DecimalCounter extends NumCounter {
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
  get perRound() { return (this.value as number) / Math.max(1, Math.floor(GamePlay.gamePlay.turnNumber / 2)); }
  override setBoxWithValue(value: number): void {
    super.setBoxWithValue(this.perRound);
  }
}

export class CostIncCounter extends NumCounter {

  constructor(
    public hex: Hex2,
    name = `costInc`,
    public ndx?: number,
    public repaint: boolean | Player = true)
  {
    super(name, 0, 'grey', TP.hexRad / 2)
    let counterCont = hex.mapCont.counterCont;
    let xy = hex.cont.localToLocal(0, TP.hexRad * H.sqrt3/2, counterCont)
    this.attachToContainer(counterCont, xy)
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
    let rv = { width: wide, height: high, text: text };
    text.x = 0 - (width / 2);
    text.y = 1 - (height / 2); // -1 fudge factor, roundoff?
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
