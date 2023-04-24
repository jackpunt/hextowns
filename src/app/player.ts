import { C, stime } from "@thegraid/common-lib"
import { GamePlay, GamePlay0 } from "./game-play"
import { Hex, Hex2 } from "./hex"
import { HexDir } from "./hex-intfs"
import { Criminal, Leader, Meeple, Police } from "./meeple"
import { IPlanner, newPlanner } from "./plan-proxy"
import { PlayerColor, TP, otherColor, playerColors } from "./table-params"
import { AuctionTile, Civic, Tile, TownRules, TownStart } from "./tile"
import { ValueCounter } from "@thegraid/easeljs-lib"

export class Player {
  static allPlayers: Player[] = [];

  /** econ, expense, vp */
  static updateCounters() {
    Player.allPlayers.forEach(player => {
      player.econCounter.updateValue(player.econs)
      player.expenseCounter.updateValue(player.expenses)
      player.vpCounter.updateValue(player.vps)
    })
    GamePlay.gamePlay.hexMap.update()
  }



  readonly Aname: string;
  readonly index: number = 0; // index in playerColors & allPlayers
  readonly color: PlayerColor = playerColors[this.index];
  readonly gamePlay: GamePlay;

  readonly civicTiles: Civic[] = [];            // Player's S, H, C, U Tiles
  // Player's B, M, P, D, Police & Criminals-claimed
  get meeples() {return Meeple.allMeeples.filter(meep => meep.player == this)};
  // Resi/Busi/PS/Lake/Civics in play on Map
  get tiles() { return Tile.allTiles.filter(t => !(t instanceof Meeple) && t.player == this) }
  get allLeaders() { return this.meeples.filter(m => m instanceof Leader && m.player == this) as Leader[] }
  get allPolice() { return this.meeples.filter(m => m instanceof Police && m.player == this) as Police[] }

  bribCounter: ValueCounter;
  _bribs = 0;
  get bribs() { return this._bribs; }
  set bribs(v: number) {
    this._bribs = v
    this.bribCounter?.updateValue(v)
  }

  coinCounter: ValueCounter;
  _coins = 0;
  get coins() { return this._coins; }
  set coins(v: number) {
    this._coins = v
    this.coinCounter?.updateValue(v)
  }

  actionCounter: ValueCounter;
  _actions = 0;
  get actions() { return this._actions; }
  set actions(v: number) {
    this._actions = v
    this.actionCounter?.updateValue(v)
  }

  captureCounter: ValueCounter;
  _captures = 0;    // captured Criminals; Tiles captured by Criminals moved by Player
  get captures() { return this._captures; }
  set captures(v: number) {
    this._captures = v;
    this.captureCounter.updateValue(this.captures)
  }

  econCounter: ValueCounter;
  get econs() {
    let econ = 0;
    this.gamePlay.hexMap.forEachHex(hex => {
      if ((hex.tile?.player == this) && !(hex.meep instanceof Criminal)) {
        econ += hex.tile.econ;
        // console.log(stime(this, `.econs`), hex.tile.Aname, hex.Aname, hex.tile.econ, econ);
      }
    })
    return econ;
  }
  expenseCounter: ValueCounter;
  get expenses() {
    let expense = 0
    this.gamePlay.hexMap.forEachHex(hex => {
      if (hex.meep?.player == this) {
        expense += hex.meep.econ     // meeples have negative econ
        // console.log(stime(this, `.expense`), hex.tile.Aname, hex.Aname, hex.tile.econ, expense);
      }
    })
    return expense
  }
  vpCounter: ValueCounter;
  get vps() {
    let vp = 0;
    this.gamePlay.hexMap.forEachHex(hex => {
      if ((hex.tile?.player == this) && !(hex.meep instanceof Criminal)) {
        vp += hex.tile.vp
        // console.log(stime(this, `.vps`), hex.tile.Aname, hex.Aname, hex.tile.vp, vp);
      }
    })
    return vp
  }

  otherPlayer(plyr: Player = this.gamePlay.curPlayer) { return Player.allPlayers[1 - plyr.index] }

  planner: IPlanner
  /** if true then invoke plannerMove */
  useRobo: boolean = false
  get colorn() { return TP.colorScheme[this.color] }

  constructor(index: number, color: PlayerColor, gameplay: GamePlay0) {
    this.index = index
    this.color = color
    this.gamePlay = gameplay as GamePlay;
    this.Aname = `Player${index}-${this.colorn}`
    Player.allPlayers[index] = this;
  }

  /** make Civics, Leaders & Police; also makeLeaderHex() */
  makePlayerBits() {
    this.civicTiles.length = 0;
    Leader.makeLeaders(this); // push new Civic onto this.civics, push new Leader onto this.meeples
  }

  /** choose TownRules & placement of TownStart */
  placeTown(town = this.civicTiles[0] as TownStart) {
    let ruleCard = TownRules.inst.selectOne();
    town.rule = ruleCard[Math.floor(Math.random() * 2)];
    // in principle this could change based on the town.rule...
    let hex = this.gamePlay.hexMap.centerHex as Hex;
    let path: HexDir[] = [['NW', 'W', 'W'] as HexDir[], ['SE', 'E', 'E'] as HexDir[]][this.index];
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
    this.coins += (this.econs + this.expenses)
    if (this.coins >= 0) this.actions += 1;
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
