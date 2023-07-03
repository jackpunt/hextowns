import { Constructor } from "@thegraid/common-lib";
import { NumCounter } from "./counters";
import { GP } from "./game-play";
import type { Hex2 } from "./hex";
import { H } from "./hex-intfs";
import type { Meeple } from "./meeple";
import type { Player } from "./player";
import { TP } from "./table-params";
import type { Tile } from "./tile";
import { ValueEvent } from "@thegraid/easeljs-lib";

/** a Dispenser of a set of Tiles. */
export class TileSource<T extends Tile> {
  static update = 'update';
  readonly Aname: string
  private readonly allUnits: T[] = new Array<T>();
  private readonly available: T[] = new Array<T>();
  readonly counter?: NumCounter;   // counter of available units.

  constructor(
    public readonly type: Constructor<T>,
    public readonly player: Player,
    public readonly hex: Hex2,
    counter?: NumCounter,
  ) {
    this.Aname = `${type.name}Source`;
    if (!counter) {
      const cont = hex.map.mapCont.counterCont; // GP.gamePlay.hexMap.mapCont.counterCont;
      const xy = hex.cont.localToLocal(0, -TP.hexRad / H.sqrt3, cont);
      counter = this.makeCounter(`${type.name}:${player?.index ?? 'any'}`, this.numAvailable, `lightblue`, TP.hexRad / 2);
      counter.attachToContainer(cont, xy);
    }
    this.counter = counter;
  }

  makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    return new NumCounter(name, initValue, color, fontSize, fontName, textColor);
  }

  get numAvailable() { return this.available.length + (this.hex?.tile || this.hex?.meep ? 1 : 0); }

  /** mark unit available for later deployment */
  availUnit(unit: T) {
    if (!this.available.includes(unit)) {
      this.available.push(unit);
      unit.hex = undefined;
      unit.visible = false;
    }
    this.updateCounter();
  }

  /** enroll a new Unit to this source. */
  newUnit(unit: T) {
    this.allUnits.push(unit);
    this.availUnit(unit);
  }

  protected isAvailable(unit: Tile) {
    return this.hex.tile === unit;
  }

  deleteUnit(unit: T) {
    if (unit && this.isAvailable(unit)) {
      unit.moveTo(undefined); // --> this.nextUnit();
      unit.parent?.removeChild(unit);
    }
    const ndx = this.allUnits.indexOf(unit);
    if (ndx >= 0) {
      this.allUnits.splice(ndx, 1);
    }
  }

  /** move next available unit to source.hex, make visible */
  nextUnit(unit = this.available.shift()) {
    if (unit) {
      unit.visible = true;
      unit.moveTo(this.hex);     // and try push to available
      if (!unit.player) unit.paint(GP.gamePlay.curPlayer?.color); // TODO: paint where nextUnit() is invoked?;
    }
    this.updateCounter();
    return unit;
  }

  updateCounter() {
    this.counter.parent?.setChildIndex(this.counter, this.counter.parent.numChildren - 1);
    this.counter.setValue(this.numAvailable);
    ValueEvent.dispatchValueEvent(this.counter, TileSource.update, this.numAvailable);
    this.hex?.cont?.updateCache(); // updateCache of counter on hex
    this.hex?.map?.update();       // updateCache of hexMap with hex & counter
  }
}

export class UnitSource<T extends Meeple> extends TileSource<T> {

}
