import { json } from "@thegraid/common-lib";
import { KeyBinder, S, Undo, stime } from "@thegraid/easeljs-lib";
import { GameSetup } from "./game-setup";
import { Hex, HexMap, IHex } from "./hex";
import { Criminal, Leader, Police } from "./meeple";
import { Planner } from "./plan-proxy";
import { Player } from "./player";
import { GameStats, TableStats } from "./stats";
import { LogWriter } from "./stream-writer";
import { Table } from "./table";
import { PlayerColor, TP, otherColor, playerColors } from "./table-params";
import { AuctionTile, Bonus, TownRules } from "./tile";

class HexEvent {}
class Move{
  Aname: string = "";
  ind: number = 0;
  board: any = {};
}

/** Implement game, enforce the rules, manage GameStats & hexMap; no GUI/Table required.
 *
 * Actions are:
 * - Reserve: place one Tile from auction to Player reserve
 * - Recruit: place a Builder/Leader (in Civic);
 *   do Build/Police action (requires 5 Econ)
 * - Build: move Master/Builders, build one Tile (from auction or reserve)
 * - Police: place one (in Station), move police (& leaders/builders), attack/capture;
 *   collatoral damge (3 Econ); dismiss Police
 * - Crime: place one on unoccupied hex adjacent to opponent Tile (requires 3 Econ)
 *   move Criminals, attack/capture;
 *   (Player keeps the captured Tile/Meeple; maybe earn VP if Crime Lord)
 * -
 */
export class GamePlay0 {
  /** the latest GamePlay instance in this VM/context/process */
  static gamePlay: GamePlay0;
  static gpid = 0
  readonly id = GamePlay0.gpid++
  ll(n: number) { return TP.log > n }
  readonly logWriter: LogWriter

  get allPlayers() { return Player.allPlayers; }

  readonly hexMap: HexMap = new HexMap()
  readonly history: Move[] = []          // sequence of Move that bring board to its state
  readonly gStats: GameStats             // 'readonly' (set once by clone constructor)
  readonly redoMoves = []
  readonly auctionTiles: AuctionTile[] = []     // per game
  readonly reservedTiles: AuctionTile[][];      // per player; 2-players, 2-Tiles

  logWriterLine0() {
    let time = stime('').substring(6,15)
    let line = {
      time: stime.fs(), maxBreadth: TP.maxBreadth, maxPlys: TP.maxPlys,
      dpb: TP.dbp, mHexes: TP.mHexes, tHexes: TP.tHexes
    }
    let line0 = json(line, false)
    let logFile = `log_${time}`
    console.log(stime(this, `.constructor: -------------- ${line0} --------------`))
    let logWriter = new LogWriter(logFile)
    logWriter.writeLine(line0)
    return logWriter;
  }

  constructor() {
    GamePlay.gamePlay = this;
    this.logWriter = this.logWriterLine0()
    this.hexMap[S.Aname] = `mainMap`
    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
    // Create and Inject all the Players: (picking a townStart?)
    Player.allPlayers.length = 0;
    playerColors.forEach((color, ndx) => new Player(ndx, color, this))
    this.auctionTiles = new Array<AuctionTile>(Player.allPlayers.length + 1);   // expect to have 1 Tile child (or none)
    this.reservedTiles = new Array<AuctionTile[]>(2).fill(new Array<AuctionTile>(2), 0, 2);
  }

  turnNumber: number = 0    // = history.lenth + 1 [by this.setNextPlayer]
  curPlayerNdx: number = 0  // curPlayer defined in GamePlay extends GamePlay0
  curPlayer: Player;

  getPlayer(color: PlayerColor): Player {
    return this.allPlayers.find(p => p.color == color)
  }

