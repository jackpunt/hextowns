import { Constructor, className, selectN } from "@thegraid/common-lib";
import { ValueEvent } from "@thegraid/easeljs-lib";
import { EventDispatcher } from "@thegraid/easeljs-module";
import { BagTile } from "./tile";


export class TileBag<BT extends BagTile> extends Array<BT> {
  static event = 'TileBagEvent';
  constructor() {
    super();
    EventDispatcher.initialize(this); // so 'this' implements EventDispatcher
  }

  get asDispatcher() { return this as any as EventDispatcher; }

  /** dispatch a ValueEvent to this EventDispatcher; update TileBag counter/length. */
  dispatch(type: string = TileBag.event, value: number = this.length) {
    ValueEvent.dispatchValueEvent(this as any as EventDispatcher, type, value);
  }

  inTheBag() {
    const counts = {};
    const inBagNames = this.map(tile => className(tile)).sort();
    inBagNames.forEach(name => counts[name] = (counts[name] ?? 0) + 1);
    return counts;
  }

  inTheBagStr() {
    const counts = this.inTheBag();
    return Object.keys(counts).reduce((pv, cv, ci) => `${pv}${ci > 0 ? ', ' : ''}${cv}:${counts[cv]}`, '');
  }

  takeType<TT extends BT>(type: Constructor<TT>, permute = false): TT {
    const tile = permute
      ? this.takeTile(this.selectOne(false, this.filter(tile => tile instanceof type)))
      : this.find((tile, ndx, bag) => (tile instanceof type) && (bag.splice(ndx, 1), true));
    this.dispatch();
    return tile as TT;
  }

  /** take specific tile from tileBag */
  takeTile(tile: BT) {
    const index = this.indexOf(tile);
    if (index < 0) return undefined;
    this.splice(index, 1);
    this.dispatch();
    return tile;
  }

  selectOne(remove = true, bag: BT[] = this) {
    return selectN(bag, 1, remove)[0];
  }

  // TODO: also override/disable push, pop, shift?
  override unshift(...items: BT[]): number {
    const rv = super.unshift(...items);
    this.dispatch();
    return rv;
  }
}
