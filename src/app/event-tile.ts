import { AT, C, Constructor, stime } from '@thegraid/common-lib';
import { TileBag } from "./tile-bag";
import { GP, GamePlay } from './game-play';
import { Hex } from './hex';
import { DragContext } from './table';
import { BagTile, Civic, Tile } from './tile';
import { Criminal, Leader, Police } from './meeple';
import { TP } from './table-params';

interface EvalSpec {
  text?: string,
  Aname?: string,
  policy?: boolean,
  cost?: number,      // coins to purchase Policy
  econ?: number,
  vp?: number,
  tvp?: number,
  val?: number,
  ehex?: (gp?: GamePlay) => void,  // eval when placeTile(eventHex)
  phex?: (gp?: GamePlay) => void,  // eval when placeTile(isPolicyHex)
  eval0?: (gp?: GamePlay) => void, // eval at start of turn
  eval1?: (gp?: GamePlay) => void, // eval at end of turn
  rhex?: (gp?: GamePlay) => void,  // eval when recycle()
  eog?: (gp?: GamePlay) => void,   // eval at End of Game
}
class SpecClass implements EvalSpec {
  /**
   * @param cost coins to purchase Policy
   * @param text appears on Tile
   * @param spec implementation details
   */
  constructor(public cost: number, public text: string, spec: EvalSpec) {
    Object.keys(spec).forEach(key => this[key] = spec[key]);
  }
  val?: number;
  econ?: number;
  vp?: number;
  tvp = 0;
  tile?: EvalTile;
  nOnMap(claz: Constructor<Tile>, op = false) {
    const player = op ? this.tile.player.otherPlayer : this.tile.player;
    return player.allOnMap(claz).length;
  }
  incVp(v = 1) {
    this.tile.player.vpCounter.updateValue(this.tile.player.vps);
  }
  incEcon(v = 1) {
    this.tile.player.econCounter.updateValue(this.tile.player.econs);
  }

  incVp0(v = 1) {
    this.tile.player.vp0Counter.incValue(v);
    this.tile.player.setCounters();
  }
  incCoins(v = 1) {
    this.tile.player.coinCounter.incValue(v);
    this.tile.player.setCounters();
  }
  incTvp0(v = 1) {
    this.tile.player.tvp0Counter.incValue(v);
    this.tile.player.setCounters();
  }
  incTvp(v = 1) {
    this.tile.player.totalVpCounter.incValue(v);
    this.tile.player.setCounters();
  }  recycle() {
    this.tile.placeTile(GP.gamePlay.recycleHex, false);
  }
}

class EventSpec extends SpecClass {
  constructor(text: string, spec: EvalSpec) {
    super(0, text, spec);
  }
}

class EventSpecs extends EventSpec {
  /** singleton */
  constructor() { super('EventSpecs', {}); }

  allSpecs: EvalSpec[] = [
    { text: 'Do a  Crime  action', Aname: 'Crime Action' },
    { text: 'Do a  Build  action', Aname: 'Build Action' },
    { text: 'Do a  Police  action', Aname: 'Police Action' },
    { text: 'Move  your  Meeples', Aname: 'Move Meeples' },
    { text: 'Gain  Influence  token', Aname: 'Influence Token' },
    { text: 'Add  Influence  token to  Resi', Aname: 'Influence Resi' },
    { text: 'Add  Influence  token to  Busi', Aname: 'Influence Busi' },
    { text: 'Add  Econ token  to  Resi', Aname: 'Econ on Resi' }, // Home Business (adj Bank?)
    { text: 'Add  Econ token  to  Lake', Aname: 'Econ on Lake' }, // lakeside resort
    { text: 'Add  Econ token  to Police  Station', Aname: 'Econ on PS' }, // ~discount police
    { text: 'Add  VP token  to  Busi', Aname: 'VP on Busi' },     // Happy Business
    { text: 'Add  VP token  to  Bank', Aname: 'VP on Bank' },     // Happy Business
    { text: 'Move  one  Criminal', Aname: 'Move Criminal' },
    { text: 'Capture  one  Criminal', Aname: 'Capture Criminal' },
    { text: 'Build  Monument  on site adj  3 types', Aname: 'Build Monument' },
    { text: '+2 Coins  per  un-placed  Leader', Aname: 'Coins per Leader' },
    { text: '  +3 Coins', Aname: '+3 Coins' },
    { text: '  +1 VP', Aname: '+1 VP', vp: 1 },
    { text: '  +10 TVP', Aname: '+10 TVP' },
    // Urban renewal:
    { text: 'Demolish  your Resi  +5 TVP', Aname: 'Demo Resi +5 TVP' },
    { text: 'Demolish  your Lake  +5 TVP', Aname: 'Demo Lake +5 TVP' },
    { text: 'Demolish  your Busi  +5 Coins', Aname: 'Demo Busi +5 Coins' },
    { text: 'Demolish  your Bank  +5 Coins', Aname: 'Demo Bank +5 Coins' },
    { text: 'Demolish  any  Auction  tile', Aname: 'Demo Auction' },

    // { text: ''},
    // { text: ''},
    // { text: ''},
  ];
}

