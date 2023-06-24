import { AT, C, Constructor, stime } from "@thegraid/common-lib";
import { TileBag } from "./auction-tile";
import { GP, GamePlay } from "./game-play";
import { Hex } from "./hex";
import { DragContext } from "./table";
import { BagType, Tile } from "./tile";
import { Criminal, Leader, Police } from "./meeple";

interface EvalSpec {
  text?: string,
  Aname?: string,
  policy?: boolean,
  cost?: number,      // coins to purchase Policy
  vp?: number,
  tvp?: number,
  ehex?: (gp?: GamePlay) => void,  // eval when placeTile(eventHex)
  phex?: (gp?: GamePlay) => void,  // eval when placeTile(isPolicyHex)
  eval0?: (gp?: GamePlay) => void, // eval at start of turn
  eval1?: (gp?: GamePlay) => void, // eval at end of turn
  rhex?: (gp?: GamePlay) => void,  // eval when recycle()
}

export class EvalTile extends Tile implements BagType {
  static aname(spec: EvalSpec, claz?: Constructor<EvalTile>, count = 0) {
    return `${spec?.Aname || `${claz.name}-${count}`}`;
  }

  constructor(Aname: string, readonly spec: EvalSpec) {
    super(Aname, undefined, 0, spec?.vp ?? 0, spec?.cost ?? 0, 0); // (Aname, player, inf, vp, cost, econ)
    this.addTextChild(-0.4 * this.radius, this.lineBreak(this.spec?.text ?? ''), 18, true);
    if (spec instanceof SpecClass) spec.tile = this;
  }

  override get vp() { return this.spec?.vp; }

  get text() { return this.spec?.text; }
  ehex(gp = GP.gamePlay) { return this.spec?.ehex?.(gp); }
  phex(gp = GP.gamePlay) { return this.spec?.phex?.(gp);}
  eval0(gp = GP.gamePlay) { return this.spec?.eval0?.(gp);}
  eval1(gp = GP.gamePlay) { return this.spec?.eval1?.(gp);}
  rhex(gp = GP.gamePlay) { return this.spec?.rhex?.(gp);}

  textString(color: AT.AnsiKey = '$red'): string {
    return `'${AT.ansiText([color], this.text)}'`
  }
  nameString(color: AT.AnsiKey = 'red'): string {
    return `'${AT.ansiText([color], this.Aname)}'`
  }

  lineBreak(text: string) {
    return text.split('  ').join('\n');
  }
  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  // override dropFunc(targetHex: Hex2, ctx: DragContext): void {
  //   console.log(stime(this, `.dropFunc: this.textString()`), targetHex?.Aname);
  //   super.dropFunc(targetHex, ctx);
  // }
  // dropFunc-->placeTile:
  override placeTile(toHex: Hex, payCost?: boolean): void {
    console.log(stime(this, `.placeTile: ${this.textString()}`), toHex?.Aname);
    super.placeTile(toHex, payCost); // --> moveTo(toHex) maybe recycle->sendHome()->undefined;
    // no effect from self drop, or phex to phex:
    if (this.fromHex === this.hex) return;
    if (this.player.isPolicyHex(this.hex) && this.player.isPolicyHex(this.fromHex)) return;

    const gamePlay = GP.gamePlay;
    if (toHex === gamePlay.recycleHex) {
      console.log(stime(this, `.rhex: ${this.textString()}`));
      this.rhex(gamePlay);
    }
    if (this.hex === gamePlay.eventHex) {
      console.log(stime(this, `.ehex: ${this.textString()}`));
      this.ehex(gamePlay);
    }
    if (this.player.isPolicyHex(this.hex)) {
      console.log(stime(this, `.phex: ${this.textString()}`));
      this.phex(gamePlay);
    }
    if (this.hex !== gamePlay.eventHex) {
      gamePlay.finishEvent(); // when moved from eventHex
    }
  }

  override moveTo(toHex: Hex): Hex {
    GP.gamePlay.removeFromAuction(this);  // for all BagType
    // console.log(stime(this, `.moveTo: ${this.textString()}`), toHex?.Aname);
    const rv = super.moveTo(toHex); // presumably can now be on AuctionHex[0] and appear as AuctionTiles[0]
    //toHex?.map.update();
    return rv;
  }

  /** load EventTile into Auction TileBag. */
  sendToBag() {
    console.log(stime(this, `.moveToBag: ${this.textString()}`));
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this); // remove from gamePlay.auctionTiles[]
    this.resetTile();
    this.player = undefined;
    super.moveTo(undefined);          // remove from Hex (auctionHexes[0])
    GP.gamePlay.shifter.tileBag.unshift(this);
    if (!this.homeHex) this.parent?.removeChild(this);
    gamePlay.hexMap.update();
  }

}

