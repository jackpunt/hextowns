import { stime, S, XY } from "@thegraid/common-lib"
import { GamePlay } from "./game-play"
import { Hex, Hex2, IHex } from "./hex"
import { H, HexDir } from "./hex-intfs"
import { IPlanner, newPlanner } from "./plan-proxy"
import { Builder, Dean, Leader, Mayor, Meeple, Police, Priest } from "./meeple"
import { Table } from "./table"
import { PlayerColor, playerColors, TP } from "./table-params"
import { AuctionTile, Church, Civic, PS, Tile, TownHall, TownRules, TownStart, University } from "./tile"

export class Player {
  static allPlayers: Player[] = [];
  readonly Aname: string;
  readonly index: number = 0; // index in playerColors & allPlayers
  readonly color: PlayerColor = playerColors[this.index];
  readonly gamePlay: GamePlay;

  readonly captures: Meeple | Tile[] = [];      // captured Criminals; Tiles captured by Criminals moved by Player
  readonly meeples: Meeple[] = [];              // Player's B, M, P, D, Police available
  readonly civicTiles: Civic[] = [];            // Player's S, H, C, U Tiles
  readonly leaderHex: Hex2[] = [];              // Table Layout Hex2 for initial placement
  readonly tiles: (Civic | AuctionTile)[] = []; // Resi/Busi/PS/Lake/Civics in play on Map
  readonly reserved: AuctionTile[] = [];        // Resi/Busi/PS/Lake reserved for Player (max 2?)

  get townstart() { return this.tiles.find(t => t instanceof TownStart) as TownStart }
  /** civicTiles in play on Map */
  get allCivics() { return this.tiles.filter(t => t instanceof Civic) as Civic[] }
  get allLeaders() { return this.meeples.filter(m => m instanceof Leader) }
  get allPolice() { return this.meeples.filter(m => m instanceof Police) as Police[] }

  otherPlayer: Player
  planner: IPlanner
  /** if true then invoke plannerMove */
  useRobo: boolean = false
  get colorn() { return TP.colorScheme[this.color] }

  constructor(index: number, color: PlayerColor, gameplay: GamePlay) {
    this.index = index
    this.color = color
    this.gamePlay = gameplay
    this.Aname = `Player${index}-${this.colorn}`
    Player.allPlayers[index] = this;
  }

  /** make Civics, Leaders & Police; also makeLeaderHex() */
  makePlayerBits() {
    this.civicTiles.length = this.meeples.length = 0;
    Leader.makeLeaders(this); // push new Civic onto this.civics, push new Leader onto this.meeples
    for (let i = 0; i < 5; i++) {
      new Police(this, i);      // Note: Player will claim/paint PS from Tile.tileBag/auction
      // PStations made in bulk, along with Resi & Busi (in Tile.tileBag)
    }
    this.makeLeaderHex(); // place for Civics before placed on hexMap.
  }
  // Leader place *before* deployed to Civic on map.
  makeLeaderHex(xy: XY = {x: 50, y: 0}) {
    this.leaderHex.length = 0;
    this.allLeaders.forEach((meep, i) => {
      // make leaderHex: (not positioned on Table)
      let hex = new Hex2(this.gamePlay.hexMap, 0, 0, meep.name)
      this.leaderHex.push(hex)
      meep.civicTile.moveTo(hex)
      meep.moveTo(hex)
    })
    this.policeAcademy.hex = new Hex2(this.gamePlay.hexMap, 0, 0, 'PoliceAcademy')
    this.policeAcademy.available = this.allPolice.slice();
    this.leaderHex.push(this.policeAcademy.hex);
    this.recruitPolice().moveTo(this.policeAcademy.hex);
  }
  readonly policeAcademy: { hex?: Hex2, available?: Police[] } = {};
  /** recruit each Police ONCE; they never go back to the academy. */
  recruitPolice() { return this.policeAcademy.available.shift() }

  /** choose TownRules & placement of TownStart */
  placeTown(town = this.civicTiles[0] as TownStart) {
    let ruleCard = TownRules.inst.selectOne();
    town.rule = ruleCard[Math.floor(Math.random() * 2)];
    // in principle this could change based on the town.rule...
    let hex = this.gamePlay.hexMap.centerHex as Hex;
    let path: HexDir[] = [['NE', 'NW', 'NE'] as HexDir[], ['SE', 'SW', 'SW'] as HexDir[]][this.index];
    path.forEach(dir => hex = hex.nextHex(dir));
    town.moveTo(hex)
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
        this.gamePlay.setNextPlayer();    // if all ships moved
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