class BonusWhenCond extends SpecClass {
  cond: () => boolean;
  getVal() { return 0; }
  setVal(v: number) { }

  constructor(cost: number, text: string, spec: EvalSpec, cond: (() => boolean) | boolean = true,) {
    super(cost, text, spec);
    this.econ = 0;
    this.vp = 0;
    this.cond = (typeof cond === 'function') ? cond : function () { return cond };
  }
  eval0() { this.setVal(this.cond.call(this) ? this.val : 0) };
  adj(cond = this.cond.call(this)) {
    if (cond === (this.getVal() === 0)) {
      this.setVal(this.val - this.getVal());
    }
    return cond;
  }
  phex() { this.adj() }
  eval1() { this.adj() }
  rhex() { this.adj(false) }
}

class EconWhenCond extends BonusWhenCond {
  // player.econs eval'd at start-of-turn (after eval0)
  override getVal() { return this.econ; }
  override setVal(v: number) { this.econ = v; }
}

class VpWhenCond extends BonusWhenCond {
  // player.vps eval'd at end-of-turn (after eval1)
  override getVal() { return this.vp; }
  override setVal(v: number) { this.vp = v; }
}


class VpUntilHired extends VpWhenCond {
  claz: Constructor<Tile>;
  origMeeps: Tile[];
  get curMeeps() { return this.tile.player.allOnMap(this.claz) }

  constructor(cost: number, text: string, spec: EvalSpec, claz: Constructor<Tile>) {
    super(cost, text, spec, () => !this.curMeeps.find(meep => !this.origMeeps.includes(meep)));
    this.claz = claz;
    this.val = this.val ?? 1;
  }
  // ehex() { this.origMeeps = undefined; }
  override phex(): void {
    this.origMeeps = this.curMeeps;
    super.phex();
  }
  override adj(cond?: boolean) {
    const c = super.adj(cond);
    if (!c) {
      this.tile.sendHome();
      this.origMeeps = undefined;
    }
  }
  // phex() {
  //   console.log(stime(this, `.phex:`), this);
  //   this.incVp0(this.val);
  //   this.curMeeps = this.meepf();
  // }
  // eval0() {
  //   this.curMeeps = this.meepf();
  // };
  // eval1() {
  //   if (!!this.meepf().find(meep => !this.curMeeps.includes(meep))) {
  //     this.incVp0(-this.val);
  //     this.curMeeps = undefined;
  //     this.tile.sendHome();
  //   }
  // };
  // rhex() {
  //   if (this.curMeeps !== undefined) {
  //     this.incVp0(-this.val);
  //     this.curMeeps = undefined;
  //   }
  // }
}

class PolicySpecs extends SpecClass {
  /** singleton */
  constructor() { super(0, 'PolicySpecs', {}); }
  // Policy is 'permanent'; evaluated each turn for effect; and end of game for TVP
  // Policy in effect while on player.isPolicyHex (phex --> rhex)
  // 'until' Policy loses effect when condition fails; and is removed by eval0 or eval1.

