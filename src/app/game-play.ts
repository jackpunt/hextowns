import { Constructor, json } from "@thegraid/common-lib";
import { KeyBinder, S, Undo, stime } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import { EzPromise } from "@thegraid/ezpromise";
import { AuctionTile, Bank, Busi, Lake, PS, Resi, } from "./auction-tile";
import { TileBag } from "./tile-bag";
import { CostIncCounter } from "./counters";
import { AutoCrime, EvalTile, EventTile, PolicyTile } from "./event-tile";
import { GameSetup } from "./game-setup";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { H } from "./hex-intfs";
import { Criminal, Leader, Meeple } from "./meeple";
import type { Planner } from "./plan-proxy";
import { Player } from "./player";
import { CenterText } from "./shapes";
import { GameStats, TableStats } from "./stats";
import { LogWriter } from "./stream-writer";
import { AuctionShifter, Table } from "./table";
import { PlayerColor, PlayerColorRecord, TP, criminalColor, otherColor, playerColorRecord, playerColors, } from "./table-params";
import { AuctionBonus, BagTile, BonusTile, MapTile, Monument, Tile, TownRules } from "./tile";
import { TileSource } from "./tile-source";
//import { NC } from "./choosers";

class HexEvent {}
class Move{
  Aname: string = "";
  ind: number = 0;
  board: any = {};
}

export class GP {
  static gamePlay: GamePlay;
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
  readonly auctionTiles: BagTile[] = []     // per game
  shifter: AuctionShifter;
  get auctionHexes() { return this.shifter.hexes; }

  readonly reserveTiles: AuctionTile[][] = [[],[]];   // per player; 2-players, TP.reserveTiles
  readonly reserveHexes: Hex[][] = [[], []];          // target Hexes for reserving a Tile.
  get playerReserveHexes() { return this.reserveHexes[this.curPlayerNdx]; }
  isReserveHex(hex: Hex) { return this.playerReserveHexes.includes(hex) };

  readonly marketTypes = [Busi, Resi, Monument];
  readonly marketSource: { Busi?: TileSource<Busi>, Resi?: TileSource<Resi>, Monument?: TileSource<Monument> }[] = [{},{}];
  /** return the market with given Source.hex; or undefined if not from market. */
  fromMarket(fromHex: Hex) {
    let rv: TileSource<Tile>;
    this.marketSource.find(ms => {
      return rv = Object.values(ms).find(source => fromHex === source.hex);
    })
    return rv;
  }

  removeFromAuction(tile: BagTile) {
    // remove from auctionTiles:
    const auctionNdx = this.auctionTiles.indexOf(tile); // if from auctionTiles
    if (auctionNdx >= 0) {
      this.auctionTiles[auctionNdx] = undefined;
      tile.player = this.curPlayer;
    }
  }

  removeFromReserve(tile: AuctionTile){
    const reserveTiles = this.reserveTiles[this.curPlayerNdx];
    const rIndex = reserveTiles.indexOf(tile);
    if (rIndex >= 0) {
      reserveTiles[rIndex] = undefined;
    }
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
    this.logWriter = this.logWriterLine0()
    this.hexMap[S.Aname] = `mainMap`;
    this.hexMap.makeAllDistricts(); // may be re-created by Table, after addToMapCont()

    this.gStats = new GameStats(this.hexMap) // AFTER allPlayers are defined so can set pStats
    // Create and Inject all the Players: (picking a townStart?)
    Player.allPlayers.length = 0;
    playerColors.forEach((color, ndx) => new Player(ndx, color, this)); // make real Players...
    this.playerByColor = playerColorRecord(...Player.allPlayers);
    this.curPlayerNdx = 0;
    this.curPlayer = Player.allPlayers[this.curPlayerNdx];

    const len = playerColors.length; // actual players
    this.crimePlayer = new Player(len, criminalColor, this);  //
    Player.allPlayers.length = len; // truncate allPlayers: exclude crimePlayer

    this.auctionTiles = new Array<AuctionTile>(TP.auctionSlots + TP.auctionMerge);
    this.reserveTiles = [[],[]];
    this.dice = new Dice();
    this.shifter = new AuctionShifter(this.auctionTiles);
    AuctionTile.fillBag(this.shifter.tileBag as TileBag<AuctionTile>); // put R/B/PS/L into draw bag.
    AutoCrime.makeAllTiles(TP.autoCrimePerBag * this.shifter.tileBag.length);
    EventTile.makeAllTiles();
    PolicyTile.makeAllTiles();
    BonusTile.makeAllTiles();
    BonusTile.addToMap(this.hexMap);
    TownRules.inst.fillRulesBag();
  }

