// Game win: a Player controls 4 of 7 Districts
// Control: Stone on >= 7 Hexes && Player.nHexes(district) - otherPlayer.nHexes(district) >= 3

import { C, DropdownButton, DropdownChoice, F, ParamGUI, ParamItem, ParamLine, ParamOpts, ParamSpec, ParamType, S, stime } from "@thegraid/easeljs-lib";
import { Text } from "@thegraid/easeljs-module";
import { Board, GamePlay } from "./game-play";
import { Hex, Hex2, HexM } from "./hex";
import { H } from "./hex-intfs";
import { Player } from "./player";
import { Table } from "./table";
import { otherColor, PlayerColor, playerColor0, playerColor1, PlayerColorRecord, playerColorRecordF, playerColors, TP } from "./table-params";
export type WINARY = [Board, PlayerColor, number, number]
export class PlayerStats {

  readonly dStones: number[] = [0];      // per-district (initialize district 0)
  readonly dMinControl: boolean[] = [];  // per-district true if minControl of district
  dMax: number = 0;      // max dStones in non-Central District
  nCoins: number = 0;    // total on board
  nInf: number = 0;      // (= nCoins*6 - edge effects - E/W-overlap)
  hThreats: Hex[] = [];  // Hexes with opponent & 1 threat (possible attack)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone) 'jeopardy' (hThreats.length)
  nAttacks: number = 0;  // (Hex w/ inf >= 2) 'unplayable by opponent'
  nAdj: number = 0;      // number of adjacent stones [compactness]

  constructor() {
    let distLen = TP.nDistricts // gStats.hexMap.nDistricts;
    this.dStones = Array(distLen).fill(0, 0, distLen)
    this.dMinControl = Array(distLen).fill(false, 0, distLen)
  }
}

export class GameStats {
  winVP: PlayerColor = undefined;
  get s0() { return this.score(playerColor0) }
  get s1() { return this.score(playerColor1) }
  get ds() { return this.score(playerColor0) - this.score(playerColor1) }

  get n0() { return this.pStats[playerColor0].nCoins }
  get n1() { return this.pStats[playerColor1].nCoins }
  get dn() { return this.pStats[playerColor0].nCoins - this.pStats[playerColor1].nCoins }

  winAny: PlayerColor = undefined;
  score(color: PlayerColor): number {
    return this.inControl.filter(ic => ic == color).length
  }

  /** extract the useful bits for maintaining stats. */
  constructor(
    public readonly hexMap: HexM,
    public readonly pStats: Record<PlayerColor, PlayerStats> = playerColorRecordF(() => new PlayerStats()),
    public readonly inControl: PlayerColor[] = Array(TP.ftHexes(TP.mHexes))) {
    this.setupStatVector()           // use default wVector
  }

  adjDistrict(hex: Hex, color: PlayerColor) {
    let pstat = this.pStat(color)
    pstat.dMax = Math.max(...pstat.dStones.slice(1))
  }

  pStat(color: PlayerColor): PlayerStats { return this.pStats[color] }
  zeroCounters(distLen = this.inControl.length) {
    this.inControl.fill(undefined, 0, distLen)
    playerColors.forEach((color) => this.pStats[color] = new PlayerStats())
  }

  /** compute pstats, return PlayerColor of winner (or undefined) */
  updateStats(board?: Board): [PlayerColor, WINARY] {
    this.zeroCounters()
    let distLen = this.inControl.length; // = TP.ftHexes(TP.mHexes) -  1
    let winVP: PlayerColor
    // forEachDistrict(d => {})
    for (let d = 0; d < distLen; d++) {
      playerColors.forEach(color => {
        let pstats = this.pStats[color]
        let dStones = pstats.dStones[d]
        let min = pstats.dMinControl[d] = (dStones >= TP.nMinControl)
        if (min && dStones - (this.pStats[otherColor(color)].dStones[d] || 0) >= TP.nDiffControl) {
          this.inControl[d] = color
          if (this.score(color) >= TP.nVictory) winVP = color
        }
      })
    }
    this.winVP = winVP
    let winAry: WINARY = [board, this.winVP, this.ds, this.dn]
    let win = this.gameOver(...winAry)
    //board && (board.winAry = winAry)
    return [win, winAry]
  }
  /** victory, resigned, stalemate; win = gStats.gameOver(...board.winAry) */
  gameOver(board: Board, winVP: PlayerColor, ds: number, dn: number): PlayerColor {
    return this.winAny = (winVP !== undefined) ? winVP : !board ? undefined
      : board.resigned ? otherColor(board.resigned)
        : (board.repCount < 3) ? undefined
          : ((ds == 0 ? (dn <= 0 ? playerColor1 : playerColor0)
            : ((ds > 0) ? playerColor0 : playerColor1)))
  }

  // Mixin to compute weighted summaryStat over pStats for Planner:
  wVector: number[] = []
  setupStatVector() {
    let distLen = this.inControl.length
    let dStonesM = new Array<number>(distLen).fill(1, 0, distLen)
    dStonesM[0] = 1.1
    let scoreM = 1.3, dMaxM = 1, nCoinsM = 1.1, nInfM = .3, nThreatsM = .2, nAttacksM = .5, nAdjM = .1
    this.wVector = dStonesM.concat([scoreM, dMaxM, nCoinsM, nInfM, nThreatsM, nAttacksM, nAdjM])
  }
  statVector(color: PlayerColor): number[] {
    let pstat = this.pStat(color)
    let score = this.score(color)
    let { dStones, dMax, nCoins: nCoins, nInf, nThreats, nAttacks, nAdj } = pstat
    return dStones.concat(score, dMax, nCoins, nInf, nThreats, nAttacks, nAdj)
  }
  mulVector(v0: number[], v1: number[]): number[] { // v0 = dotProd(v0, v1)
    for (let i in v0 ) v0[i] *= v1[i]
    return v0
  }
  sumVector(v0: number[]): number {
    return v0.reduce((sum, cv) => sum+cv, 0)
  }
  getSummaryStat(color: PlayerColor, wVec = this.wVector) {
    let sv = this.statVector(color)
    this.mulVector(sv, wVec)
    return this.sumVector(sv)
  }
}
/**
 * GameStats with Table/GUI
 */