  allSpecs: EvalSpec[] = [ // TODO: use claz, otherPlyr: boolean
    new VpUntilHired(8, '+1 VP  until  Police  is hired', { Aname: 'No Police' }, Police),
    new VpUntilHired(10, '+1 VP  until  Leader  is hired', { Aname: 'No Leader' }, Leader,),
    new VpUntilHired(12, '+1 VP  until  Criminal  is hired', { Aname: 'No Mercs' }, Criminal),

    new VpWhenCond(8, '+1 VP  when no  opposing  Criminal', { Aname: 'No Crime', val: 1, },
      function() { return this.nOnMap(Criminal, true) === 0 }
    ),
    new SpecClass(20, '+1 VP  per  Police', { Aname: 'Happy Police', val: 0,
      phex: function () { this.incVp0(- this.val); this.incVp0(this.val = this.nOnMap(Police)); },
      eval0: function () { this.incVp0(- this.val); this.incVp0(this.val = this.nOnMap(Police)); },
      eval1: function () { this.incVp0(- this.val); this.incVp0(this.val = this.nOnMap(Police)); },
      rhex: function () { this.incVp0(- this.val); this.val = 0; }
    }),
    new SpecClass(10, '+20 TVP  until  Police', {          // discard when Police are hired
      Aname: 'Never Police', tvp: 20, val: 0,
      phex: function () { this.incTvp0(this.val = 20) },
      eval1: function () { if (this.nOnMap(Police) > 0) { this.recycle() } },
      rhex: function () { this.incTvp0(-this.val) },
    }),

    new EconWhenCond(20, '  +1 Econ', { Aname: 'Invest-1', val: 1 }, true),
    new EconWhenCond(20, '  +1 Econ', { Aname: 'Invest-2', val: 1 }, true),

    new EconWhenCond(10, '+1 Econ  per  Police', { Aname: 'Econ/Police', val: 0 },
      function () { (this as any as EconWhenCond).setVal(this.val = this.nOnMap(Police)); return true; }),

    new VpWhenCond(10, '+1 Vp  per  Police', { Aname: 'VP/Police', val: 0 },
      function () { (this as any as VpWhenCond).setVal(this.val = this.nOnMap(Police)); return true; }),

    new EconWhenCond(10, '+1 Econ  for one  Police', { Aname: 'Police +1', val: 1 }, function () { return this.nOnMap(Police) >= this.val }),
    new EconWhenCond(20, '+2 Econ  for two  Police', { Aname: 'Police +2', val: 2 }, function () { return this.nOnMap(Police) >= this.val }),
    new EconWhenCond(30, '+3 Econ  for three  Police', { Aname: 'Police +3', val: 3 }, function () { return this.nOnMap(Police) >= this.val }),

    new EconWhenCond(25, '+1 Econ  for one  Civic', { Aname: 'Civic +1', val: 1 }, function () { return this.nOnMap(Civic) >= this.val }),
    new EconWhenCond(15, '+2 Econ  for two  Civics', { Aname: 'Civic +2', val: 2 }, function () { return this.nOnMap(Civic) >= this.val }),
    new EconWhenCond(10, '+3 Econ  for three  Civics', { Aname: 'Civic +3', val: 3 }, function () { return this.nOnMap(Civic) >= this.val }),

    new SpecClass(8, '+10 TVP  if no  adjacent  Civics', { Aname: 'No adjacent Civics', val: 10,
      ehex: function () { this.val = 0; },
      phex: function () { this.incTvp0(this.val = 10) },
      rhex: function () { this.incTvp0(-this.val) },
      eval1: function () {
        const adj = this.tile.player.allOnMap(Civic).find((civ: Civic) => civ.hex.findLinkHex(hex => hex.tile instanceof Civic));
        this.incTvp0((this.val = (adj ? 0 : 10)) - this.val);
      },
    }),
    new SpecClass(8, '+30 TVP  if no  colinear  Civics', { Aname: 'No colinear Civics', val: 30,
      ehex: function () { this.val = 0; },
      phex: function () { this.incTvp0(this.val = 30) },
      rhex: function () { this.incTvp0(-this.val) },
      eval1: function () {
        const adj = this.tile.player.allOnMap(Civic).find((civ: Civic) => civ.hex.findLinkHex((hex, dir) => !!hex.findInDir(dir, hex => hex.tile instanceof Civic)));
        this.incTvp0((this.val = (adj ? 0 : 10)) - this.val);
      },
    }),
    new SpecClass(8, 'Extra  Reserve  Hex', { Aname: 'Reserve Hex 1', }),  // place this as Reserve Hex
    new SpecClass(8, 'Extra  Reserve  Hex', { Aname: 'Reserve Hex 2', }),  // place this as Reserve Hex
    // { text: ''},
    // { text: ''},
    // { text: ''},
  ];
}

