import { json } from "@thegraid/common-lib";
import { KeyBinder, S, Undo, stime } from "@thegraid/easeljs-lib";
import { Container, Text } from "@thegraid/easeljs-module";
import { CostIncCounter } from "./counters";
import { GameSetup } from "./game-setup";
import { Hex, HexMap, IHex } from "./hex";
import { H } from "./hex-intfs";
import { Criminal, Leader, Meeple, Police } from "./meeple";
import type { Planner } from "./plan-proxy";
import { Player } from "./player";
import { CenterText } from "./shapes";
import { GameStats, TableStats } from "./stats";
import { LogWriter } from "./stream-writer";
import { AuctionShifter, DragContext, Table } from "./table";
import { PlayerColor, PlayerColorRecord, TP, criminalColor, otherColor, playerColorRecord, playerColors, } from "./table-params";
import { AuctionBonus, AuctionTile, BonusTile, Busi, Monument, Resi, Tile, TownRules } from "./tile";
import { NC } from "./choosers";
import { TileSource } from "./tile-source";

class HexEvent {}
class Move{
  Aname: string = "";
  ind: number = 0;
  board: any = {};
}

export class GP {
  static gamePlay: GamePlay0;
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
  shifter: AuctionShifter;
  get auctionHexes() { return this.shifter.hexes; }

  readonly reserveTiles: AuctionTile[][] = [[],[]];   // per player; 2-players, TP.reserveTiles
  readonly reserveHexes: Hex[][] = [[], []];          // target Hexes for reserving a Tile.
  get reserveHexesP() { return this.reserveHexes[this.curPlayerNdx]; }

  readonly marketSource: { Busi?: TileSource<Busi>, Resi?: TileSource<Resi>, Monument?: TileSource<Monument> } = {};  // per Busi/Resi type
  /** return the market with given Source.hex; or undefined if not from market. */
  fromMarket(fromHex: Hex) {
    return Object.values(this.marketSource).find(src => fromHex === src.hex);
  }

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
    GP.gamePlay = this;
    this.logWriter = this.logWriterLine0()
    this.hexMap[S.Aname] = `mainMap`
    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
    // Create and Inject all the Players: (picking a townStart?)
    Player.allPlayers.length = 0;
    playerColors.forEach((color, ndx) => new Player(ndx, color, this)); // make real Players...
    this.playerByColor = playerColorRecord(...Player.allPlayers);
    this.curPlayerNdx = 0;
    this.curPlayer = Player.allPlayers[this.curPlayerNdx];

    this.crimePlayer = new Player(2, criminalColor, this);
    Player.allPlayers.length = playerColors.length; // 2