export class EventTile extends EvalTile {
  static allEvents: EventTile[];
  static makeAllEvent() {
    EventTile.allEvents = new EventSpecs().allEventSpecs.map((spec, ndx) => new EventTile(spec, ndx));
  }
  /** add all EventTile and selected PolicyTile. */
  static addToBag(max: number, tileBag: TileBag<BagType>) {
    const tiles = EventTile.allEvents.slice() as BagType[]; // draw without replacement from copy of Tile[]
    tiles.splice(0, 0, ...PolicyTile.getEvents() as BagType[]);
    if (max >= tiles.length) {
      tileBag.push(...tiles);  // push them all, in order
      return;
    }
    // push a sample selection:
    const n = Math.min(max, tiles.length);
    for (let i = 0; i < n; i++) tileBag.push(tileBag.selectOne(true, tiles));
  }

  constructor(spec: EvalSpec, n: number) {
    super(EventTile.aname(spec, EventTile, n), spec);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return false; // only drop on recycle
  }

  override sendHome(): void {
    GP.gamePlay.finishEvent(); // when sendHome()
    super.sendHome();
  }

  // TODO: add +VP & +TVP buttons
  // TODO: add player.policySlots Hexes, and forEach policySlot(hex=>hex.tile.eval())
}
class EventSpecs extends EventTile {
  constructor() { super({text: ''}, 0);}

  allEventSpecs: EvalSpec[] = [
    { text: "Do a  Crime  action", Aname: "Crime Action" },
    { text: "Do a  Build  action", Aname: "Build Action" },
    { text: "Do a  Police  action", Aname: 'Police Action' },
    { text: "Move  your  Meeples", Aname: 'Move Meeples' },
    { text: "Gain  Influence  token", Aname: 'Influence Token' },
    { text: "Add  Influence  token to  Resi", Aname: 'Influence Resi' },
    { text: "Add  Influence  token to  Busi", Aname: 'Influence Busi' },
    { text: "Add  Econ token  to  Resi", Aname: 'Econ on Resi' }, // Home Business (adj Bank?)
    { text: "Add  Econ token  to  Lake", Aname: 'Econ on Lake' }, // lakeside resort
    { text: "Add  Econ token  to  Police", Aname: 'Econ on PS' }, // ~discount police
    { text: "Add  VP token  to  Busi", Aname: 'VP on Busi' },     // Happy Business
    { text: "Add  VP token  to  Bank", Aname: 'VP on Bank' },     // Happy Business
    { text: "Move  one  Criminal", Aname: 'Move Criminal' },
    { text: "Capture  one  Criminal", Aname: 'Capture Criminal' },
    { text: "Build  Monument  on site adj  3 types", Aname: 'Build Monument' },
    { text: "+2 Coins  per  un-placed  Leader", Aname: 'Coins per Leader' },
    { text: "  +3 Coins", Aname: '+3 Coins' },
    { text: "  +1 VP", Aname: '+1 VP', vp: 1 },
    { text: "  +10 TVP", Aname: '+10 TVP' },
    // Urban renewal:
    { text: "Demolish  your Resi  +5 TVP", Aname: 'Demo Resi +5 TVP' },
    { text: "Demolish  your Lake  +5 TVP", Aname: 'Demo Lake +5 TVP' },
    { text: "Demolish  your Busi  +5 Coins", Aname: 'Demo Busi +5 TVP' },
    { text: "Demolish  your Bank  +5 Coins", Aname: 'Demo Bank +5 TVP' },
    { text: "Demolish  any  Auction  tile", Aname: 'Demo Auction' },

    // { text: ""},
    // { text: ""},
    // { text: ""},
  ];
}

export class PolicyTile extends EvalTile {
  static allPolicy: PolicyTile[];
  static makeAllPolicy() {
    PolicyTile.allPolicy = new PolicySpecs().allPolicySpecs.map((spec, ndx) => new PolicyTile(spec, ndx));
  }
  static getEvents() { return PolicyTile.allPolicy.filter(p => p.isEvent); }

  get isEvent() { return this.Aname.endsWith('Event') }

  constructor(spec: EvalSpec, n: number) {
    super(EventTile.aname(spec, EventTile, n), spec);
    this.spec.policy = true;
  }

  override paint(pColor?: "b" | "w" | "c", colorn = C.YELLOW): void {
    super.paint(pColor, colorn);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (GP.gamePlay.curPlayer.isPolicyHex(toHex)) return true;
    return false;  // else: only drop on recycle
  }
}
class SpecClass implements EvalSpec {
  constructor(public text: string, spec: EvalSpec) {
    Object.keys(spec).forEach(key => this[key] = spec[key]);
  }
  cost?: number;      // coins to purchase Policy
  vp?: number;
  tvp = 0;
  tile?: EvalTile;
  nOnMap(claz: Constructor<Tile>) {
    return this.tile.player.allOnMap(claz).length;
  }
  incVp0(v = 1) {
    this.tile.player.vp0Counter.incValue(v);
    this.tile.player.updateCounters();
  }
  incCoins(v = 1) {
    this.tile.player.coinCounter.incValue(v);
    this.tile.player.updateCounters();
  }
  incTvp0(v = 1) {
    this.tile.player.tvp0Counter.incValue(v);
    this.tile.player.updateCounters();
  }
}