export class EvalTile extends Tile implements BagTile {
  static override allTiles: EvalTile[];
  static makeAllTiles() {
    EvalTile.allTiles = new EventSpecs().allSpecs.map((spec, ndx) => new EvalTile(EvalTile.aname(spec, EvalTile, ndx), spec));
  }

  /** add all or selected EvalTile to tileBag. */
  static addToBag(tileBag: TileBag<BagTile>, max: number, allTiles: BagTile[]) {
    const tiles = allTiles.slice() as BagTile[]; // draw without replacement from copy of Tile[]
    // tiles.splice(0, 0, ...PolicyTile.goInBag() as BagType[]);
    if (max >= tiles.length || max < 0) {
      tileBag.push(...tiles);  // push them all, in order
      return;
    }
    // push a sample selection:
    const n = Math.min(max, tiles.length);
    for (let i = 0; i < n; i++) tileBag.push(tileBag.selectOne(true, tiles));
  }

  static aname(spec: EvalSpec, claz?: Constructor<EvalTile>, serial = 0) {
    return `${spec?.Aname || `${claz.name}-${serial}`}`;
  }

  constructor(Aname: string, readonly spec: EvalSpec) {
    super(Aname, undefined, 0, spec?.vp ?? 0, spec?.cost ?? 0, 0); // (Aname, player, inf, vp, cost, econ)
    this.addTextChild(-0.4 * this.radius, this.lineBreak(this.spec?.text ?? ''), 18, true);
    if (spec instanceof SpecClass) spec.tile = this;
  }

  override get vp() { return this.spec?.vp; }
  override get econ() { return this.spec?.econ; }

  get text() { return this.spec?.text; }
  ehex(gp = GP.gamePlay) { return this.spec?.ehex?.(gp); }
  phex(gp = GP.gamePlay) { return this.spec?.phex?.(gp);}
  eval0(gp = GP.gamePlay) { return this.spec?.eval0?.(gp);}
  eval1(gp = GP.gamePlay) { return this.spec?.eval1?.(gp);}
  rhex(gp = GP.gamePlay) { return this.spec?.rhex?.(gp);}
  eog(gp = GP.gamePlay) { return this.spec?.eog?.(gp);}

  textString(color: AT.AnsiKey = '$red'): string {
    return `'${AT.ansiText([color], this.text)}'`
  }
  nameString(color: AT.AnsiKey = 'red'): string {
    return `'${AT.ansiText([color], this.Aname)}'`
  }

  lineBreak(text: string) {
    return text.split('  ').join('\n');
  }

  // shiftAndProcess -> moveTo: [eventHex]
  // dropFunc OR C-q -> placeTile -> moveTo: [recycleHex, policyHex]
  dispatchByHex(toHex: Hex) {
    // no effect from self drop, or phex to phex:
    if (toHex === this.fromHex) return;
    if (this.player.isPolicyHex(toHex) && this.player.isPolicyHex(this.fromHex)) return;
    // the only place a Policy (or Event) can go: ehex, phex, rhex
    const gamePlay = GP.gamePlay;
    if (toHex === gamePlay.eventHex) {
      console.log(stime(this, `.ehex: ${this.textString()}`));
      this.ehex(gamePlay);
    }
    if (this.player.isPolicyHex(toHex)) {
      console.log(stime(this, `.phex: ${this.textString()}`));
      this.phex(gamePlay);
    }
    if (toHex === gamePlay.recycleHex) {
      console.log(stime(this, `.rhex: ${this.textString()}`));
      this.rhex(gamePlay);   // sendHome(); resetTile()
    }
  }