    this.auctionTiles = new Array<AuctionTile>(TP.auctionSlots + TP.auctionMerge);
    this.reserveTiles = [[],[]];
    this.dice = new Dice();
    this.shifter = new AuctionShifter(this.auctionTiles);
    AuctionTile.fillBag(this.shifter.tileBag);              // put R/B/PS/L into draw bag.
    TownRules.inst.fillRulesBag();
  }

  recycleHex: Hex;          // set by Table.layoutTable()
  debtHex: Hex;             // set by Table.layoutTable()

  crimePlayer: Player;
  turnNumber: number = 0    // = history.lenth + 1 [by this.setNextPlayer]
  curPlayerNdx: number = 0  // curPlayer defined in GamePlay extends GamePlay0
  curPlayer: Player;
  preGame = true;

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
  rollDiceForBonus() {
    let dice = this.dice.roll();
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

  /** allow curPlayer to place a Criminal [on empty hex] for free. Override in GamePlay. */
  autoCrime() {
  }

  /** add Bonus to [first] AuctionTile */
  addBonus(type: AuctionBonus, tile?: AuctionTile) {
    if (!tile) tile = this.auctionTiles[this.curPlayerNdx * TP.auctionMerge]
    tile.addBonus(type);
    this.hexMap.update()
  }

  playerByColor: PlayerColorRecord<Player>
  otherPlayer(plyr: Player = this.curPlayer) { return this.playerByColor[otherColor(plyr.color)]}

  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }

  logText(line: string) {
    (this instanceof GamePlay) && this.table.logText(line);
  }
  permute(stack: any[]) {
    for (let i = 0, len = stack.length; i < len; i++) {
      let ndx: number = Math.floor(Math.random() * (len - i)) + i
      let tmp = stack[i];
      stack[i] = stack[ndx]
      stack[ndx] = tmp;
    }
    return stack;
  }

  addBonusTiles() {
    const tiles = (this.permute(['brib', 'star', 'econ', 'actn']) as AuctionBonus[]).map(type => new BonusTile(type));
    let hex = this.hexMap.centerHex as Hex;
    tiles.forEach(tile => {
      hex = hex.nextHex('SW');
      hex.tile = tile;
    });
  }
  shiftAuction(pNdx?: number, alwaysShift?: boolean) {
    this.shifter.shift(pNdx, alwaysShift);
  }

  /** when Player has completed their Action & maybe a hire. */
  endTurn() {
    this.shiftAuction();
    this.rollDiceForBonus();
  }

  assessThreats() {
    this.hexMap.forEachHex(hex => hex.assessThreats()); // try ensure threats are correctly marked
  }

  setNextPlayer(plyr: Player): void {
    this.preGame = false;
    this.turnNumber += 1 // this.history.length + 1
    this.curPlayer = plyr
    this.curPlayerNdx = plyr.index
    this.curPlayer.actions = 0;
    this.curPlayer.newTurn();
    this.assessThreats();
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

  playerBalanceString(player: Player, ivec = [0, 0, 0, 0]) {
    const [nb, fb, nr, fr] = this.playerBalance(player, ivec);
    return `${nb}+${fb}:${nr}+${fr}`;
  }
  playerBalance(player: Player, ivec = [0, 0, 0, 0]) {
    let [nBusi, fBusi, nResi, fResi] = ivec;
    this.hexMap.forEachHex(hex => {
      let tile = hex.tile;
      if (tile && tile.player == player) {
        nBusi += tile.nB;
        fBusi += tile.fB;
        nResi += tile.nR;
        fResi += tile.fR;
      }
    });
    return [nBusi, fBusi, nResi, fResi];
  }

  failTurn = undefined;  // Don't repeat "Need Busi/Resi" message this turn.
  failToBalance(tile: Tile) {
    const player = this.curPlayer;
    // tile on map during Test/Dev, OR: when demolishing...
    const ivec = tile.hex.isOnMap ? [0, 0, 0, 0] : [tile.nB, tile.nR, tile.fB, tile.fR];
    const [nBusi, fBusi, nResi, fResi] = this.playerBalance(player, ivec);
    const noBusi = nBusi > 1 * (nResi + fResi);
    const noResi = nResi > 2 * (nBusi + fBusi);
    const fail = (noBusi && (tile.nB > 0)) || (noResi && (tile.nR > 0));
    if (fail) {
      const failText =  noBusi ? 'Need Residential' : 'Need Business';
      const failTurn = `${this.turnNumber}:${failText}`;
      if (this.failTurn != failTurn) {
        this.failTurn = failTurn;
        console.log(stime(this, `.failToBalance: ${failText} ${tile.Aname}`), [nBusi, fBusi, nResi, fResi], tile);
        this.logText(failText);
      }
    }
    return fail;
  }

  // Costinc [0] = curPlayer.civics.filter(civ => civ.hex.isOnMap).length + 1
  // each succeeding is 1 less; to min of 1, except last slot is min of -1;
  // costInc[nCivOnMap][slotN] => [0, 0, 0, -1], [1, 0, 0, -1], [2, 1, 0, -1], [3, 2, 1, 0], [4, 3, 2, 1]
  costIncMatrix(maxCivics = TP.maxCivics, nSlots = TP.auctionSlots) {
    // nCivics = [0...maxCivics]
    return new Array(maxCivics + 1).fill(1).map((civElt, nCivics) => {
      // iSlot = [0...nSlots - 1]
      return new Array(nSlots).fill(1).map((costIncElt, iSlot) => {
        let minVal = (iSlot === (nSlots - 1)) ? -1 : 0;
        return Math.max(minVal, nCivics - iSlot) // assert nSlots <= maxCivics; final slot always = 0
      })
    })
  }
  readonly costInc = this.costIncMatrix()

  /** show player color and cost. */
  readonly costIncHexCounters = new Map<Hex,CostIncCounter>()
  costNdxFromHex(hex: Hex) {
    return this.costIncHexCounters.get(hex)?.ndx ?? -1; // Criminal/Police: ndx, no counter
  }
  showAuctionPrices() {

  }

  /** Influence Required; must supply tile.hex OR ndx */
  getInfR(tile: Tile | undefined, ndx = this.costNdxFromHex(tile.hex), plyr = this.curPlayer) {
    // assert: !tile.hex.isOnMap (esp fromHex: tile.hex == tile.homeHex)
    // Influence required:
    let infR = (tile?.cost ?? 0) + (tile?.bonusCount ?? 0) + (this.costInc[plyr.nCivics][ndx] ?? 0);
    // if (tile instanceof AuctionTile)
    let coinR = infR + ((tile?.econ ?? 0) < 0 ? -tile.econ : 0);  // Salary is required when recruited.
    if (Number.isNaN(coinR)) debugger;
    return [infR, coinR];
  }

  logFailure(type: string, reqd: number, avail: number, toHex: Hex) {
    const failText = `${type} required: ${reqd} > ${avail}`;
    console.log(stime(this, `.failToPayCost:`), failText, toHex.Aname);
    this.logText(failText);
  }

  failToPayCost(tile: Tile, toHex: Hex, commit = true) {
    const toReserve = this.reserveHexes[this.curPlayerNdx].includes(toHex);
    if (tile.hex === toHex) return false;  // no payment; recompute influence
    if (this.preGame) return false;
    // Can't fail if not going onto the Map:
    if (!(!tile.hex.isOnMap && (toHex.isOnMap || toReserve))) return false;
    // curPlayer && NOT FROM Map && TO [Map or Reserve]
    const [infR, coinR] = this.getInfR(tile); // assert coinR >= 0
    let bribR = 0;
    if (!toReserve && infR > 0) {
      // bribes can be used to reduce the influence required to deploy:
      const infT = toHex.getInfT(this.curPlayer.color)
      bribR = infR - infT;        // add'l influence needed, expect <= 0
      if (bribR > this.curPlayer.bribs) {
        if (commit) this.logFailure('Influence', infR, infT, toHex);
        return true;
      }
    }
    if (coinR > 0 && coinR > this.curPlayer.coins) {    // QQQ: can you buy a 0-cost tile with < 0 coins? [Yes!? so can buy a AT for free]
      if (commit) this.logFailure('Coins', coinR, this.curPlayer.coins, toHex);
      return true;
    }
    if (commit) {
      // fail == false; commit to purchase:
      if (bribR > 0) {
        this.curPlayer.bribs -= bribR;
      }
      this.curPlayer.coins -= coinR;
    }
    return false;
  }

  setIsLegalRecycle(tile: Tile, ctx: DragContext) {
    return this.recycleHex.isLegal = true;
  }

  /** Meeple.dropFunc() --> place Meeple (to Map, reserve; not Recycle) */
  placeMeep(meep: Meeple, toHex: Hex, autoCrime = false) {
    if (!autoCrime && this.failToPayCost(meep, toHex)) {
      meep.moveTo(meep.hex);  // abort; return to fromHex
      return;
    }
    this.placeEither(meep, toHex);
  }

  // from tile.dropFunc()
  /** Tile.dropFunc() --> place Tile (to Map, reserve, ~>auction; not Recycle) */
  placeTile(tile: Tile, toHex: Hex) {
    if (toHex.isOnMap && this.failToBalance(tile) || this.failToPayCost(tile, toHex)) {
      // unlikely, now that we check in dragStart...
      tile.moveTo(tile.hex); // abort; return to fromHex
      return;
    }
    this.placeEither(tile, toHex);
  }

  placeEither(tile: Tile, toHex: Hex) {
    // update influence on map:
    const fromHex = tile.hex, infColor = tile.infColor || this.curPlayer.color;
    if (fromHex.isOnMap && (tile.inf !== 0)) {
      tile.hex = undefined;      // hex.tile OR hex.meep = undefined; remove tile's infP
      this.decrInfluence(fromHex, tile.inf, infColor);
      tile.hex = fromHex;        // briefly, until moveTo(toHex)
    }
    if (toHex == this.recycleHex) {
      this.recycleTile(tile);    // Score capture; log; return to homeHex
      this.logText(`Recycle ${tile.Aname} from ${fromHex.Aname}`)
    } else {
      tile.moveTo(toHex);  // placeTile(tile, hex) --> moveTo(hex)
      if (toHex !== fromHex) this.logText(`Place ${tile.Aname}@${toHex.Aname}`)
      if (toHex.isOnMap) {
        if (!tile.player) tile.player = this.curPlayer; // for Market tiles; also for [auto] Criminals
        this.incrInfluence(tile.hex, infColor);
      }
    }
    Player.updateCounters();
  }
  logDisposition(tile: Tile, verb: string) {
    const cp = this.curPlayer
    const loc = tile.hex?.isOnMap ? 'onMap' : 'offMap';
    const info = { name: tile.Aname, fromHex: tile.hex?.Aname, cp: cp.colorn, caps: cp.captures, tile }
    console.log(stime(this, `.recycleTile[${loc}]: ${verb}`), info);
    this.logText(`${cp.Aname} ${verb} ${tile.Aname}@${tile.hex.Aname}`);
  }

  recycleTile(tile: Tile) {
    if (!tile) return;
    let verb = undefined;
    if (tile.hex?.isOnMap) {
      if (tile.player !== this.curPlayer) {
        this.curPlayer.captures++;
        verb = 'captured';
      } else if (tile instanceof Meeple) {
        this.curPlayer.coins -= tile.econ;  // dismiss Meeple, claw-back salary.
      }
    }
    verb = (tile instanceof Meeple) ? 'dismissed' : 'removed';
    this.logDisposition(tile, verb);
    tile.sendHome();  // recycleTile
  }

  /** from auctionTiles to reservedTiles */
  reserveAction(tile: AuctionTile, rIndex: number) {
    let pIndex = this.curPlayerNdx;
    this.recycleTile(this.reserveTiles[pIndex][rIndex]);   // if another Tile in reserve slot, recycle it.
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
    return this.placeMeep0(Criminal.source[this.curPlayerNdx].hexMeep, hex);
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
    // Players have: civics & meeples & TownSpec
    // setTable(table)
    this.table = table
    this.gStats = new TableStats(this, table) // upgrade to TableStats
    if (this.table.stage.canvas) this.bindKeys()
  }

  autoCrimeTarget(meep: Criminal) {
    // Gang up on a weak Tile:
    let hexes = this.hexMap.filterEachHex(hex => !hex.occupied && meep.isLegalTarget(hex));
    //  && hex.getInfT(this.curPlayer.color) < 1 ?? to avoid playing into jeopardy
    let pColor = this.curPlayer.otherPlayer.color
    hexes.sort((a, b) => a.getInfT(pColor) - b.getInfT(pColor))
    let infs = hexes.map(hex => hex.getInfT(pColor));
    let minInf = hexes[0]?.getInfT(pColor) ?? 0;
    let hexes1 = hexes.filter(hex => hex.getInfT(pColor) == minInf);
    if (hexes1.length > 0) hexes = hexes1;
    // TODO: select placement with max attacks
    // place meep, propagateIncr, check getInfT('c') > getInfT(pColor), remove(meep)
    let hexes2 = hexes.filter(hex => hex.findLinkHex(hex => hex.meep instanceof Criminal));
    if (hexes2.length > 0) hexes = hexes2;
    return hexes[Math.floor(Math.random() * hexes.length)];
  }

  // mercenaries rally to your cause against the enemy (no cost, follow your orders.)
  // TODO: allow 'curPlayer' to place one of their [autoCrime] Criminals
  override autoCrime(force = false) {
    // no autoCrime until all Players have 3 VPs.
    if (!force && this.allPlayers.find(plyr => plyr.econs < TP.econForCrime)) return; // poverty
    const meep = Criminal.source[this.curPlayerNdx].hexMeep;   // TODO: use per-player Criminal source
    if (!meep) return;               // no Criminals available
    meep.autoCrime = true;           // no econ charge to curPlayer
    const targetHex = this.autoCrimeTarget(meep);
    this.placeMeep(meep, targetHex, true); // meep.player == undefined --> no failToPayCost()
    // meep.player = this.crimePlayer;  // autoCrime: not owned by curPlayer
    this.logText(`AutoCrime: ${meep.Aname}@${targetHex.Aname}`)
    this.processAttacks(meep.infColor);
  }

  /** attacks *against* color */
  processAttacks(attacker: PlayerColor) {
    // TODO: until next 'click': show flames on hex & show Tile in 'purgatory'.
    // loop to check again after capturing (cascade)
    while (this.hexMap.findHex(hex => {
      if (hex.tile?.isThreat[attacker]) {
        this.recycleTile(hex.tile);  // remove tile, allocate points; no change to infP!
        return true;
      }
      if (hex.meep?.isThreat[attacker]) {
        this.recycleTile(hex.meep);  // remove tile, allocate points; no change to infP!
        return true;
      }
      return false;
    }));
  }

  // do we may need to unMove meeples in the proper order? lest we get 2 meeps on a hex? (apparently not)
  // move police from station, place new police in station; unMove will place *both* in the station.
  // perhaps one of them should recycle back to the academy...
  // perhpas the startHex should be the academy? and use recycle/sendHome to reclaim the salary?
  unMove() {
    this.curPlayer.meeples.forEach(meep => {
      if (meep.hex?.isOnMap && meep.startHex && meep.startHex !== meep.hex ) {
        this.placeMeep(meep, meep.startHex); // unMove update influence; Note: no unMove for Hire! (sendHome)
        meep.faceUp();
      }
    })
    this.assessThreats();
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
    KeyBinder.keyBinder.setKey('C-a', { thisArg: this, func: () => { this.shiftAuction(undefined, true)} })  // C-a new Tile
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
    KeyBinder.keyBinder.setKey('M-C', { thisArg: this, func: this.autoCrime, argVal: true })// S-M-C (force)
    KeyBinder.keyBinder.setKey('S-?', { thisArg: this, func: () => console.log(stime(this, `.inTheBag:`), this.shifter.tileBag.inTheBag()) })

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
    if (toHex !== tile.hex) console.log(stime(this, `.placeEither:`), info);
    super.placeEither(tile, toHex);
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

  /** for KeyBinding test */
  override shiftAuction(pNdx?: number, alwaysShift?: boolean) {
    super.shiftAuction(pNdx, alwaysShift);
    this.paintForPlayer();
    this.showAuctionPrices();
    this.hexMap.update();
  }

  override endTurn(): void {
    this.preGame || this.curPlayer.totalVpCounter.incValue(this.curPlayer.vps);
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = false;
    super.endTurn();   // shift(), roll()
  }

  override setNextPlayer(plyr = this.otherPlayer()) {
    super.setNextPlayer(plyr);
    this.paintForPlayer();
    this.showAuctionPrices();
    Player.updateCounters(plyr); // beginning of round...
    this.logText(this.shifter.tileNames(this.curPlayerNdx));
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = true;
    this.table.showNextPlayer() // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.hexMap.update()
    this.startTurn()
    this.makeMove()
  }

  /** After setNextPlayer() */
  startTurn() {
  }

  paintForPlayer() {
    this.costIncHexCounters.forEach(cic => {
      let plyr = (cic.repaint instanceof Player) ? cic.repaint : this.curPlayer;
      if (cic.repaint !== false) {
        cic.hex.tile?.paint(plyr.color); //
        cic.hex.meep?.paint(plyr.color); // flipping criminals!
      }
    })
  }

  override showAuctionPrices() {
    this.costIncHexCounters.forEach(cic => {
      let plyr = (cic.repaint instanceof Player) ? cic.repaint : this.curPlayer;
      let [infR] = this.getInfR(cic.hex.tile, cic.ndx, plyr);
      cic.setValue(infR);
    });
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
    this.text = new CenterText(`0:0`, this.textSize);
  }
  roll(n = 2, d = 6) {
    let rv = new Array(n).fill(1).map(v => 1 + Math.floor(Math.random() * d));
    this.text.text = rv.reduce((pv, cv, ci) => `${pv}${ci > 0 ? ':' : ''}${cv}`, '');
    this.text.textAlign = 'center';
    return rv
  }
  setContainer(parent: Container, x = 0, y = 0) {
    this.text.x = x;
    this.text.y = y;
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
