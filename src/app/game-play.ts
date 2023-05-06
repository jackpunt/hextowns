import { F, json } from "@thegraid/common-lib";
import { KeyBinder, S, Undo, stime } from "@thegraid/easeljs-lib";
import { GameSetup } from "./game-setup";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { Criminal, Leader, Meeple, Police, TileSource } from "./meeple";
import { Planner } from "./plan-proxy";
import { Player } from "./player";
import { GameStats, TableStats } from "./stats";
import { LogWriter } from "./stream-writer";
import { NumCounter, Table } from "./table";
import { PlayerColor, TP, criminalColor, otherColor, playerColorRecordF, playerColors, playerColorsC } from "./table-params";
import { AuctionBonus, AuctionTile, Bonus, Busi, Resi, Tile, TownRules, TownStart } from "./tile";
import { NC } from "./choosers";
import { H } from "./hex-intfs";
import { Container, DisplayObject, Text } from "@thegraid/easeljs-module";

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
  readonly reserveTiles: AuctionTile[][] = [[],[]];      // per player; 2-players, 2-Tiles
  readonly reserveHexes: Hex[][] = [[], []];   // target Hexes for reserving a Tile.
  readonly marketSource: { Busi?: TileSource<Busi>, Resi?: TileSource<Resi>} = {};  // per Busi/Resi type
  getMarketSource(type: 'Busi' | 'Resi' ) { return this.marketSource[type] as TileSource<AuctionTile>; }
  recycleHex: Hex2;

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
  crimePlayer: Player;

  constructor() {
    GamePlay.gamePlay = this;
    this.logWriter = this.logWriterLine0()
    this.hexMap[S.Aname] = `mainMap`
    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
    // Create and Inject all the Players: (picking a townStart?)
    Player.allPlayers.length = 0;
    playerColors.forEach((color, ndx) => new Player(ndx, color, this)); // make real Players...

    this.crimePlayer = new Player(2, 'c', this);
    Player.allPlayers.length = 2;

    this.auctionTiles = new Array<AuctionTile>(TP.auctionSlots);   // expect to have 1 Tile child (or none)
    this.reserveTiles = [[],[]];
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
    this.curPlayer.actions = 0;
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

  /** after add Tile to hex: propagate its influence in each direction; maybe capture. */
  incrInfluence(hex: Hex, infColor: PlayerColor) {
    //let infP = hex.getInfP(color);
    H.infDirs.forEach(dn => {
      let inf = hex.getInf(infColor, dn);
      hex.propagateIncr(infColor, dn, inf); // use test to identify captured Criminals?
    })
  }

  /** after remove Tile [w/tileInf] from hex: propagate influence in each direction. */
  decrInfluence(hex: Hex, tileInf: number, infColor: PlayerColor) {
    H.infDirs.forEach(dn => {
      let inf = hex.getInf(infColor, dn)
      //let inc = hex.links[H.dirRev[dn]]?.getInf(color, dn) || 0
      hex.propagateDecr(infColor, dn, inf, tileInf)       // because no-stone, hex gets (inf - 1)
    })
  }

  whichAttacks(hex: Hex) {
    const tInf = playerColorRecordF(tc => hex.getInfT(tc));
    const occ = hex.occupied; // if there are any Tiles, are they 'under' attack?
    return playerColorsC.filter(pc => !!occ?.find(t => t && tInf[t.infColor] < tInf[pc]))
  }

  isAttack(hex: Hex) {
    const tInf = playerColorRecordF(tc => hex.getInfT(tc));
    const occ = hex.occupied; // if there are any Tiles, are they 'under' attack?
    return !!occ && !!playerColorsC.find(pc => !!occ?.find(t => t && tInf[t.infColor] < tInf[pc]))
  }

  allAttacks() {
    return this.hexMap.filterEachHex(hex => this.isAttack(hex))
  }

  playerBalanceString(player: Player, ivec = [0, 0, 0, 0]) {
    return this.playerBalance(player, ivec).toString(); // so we can use alternate format if desired
  }
  playerBalance(player: Player, ivec = [0, 0, 0, 0]) {
    let [nBusi, nResi, fBusi, fResi] = ivec;
    this.hexMap.forEachHex(hex => {
      let tile = hex.tile;
      if (tile && tile.player == player) {
        nBusi += tile.nB;
        nResi += tile.nR;
        fBusi += tile.fB;
        fResi += tile.fR;
      }
    });
    return [nBusi, nResi, fBusi, fResi];
  }

  failToBalance(tile: Tile, player: Player) {
    // tile on map during Test/Dev, OR: when demolishing...
    const ivec = tile.hex.isOnMap ? [0, 0, 0, 0] : [tile.nB, tile.nR, tile.fB, tile.fR];
    const [nBusi, nResi, fBusi, fResi] = this.playerBalance(player, ivec);
    const hiBusi = nBusi > (nResi + fResi);
    const loBusi = nResi > 2 * (nBusi + fBusi);
    const fail = hiBusi || loBusi;
    if (fail) {
      console.log(stime(this, `.balanceFail: ${hiBusi ? 'hiBusi' : 'loBusi'} ${tile.Aname}`), [nBusi, nResi, fBusi, fResi], tile);
    }
    return fail;
  }

  // Costinc [0] = curPlayer.civics.filter(civ => civ.hex.isOnMap).length + 1
  // each succeeding is 1 less; to min of 1, except last slot is min of 0;
  // initially: 2 1 1 0;
  // Array<nCivOnMap,slotN> => [1, 1, 1, 0], [2, 1, 1, 0], [3, 2, 1, 0], [4, 3, 2, 1], [5, 4, 3, 2]
  // Array<nCivOnMap,slotN> => [0, 0, 0, -1], [1, 0, 0, -1], [2, 1, 0, -1], [3, 2, 1, 0], [4, 3, 2, 1]
  costIncMatrix(maxCivics = TP.maxCivics, nSlots = TP.auctionSlots) {
    // [0...maxCivs]
    return new Array(maxCivics + 1).fill(1).map((civElt, nCivics) => {
      // [0...nSlots-1]
      return new Array(nSlots + 1).fill(1).map((costIncElt, iSlot) => {
        let minVal = (iSlot == (nSlots - 1)) ? -1 : 0;
        return Math.max(minVal, (nCivics) - iSlot) // assert nSlots <= maxCivics; final slot always = 0
      })
    })
  }
  readonly costInc = this.costIncMatrix()

  /** show player color and cost. */
  readonly costIncHexCounters: [hex: Hex2, ndx :number, infCounter?: NumCounter, repaint?: boolean][] = [];
  costNdxFromHex(hex: Hex) {
    const [, ndx] = this.costIncHexCounters.find(([h]) => h == hex); // Criminal/Police: ndx, no counter
    return ndx;
  }

  /** must supply tile.hex OR ndx */
  getInfR(tile: Tile | undefined, ndx = this.costNdxFromHex(tile.hex)) {
    let incr = this.costInc[this.curPlayer.nCivics][ndx]
    // assert: !tile.hex.isOnMap (esp: tile.hex == tile.homeHex)
    let infR = (tile?.cost ?? 0) + incr; // Influence required.
    if (tile instanceof AuctionTile) infR += tile.bonusCount;
    let coinR = infR + ((tile?.econ ?? 0) < 0 ? -tile.econ : 0);  // Salary also required when recruited.
    return [infR, coinR];
  }

  failToPayCost(tile: Tile, toHex: Hex) {
    const toReserve = this.reserveHexes[this.curPlayerNdx].includes(toHex);
    if (tile.hex == toHex) return false;  // no payment; recompute influence
    if (!(this.curPlayer && !tile.hex.isOnMap && (toHex.isOnMap || toReserve))) return false;
    // curPlayer && NOT FROM Map && TO [Map or Reserve]
    let bribR = 0, [infR, coinR] = this.getInfR(tile);
    if (!toReserve) {
      // bribes can be used to reduce the influence required to deploy:
      const infT = toHex.getInfT(this.curPlayer.color)
      bribR = infR - infT;        // add'l influence needed, expect <= 0
      if (bribR > this.curPlayer.bribs) {
        console.log(stime(this, `.failToPayCost: infFail ${infR} >`), infT, toHex.Aname);
        return true;
      }
    }
    if (coinR > this.curPlayer.coins) {
      console.log(stime(this, `.failToPayCost: coinsFail ${coinR} [${infR}] >`), this.curPlayer.coins, toHex.Aname)
      return true;
    }
    // fail == false; commit to purchase:
    if (bribR > 0) {
      this.curPlayer.bribs -= bribR;
    }
    this.curPlayer.coins -= coinR;
    return false;
  }

  /** Meeple.dropFunc() --> place Meeple (to Map, reserve; not Recycle) */
  placeMeep(meep: Meeple, toHex: Hex, autoCrime = (meep.player == undefined)) {
    if (!autoCrime && this.failToPayCost(meep, toHex)) {
      meep.moveTo(meep.hex);  // abort; return to fromHex
      return;
    }
    this.placeEither(meep, toHex);
  }

  // from tile.dropFunc()
  /** Tile.dropFunc() --> place Tile (to Map, reserve, ~>auction; not Recycle) */
  placeTile(tile: Tile, toHex: Hex) {
    if (toHex.isOnMap && this.failToBalance(tile, this.curPlayer) || this.failToPayCost(tile, toHex)) {
      tile.moveTo(tile.hex); // abort; return to fromHex
      return;
    }
    this.placeEither(tile, toHex);
  }

  placeEither(tile: Tile, toHex: Hex) {
    // update influence on map:
    const fromHex = tile.hex, infColor = tile.infColor || this.curPlayer.color;
    if (fromHex.isOnMap) {
      tile.hex = undefined;      // hex.tile OR hex.meep = undefined; remove tile's infP
      this.decrInfluence(fromHex, tile.inf, infColor);
      tile.hex = fromHex;        // briefly, until moveTo(toHex)
    }
    if (toHex == this.recycleHex) {
      tile.recycle();      // return to homeHex, Dev/Test: capture or dismiss
    } else {
      tile.moveTo(toHex);  // placeTile(tile, hex) --> moveTo(hex)
      if (toHex.isOnMap) {
        if (!tile.player) tile.player = this.curPlayer; // for Market tiles; not for auto-Criminals
        this.incrInfluence(tile.hex, infColor);
      }
    }
    Player.updateCounters();
  }

  /** from auctionTiles to reservedTiles */
  reserveAction(tile: AuctionTile, rIndex: number) {
    let pIndex = this.curPlayerNdx;
    this.reserveTiles[pIndex][rIndex]?.recycle();   // if another Tile in reserve slot, recycle it.
    this.reserveTiles[pIndex][rIndex] = tile;
    tile.player = this.curPlayer;
    return true;
  }

  /** from AuctionTiles or ReserveTiles to hexMap: */
  buildAction(tile: AuctionTile, hex: Hex) {
    if (!tile.isLegalTarget(hex)) return false
    let pIndex = this.curPlayerNdx;
    let player = Player.allPlayers[pIndex];
    let rIndex = this.reserveTiles[pIndex].indexOf(tile);
    if (rIndex > 0) this.reserveTiles[pIndex][rIndex] = undefined;
    let aIndex = this.auctionTiles.indexOf(tile);
    if (aIndex > 0) this.auctionTiles[aIndex] = undefined;
    this.placeTile(tile, hex);
    return true;
  }

  private placeMeep0(meep: Meeple, hex: Hex) {
    if (!meep) return false;
    if (!meep.isLegalTarget(hex)) return false;
    this.placeMeep(meep, hex);  // ACTION by curPlayer: check failToPay, set meep.owner
    return true;
  }

  // TODO: click on leader to recruit
  recruitAction(leader: Leader) {
    if (leader.hex?.isOnMap) return false;
    if (!leader.civicTile.hex?.isOnMap) return false;
    this.placeMeep0(leader, leader.civicTile.hex)
    return true;
  }

  placePolice(hex: Hex) {
    return this.placeMeep0(Police.source[this.curPlayerNdx].hex.meep, hex);
  }

  placeCriminal(hex: Hex) {
    return this.placeMeep0(Criminal.source.hex.meep, hex);
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
    this.dice = new Dice();
  }
  dice: Dice;

  /**
   * While curPlayer = *last* player.
   * [so autoCrime() -> meep.player = curPlayer]
   *
   * - Shift Auction
   * - Roll 2xD6, enable effects.
   * - - 1+1: add Star
   * - - 2+2: add Action
   * - - 3+3: add Coin
   * - - 6+4-6: add Criminal
   */
  beforeNxtPlayer() {
    let dice = this.dice.roll();
    let tile = this.table.auctionCont.shift();
    dice.sort(); // ascending
    console.log(stime(this, `.startTurn: Dice =`), dice)
    if (dice[0] == 1 && dice[1] == 1) { this.addBonus('actn'); }
    if (dice[0] == 2 && dice[1] == 2) { this.addBonus('star'); }
    if (dice[0] == 3 && dice[1] == 3) { this.addBonus('brib'); }
    if (dice[0] == 4 && dice[1] == 4) { this.addBonus('econ'); }
    if (dice[0] != dice[1] && !dice.find(v => v < 4)) {
      this.autoCrime(); // 4-[5,6], 5-[4,6], 6-[4,5] 6/36 => 16.7%
    }
    this.hexMap.update()
  }

  startTurn() {
  }

  autoCrime(dice = this.dice) {
    // no autoCrime until all Players have 3 VPs.
    if (this.allPlayers.find(plyr => plyr.econs < 3)) return; // poverty
    let meep = this.table.crimeHex.meep as Criminal;
    if (!meep) return;               // no Criminals available
    let targetHex = this.autoCrimeTarget(meep);
    this.placeMeep(meep, targetHex); // meep.player == undefined --> no failToPayCost()
    meep.player = this.crimePlayer;  // autoCrime: not owned by curPlayer
  }

  autoCrimeTarget(meep: Criminal) {
    // Gang up on a weak Tile:
    let hexes = this.hexMap.filterEachHex(hex => !hex.occupied && meep.isLegalTarget(hex) && hex.getInfT(this.curPlayer.color) < 1)
    let pColor = this.curPlayer.otherPlayer().color
    hexes.sort((a, b) => a.getInfT(pColor) - b.getInfT(pColor))
    let infs = hexes.map(hex => hex.getInfT(pColor));
    let minInf = hexes[0] ? hexes[0].getInfT(pColor) : 0;
    let hexes1 = hexes.filter(hex => hex.getInfT(pColor) == minInf);
    if (hexes1.length > 0) hexes = hexes1;
    let hexes2 = hexes.filter(hex => hex.findLinkHex(hex => hex.meep instanceof Criminal));
    if (hexes2.length > 0) hexes = hexes2;
    return hexes[Math.floor(Math.random() * hexes.length)];
  }

  markedAttacks: Hex[] = [];
  showAttackMarks() {
    this.markedAttacks = this.allAttacks();
    this.markedAttacks.forEach((hex: Hex2) => {
      const attacks = this.whichAttacks(hex);
      attacks?.forEach(pc => hex.markCapture(pc));
    }
      );
  }
  clearAttackMarks() {
    this.markedAttacks.forEach((hex: Hex2) => hex.unmarkCapture());
  }

  unMove() {
    this.curPlayer.meeples.forEach(meep => {
      if (meep.hex?.isOnMap && meep.startHex) {
        this.placeMeep(meep, meep.startHex); // unMove update influence; Note: no unMove for Hire! (sendHome)
        meep.faceUp()
      }
    })
  }

  addBonus(type?: AuctionBonus, tile = this.auctionTiles[0]) {
    tile.addBonus(type);
    if (this.auctionTiles.includes(tile)) {
      tile.paint() // Why paint now? to updateCache with bonus child
      console.log(stime(this, `.addBonus`), {tile, type})
    }
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
    KeyBinder.keyBinder.setKey('M-c', { thisArg: this, func: () => this.addBonus('star') })
    KeyBinder.keyBinder.setKey('M-b', { thisArg: this, func: () => this.addBonus('brib') })
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
    KeyBinder.keyBinder.setKey('u', { thisArg: this, func: this.unMove })
    KeyBinder.keyBinder.setKey('i', { thisArg: this, func: () => {table.showInf = !table.showInf; this.hexMap.update() } })
    KeyBinder.keyBinder.setKey('M-C', { thisArg: this, func: this.autoCrime })// S-M-C
    KeyBinder.keyBinder.setKey('S-?', { thisArg: this, func: () => console.log(stime(this, `.inTheBag:`), AuctionTile.inTheBag()) })

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

  override placeEither(tile: Tile, toHex: Hex): void {
    const info = { tile, fromHex: tile.hex, toHex, hexInf: toHex.infStr };
    console.log(stime(this, `.placeEither:`), info);

    this.clearAttackMarks();
    super.placeEither(tile, toHex);
    this.showAttackMarks();
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
    this.beforeNxtPlayer();
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = false;
    super.setNextPlayer(plyr)
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = true;
    this.showPlayerPrices(plyr)
    this.table.showNextPlayer() // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.hexMap.update()
    this.startTurn()
    this.makeMove()
  }

  showPlayerPrices(plyr: Player = this.curPlayer) {
    this.costIncHexCounters.forEach(([hex, ndx, incCounter, repaint]) => {
      if (repaint) {
        hex.tile?.paint(plyr.color);
        hex.meep?.paint(plyr.color);
      }
      let [infR] = this.getInfR(hex.tile, ndx);
      incCounter?.setValue(infR);
    })
  }

  // when  tile lands on AuctionHex, show new/currect price?
  showNewPrice(hex: Hex2) {
    let [, ndx, incCounter] = this.costIncHexCounters.find(([h]) => h == hex)
    let [infR] = this.getInfR(hex.tile, ndx);
    incCounter?.setValue(infR);
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
  text: Text;
  textSize: number = .5 * TP.hexRad;
  constructor() {
    this.text = new Text(`0:0`, F.fontSpec(this.textSize));

  }
  roll(n = 2, d = 6) {
    let rv = new Array(n).fill(1).map(v => 1 + Math.floor(Math.random() * d));
    this.text.text = rv.reduce((pv, cv, ci) => `${pv}${ci > 0 ? ':' : ''}${cv}`, '');
    this.text.textAlign = 'center';
    return rv
  }
  setContainer(parent: Container, x = 0, y = 0) {
    this.text.x = x;
    this.text.y = y - this.textSize/2;
    parent.addChild(this.text);
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
