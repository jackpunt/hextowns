import type { Constructor } from "@thegraid/common-lib"

export const playerColors = ['b', 'w'] as const // Player Colors!
export const playerColorsC = ['b', 'w', 'c'] as const // Player Colors + Criminal!
export const playerColor0 = playerColors[0]
export const playerColor1 = playerColors[1]
export const playerColor2 = playerColorsC[2]
export const criminalColor = playerColorsC[2]
//type playerColorTuple = typeof playerColors
export type PlayerColor = typeof playerColorsC[number];
export function otherColor(color: PlayerColor): PlayerColor { return color === playerColor0 ? playerColor1 : playerColor0 }

/** PlayerColerRecord<T> maps from PlayerColor -> T */
export type PlayerColorRecord<T> = Record<PlayerColor, T>
export function playerColorRecord<T>(b: T = undefined, w: T = undefined, c: T = undefined): PlayerColorRecord<T> { return { b, w, c } };
export function playerColorRecordF<T>(f: (sc: PlayerColor) => T) { return playerColorRecord(f(playerColor0), f(playerColor1), f(playerColor2)) }

export function buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
  return `${scheme}://${host}.${domain}:${port}${path}`
}
export class TP {
  static cacheTiles = 2;
  // negative Econ is charged as cost when recruited.
  static leaderEcon = -6;
  static policeEcon = -3;
  static criminalEcon = -3;
  // Meeples: pay with econ; no inf cost, place in Civic/PStation, or crime zone.
  static leaderCost = 0; // increased by [bonus('star') + costInc] == 1 + -leaderEcon
  static policeCost = 0;
  static criminalCost = 0;
  static econForCrime = 6;
  static econForEvents = 6;

  static eventScale = 1.5;
  static allowMultiEvent = false;
  static anyPlayerAdj = true;
  static bankAdjBank = false;
  static tvpPerVP = 4;       // integrate long-term vp -> TVP
  static vpMulWhenCmplt = 2; // bonus for the last 1 or 2 rounds.
  static nCivics = 4;
  static vpOnCivic = 1;
  static infOnCivic = 0;
  static maxCivics = 4;
  static auctionMerge = 0;
  static auctionSlots = 5;
  static reserveSlots = 1;
  static nResaDraw = 3;
  static nPolicySlots = 4;
  static preShiftCount = Math.max(1, TP.auctionSlots - 2);
  static alwaysShiftPolicy = true;
  static resiPerPlayer = 11;  // 2-side 29 double-sided Tile2! (167 - 29 = 138) < 140!!
  static busiPerPlayer = 9;   // 2-side
  static lakePerPlayer = 3;   // 2-side
  static bankPerPlayer = 3;   // 2-side
  static pstaPerPlayer = 3;   // 2-side
  static eventsPerPlayer = 3; // how may to put in bag, from total supply of event tiles
  static policyPerPlayer = 3; // how may to put in bag, from total supply of policy tiles
  static bonusPerType = 2;    // 4 types: star, econ, infl, actn (star == VP, econ=$$)
  static bonusOnBoard = 4;    //
  static autoCrimePerBag = 1 / 6;   // 1 in 6 --> 1 in 7;
  static inMarketPerPlayer = { Busi: 2, Resi: 2, Monument: 3 } as const;
  // 58 Baggable Tiles + 4 Civic Tiles per player.
  static criminalPerPlayer = 4;
  static policePerPlayer = 3;
  static textLogLines = 6;
  static tileCosts = { Lake: 2, Bank: 2, PS: 2 }
  static tileCost(type: Constructor<Object>, def = 1) { return TP.tileCosts[type.name] ?? def }

  static placeAdjacent = true;
  static alwaysShift = false;
  static useEwTopo = true;
  static parallelAttack = true;  // true --> N intersects S
  static allowSacrifice = true;
  static yield = true
  static yieldMM = 1
  static pPlaner = true
  static pWorker = false
  static pWeight = 1      // allocation of new value: vNew * w + vOld * (1-w)
  static keepMoves = 4;   // number of predicted/evaluated moves to retain in State.moveAry
  static pResign = 1      // if lookahead(resignAhead).bv = -Infinity --> Resign
  static pBoards = true   // true: evalState saves board->state
  static pMoves = true    // true: use predicted moveAry
  static pGCM = true      // GC state.moveAry (except bestHexState.moveAry)
  static maxPlys = 5      // for robo-player lookahead
  static maxBreadth = 7   // for robo-player lookahead
  static nPerDist = 4     // samples per district
  // Note that DARKGREY is actually lighter than GREY
  static Black_White = playerColorRecord<'BLACK' | 'WHITE' | 'DARKGREY'>('BLACK', 'WHITE', 'DARKGREY')
  static Blue_Red = playerColorRecord<'BLUE' | 'RED' | 'DARKGREY'>('BLUE', 'RED', 'DARKGREY')
  static Red_Blue = playerColorRecord<'RED' | 'BLUE' | 'DARKGREY'>('RED', 'BLUE', 'DARKGREY')
  static Purpl_Orng = playerColorRecord<'ORANGE' | 'BLUE' | 'DARKGREY'>('BLUE', 'ORANGE', 'DARKGREY')
  static schemeNames = ['Red_Blue', 'Blue_Red', 'Purpl_Orng'];
  static colorScheme = TP.Blue_Red;
  static policyColor = 'YELLOW';
  static eventColor = 'GREEN';
  static eventColor2 = 'ORANGE';
  static numPlayers = 2;
  /** Order [number of rings] of metaHexes */
  static mHexes = 1   // number hexes on side of Meta-Hex
  /** Order [number of Hexs on side] of District [# rings of Hexes in each metaHex] */
  static nHexes = 8    // number of Hexes on side of District
  static nDistricts = 7
  static nVictory = 3  // number of Colony to win
  static tHexes = TP.ftHexes(this.mHexes) * TP.ftHexes(this.nHexes)
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  static hexRad = 210; // 210 fills Print&Play template
  static fontSize = TP.hexRad / 2;
  static meepleRad = TP.hexRad / 1.9;
  static meepleY0 = TP.hexRad * .25;
  static log = 0
  /** map size for (dpb, dop) */
  static fnHexes(nh = TP.nHexes, nm = TP.mHexes) {
    TP.nHexes = nh;
    TP.mHexes = nm;
    TP.tHexes = TP.ftHexes(TP.mHexes)
  }
  /** number of hexes in a metaHex of order n; number of districts(n=TP.mHexes)
   * @return an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n <= 1) ? n : 6 * (n-1) + TP.ftHexes(n - 1) }
  /** initialize fnHexes using initial nHexes, mHexes */
  static xxx = TP.fnHexes();

  /** exclude whole Extension sets */
  static excludeExt: string[] = ["Policy", "Event", "Roads", "Transit"]; // url?ext=Transit,Roads
  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor: string = 'tan' //'wheat'// C.BROWN
  static borderColor: string = 'peru'//TP.bgColor; //'burlywood'

  static ghost: string = 'cgserver'   // game-setup.network()
  static gdomain: string = 'thegraid.com'
  static gport: number = 8447
  static networkUrl = buildURL();  // URL to cgserver (wspbserver)
  static networkGroup: string = "hexagon";
}
