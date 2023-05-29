import { NumCounter } from "./counters";
import { GP } from "./gp";
import type { Hex2 } from "./hex";
import { H } from "./hex-intfs";
import type { Meeple } from "./meeple";
import type { Player } from "./player";
import { TP } from "./table-params";
import type { Tile } from "./tile";

/** a Dispenser of a set of Tiles. */
export class TileSource<T extends Tile> {
  readonly Aname: string
  private readonly allUnits: T[] = new Array<T>();
  private readonly available: T[] = new Array<T>();
  readonly counter?: NumCounter;   // counter of available units.

  constructor(readonly type: new (...args: any) => T, public readonly player: Player, public readonly hex: Hex2) {
    this.Aname = `${type.name}-Source`;
    this.counter = new NumCounter(`${type.name}:${player?.index ?? 'any'}`, this.available.length, `lightblue`, TP.hexRad / 2);
    const cont = hex.map.mapCont.counterCont; // GP.gamePlay.hexMap.mapCont.counterCont;
    const xy = hex.cont.localToLocal(0, -TP.hexRad / H.sqrt3, cont);
    this.counter.attachToContainer(cont, xy);
  }

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
      unit.homeHex = this.hex;
      this.allUnits.push(unit);
      this.availUnit(unit);
    }

  /** move next available unit to source.hex, make visible */
  nextUnit() {
    const unit = this.available.shift();    // remove from available
    if (!unit) return unit;
    unit.visible = true;
    unit.moveTo(this.hex);     // and try push to available
    if (!unit.player) unit.paint(GP.gamePlay.curPlayer?.color); // TODO: paint where nextUnit() is invoked?;
    this.updateCounter();
    return unit;
  }

  updateCounter() {
    this.counter.parent.setChildIndex(this.counter, this.counter.parent.numChildren - 1);
    this.counter?.setValue(this.available.length);
    this.hex.cont.updateCache(); // updateCache of counter on hex
    this.hex.map.update();       // updateCache of hexMap with hex & counter
  }
}

export class UnitSource<T extends Meeple> extends TileSource<T> {

}
