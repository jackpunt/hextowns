export const playerColors = ['w', 'b'] as const // Player Colors!
export const playerColor0 = playerColors[0]
export const playerColor1 = playerColors[1]
//type playerColorTuple = typeof playerColors
export type PlayerColor = typeof playerColors[number]
export function otherColor(color: PlayerColor): PlayerColor { return color === playerColor0 ? playerColor1 : playerColor0 }

export type PlayerColorRecord<T> = Record<PlayerColor, T>
export function playerColorRecord<T>(b: T = undefined, w: T = undefined): PlayerColorRecord<T> { return { 'b': b, 'w': w } };
export function playerColorRecordF<T>(f: (sc: PlayerColor) => T) { return playerColorRecord(f(playerColor0), f(playerColor1)) }

export function buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
  return `${scheme}://${host}.${domain}:${port}${path}`
}
export class TP {
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
  static Black_White = playerColorRecord<'BLACK' | 'WHITE'>('BLACK', 'WHITE')
  static Blue_Red = playerColorRecord<'BLUE' | 'RED'>('BLUE', 'RED')
  static Red_Blue = playerColorRecord<'RED' | 'BLUE'>('RED', 'BLUE')
  static schemeNames = ['Red_Blue']
  static colorScheme = TP.Blue_Red
  static numPlayers = 2;
  static load = 5;  // initial Ship load for manual testing
  /** offset planets  */
  static offP = true;
  /** distance between planets */
  static dbp = 4; // nCows = nCols = 3*dbp+3
  /** distance outside planets */
  static dop = 2; // nh = dbp + 2 * dop (length of outer edge)
  /** Order [number of rings] of metaHexes */
  static mHexes = 10   // number hexes on side of Meta-Hex
  /** Order [number of Hexs on side] of District [# rings of Hexes in each metaHex] */
  static nHexes = 1    // number of Hexes on side of District
  static nDistricts = 7
  static nVictory = 3  // number of Colony to win
  static tHexes = TP.ftHexes(this.mHexes) * TP.ftHexes(this.nHexes)
  static nMinControl  = (TP.nHexes <= 1) ? 1 : TP.nHexes + 1 // [1, 1, 3, 4, 5, ...]
  static nDiffControl = (TP.nHexes <= 1) ? 0 : TP.nHexes - 1 // [0, 0, 1, 2, 3, ...]
  static hexRad = 60
  static log = 0
  /** map size for (dpb, dop) */
  static fnHexes(dbp = 4, dop = 2) {
    TP.dbp = dbp
    TP.dop = dop
    TP.nHexes = 1;
    TP.mHexes = dbp + 2 + dop; // between planets + planets + outside planets
    TP.tHexes = TP.ftHexes(TP.mHexes)
  }
  /** number of hexes in a metaHex of order n; number of districts(n=TP.mHexes)
   * @return an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n <= 1) ? n : 6 * (n-1) + TP.ftHexes(n - 1) }
  /** initialize fnHexes using initial dpb, dop */
  static xxx = TP.fnHexes(TP.dbp, TP.dop)

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
