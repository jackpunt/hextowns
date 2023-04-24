import { ValueCounter } from "@thegraid/easeljs-lib";
import { DisplayObject, Shape, Text } from "@thegraid/easeljs-module";

/** ValueCounter is a Rectangle. */
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