  otherPlayer(plyr: Player = this.curPlayer) { return this.getPlayer(otherColor(plyr.color))}

  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }

  setNextPlayer(plyr: Player): void {
    this.turnNumber += 1 // this.history.length + 1
    this.curPlayer = plyr
    this.curPlayerNdx = plyr.index
    this.curPlayer.newTurn();
  }

  /** Planner may override with alternative impl. */
  newMoveFunc: (hex: Hex, sc: PlayerColor, caps: Hex[], gp: GamePlay0) => Move
  newMove(hex: Hex, sc: PlayerColor, caps: Hex[], gp: GamePlay0) {
    return this.newMoveFunc? this.newMoveFunc(hex,sc, caps, gp) : new Move()
  }
  undoRecs: Undo = new Undo().enableUndo();
  addUndoRec(obj: Object, name: string, value: any | Function = obj[name]) {
    this.undoRecs.addUndoRec(obj, name, value);
  }

  /** from auctionTiles to reservedTiles */
  reserve(tile: AuctionTile, rIndex: number) {
    let pIndex = this.curPlayerNdx;
    this.reservedTiles[pIndex][rIndex]?.recycle();   // if another Tile in reserve slot, recycle it.
    this.reservedTiles[pIndex][rIndex] = tile;
    tile.player = Player.allPlayers[pIndex];
    return true;
  }

  /** from AuctionTiles or ReserveTiles to hexMap: */
  build(tile: AuctionTile, hex: Hex) {
    if (!tile.isLegalTarget(hex)) return false
    let pIndex = this.curPlayerNdx;
    let player = Player.allPlayers[pIndex];
    let rIndex = this.reservedTiles[pIndex].indexOf(tile);
    if (rIndex > 0) this.reservedTiles[pIndex][rIndex] = undefined;
    let aIndex = this.auctionTiles.indexOf(tile);
    if (aIndex > 0) this.auctionTiles[aIndex] = undefined;
    tile.moveTo(hex);
    return true;
  }

  recruit(leader: Leader) {
    if (leader.hex?.isOnMap) return false;
    if (!leader.civicTile.hex?.isOnMap) return false;
    leader.hex = leader.civicTile.hex
    return true;
  }

  placePolice(hex: Hex) {
    let meep = Police.source[this.curPlayerNdx].nextUnit(); // meep.moveTo(source.hex)
    if (!meep) return false;
    if (!meep.isLegalTarget(hex)) return false;
    meep.moveTo(hex);
    return true;
  }

  placeCriminal(hex: Hex) {
    let meep = Criminal.source.nextUnit(); // meep.moveTo(source.hex)
    if (!meep) return false;
    if (!meep.isLegalTarget(hex)) return false;
    meep.moveTo(hex);
    return true;
  }
}

/** GamePlayD has compatible hexMap(mh, nh) but does not share components. used by Planner */
export class GamePlayD extends GamePlay0 {
  //override hexMap: HexMaps = new HexMap();
  constructor(dbp: number = TP.dbp, dop: number = TP.dop) {
    super()
    this.hexMap[S.Aname] = `GamePlayD#${this.id}`
    this.hexMap.makeAllDistricts(dbp, dop)
    return
  }
}

/** GamePlay with Table & GUI (KeyBinder, ParamGUI & Dragger) */
export class GamePlay extends GamePlay0 {
  readonly table: Table   // access to GUI (drag/drop) methods.
  declare readonly gStats: TableStats // https://github.com/TypeStrong/typedoc/issues/1597
  /** GamePlay is the GUI-augmented extension of GamePlay0; uses Table */
  constructor(table: Table, public gameSetup: GameSetup) {
    super()            // hexMap, history, gStats...
    AuctionTile.fillBag()                         // put R/B/PS/L into draw bag.
    TownRules.inst.fillRulesBag();
    // Players have: civics & meeples & TownSpec
    // setTable(table)
    this.table = table
    this.gStats = new TableStats(this, table) // upgrade to TableStats
    if (this.table.stage.canvas) this.bindKeys()
  }

