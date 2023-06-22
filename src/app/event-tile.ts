import { AT, C, Constructor, stime } from "@thegraid/common-lib";
import { Text } from "@thegraid/easeljs-module";
import { TileBag } from "./auction-tile";
import { BagType, Tile } from "./tile";
import { DragContext } from "./table";
import { Hex, } from "./hex";
import { GP } from "./game-play";

type EventSpec = {
  text: string,
  Aname?: string,
  policy?: boolean,
  vp?: number,
  tvp?: number,
  cost?: number,    // coins to purchase Policy
  ehex?: () => void, // eval when placeTile(eventHex)
  eval0?: () => void, // eval at start of turn
  eval1?: () => void, // eval at end of turn
}

class EvalTile extends Tile {
  static aname(spec: EventSpec, claz?: Constructor<EvalTile>, count = 0) {
    return `${spec?.Aname || `${claz.name}-${count}`}`;
  }

  get policy() { return this.spec?.policy; } // called in constructor
  get text() { return this.spec.text; }
  get ehex() { return this.spec.ehex; }
  get eval0() { return this.spec.eval0; }
  get eval1() { return this.spec.eval1; }

  constructor(Aname: string, readonly spec: EventSpec) {
    super(Aname, undefined, 0, spec?.vp ?? 0, spec?.cost ?? 0, 0); // (Aname, player, inf, vp, cost, econ)
    this.addTextChild(-0.4 * this.radius, this.lineBreak(this.spec?.text ?? ''), 18, true);
  }

  lineBreak(text: string) {
    return text.split('  ').join('\n');
  }
  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  override paint(pColor?: "b" | "w" | "c", colorn?: string): void {
    super.paint(pColor, this.policy ? C.YELLOW : colorn);
  }

  override placeTile(toHex: Hex, payCost?: boolean): void {
    super.placeTile(toHex, payCost);
    const gamePlay = GP.gamePlay;
    if (this.hex === gamePlay.eventHex) {
      this.eval0?.call(this, gamePlay);
    }
  }
}

export class EventTile extends EvalTile implements BagType {
  static allEventSpecs: EventSpec[] = [
    { text: "Do a  Crime  action", Aname: "Crime  Action" },
    { text: "Do a  Build  action", Aname: "Build  Action" },
    { text: "Do a  Police  action", Aname: 'Police  Action' },
    { text: "Move  your  Meeples", Aname: 'Move  Meeples' },
    { text: "Gain  Influence  token", Aname: 'Influence  Token' },
    { text: "Add  Influence  token to  Resi", Aname: 'Influence  Resi' },
    { text: "Add  Influence  token to  Busi", Aname: 'Influence  Busi' },
    { text: "Add  Econ token  to  Resi", Aname: 'Econ  on Resi' }, // Home Business (adj Bank?)
    { text: "Add  Econ token  to  Lake", Aname: 'Econ  on Lake' }, // lakeside resort
    { text: "Add  Econ token  to  Police", Aname: 'Econ  on PS' }, // ~discount police
    { text: "Add  VP token  to  Busi", Aname: 'VP  on Busi' },     // Happy Business
    { text: "Add  VP token  to  Bank", Aname: 'VP  on Bank' },     // Happy Business
    { text: "Move  one  Criminal", Aname: 'Move  Criminal' },
    { text: "Capture  one  Criminal", Aname: 'Capture  Criminal' },
    { text: "Build  Monument  on site adj  3 types", Aname: 'Build  Monument' },
    { text: "+2 Coins  per  un-placed  Leader", Aname: 'Coins  per Leader' },
    { text: "  +3 Coins", Aname: '+3 Coins' },
    { text: "  +1 VP", Aname: '+1 VP', vp: 1 },
    { text: "  +10 TVP", Aname: '+10 TVP' },
    // Urban renewal:
    { text: "Demolish  your Resi  +5 TVP", Aname: 'Demo  Resi  +5 TVP' },
    { text: "Demolish  your Lake  +5 TVP", Aname: 'Demo  Lake  +5 TVP' },
    { text: "Demolish  your Busi  +5 Coins", Aname: 'Demo Busi  +5 TVP' },
    { text: "Demolish  your Bank  +5 Coins", Aname: 'Demo  Bank  +5 TVP' },
    { text: "Demolish  any  Auction  tile", Aname: 'Demo  Auction' },

    // 'policy' Event implies duration until removed by eval [evaluated at start of turn]
    // eval gives the reward.
    { text: "+1 VP  until  Leader  is hired", Aname: 'No  Leader  Policy', policy: true, ehex: () => {}, vp: 1 },
    { text: "+1 VP  until  opposing  Criminal", Aname: 'No  Victim  Policy', policy: true, ehex: () => {}, vp: 1 },
    { text: "+1 VP  until  Criminal  is hired", Aname: 'No  Perp  Policy', policy: true, ehex: () => {}, vp: 1 },
    { text: "+1 VP  until  Police  is hired", Aname: 'No  Police  Policy', policy: true, ehex: () => {}, vp: 1 },
    { text: "+1 VP  per  Police", Aname: 'Police  happiness  Policy', policy: true, ehex: () => {}, vp: 1 },
    { text: "+1 Coin  per  Police", Aname: 'Police  discount  Policy', policy: true, ehex: () => {} },
    // { text: ""},
    // { text: ""},
    // { text: ""},
  ];
  static allEvents: EventTile[];
  static makeAllEvent() {
    EventTile.allEvents = EventTile.allEventSpecs.map((spec, ndx) => new EventTile(spec, ndx));
  }
  static addToBag(max: number, tileBag: TileBag<BagType>) {
    const tiles = EventTile.allEvents.slice(); // draw without replacement from copy of Tile[]
    const n = Math.min(max, tiles.length);
    for (let i = 0; i < n; i++) tileBag.push(tileBag.selectOne(true, tiles));
  }