export class TableStats extends GameStats {
  // provide nextHex, hexMap.mapCont, statsPanel, miniMap
  gamePlay: GamePlay;
  table: Table         // presence indicates a GUI environment: showControl, showBoardRep
  boardRep: Text       // display repeatCount
  dStonesText: Text[] = []

  sStat(color: PlayerColor): number {
    return this.getSummaryStat(color)
  }
  // TableStats:
  constructor(gamePlay: GamePlay, table: Table) {
    super(gamePlay.hexMap)
    this.gamePlay = gamePlay
    this.table = table
  }


  /** update all the stats
   * @move0 if supplied, check move0.board for resign/stalemate
   */
  override updateStats(board?: Board): [PlayerColor, WINARY] {
    const winAry = super.updateStats(board)
    this.gamePlay.forEachPlayer(p => {
    })

    const [win] = winAry
    if (!!this.table) {
      this.table.statsPanel?.update()
      this.table.stage?.update()
    }
    if (win !== undefined) {
      let pc = win, pcr = TP.colorScheme[pc], pStats = this.pStat(pc)
      let opc = otherColor(pc), opcr = TP.colorScheme[opc], opStats = this.pStat(opc)
      if (board.resigned) this.showWin(pc, `${opcr} RESIGNS`)
      else if (board.repCount == 3) this.showWin(pc, `STALEMATE (${pStats.nCoins} -- ${opStats.nCoins})`)
      else this.showWin(pc, `${opcr} loses`)
    }
    return winAry
  }
  // TODO: align with nextHex(x & y), background
  showWin(win: PlayerColor, text: string): PlayerColor {
    this.table.showRedoUndoCount()
    let lose = otherColor(win), winS = this.score(win), loseS = this.score(lose)
    let winr = TP.colorScheme[win], msg = `${winr} WINS:\n${text}\n${winS} -- ${loseS}`
    console.log(stime(this, `.showWin:`), msg)
    this.table.showWinText(msg)
    return win
  }
}
/**
  dStones: number[] = Array(7);       // per-district
  dMinControl: boolean[] = Array(7);  // per-district true if minControl of district
  dMax: number                        // max dStones in non-central district
  nCoins: number = 0;    // total on board
  nInf: number = 0;      // (= nCoins*6 - edge effects - E/W-underlap)
  nThreats: number = 0;  // (Hex w/ inf && [op].stone)
  nAttacks: number = 0;  // (Hex w/ inf >= 2)
  inControl(d: PlayerColor)  { return this.gStats.inControl[this.plyr.color][d]; }
 */

/** A "read-only" version of ParamGUI, to display value of target[fieldName] */
export class StatsPanel extends ParamGUI {

  gStats: TableStats
  bFields = ['score', 'sStat'] //
  pFields = ['nCoins', 'nInf', 'nThreats', 'nAttacks', 'dMax'] // 'dStones', 'dMinControl',
  valueSpace = "                   "       // could be set in constructor...

  /**  StatsPanel.setValue() does nothing; StatsPanel.selectValue() -> setValueText(stat) */
  constructor(gStats: TableStats, defStyle = {}) {
    super(gStats, DropdownButton.mergeStyle(defStyle, DropdownButton.mergeStyle({ arrowColor: '0', textAlign: 'center'})))
    this.gStats = gStats
  }
  /** very dodgy to pass the 'decimal' number as ary[0] */
  override makeParamSpec(fieldName: string, ary: any[] = [], opts: ParamOpts = {}): ParamSpec {
    let decimal = ary[0]
    opts.chooser = SC
    let spec = super.makeParamSpec(fieldName, [this.valueSpace], opts)
    spec['decimal'] = decimal
    return spec
  }
  targetValue(target: object, color: PlayerColor, fieldName: string) {
    let value = target[fieldName] as (color: PlayerColor) => any | Array<PlayerColor>
    if (typeof(value) === "function") {
      return value.call(target, color)
    } else {
      return target[color][fieldName]
    }
  }
  /** show 'fieldName[0] -- fieldName[1]' in _rootButton.text.text */
  override selectValue(fieldName: string, value?: ParamType, line = this.findLine(fieldName)) {
    if (!line) return null
    let decimal = line.spec.choices[0]
    let lineValue = "?"
    let target = this.pFields.includes(fieldName) ? this.gStats.pStats : this.gStats
    let v0 = this.targetValue(target, playerColor0, fieldName).toFixed(decimal)
    let v1 = this.targetValue(target, playerColor1, fieldName).toFixed(decimal)
    lineValue = `${v0} -- ${v1}`
    let chooser = line.chooser as SC
    chooser._rootButton.text.text = lineValue
    return undefined as ParamItem // Note: return value is never used!
  }

  /** read-only... do nothing, unless spec.onChange(...) */
  override setValue(item: ParamItem): void {  }

  update() {
    this.pFields.forEach(fieldName => this.selectValue(fieldName))
    this.bFields.forEach(fieldName => this.selectValue(fieldName))
  }
}
/** StatChoice: never expand the [sp] item */
class SC extends DropdownChoice {
  /** never expand */
  override rootclick(): void {}
}