  override moveTo(toHex: Hex): Hex {
    GP.gamePlay.removeFromAuction(this);  // for all BagType
    // console.log(stime(this, `.moveTo: ${this.textString()}`), toHex?.Aname);
    const rv = super.moveTo(toHex); // presumably can now be on AuctionHex[0] and appear as AuctionTiles[0]
    this.dispatchByHex(toHex);
    return rv;
  }

  override placeTile(toHex: Hex, payCost?: boolean): void {
    console.log(stime(this, `.placeTile: ${this.textString()}`), toHex?.Aname);
    super.placeTile(toHex, payCost); // --> moveTo(toHex) maybe recycle->sendHome()->undefined;
    // self-drop to auctionTiles:
    const ndx = GP.gamePlay.auctionHexes.indexOf(this.hex);
    if (ndx >= 0) GP.gamePlay.auctionTiles[ndx] = this;
  }

  // like sendHome() if homeHex was tileBag...
  /** load EventTile [back] into Auction TileBag. */
  sendToBag() {
    console.log(stime(this, `.moveToBag: ${this.textString()}`));
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this); // remove from gamePlay.auctionTiles[]
    this.resetTile();                 // pro-forma: no effect
    this.player = undefined;
    super.moveTo(undefined);          // remove from Hex (auctionHexes[0])
    GP.gamePlay.shifter.tileBag.unshift(this);
    if (!this.homeHex) this.parent?.removeChild(this);
    gamePlay.hexMap.update();
  }
}

export class EventTile extends EvalTile {
  static override allTiles: EventTile[];
  static override makeAllTiles() {
    EventTile.allTiles = new EventSpecs().allSpecs.map((spec, ndx) => new EventTile(spec, ndx));
  }

  constructor(spec: EvalSpec, n = 0) {
    super(EventTile.aname(spec, EventTile, n), spec);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    return false; // only drop on recycle
  }

  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  override sendHome(): void {
    GP.gamePlay.finishEvent(); // when sendHome()
    super.sendHome();
  }
}

/** Goes into the tileBag: AutoCrime */
export class AutoCrime extends EventTile {
  static override allTiles: AutoCrime[];
  static override makeAllTiles(nac = TP.autoCrimePerBag * GP.gamePlay.shifter.tileBag.length) { //
    // make in advance, so they are dragable.
    const autoCrimeSpec = AutoCrime.autoCrimeSpec;
    AutoCrime.allTiles = new Array(nac).fill(undefined).map((v, ndx) => new AutoCrime(autoCrimeSpec, ndx));
  }
  static autoCrimeSpec =  new EventSpec('Auto  Crime', { Aname: 'AutoCrime', ehex: function (gp: GamePlay) { gp.autoCrime(true) }, });

  static override addToBag(tileBag: TileBag<BagTile>, acpb: number = TP.autoCrimePerBag, allTiles?: BagTile[]): void {
    const max = AutoCrime.allTiles.length;
    const nac1 = tileBag.filter(t => t instanceof AutoCrime).length;
    const nac2 = Math.min(max, Math.floor(acpb * tileBag.length));
    tileBag.push(...AutoCrime.allTiles.slice(nac1, Math.max(0, nac2 - nac1)));
  }
}

export class PolicyTile extends EvalTile {
  static override allTiles: PolicyTile[];
  static override makeAllTiles() {
    PolicyTile.allTiles = new PolicySpecs().allSpecs.map((spec, ndx) => new PolicyTile(spec, ndx));
  }

  constructor(spec: EvalSpec, n: number) {
    super(EventTile.aname(spec, EventTile, n), spec);
    this.spec.policy = true;
  }

  override paint(pColor?: 'b' | 'w' | 'c', colorn = C.YELLOW): void {
    super.paint(pColor, colorn);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (GP.gamePlay.failToPayCost(this, toHex, false)) return false;
    if (GP.gamePlay.curPlayer.isPolicyHex(toHex)) return true;
    if (GP.gamePlay.isReserveHex(toHex)) return true;
    return false;  // else: only drop on recycle
  }
  override sendHome(): void {
    this.sendToBag()
  }
}
