import { stime, S } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { Hex, Hex2, IHex } from "./hex"
import { H } from "./hex-intfs"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Meeple } from "./meeple"
import { Table } from "./table"
import { PlayerColor, playerColors, TP } from "./table-params"

export class Player {
  static allPlayers: Player[] = [];
  name: string
  index: number = 0; // index in playerColors & allPlayers
  color: PlayerColor = playerColors[this.index]
  table: Table
  meeples: Meeple[] = []
  tiles = [];   // R/B/PS Tiles (& Civics?)
  civics = [];  // TS, U, C, CH
  otherPlayer: Player
  planner: IPlanner
  /** if true then invoke plannerMove */
  useRobo: boolean = false
  get colorn() { return TP.colorScheme[this.color] }

  constructor(index: number, color: PlayerColor, table: Table) {
    this.index = index
    this.color = color
    this.table = table
    this.name = `Player${index}-${this.colorn}`
    Player.allPlayers[index] = this;
  }
  makeMeeple() {
    this.meeples = [];     // no meeple at startup@
  }
  /** choose placement of TownStart */
  placeTown() {
    //
  }
  /** place ship initially on a Hex adjacent to planet0 */
  chooseShipHex(ship: Meeple) {
    let map = this.table.hexMap, hexes: Hex[] = []
    // find un-occupied hexes surrounding planet0
    H.ewDirs.forEach(dir => {
      let hex = map.planet0.nextHex(dir) as Hex;
      if (!hex.occupied) hexes.push(hex)
    })
    let dn = Math.floor(Math.random() * hexes.length);
    let hex = hexes[dn]
    console.log(stime(this, `.chooseShipHex: `), ship, hex)
    return hex
  }
  endGame(): void {
    this.planner?.terminate()
    this.planner = undefined
  }
  static remotePlayer = 1 // temporary, bringup-debug: index of 'remotePlayer' (see below)
  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    this.makeMeeple()
    this.planner?.terminate()
    // this.hgClient = (this.index == Player.remotePlayer) ? new HgClient(url, (hgClient) => {
    //   console.log(stime(this, `.hgClientOpen!`), hgClient)
    // }) : undefined
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  newTurn() {
    this.meeples.forEach(ship => ship.newTurn())
  }
  stopMove() {
    this.planner?.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.colorn}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
    // continue any semi-auto moves for ship:
      if (!this.meeples.find(ship => !ship.shipMove())) {
        this.table.gamePlay.setNextPlayer();    // if all ships moved
      }
      // start plannerMove from top of stack:
      // setTimeout(() => this.plannerMove(incb))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(incb = 0) {
    this.planner?.roboMove(true)
    this.plannerRunning = true
    // let iHistory = this.table.gamePlay.iHistory
    // let ihexPromise = this.planner.makeMove(sc, iHistory, incb)
    // ihexPromise.then((ihex: IHex) => {
    //   this.plannerRunning = false
    //   this.table.moveStoneToHex(ihex, sc)
    // })
  }
}
class RemotePlayer extends Player {
  override newGame(gamePlay: GamePlay) {
    this.planner?.terminate()
    // this.hgClient = (this.index == RemotePlayer.remotePlayer) ? new HgClient() : undefined
    // this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
}