  constructor(spec: EventSpec, n: number) {
    super(EventTile.aname(spec, EventTile, n), spec);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!super.isLegalTarget(toHex, ctx)) return false;
    if (toHex.isOnMap) return false;
    if (this.policy && GP.gamePlay.curPlayer.policySlots.includes(toHex)) return true;
    // else: only drop on recycle
    return false;
  }

  override moveTo(toHex: Hex): Hex {
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this);
    if (gamePlay.curPlayer.policySlots.includes(toHex)) {
      // process as if PolicyTile...
      gamePlay.finishEvent();
    }
    const rv = super.moveTo(toHex); // presumably can now be on AuctionHex[0] and appear as AuctionTiles[0]
    if (toHex === GP.gamePlay.eventHex) {
      console.log(stime(this, `.moveTo: ${AT.ansiText(['$red'], this.text)}`) );
    }
    toHex?.map.update();
    return rv;
  }

  /** load EventTile into Auction TileBag. */
  sendToBag() {
    console.log(this, `.moveToBag: ${AT.ansiText(['$red'], this.text)}`)
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this); // remove from gamePlay.auctionTiles[]
    this.resetTile();
    super.moveTo(undefined);          // remove from Hex (auctionHexes[0])
    GP.gamePlay.shifter.tileBag.unshift(this);
    if (!this.homeHex) this.parent?.removeChild(this);
    gamePlay.hexMap.update();
  }

  override sendHome(): void {
    GP.gamePlay.finishEvent();
    super.sendHome();
  }

  // TODO: add +VP & +TVP buttons
  // TODO: add player.policySlots Hexes, and forEach policySlot(hex=>hex.tile.eval())
}

export class PolicyTile extends EvalTile {
  static allPolicySpecs: EventSpec[] = [
    // 'permanent' Policy; evaluated each turn for VP, and end of game for TVP
    { text: "+1 VP  until  Leader  is hired", Aname: "No Leader", vp: 1, cost: 6, ehex: () => { } },
    { text: "+1 VP  until  opposing  Criminal", Aname: "No Victim", vp: 1, cost: 6, ehex: () => {} },
    { text: "+1 VP  until  hire  Criminal", Aname: "No Corruption", vp: 1, cost: 8, ehex: () => {} },
    { text: "+1 VP  until  hire  Police", Aname: "No Police", vp: 1, cost: 8, ehex: () => {} },
    { text: "+20 TVP  if never  Police", Aname: "Never Police", tvp: 20, cost: 10, ehex: () => {} }, // discard when hire Police
    { text: "+1 Econ  for one  Police", Aname: "Police discount 1", cost: 10 },
    { text: "+2 Econ  for two  Police", Aname: "Police discount 2", cost: 20 },
    { text: "+3 Econ  for three  Police", Aname: "Police discount 3", cost: 30 },
    { text: "+1 VP  per  Police", Aname: "Police happiness", cost: 10 },

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
  static allPolicy: PolicyTile[];
  static makeAllPolicy() {
    PolicyTile.allPolicy = new PolicySpecs().allPolicySpecs.map((spec, ndx) => new PolicyTile(spec, ndx));
  }

  constructor(spec: EventSpec, n: number) {
    super(EventTile.aname(spec, EventTile, n), spec);
    this.spec.policy = true;
  }
}
class PolicySpecs extends PolicyTile {
  constructor() { super({text: ''}, 0);}
  allPolicySpecs: EventSpec[] = [
    // 'permanent' Policy; evaluated each turn for VP, and end of game for TVP
    { text: "+1 VP  until  Leader  is hired", Aname: "No Leader", vp: 1, cost: 6, ehex: () => {
      this.player
    } },
    { text: "+1 VP  until  opposing  Criminal", Aname: "No Victim", vp: 1, cost: 6, ehex: () => {} },
    { text: "+1 VP  until  hire  Criminal", Aname: "No Corruption", vp: 1, cost: 8, ehex: () => {} },
    { text: "+1 VP  until  hire  Police", Aname: "No Police", vp: 1, cost: 8, ehex: () => {} },
    { text: "+20 TVP  if never  Police", Aname: "Never Police", tvp: 20, cost: 10, ehex: () => {} }, // discard when hire Police
    { text: "+1 Econ  for one  Police", Aname: "Police discount 1", cost: 10 },
    { text: "+2 Econ  for two  Police", Aname: "Police discount 2", cost: 20 },
    { text: "+3 Econ  for three  Police", Aname: "Police discount 3", cost: 30 },
    { text: "+1 VP  per  Police", Aname: "Police happiness", cost: 10 },

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
