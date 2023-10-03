import { Constructor } from "@thegraid/common-lib";
import { Container, DisplayObject, Text } from "@thegraid/easeljs-module";
import { CenterText } from "./shapes";

export function selectN<T>(bag: T[], n = 1, remove = true) {
  const rv: T[] = [];
  for (let i = 0; i < n; i++) {
    const index = Math.floor(Math.random() * bag.length);
    rv.push(remove ? bag.splice(index, 1)[0] : bag[index]);
  }
  return rv;
}

export function permute(stack: any[]) {
  for (let i = 0, len = stack.length; i < len; i++) {
    let ndx: number = Math.floor(Math.random() * (len - i)) + i
    let tmp = stack[i];
    stack[i] = stack[ndx]
    stack[ndx] = tmp;
  }
  return stack;
}
/** select items from a that are also in b (based on keyf).
 *
 * elements of a that appear (& match) twice appear in result twice.
 */
export function Arrays_intersect<T>(a: T[], b: T[], keyf: ((v: T) => any) = v => v) {
  // return a.filter(va => b.find(vb => keyf(va)===keyf(vb)))
  const [outer, inner] = [a, b];
  const outerKey = outer.map(keyf);
  const innerKey = inner.map(keyf);
  return outer.filter((av, n) => innerKey.includes(outerKey[n]));
}

export function removeEltFromArray(elt: any, array: any[]) {
  return array.splice(array.indexOf(elt), 1);
}
export function removeChildType<T extends DisplayObject>(type: Constructor<T>, pred = (dobj: T) => true ): T[] {
  const cont = this as Container;
  const rems = cont.children.filter((c: DisplayObject) => (c instanceof type) && pred(c)) as T[];
  cont.removeChild(...rems);
  return rems;
}
export function textBounds(t: Text | string, fs?: number, cons: Constructor<Text> = CenterText) {
    const txt = (t instanceof Text) ? t : new cons(t, fs ?? 30);
    const h = txt.getMeasuredHeight(), w = txt.getMeasuredWidth();
    const x = 0, y = 0
    return {x,y,w,h}
}
/** extreme form of JSON-minification */
export function json(obj: object): string {
  return JSON.stringify(obj).replace(/"/g, '')
}

export function afterUpdate(cont: DisplayObject, after: () => void, scope?: any) {
  cont.stage.on('drawend', after, scope, true);
  cont.stage.update();
}

export async function awaitUpdate(cont: DisplayObject) {
  return new Promise<void>((res, rej) => {
    afterUpdate(cont, res);
  })
}

export async function blinkAndThen(dispObj: DisplayObject, after: () => void, dwell = 0) {
  dispObj.visible = false;
  awaitUpdate(dispObj).then(() => {
    setTimeout(() => {
      dispObj.visible = true;
      after();
    }, dwell)
  });
}

export function uniq<T>(ary: T[]) {
  const rv: T[] = [];
  ary.forEach(elt => rv.includes(elt) || rv.push(elt));
  return rv;
}