  /**
   * 'Start' action.
   *
   * - Shift Auction
   * - Roll 2xD6, enable effects.
   * - - 1+1: add Star
   * - - 2+2: add Action
   * - - 3+3: add Coin
   * - - 6+4-6: add Criminal
   */
  startTurn(dice = Dice.roll()) {
    let tile = this.table.auctionCont.shift();
    dice.sort(); // ascending
    console.log(stime(this, `.startTurn:`), dice)
    if (dice[0] == 1 && dice[1] == 1) { this.addBonus('actn'); }
    if (dice[0] == 2 && dice[1] == 2) { this.addBonus('star'); }
    if (dice[0] == 3 && dice[1] == 3) { this.addBonus('coin'); }
    if (dice[0] == 4 && dice[1] == 4) { this.addBonus('econ'); }
    this.curPlayer.actionCounter.updateValue(this.curPlayer.actions = 1)
    this.hexMap.update()
  }
  addBonus(type?: Bonus, tile = this.auctionTiles[0]) {
    tile.addBonus(type);
    if (this.auctionTiles.includes(tile)) tile.paint(this.curPlayer.color)
    this.hexMap.update()
  }

  bindKeys() {
    let table = this.table
    let roboPause = () => { this.forEachPlayer(p => this.pauseGame(p) )}
    let roboResume = () => { this.forEachPlayer(p => this.resumeGame(p) )}
    let roboStep = () => {
      let p = this.curPlayer, op = this.otherPlayer(p)
      this.pauseGame(op); this.resumeGame(p);
    }
    KeyBinder.keyBinder.setKey('M-a', { thisArg: this, func: () => this.addBonus('actn') })
    KeyBinder.keyBinder.setKey('M-b', { thisArg: this, func: () => this.addBonus('star') })
    KeyBinder.keyBinder.setKey('M-c', { thisArg: this, func: () => this.addBonus('coin') })
    KeyBinder.keyBinder.setKey('M-d', { thisArg: this, func: () => this.addBonus('econ') })
    // KeyBinder.keyBinder.setKey('p', { thisArg: this, func: roboPause })
    // KeyBinder.keyBinder.setKey('r', { thisArg: this, func: roboResume })
    // KeyBinder.keyBinder.setKey('s', { thisArg: this, func: roboStep })
    KeyBinder.keyBinder.setKey('R', { thisArg: this, func: () => this.runRedo = true })
    KeyBinder.keyBinder.setKey('q', { thisArg: this, func: () => this.runRedo = false })
    KeyBinder.keyBinder.setKey(/1-9/, { thisArg: this, func: (e: string) => { TP.maxBreadth = Number.parseInt(e) } })

    KeyBinder.keyBinder.setKey('M-z', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('b', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('f', { thisArg: this, func: this.redoMove })
    //KeyBinder.keyBinder.setKey('S', { thisArg: this, func: this.skipMove })
    KeyBinder.keyBinder.setKey('M-K', { thisArg: this, func: this.resignMove })// S-M-k
    KeyBinder.keyBinder.setKey('Escape', {thisArg: table, func: table.stopDragging}) // Escape
    KeyBinder.keyBinder.setKey('C-a', { thisArg: table, func: () => { table.shiftAuction()} })  // C-a new Tile
    KeyBinder.keyBinder.setKey('C-s', { thisArg: this.gameSetup, func: () => { this.gameSetup.restart() } })// C-s START
    KeyBinder.keyBinder.setKey('C-c', { thisArg: this, func: this.stopPlayer })// C-c Stop Planner
    KeyBinder.keyBinder.setKey('m', { thisArg: this, func: this.makeMove, argVal: true })
    KeyBinder.keyBinder.setKey('M', { thisArg: this, func: this.makeMoveAgain, argVal: true })
    KeyBinder.keyBinder.setKey('n', { thisArg: this, func: this.autoMove, argVal: false })
    KeyBinder.keyBinder.setKey('N', { thisArg: this, func: this.autoMove, argVal: true})
    KeyBinder.keyBinder.setKey('c', { thisArg: this, func: this.autoPlay, argVal: 0})
    KeyBinder.keyBinder.setKey('v', { thisArg: this, func: this.autoPlay, argVal: 1})
    KeyBinder.keyBinder.setKey('y', { thisArg: this, func: () => TP.yield = true })
    KeyBinder.keyBinder.setKey('u', { thisArg: this, func: () => TP.yield = false })

    // diagnostics:
    //KeyBinder.keyBinder.setKey('x', { thisArg: this, func: () => {this.table.enableHexInspector(); }})
    KeyBinder.keyBinder.setKey('t', { thisArg: this, func: () => {this.table.toggleText(); }})
    //KeyBinder.keyBinder.setKey('z', { thisArg: this, func: () => {this.gStats.updateStats(); }})

    // KeyBinder.keyBinder.setKey('M-r', { thisArg: this, func: () => { this.gameSetup.netState = "ref" } })
    // KeyBinder.keyBinder.setKey('M-J', { thisArg: this, func: () => { this.gameSetup.netState = "new" } })
    // KeyBinder.keyBinder.setKey('M-j', { thisArg: this, func: () => { this.gameSetup.netState = "join" } })
    //KeyBinder.keyBinder.setKey('M-d', { thisArg: this, func: () => { this.gameSetup.netState = "no" } })
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
    table.skipShape.on(S.click, () => this.skipMove(), this)
  }

  useReferee = true


  async waitPaused(p = this.curPlayer, ident = '') {
    this.hexMap.update()
    let isPaused = !(p.planner as Planner).pauseP.resolved
    if (isPaused) {
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} waiting...`))
      await p.planner.waitPaused(ident)
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} running`))
    }
    this.hexMap.update()
  }
  pauseGame(p = this.curPlayer) {
    p.planner?.pause();
    this.hexMap.update();
    console.log(stime(this, `.pauseGame: ${p.colorn}`))
  }
  resumeGame(p = this.curPlayer) {
    p.planner?.resume();
    this.hexMap.update();
    console.log(stime(this, `.resumeGame: ${p.colorn}`))
  }
  /** tell [robo-]Player to stop thinking and make their Move; also set useRobo = false */
  stopPlayer() {
    this.autoMove(false)
    this.curPlayer.stopMove()
    console.log(stime(this, `.stopPlan:`), { planner: this.curPlayer.planner }, '----------------------')
    setTimeout(() => { this.table.showWinText(`stopPlan`) }, 400)
  }
  /** undo and makeMove(incb=1) */
  makeMoveAgain(arg?: boolean, ev?: any) {
    if (this.curPlayer.plannerRunning) return
    this.undoMove()
    this.makeMove(true, undefined, 1)
  }

  /**
   * Current Player takes action.
   *
   * after setNextPlayer: enable Player (GUI or Planner) to respond
   * with playerMove() [table.moveStoneToHex()]
   *
   * Note: 1st move: player = otherPlayer(curPlayer)
   * @param auto this.runRedo || undefined -> player.useRobo
   * @param ev KeyBinder event, not used.
   * @param incb increase Breadth of search
   */
  makeMove(auto = undefined, ev?: any, incb = 0) {
    let player = this.curPlayer
    if (this.runRedo) {
      this.waitPaused(player, `.makeMove(runRedo)`).then(() => setTimeout(() => this.redoMove(), 10))
      return
    }
    if (auto === undefined) auto = player.useRobo
    player.playerMove(auto, incb) // make one robo move
  }
  /** if useRobo == true, then Player delegates to robo-player immediately. */
  autoMove(useRobo = false) {
    this.forEachPlayer(p => {
      this.roboPlay(p.index, useRobo)
    })
  }
  autoPlay(pid = 0) {
    this.roboPlay(pid, true)  // KeyBinder uses arg2
    if (this.curPlayerNdx == pid) this.makeMove(true)
  }
  roboPlay(pid = 0, useRobo = true) {
    let p = this.allPlayers[pid]
    p.useRobo = useRobo
    console.log(stime(this, `.autoPlay: ${p.colorn}.useRobo=`), p.useRobo)
  }
  /** when true, run all the redoMoves. */
  set runRedo(val: boolean) { (this._runRedo = val) && this.makeMove() }
  get runRedo() { return this.redoMoves.length > 0 ? this._runRedo : (this._runRedo = false) }
  _runRedo = false

  /** invoked by GUI or Keyboard */
  undoMove(undoTurn: boolean = true) {
    this.table.stopDragging() // drop on nextHex (no Move)
    //
    // undo state...
    //
    this.showRedoMark()
    this.hexMap.update()
  }
  /** doTableMove(redoMoves[0]) */
  redoMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
    let move = this.redoMoves[0]// addStoneEvent will .shift() it off
    if (!move) return
    this.table.doTableMove(move.hex)
    this.showRedoMark()
    this.hexMap.update()
  }
  showRedoMark(hex: IHex | Hex = this.redoMoves[0]?.hex) {
    if (!!hex) { // unless Skip or Resign...
      this.hexMap.showMark((hex instanceof Hex) ? hex : Hex.ofMap(hex, this.hexMap))
    }
  }

  skipMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
  }
  resignMove() {
    this.table.stopDragging() // drop on nextHex (no Move)
  }

  // TODO: use setNextPlayerNdx() and include in GamePlay0 ?
  override setNextPlayer(plyr = this.otherPlayer()) {
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = false;
    super.setNextPlayer(plyr)
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = true;
    this.table.auctionCont.tiles.forEach(tile => tile?.paint(this.curPlayer.color))
    this.table.showNextPlayer() // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.hexMap.update()
    this.startTurn()
    this.makeMove()
  }

  /** dropFunc | eval_sendMove -- indicating new Move attempt */
  localMoveEvent(hev: HexEvent): void {
    let redo = this.redoMoves.shift()   // pop one Move, maybe pop them all:
    //if (!!redo && redo.hex !== hev.hex) this.redoMoves.splice(0, this.redoMoves.length)
    //this.doPlayerMove(hev.hex, hev.playerColor)
    this.setNextPlayer()
    this.ll(2) && console.log(stime(this, `.localMoveEvent: after doPlayerMove - setNextPlayer =`), this.curPlayer.color)

  }

  /** local Player has moved (S.add); network ? (sendMove.then(removeMoveEvent)) : localMoveEvent() */
  playerMoveEvent(hev: HexEvent): void {
    this.localMoveEvent(hev)
  }
}

class Dice {
  static roll(n = 2, d = 6) {
    return new Array(n).fill(1).map(v => 1 + Math.floor(Math.random() * d));
  }
}

/** a uniquifying 'symbol table' of Board.id */
class BoardRegister extends Map<string, Board> {}
/** Identify state of HexMap by itemizing all the extant Stones
 * id: string = Board(nextPlayer.color, captured)resigned?, allStones
 * resigned: PlayerColor
 * repCount: number
 */
export class Board {
  readonly id: string = ""   // Board(nextPlayer,captured[])Resigned?,Stones[]
  readonly resigned: PlayerColor //
  repCount: number = 1;

  /**
   * Record the current state of the game: {Stones, turn, captures}
   * @param move Move: color, resigned & captured [not available for play by next Player]
   */
  constructor(id: string, resigned: PlayerColor) {
    this.resigned = resigned
    this.id = id
  }
  toString() { return `${this.id}#${this.repCount}` }

  setRepCount(history: {board}[]) {
    return this.repCount = history.filter(hmove => hmove.board === this).length
  }
  get signature() { return `[${TP.mHexes}x${TP.nHexes}]${this.id}` }
}