  recycleHex: Hex;          // set by Table.layoutTable()
  debtHex: Hex;             // set by Table.layoutTable()
  eventHex: Hex2;

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
    console.log(stime(this, `.endTurn2: Dice =`), dice)
    if (dice[0] == 1 && dice[1] == 1) { this.addBonus('actn'); }
    if (dice[0] == 2 && dice[1] == 2) { this.addBonus('star'); }
    if (dice[0] == 3 && dice[1] == 3) { this.addBonus('infl'); }
    if (dice[0] == 4 && dice[1] == 4) { this.addBonus('econ'); }
    // if (dice[0] != dice[1] && !dice.find(v => v < 4)) { this.autoCrime(); }// 4-[5,6], 5-[4,6], 6-[4,5] 6/36 => 16.7%
    this.hexMap.update()
  }

  /** allow curPlayer to place a Criminal [on empty hex] for free. Override in GamePlay. */
  autoCrime() {
  }

  /** add Bonus of type to given tile (or [first] AuctionTile)
   * @return false if tile is not eligble for bonus
   */
  addBonus(type: AuctionBonus, tile?: Tile) {
    if (!tile) tile = this.shifter.tile0(this.curPlayerNdx) as AuctionTile;
    if ((tile instanceof AuctionTile) && tile.bonusCount === 0) {
      tile.addBonus(type);
      const cic = this.costIncHexCounters.get(tile.hex); // auctionHexes
      if (cic) this.updateCostCounter(cic);
      this.hexMap.update();
      return true;
    }
    return false;
  }

  playerByColor: PlayerColorRecord<Player>
  otherPlayer(plyr: Player = this.curPlayer) { return this.playerByColor[otherColor(plyr.color)]}

  forEachPlayer(f: (p:Player, index?: number, players?: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }

  logText(line: string, from = '') {
    if (this instanceof GamePlay) this.table.logText(line, from);
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

  shiftAuction(pNdx = this.curPlayerNdx, alwaysShift?: boolean, forceDraw = this.forceDrawType) {
    this.shifter.shift(pNdx, alwaysShift, forceDraw);  // the only external access to shifter.shift
  }
  private forceDrawNdx = -1;   // tweak in debugger to force draw Tile of specific type:
  get forceDrawType(): Constructor<BagTile> { return [EventTile, PolicyTile, Resi, Busi, PS, Lake, Bank][this.forceDrawNdx]; }

  eventInProcess: EzPromise<void>;
  async awaitEvent(init: () => void) {
    this.eventInProcess = new EzPromise<void>();
    init(); // tile0.moveTo(eventHex);
    return this.eventInProcess;
  }
  finishEvent() {
    this.eventInProcess.fulfill();
  }

  async processEventTile(tile0: EvalTile) {
    // manually D&D event (to Player.Policies or RecycleHex)
    // EventTile.dropFunc will: gamePlay.finishEvent();
    await this.awaitEvent(() => {
      // tile0.setPlayerAndPaint(this.curPlayer);
      tile0.moveTo(this.eventHex);
      this.hexMap.update();
    });
  }

  async shiftAndProcess(func?: () => void, alwaysShift = false, allowEvent = true, drawType?: Constructor<BagTile>) {
    if (this.eventHex.tile instanceof EvalTile) {
      console.log(stime(this, `.shiftAndProcess: must dismiss event: ${this.eventHex.tile.nameString()}`))
      return;
    }
    this.shiftAuction(undefined, alwaysShift, drawType);
    let tile0 = this.shifter.tile0(this.curPlayerNdx);

    if (!allowEvent) {
      const xEvents: EventTile[] = [];
      while (tile0 instanceof EventTile) {
        console.log(stime(this, `.shiftAndProcess: setAside Event ${tile0.nameString()}`));
        tile0.moveTo(undefined); // tile0.hex = undefined;
        xEvents.push(tile0);
        this.shiftAuction(undefined, alwaysShift);
        tile0 = this.shifter.tile0(this.curPlayerNdx);
      }
      xEvents.forEach(ev => ev.sendToBag());  // note: DO NOT sendHome()/finishEvent()
    }
    // replace BonusTile with AuctionTile + BonusType
    if (tile0 instanceof BonusTile) {
      const hex0 = tile0.hex;   // depends on (player, nm)
      const tile = this.shifter.tileBag.takeType(AuctionTile, true);
      tile0.moveBonusTo(tile);  // and: tile0.sendHome() --> moveTo(undefined), parent.removeChild()
      tile.moveTo(hex0);
    }
    if (tile0 instanceof EventTile) {
      await this.processEventTile(tile0);
      this.shiftAndProcess(func, alwaysShift, TP.allowMultiEvent);
    } else {
      if (func) func(); // the continuation...
    }
  }

  eventsInBag = false;
  /** when Player has completed their Action & maybe a hire.
   * { shiftAuction, processEvent }* -> endTurn2() { roll dice, set Bonus, NextPlayer }
   */
  endTurn() {
    if (!!this.eventHex.tile) {
      console.log(stime(this, `.endTurn: must dismiss Event: ${this.eventHex.tile.nameText}`));
      return; // can't end turn until Event is dismissed.
    }
    if (!this.eventsInBag && !Player.allPlayers.find(plyr => plyr.econs < TP.econForEvents)) {
      const np = Player.allPlayers.length, tileBag = this.shifter.tileBag;
      EventTile.addToBag(tileBag, TP.eventsPerPlayer * np, EventTile.allTiles);
      PolicyTile.addToBag(tileBag, TP.policyPerPlayer * np, PolicyTile.allTiles);
      BonusTile.addToBag(tileBag);
      AutoCrime.addToBag(tileBag);
      this.eventsInBag = true;
      console.log(stime(this, `.endTurn: eventsInBag`), tileBag);
    }
    this.shiftAndProcess(() => this.endTurn2());
  }
  endTurn2() {
    this.rollDiceForBonus();
    this.curPlayer.policyHexes.forEach(hex => hex.tile instanceof PolicyTile && hex.tile.eval1());
    this.curPlayer.totalVps += this.curPlayer.vps;
    if (this.isEndOfGame()) {
      this.endGame();
    } else {
      this.setNextPlayer();
    }
  }

  endGame() {
    const scores = [];
    let topScore = -1, winner: Player;
    console.log(stime(this, `.endGame: Game Over`), this.vca);
    this.allPlayers.forEach(p => {
      p.endGame();
      p.policyHexes.forEach(hex => (hex.tile as PolicyTile)?.eog());
      // TODO: include TownRules bonuses
      const score = p.totalVps;
      scores.push(score);
      console.log(stime(this, `.endGame: ${p.Aname} score =`), score);
      if (topScore < score) {
        topScore = score;
        winner = p;
      }
    });
    console.log(stime(this, `.endGame: Winner = ${winner.Aname}`), scores);
  }

  setNextPlayer(plyr = this.otherPlayer()): void {
    this.preGame = false;
    this.turnNumber += 1 // this.history.length + 1
    this.curPlayer = plyr
    this.curPlayerNdx = plyr.index
    this.curPlayer.actions = 0;
    this.curPlayer.newTurn();
    this.assessThreats();
  }

  vca: {vc1: boolean, vc2: boolean}[] = [{vc1: false, vc2: false}, {vc1: false, vc2: false}];
  /** true if curVal true, twice in a row... */
  vc2(player: Player, vc: 'vc1'|'vc2', curVal: boolean) {
    const rv = this.vca[player.index][vc] && curVal;
    // console.log(stime(this, `.vc2: [${player.index}][${vc}] = ${rv}; curVal=`), curVal);
    this.vca[player.index][vc] = curVal;
    return rv;
  }
  isPlayerWin(player: Player) {
    const n = Leader.nLeader;
    const end1 = this.vc2(player, 'vc1', player.otherPlayer.allOnMap(MapTile).length == 0);
    const end2 = this.vc2(player, 'vc2', (player.nCivics == n) && (player.allOnMap(Leader).length == n) && player.econs + player.expenses >= 0);
    return end1 || end2;
  }

  isEndOfGame() {
    let end = false;
    this.allPlayers.forEach(player => {
      const endp = this.isPlayerWin(player);
      end = end || endp;
    })
    return end;
  }

  assessThreats() {
    this.hexMap.forEachHex(hex => hex.assessThreats()); // try ensure threats are correctly marked
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
    H.infDirs.forEach(dn => {
      const inf = hex.getInf(infColor, dn);
      hex.propagateIncr(infColor, dn, inf); // use test to identify captured Criminals?
    })
  }

  /** after remove Tile [w/tileInf] from hex: propagate influence in each direction. */
  decrInfluence(hex: Hex, tile: Tile, infColor: PlayerColor) {
    H.infDirs.forEach(dn => {
      const inf = hex.getInf(infColor, dn);
      hex.propagateDecr(infColor, dn, inf, tile);       // because no-stone, hex gets (inf - 1)
    })
  }

  playerBalanceString(player: Player, ivec = [0, 0, 0, 0]) {
    const [nb, fb, nr, fr] = this.playerBalance(player, ivec);
    return `${nb}+${fb}:${nr}+${fr}`;
  }
  playerBalance(player: Player, ivec = [0, 0, 0, 0]) {
    let [nBusi, fBusi, nResi, fResi] = ivec;
    this.hexMap.forEachHex(hex => {
      const tile = hex.tile;
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
    const ivec = tile.hex.isOnMap ? [0, 0, 0, 0] : [tile.nB, tile.fB, tile.nR, tile.fR];
    const [nBusi, fBusi, nResi, fResi] = this.playerBalance(player, ivec);
    const noBusi = nBusi > 1 * (nResi + fResi);
    const noResi = nResi > 2 * (nBusi + fBusi);
    const fail = (noBusi && (tile.nB > 0)) || (noResi && (tile.nR > 0));
    const failText = noBusi ? 'Need Residential' : 'Need Business';
    if (fail) {
      const failTurn = `${this.turnNumber}:${failText}`;
      if (this.failTurn != failTurn) {
        this.failTurn = failTurn;
        console.log(stime(this, `.failToBalance: ${failText} ${tile.Aname}`), [nBusi, fBusi, nResi, fResi], tile);
        this.logText(failText, 'GamePlay.failToBalance');
      }
    }
    return fail ? failText : undefined;
  }

  // Costinc [0] = curPlayer.civics.filter(civ => civ.hex.isOnMap).length + 1
  // each succeeding is 1 less; to min of 1, except last slot is min of -1;
  // costInc[nCivOnMap][slotN] => [0, 0, 0, -1], [1, 0, 0, -1], [2, 1, 0, -1], [3, 2, 1, 0], [4, 3, 2, 1]
  costIncMatrix(maxCivics = TP.maxCivics, nSlots = TP.auctionSlots) {
    const d3 = nSlots - 4;//nSlot=3:0, 4:1, 5:2 + mCivics
    // nCivics = [0...maxCivics]
    return new Array(maxCivics + 1).fill(1).map((civElt, nCivics) => {
      // iSlot = [0...nSlots - 1]
      return new Array(nSlots).fill(1).map((costIncElt, iSlot) => {
        let minVal = (iSlot === (nSlots - 1)) ? -1 : 0;
        return Math.max(minVal, nCivics + d3 - iSlot) // assert nSlots <= maxCivics; final slot always = 0
      })
    })
  }
  readonly costInc = this.costIncMatrix()

  /** show player color and cost. */
  readonly costIncHexCounters = new Map<Hex, CostIncCounter>()
  private costNdxFromHex(hex: Hex) {
    return this.costIncHexCounters.get(hex)?.ndx ?? -1; // Criminal/Police[constant cost]: no CostIncCounter, no ndx
  }

  updateCostCounter(cic: CostIncCounter) {
    const plyr = (cic.repaint instanceof Player) ? cic.repaint : this.curPlayer;
    const [infR] = this.getInfR(cic.hex.tile, cic.ndx, plyr);
    cic.setValue(infR);
  }

  /** update when Auction, Market or Civic Tiles are dropped. */
  updateCostCounters() {
    this.costIncHexCounters.forEach(cic => this.updateCostCounter(cic));
  }

  /** Influence & Coins Required to place tile; from offMap to onMap */
  getInfR(tile: Tile | undefined, ndx = this.costNdxFromHex(tile.hex), plyr = this.curPlayer) {
    const infR = (tile?.cost ?? 0) + (tile?.bonusCount ?? 0) + (this.costInc[plyr.nCivics][ndx] ?? 0);
    const coinR = infR + ((tile?.econ ?? 0) < 0 ? -tile.econ : 0);  // Salary is required when recruited.
    if (Number.isNaN(coinR)) debugger;
    return [infR, coinR];
  }

  logFailure(type: string, reqd: number, avail: number, toHex: Hex) {
    const failText = `${type} required: ${reqd} > ${avail}`;
    console.log(stime(this, `.failToPayCost:`), failText, toHex.Aname);
    this.logText(failText, `GamePlay.failToPayCost`);
  }

  failToPayCost(tile: Tile, toHex: Hex, commit = true) {
    if (tile.hex === toHex) return false;  // no payment; recompute influence
    if (this.preGame) return false;
    const toMap = toHex?.isOnMap;
    const toPolicy = this.curPlayer.isPolicyHex(toHex);
    const toReserve = this.reserveHexes[this.curPlayerNdx].includes(toHex);
    // no charge unless from off-Map to onMap/reserve/policy
    if (!(!tile.hex?.isOnMap && (toMap || toPolicy || toReserve))) return false;
    // tile is NOT On Map && IS going to [Map or Policy or Reserve]
    const [infR, coinR] = this.getInfR(tile); // assert coinR >= 0
    let inflR = 0;
    if (toMap && infR > 0) {
      // infls can be used to reduce the influence required to deploy:
      const infT = toHex.getInfT(this.curPlayer.color)
      inflR = infR - infT;        // add'l influence needed, expect <= 0
      if (inflR > this.curPlayer.infls) {
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
      if (inflR > 0) {
        this.curPlayer.infls -= inflR;
      }
      this.curPlayer.coins -= coinR;
    }
    return false;
  }

  /**
   * Move tile to hex (or recycle), updating influence.
   *
   * Tile.dropFunc() -> Tile.placeTile() -> gp.placeEither()
   * @param tile ignore if undefined
   * @param toHex tile.moveTo(toHex)
   * @param payCost commit and verify payment
   */
  placeEither(tile: Tile, toHex: Hex, payCost = true) {
    if (!tile) return;
    const fromHex = tile.hex;
    const info = { tile, fromHex, toHex, infStr: toHex?.infStr ?? '?', payCost };
    if (toHex !== tile.hex) console.log(stime(this, `.placeEither:`), info);
    // commit to pay, and verify payment made:
    if (payCost && this.failToPayCost(tile, toHex)) {
      console.log(stime(this, `.placeEither: payment failed`), tile, toHex);
      debugger;              // should not happen, since isLegalTarget() checks failToPayCost()
      tile.moveTo(tile.hex); // abort; return to fromHex
      return;
    }
    // update influence on map:
    const infColor = tile.infColor || this.curPlayer.color;
    const tileInfP = tile.infP + tile.bonusInf(infColor);
    if (fromHex?.isOnMap && tileInfP !== 0) {
      this.decrInfluence(fromHex, tile, infColor);        // as if tile has no influence
    }
    if (toHex !== fromHex) this.logText(`Place ${tile} -> ${toHex}`, `gamePlay.placeEither`)
    tile.moveTo(toHex);  // placeEither(tile, hex) --> moveTo(hex)
    if (fromHex?.meep || fromHex?.tile) {
      const infP = fromHex.getInfP(infColor);
      fromHex.meep?.setInfRays(infP); // meep inf w/o tile moved
      fromHex.tile?.setInfRays(infP); // tile inf w/o meep moved
    }
    if (toHex?.isOnMap) {
      this.incrInfluence(tile.hex, infColor);
      const infP = toHex.getInfP(infColor);
      toHex.meep?.setInfRays(infP);   // meep inf with tile placed
      toHex.tile?.setInfRays(infP);   // tile inf with meep placed
    } else if (toHex === this.recycleHex) {
      this.logText(`Recycle ${tile} from ${fromHex?.Aname || '?'}`, `gamePlay.placeEither`)
      this.recycleTile(tile);    // Score capture; log; return to homeHex
    }
    Player.updateCounters();
  }

  recycleTile(tile: Tile) {
    if (!tile) return;    // no prior reserveTile...
    let verb = tile.recycleVerb ?? 'recycled';
    if (tile.fromHex?.isOnMap) {
      if (tile.player !== this.curPlayer) {
        this.curPlayer.captures++;
        verb = 'captured';
      } else if (tile instanceof Meeple) {
        this.curPlayer.coins -= tile.econ;  // dismiss Meeple, claw-back salary.
      }
    }
    tile.logRecycle(verb);
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

  // /** from AuctionTiles or ReserveTiles to hexMap: */
  // buildAction(tile: AuctionTile, hex: Hex) {
  //   if (!tile.isLegalTarget(hex)) return false
  //   let pIndex = this.curPlayerNdx;
  //   let player = Player.allPlayers[pIndex];
  //   let rIndex = this.reserveTiles[pIndex].indexOf(tile);
  //   if (rIndex > 0) this.reserveTiles[pIndex][rIndex] = undefined;
  //   let aIndex = this.auctionTiles.indexOf(tile);
  //   if (aIndex > 0) this.auctionTiles[aIndex] = undefined;
  //   this.placeTile(tile, hex);  // buildAction
  //   return true;
  // }
}

/** GamePlayD has compatible hexMap(mh, nh) but does not share components. used by Planner */
export class GamePlayD extends GamePlay0 {
  //override hexMap: HexMaps = new HexMap();
  constructor(dbp: number = TP.dbp, dop: number = TP.dop) {
    super();
    this.hexMap[S.Aname] = `GamePlayD#${this.id}`;
    // this.hexMap.makeAllDistricts(dbp, dop); // included in GamePlay0
    return;
  }
}

/** GamePlay with Table & GUI (KeyBinder, ParamGUI & Dragger) */
export class GamePlay extends GamePlay0 {
  readonly table: Table   // access to GUI (drag/drop) methods.
  declare readonly gStats: TableStats // https://github.com/TypeStrong/typedoc/issues/1597
  /** GamePlay is the GUI-augmented extension of GamePlay0; uses Table */
  constructor(table: Table, public gameSetup: GameSetup) {
    super();            // hexMap, history, gStats...
    GP.gamePlay = this; // table
    // Players have: civics & meeples & TownSpec
    // setTable(table)
    this.table = table;
    this.gStats = new TableStats(this, table); // upgrade to TableStats
    if (this.table.stage.canvas) this.bindKeys();
  }

  autoCrimeTarget(meep: Criminal) {
    // Gang up on a weak Tile? place in weakly defended hex:
    let hexes = this.hexMap.filterEachHex(hex => !hex.occupied && meep.isLegalTarget(hex));
    //  && hex.getInfT(this.curPlayer.color) < 1 ?? to avoid playing into jeopardy
    const pColor = this.curPlayer.otherPlayer.color
    hexes.sort((a, b) => a.getInfT(pColor) - b.getInfT(pColor))
    const infs = hexes.map(hex => hex.getInfT(pColor));
    const minInf = hexes[0]?.getInfT(pColor) ?? 0;
    const hexes1 = hexes.filter(hex => hex.getInfT(pColor) == minInf);
    if (hexes1.length > 0) hexes = hexes1;
    // TODO: select placement with max attacks
    // place meep, propagateIncr, check getInfT('c') > getInfT(pColor), remove(meep)
    const hexes2 = hexes.filter(hex => hex.findLinkHex(hex => hex.meep instanceof Criminal));
    if (hexes2.length > 0) hexes = hexes2;
    return hexes[Math.floor(Math.random() * hexes.length)];
  }

  // mercenaries rally to your cause against the enemy (no cost, follow your orders.)
  // TODO: allow 'curPlayer' to place one of their [autoCrime] Criminals
  override autoCrime(force = false) {
    // no autoCrime until all Players have TP.econForCrime:
    if (!force && this.allPlayers.find(plyr => plyr.econs < TP.econForCrime)) return; // poverty
    const meep = this.curPlayer.criminalSource.hexMeep; //     meep.startHex = meep.source.hex;
    if (!meep) return;               // no Criminals available
    meep.autoCrime = true;           // no econ charge to curPlayer
    const targetHex = this.autoCrimeTarget(meep);
    meep.placeTile(targetHex, false); // meep.player == undefined --> no failToPayCost()
    this.logText(`AutoCrime: ${meep}`, 'GamePlay.autoCrime');
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

  unMove() {
    this.curPlayer.meeples.forEach(meep => meep.hex?.isOnMap && meep.unMove());
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
    KeyBinder.keyBinder.setKey('M-b', { thisArg: this, func: () => this.addBonus('infl') })
    KeyBinder.keyBinder.setKey('M-d', { thisArg: this, func: () => (this.addBonus('econ'), false) })
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
    KeyBinder.keyBinder.setKey('C-a', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true)} })  // C-a new Tile
    KeyBinder.keyBinder.setKey('C-A', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, true, EventTile)} })  // C-A shift(Event)
    KeyBinder.keyBinder.setKey('C-M-a', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, PolicyTile)} })  // C-M-a shift(Policy)
    KeyBinder.keyBinder.setKey('M-C', { thisArg: this, func: this.autoCrime, argVal: true })// S-M-C (force)
    KeyBinder.keyBinder.setKey('S-C', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, true, AutoCrime) } })
    KeyBinder.keyBinder.setKey('S-B', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, Busi) } })
    KeyBinder.keyBinder.setKey('S-R', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, Resi) } })
    KeyBinder.keyBinder.setKey('S-K', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, Bank) } })
    KeyBinder.keyBinder.setKey('S-L', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, Lake) } })
    KeyBinder.keyBinder.setKey('S-P', { thisArg: this, func: () => { this.shiftAndProcess(undefined, true, false, PS) } })
    KeyBinder.keyBinder.setKey('C-q', { thisArg: this, func: () => { this.table.dragStartAndDrop(this.eventHex.tile, this.recycleHex) } })  // C-q recycle from eventHex
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

  drawTile(type: new (...args: any[]) => AuctionTile, permute = false) {
    const tile = this.shifter.tileBag.takeType(type, permute);
    tile.setPlayerAndPaint(this.curPlayer);
    tile.moveTo(this.eventHex);
    this.hexMap.update();
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

  /** originally for KeyBinding test */
  override shiftAuction(pNdx?: number, alwaysShift?: boolean, drawType?: Constructor<BagTile>) {
    super.shiftAuction(pNdx, alwaysShift, drawType);
    this.paintForPlayer();
    this.updateCostCounters();
    this.hexMap.update();
  }

  override endTurn2(): void {
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = false;
    super.endTurn2();   // shift(), roll(); totalVps += vps
  }

  override isPlayerWin(player: Player): boolean {
    const rv = super.isPlayerWin(player), cont = this.table.winIndForPlayer[player.index];
    const warn = this.vca[player.index]['vc1'] || this.vca[player.index]['vc2'];
    if (warn) {
      // console.log(stime(this, `.isPlayerWin: ${AT.ansiText(['$red'], 'warn!')} ${player.Aname}`))
      const ddd = new CenterText('!!', 80, 'rgba(0,180,0,.8)'); // F.fontSpec()
      cont.addChild(ddd);
      this.hexMap.update();
    } else if(cont.numChildren > 0) {
      // console.log(stime(this, `.isPlayerWin: cancel!`))
      cont.removeAllChildren();
      this.hexMap.update();
    }
    return rv;
  }

  override setNextPlayer(plyr?: Player) {
    super.setNextPlayer(plyr); // update player.coins
    this.paintForPlayer();
    this.updateCostCounters();
    Player.updateCounters(); // beginning of round...
    this.logText(this.shifter.tileNames(this.curPlayerNdx), `GamePlay.setNextPlayer`);
    this.table.buttonsForPlayer[this.curPlayerNdx].visible = true;
    this.table.showNextPlayer(); // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.hexMap.update();
    this.startTurn();
    this.makeMove();
  }

  /** After setNextPlayer() */
  startTurn() {
  }

  paintForPlayer() {
    this.costIncHexCounters.forEach(cic => {
      const plyr = (cic.repaint instanceof Player) ? cic.repaint : this.curPlayer;
      if (cic.repaint !== false) {
        cic.hex.tile?.setPlayerAndPaint(plyr);
      }
    })
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
  text: CenterText;
  textSize: number = .5 * TP.hexRad;
  constructor() {
    this.text = new CenterText(`0:0`, this.textSize);
  }
  roll(n = 2, d = 6) {
    let rv = new Array(n).fill(1).map(v => 1 + Math.floor(Math.random() * d));
    this.text.text = rv.reduce((pv, cv, ci) => `${pv}${ci > 0 ? ':' : ''}${cv}`, '');
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
