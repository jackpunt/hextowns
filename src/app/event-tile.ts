import { Constructor, stime } from "@thegraid/common-lib";
import { AuctionTile, Tile, TileBag } from "./tile";
import { DragContext } from "./table";
import { Hex, } from "./hex";
import { Text } from "@thegraid/easeljs-module";
import { GP } from "./game-play";

export type BagType = AuctionTile | EventTile;

type EventSpec = {
  text: string,
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
  eval() { this.evalf.call(this);
  }
  readonly eventText: Text;

  constructor(claz: Constructor<EvalTile>, count: number, spec: EventSpec) {
    super(undefined, `${claz.name}-${count}`, 0, spec.vp, spec.cost, 0);
    this.text = spec.text;
    this.policy = true;
    this.tvp = spec.tvp;
    this.evalf = spec.eval;
    this.eventText = this.addTextChild(-this.radius/2, this.text, true);
  }
}

export class EventTile extends EvalTile {
  static allEventSpecs: EventSpec[] = [
    { text: "Do a Crime action"},
    { text: "Do a Build action"},
    { text: "Do a Police action"},
    { text: "Gain an Action token"},
    { text: "Gain an Influence token"},
    { text: "Add Influence token to a Resi"},
    { text: "Add Influence token to a Busi"},
    { text: "Add Econ token to a Resi"},
    { text: "Add VP token to a Busi"},
    { text: "Coins +5"},
    { text: "VP +3"},
    { text: "TVP +10"},
    { text: "Move one Criminal"},
    { text: "Capture one Criminal"},
    { text: "Build a Monument (on site adjancent to 3 different types)"},
    { text: "Coins +4 per un-placed Leader"},
    // Urban renewal:
    { text: "Demolish one of your Resi; +5 TVP"},
    { text: "Demolish one of your Lake; +5 TVP"},
    { text: "Demolish one of your Busi; +5 Coins"},
    { text: "Demolish one of your Bank; +5 Coins"},
    { text: "Demolish one from Auction"},

    // 'policy' Event implies duration until removed by eval [evaluated at start of turn]
    // eval gives the reward.
    { text: "No Leader Policy; +1 VP until Leader is hired", policy: true, eval: () => {}, vp: 1 },
    { text: "No Crime Policy; +1 VP until [opposing] Criminal", policy: true, eval: () => {}, vp: 1 },
    { text: "No Corruption Policy; +1 VP until Criminal is hired", policy: true, eval: () => {}, vp: 1 },
    { text: "No Police Policy; +1 VP until Police is hired", policy: true, eval: () => {}, vp: 1 },
    { text: "Police discount Policy; +1 Coin per Police"},
    { text: "Police happiness Policy; +1 VP per Police"},
    // { text: ""},
    // { text: ""},
    // { text: ""},
  ];
  static allEvents: EventTile[];
  static makeAllEvent() {
    EventTile.allEvents = EventTile.allEventSpecs.map((spec, ndx) => new EventTile(spec, ndx));
  }
  static addToBag(n: number, tileBag: TileBag<BagType>) {
    const tiles = EventTile.allEvents.slice(); // draw without replacement from copy of Tile[]
    for (let i = 0; i < n; i++) tileBag.push(tileBag.selectOne(true, tiles));
  }

  constructor(spec: EventSpec, n: number) {
    super(EventTile, n, spec);
  }
  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!super.isLegalTarget(toHex, ctx)) return false;
    if (toHex.isOnMap) return false;
    // TODO: if(this.policy) { allow drop on player's policy slots }
    // else: only drop on recycle
    return false;
  }
  override moveTo(hex: Hex): Hex {
    const gamePlay = GP.gamePlay;
    gamePlay.removeFromAuction(this);
    if (gamePlay.curPlayer.policySlots.includes(hex)) gamePlay.finishEvent();
    const rv = super.moveTo(hex); // presumably can now be on AuctionHex[0] and appear as AuctionTiles[0]
    if (hex === GP.gamePlay.eventHex) console.log(stime(this, `.moveTo:`), this.text);
    hex?.map.update();
    return rv;
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
    super(PolicyTile, n, spec);
  }
}
