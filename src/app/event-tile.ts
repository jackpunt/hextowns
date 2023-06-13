import { AT, C, Constructor, stime } from "@thegraid/common-lib";
import { TileBag } from "./auction-tile";
import { Tile } from "./tile";
import { AuctionTile } from "./auction-tile";
import { DragContext } from "./table";
import { Hex, } from "./hex";
import { Text } from "@thegraid/easeljs-module";
import { GP } from "./game-play";

export type BagType = AuctionTile | EventTile;

type EventSpec = {
  text: string,
  Aname?: string,
  policy?: boolean,
  vp?: number,
  tvp?: number,
  cost?: number,    // coins to purchase Policy
  eval?: () => void, // eval at start of turn: eval.call(this)
}

class EvalTile extends Tile {
  readonly text: string;
  readonly policy?: boolean;
  readonly tvp?: number;
  readonly evalf?: () => void; // eval at start of turn: eval.call(this)
  eval() { this.evalf.call(this); }
  readonly eventText: Text;

  constructor(claz: Constructor<EvalTile>, count: number, spec: EventSpec) {
    super(undefined, `${spec.Aname || `${claz.name}-${count}`}`, 0, spec.vp, spec.cost, 0);
    this.text = spec.text;
    this.policy = spec.policy;
    this.tvp = spec.tvp;
    this.evalf = spec.eval;
    this.eventText = this.addTextChild(-0.4 * this.radius, this.lineBreak(this.text), 18, true);
  }
  lineBreak(text: string) {
    return text.split('  ').join('\n');
  }
  /** never showCostMark */
  override showCostMark(show?: boolean): void { }

  override paint(pColor?: "b" | "w" | "c", colorn?: string): void {
    super.paint(pColor, this.policy? C.YELLOW: colorn);
  }

}

export class EventTile extends EvalTile {
  static allEventSpecs: EventSpec[] = [
    { text: "Do a  Crime  action", Aname: "Crime  Action" },
    { text: "Do a  Build  action", Aname: "Build  Action" },
    { text: "Do a  Police  action", Aname: 'Police  Action' },
    { text: "Move  your  Meeples", Aname: 'Move  Meeples' },
    { text: "Gain  Influence  token", Aname: 'Influence  Token' },
    { text: "Add  Influence  token to  Resi", Aname: 'Influence  Resi' },
    { text: "Add  Influence  token to  Busi", Aname: 'Influence  Busi' },
    { text: "Add  Econ token  to  Resi", Aname: 'Econ  on Resi' }, // Home Business (adj Bank?)
    { text: "Add  VP token  to  Busi", Aname: 'VP  on Busi' },     // Happy Business (adj Lake?)
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
    { text: "+1 VP  until  Leader  is hired", Aname: 'No  Leader  Policy', policy: true, eval: () => {}, vp: 1 },
    { text: "+1 VP  until  opposing  Criminal", Aname: 'No  Victem  Policy', policy: true, eval: () => {}, vp: 1 },
    { text: "+1 VP  until  Criminal  is hired", Aname: 'No  Perp  Policy', policy: true, eval: () => {}, vp: 1 },
    { text: "+1 VP  until  Police  is hired", Aname: 'No  Police  Policy', policy: true, eval: () => {}, vp: 1 },
    { text: "+1 VP  per Police", Aname: 'Police  happiness  Policy', policy: true, eval: () => {}, vp: 1 },
    { text: "+1 Coin  per Police", Aname: 'Police  discount  Policy', policy: true, eval: () => {} },
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
    super(EventTile, n, spec);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!super.isLegalTarget(toHex, ctx)) return false;
    if (toHex.isOnMap) return false;
    if (this.policy && GP.gamePlay.curPlayer.policySlots.includes(toHex)) return true;
    // TODO: if(this.policy) { allow drop on player's policy slots }
    // else: only drop on recycle
    return false;
  }

  override moveTo(toHex: Hex): Hex {
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this);
    if (gamePlay.curPlayer.policySlots.includes(toHex)) gamePlay.finishEvent();
    const rv = super.moveTo(toHex); // presumably can now be on AuctionHex[0] and appear as AuctionTiles[0]
    if (toHex === GP.gamePlay.eventHex) {
      console.log(stime(this, `.moveTo: ${AT.ansiText(['$red'], this.text)}`) );
    }
    toHex?.map.update();
    return rv;
  }

  moveToBag() {
    console.log(this, `.moveToBag: ${AT.ansiText(['$red'], this.text)}`)
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this); // remove from gamePlay.auctionTiles[]
    super.moveTo(undefined);          // remove from Hex (auctionHexes[0])
    gamePlay.shifter.tileBag.push(this);
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
    { text: "No Leader; +1 VP while no Leader", eval: () => {}, vp: 1, cost: 6 },
    { text: "No Crime; +1 VP no [opposing] Criminal", eval: () => {}, vp: 1, cost: 6 },
    { text: "No Corruption; +1 VP while no [hired] Criminal", eval: () => {}, vp: 1, cost: 8 },
    { text: "No Police; +1 VP while no Police", eval: () => {}, vp: 1, cost: 8 },
    { text: "No Police; +20 TVP if never Police", eval: () => {}, tvp: 20, cost: 10 }, // discard when hire Police
    { text: "Police discount; +1 Coin per one Police", cost: 10 },
    { text: "Police discount; +1 Coin per two Police", cost: 20 },
    { text: "Police discount; +1 Coin per each Police", cost: 30 },
    { text: "Police happiness; +1 VP per Police", cost: 10},

    { text: "No adjacent Civics: +10 TVP", cost: 8 },
    { text: "No colinear Civics: +30 TVP", cost: 8 },
    { text: "Extra Reserve Hex", cost: 8 },  // place this as Reserve Hex
    // { text: ""},
    // { text: ""},
    // { text: ""},
  ];
  static allPolicy: PolicyTile[];
  static makeAllPolicy() {
    PolicyTile.allPolicy = PolicyTile.allPolicySpecs.map((spec, ndx) => new PolicyTile(spec, ndx));
  }

  constructor(spec: EventSpec, n: number) {
    super(PolicyTile, n, {...spec, policy: true});
  }
}