class VpUntilHired extends SpecClass {
  curMeeps: Tile[];
  meepf: () => Tile[];
  constructor(text: string, spec: EvalSpec, claz: Constructor<Tile>, other = false) {
    super(text, spec);
    this.meepf = () => (other ? this.tile.player.otherPlayer : this.tile.player).allOnMap(claz);
    this.vp = this.vp ?? 1;
  }
  ehex() { this.curMeeps = undefined; }
  phex() {
    console.log(stime(this, `.phex:`), this);
    this.incVp0(this.vp);
    this.curMeeps = this.meepf();
  }
  eval0() {
    this.curMeeps = this.meepf();
  };
  eval1() {
    if (this.meepf().find(meep => !this.curMeeps.includes(meep))) {
      this.incVp0(-this.vp);
      this.curMeeps = undefined;
      this.tile.sendHome();
    }
  };
  rhex() {
    if (this.curMeeps !== undefined) {
      this.incVp0(-this.vp);
      this.curMeeps = undefined;
    }
  }
}
class VpUntilOtherHires extends VpUntilHired {
  override eval1() {
    this.curMeeps = this.meepf();
  };
  override eval0() {
    if (this.meepf().find(meep => !this.curMeeps.includes(meep))) {
      this.incVp0(-this.vp);
      this.curMeeps = undefined;
      this.tile.sendHome();
    }
  };

}

class PolicySpecs extends SpecClass {

  constructor() { super('', {}); }
  // Policy is 'permanent'; evaluated each turn for effect; and end of game for TVP
  // Policy in effect while on player.isPolicyHex (phex --> rhex)
  // 'until' Policy loses effect when condition fails; and is removed by eval0 or eval1.

  allPolicySpecs: EvalSpec[] = [ // TODO: use claz, otherPlyr: boolean
    new VpUntilHired('+1 VP  until  Leader  is hired', { Aname: 'No Leader Event', cost: 6 }, Leader,),
    new VpUntilOtherHires('+1 VP  until  opposing  Criminal', { Aname: "No Victim Event", cost: 6 }, Criminal),
    new VpUntilHired('+1 VP  until  Criminal  is hired', { Aname: "No Corruption Event", cost: 8 }, Criminal),
    new VpUntilHired('+1 VP  until  Police  is hired', { Aname: "No Police Event", cost: 8 }, Police),
    new SpecClass("+1 VP  per  Police", {
      Aname: "Police happiness Event", vp: 0, cost: 10,
      eval1: function () { this.incVp(- this.vp); this.incVp(this.vp = this.nOnMap(Police)); },
      rhex: function () { this.incVp(- this.vp); this.vp = 0; }
    }),
    new SpecClass('+1 Coin  per  Police', {
      Aname: "Police discount Event", cost: 10,
      eval1: function () { this.incCoins(this.nOnMap(Police)); }
    }),
    new SpecClass('+20 TVP  until  Police', {          // discard when Police are hired
      Aname: "No Police Event", tvp: 20, cost: 10, vp: 0,
      phex: function () { this.incTvp0(this.vp = 20) },
      eval1: function (gp: GamePlay) { if (this.nOnMap(Police) > 0) { this.tile.placeTile(gp.recycleHex, false) } },
      rhex: function () { this.incTvp0(-this.vp) },
    }),
    { text: "+1 Econ  for one  Police", Aname: "Police discount 1", cost: 10 },
    { text: "+2 Econ  for two  Police", Aname: "Police discount 2", cost: 20 },
    { text: "+3 Econ  for three  Police", Aname: "Police discount 3", cost: 30 },

    { text: "  +1 Econ", Aname: "Econ Investment", cost: 20 },
    { text: "+1 Econ  for one  Civic", Aname: "Civic Investment 1", cost: 10} ,
    { text: "+2 Econ  for two  Civics", Aname: "Civic Investment 2", cost: 20 },
    { text: "+3 Econ  for three  Civics", Aname: "Civic Investment 3", cost: 30 },

    { text: "+10 TVP  if no  adjancent  Civics", Aname: "No adjacent Civics", cost: 8 },
    { text: "+30 TVP  if no  colinear  Civics", Aname: "No colinear Civics", cost: 8 },
    { text: "Extra Reserve Hex", cost: 8, Aname: "Reserve Hex 1" },  // place this as Reserve Hex
    { text: "Extra Reserve Hex", cost: 8, Aname: "Reserve Hex 2" },  // place this as Reserve Hex
    // { text: ""},
    // { text: ""},
    // { text: ""},
  ];
}
