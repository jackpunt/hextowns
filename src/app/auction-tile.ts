import { className, stime } from "@thegraid/common-lib";
import { ValueEvent } from "@thegraid/easeljs-lib";
import { EventDispatcher } from "@thegraid/easeljs-module";
import { GP } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { H } from "./hex-intfs";
import type { Player } from "./player";
import { DragContext } from "./table";
import { TP } from "./table-params";
import { AuctionBonus, BagType, Bonus, BonusMark, BonusTile, Tile } from "./tile";

export class AuctionTile extends Tile implements BagType {

  static fillBag(tileBag: TileBag<AuctionTile>) {
    const addTiles = (n: number, type: new () => AuctionTile) => {
      for (let i = 0; i < n; i++) {
        const tile = new type();
        tileBag.push(tile);
      }
    };
    tileBag.length = 0;
    addTiles(TP.busiPerPlayer * 2 - TP.inMarket['Busi'], Busi);
    addTiles(TP.resiPerPlayer * 2 - TP.inMarket['Resi'], Resi);
    addTiles(TP.pstaPerPlayer * 2, PS);
    addTiles(TP.bankPerPlayer * 2, Bank);
    addTiles(TP.lakePerPlayer * 2, Lake);
    tileBag.dispatch();
  }

  /** AuctionTile */
  constructor(Aname?: string, player?: Player, inf?: number, vp?: number, cost?: number, econ?: number) {
    super(Aname, player, inf, vp, cost, econ); // AuctionTile
  }

  sendToBag() {
    console.log(stime(this, `.sendHome: tileBag.unshift()`), this.Aname, this.player?.colorn, this);
    this.player = undefined;
    GP.gamePlay.shifter.tileBag.unshift(this);
  }

  // from map: capture/destroy; from auction: outShift; from Market: recycle [unlikely]
  override sendHome(): void {
    super.sendHome(); // resetTile(); this.hex = undefined
    this.sendToBag();
    GP.gamePlay.hexMap.update();
  }

  override cantBeMovedBy(player: Player, ctx: DragContext) {
    const reason1 = super.cantBeMovedBy(player, ctx);
    if (reason1)
      return reason1;
    // allow shift-demolish/fire/capture(Tile,Meeple) from map [Debt & EventTile override]
    if (player.actions <= 0 && !this.hex.isOnMap && !ctx.lastShift)
      return "no Actions";
    // exclude opponent's [unowned] private auction Tiles:
    const gamePlay = GP.gamePlay;
    const ndx = gamePlay.auctionTiles.indexOf(this);
    const plyr = gamePlay.shifter.getPlayer(ndx, true);
    return (plyr === true) ? undefined : (plyr === player) ? undefined : 'Not your Tile';
  }

  override addBonus(type: AuctionBonus): BonusMark {
    if (GP.gamePlay.auctionTiles.includes(this)) {
      console.log(stime(this, `.addBonus`), { tile: this, type });
    }
    return super.addBonus(type);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!super.isLegalTarget(toHex, ctx))
      return false;
    const gamePlay = GP.gamePlay;
    // allows dropping on occupied reserveHexes:
    if (!toHex.isOnMap) {
      if (gamePlay.isReserveHex(toHex)) return true;   // AuctionTile can go toReserve:
      // TODO: during dev/testing: allow return to auctionHexes, if fromReserve
      if (ctx?.lastShift && gamePlay.isReserveHex(this.hex) && gamePlay.auctionHexes.includes(toHex))
        return true;
      return false;
    }
    // Now consider toHex.isOnMap:
    if (ctx.lastShift) return true; // Shift key allows map-to-map & failToBalance

    // Cannot move a tile that is already on the map:
    if (this.hex.isOnMap)
      return false;
    if (gamePlay.failToBalance(this))
      return false;
    // cannot place on meep of other Player or Criminal (AuctionTile can go under own meep)
    if (toHex.meep && (toHex.meep.infColor !== gamePlay.curPlayer.color))
      return false;
    return true;
  }

  // AuctionTile
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    this.flipOwner(targetHex, ctx);
    super.dropFunc(targetHex, ctx); // set this.hex = targetHex, this.fromHex.tile = undefined;
  }

  override placeTile(hex: Hex, payCost?: boolean): void {
    const gamePlay = GP.gamePlay, player = gamePlay.curPlayer;

    gamePlay.removeFromAuction(this);
    gamePlay.removeFromReserve(this);

    const priorTile = hex.tile; // generally undefined; except BonusTile (or ReserveHexes.tile)
    const bonus = (priorTile instanceof BonusTile) && priorTile.bonus;

    super.placeTile(hex, payCost);

    // now ok to increase 'cost' of this Tile.
    if (bonus) {
      this.player.takeBonus(priorTile); // deposit Infls & Actns with Player;
      priorTile.moveBonusTo(this);      // and priorTile.sendHome()
    }

    // if from market source:
    gamePlay.fromMarket(this.fromHex)?.nextUnit();
    gamePlay.updateCostCounters(); // update if fromMarket (or toMarket!)

    // special treatment for where tile landed:
    const toHex = this.hex as Hex2; // where GamePlay.placeTile() put it (recycle: homeHex or undefined)

    if (toHex?.isOnMap && !this.fromHex.isOnMap) { // ctx.lastCtrl allows map-to-map
      this.player.takeBonus(this);
      player.useAction(); // Build
    }
    // add TO auctionTiles (from reserveHexes; see isLegalTarget) FOR TEST & DEV
    const auctionTiles = gamePlay.auctionTiles;
    const auctionNdx = gamePlay.auctionHexes.indexOf(toHex);
    if (auctionNdx >= 0) {
      auctionTiles[auctionNdx]?.moveTo(this.fromHex); // if something there, swap it to fromHex
      auctionTiles[auctionNdx] = this;
      this.setPlayerAndPaint(player);
    }
    // add TO reserveTiles:
    const rIndex = gamePlay.playerReserveHexes.indexOf(toHex);
    if (rIndex >= 0) {
      const info = [this.Aname, this.hex?.Aname, this.bonus];
      console.log(stime(this, `.dropFunc: Reserve[${rIndex}]`), ...info);
      gamePlay.reserveAction(this, rIndex);
      player.useAction(); // Reserve
    }
  }
}

export class TileBag<T extends Tile> extends Array<T> {
  static event = 'TileBagEvent';
  constructor() {
    super()
    EventDispatcher.initialize(this);  // so 'this' implements EventDispatcher
  }

  get asDispatcher() { return this as any as EventDispatcher; }

  /** dispatch a ValueEvent to this EventDispatcher; update TileBag counter/length. */
  dispatch(type: string = TileBag.event, value: number = this.length) {
    ValueEvent.dispatchValueEvent(this as any as EventDispatcher, type, value)
  }

  inTheBag() {
    const counts = {};
    const inBagNames = this.map(tile => className(tile)).sort();
    inBagNames.forEach(name => counts[name] = (counts[name] ?? 0) + 1);
    return counts;
  }

  inTheBagStr() {
    const counts = this.inTheBag();
    return Object.keys(counts).reduce((pv, cv, ci) => `${pv}${ci>0?', ':''}${cv}:${counts[cv]}`, '');
  }

  takeType(type: new (...args: any[]) => T) {
    const tile = this.find((tile, ndx, bag) => (tile instanceof type) && (bag.splice(ndx, 1), true));
    this.dispatch();
    return tile;
  }

  /** take specific tile from tileBag */
  takeTile(tile: T) {
    let index = this.indexOf(tile)
    if (index < 0) return undefined;
    this.splice(index, 1)
    this.dispatch();
    return tile;
  }

  selectOne(remove = true, bag: T[] = this) {
    const index = Math.floor(Math.random() * bag.length);
    const tile = remove ? bag.splice(index, 1)[0] : bag[index];
    this.dispatch();
    return tile;
  }

  // TODO: also override/disable push, pop, shift?
  override unshift(...items: T[]): number {
    const rv = super.unshift(...items);
    this.dispatch();
    return rv
  }
}

export class Resi extends AuctionTile {
  override get nR() { return 1; } // Resi
  constructor(Aname?: string, player?: Player, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Resi');
    this.loanLimit = 6;
  }
}

export class Busi extends AuctionTile {
  override get nB() { return 1; } // Busi
  constructor(Aname?: string, player?: Player, inf = 0, vp = 1, cost = 1, econ = 1) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Busi');
    this.loanLimit = 7;
  }
}

export class PS extends AuctionTile {
  constructor(Aname?: string, player?: Player, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Pstation')
  }
}

class AdjBonusTile extends AuctionTile {

  /** dodgy? merging Bonus.type with asset/image name */
  constructor(
    public type: Bonus,
    public isAdjFn = (tile: Tile) => false,
    public anyPlayer = TP.anyPlayerAdj, // true -> bonus for adj tile, even if owner is different
    player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap(type)        // addChild(...myMarks) sometimes FAILS to add! [or get re-added?]
    this.addChild(...this.myMarks);  // add all the stars; will tweak visibility during draw
  }

  myMarks = H.ewDirs.map(dir => {
    let mark = new BonusMark(this.type, H.dirRot[dir]);
    mark.rotation = H.dirRot[dir];
    return mark;
  });

  isBonus(tile: Tile | undefined) {
    return !!tile && this.isAdjFn(tile) && (this.anyPlayer || tile.player === this.player);
  }

  get adjBonus() { return this.hex.linkHexes.filter(hex => this.isBonus(hex.tile)).length; }

  override draw(ctx: CanvasRenderingContext2D, ignoreCache?: boolean): boolean {
    this.myMarks?.forEach((m, ndx) => {
      m.visible = this.hex?.isOnMap && this.isBonus(this.hex.nextHex(H.ewDirs[ndx]).tile);
    })
    return super.draw(ctx, true); // ignoreCache! draw with new visiblity (still: cache in HexMap)
  }

  override removeBonus(type?: Bonus): void {
    super.removeBonus(type);
    this.addChild(...this.myMarks);  // reinsert *these* bonus marks.
  }
}

export class Bank extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (TP.bankAdjBank || !(t instanceof Bank)) && (t.nB + t.fB) > 0;
  }
  override get nB() { return 1; }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Bank', Bank.isAdj, true, player, Aname, inf, vp, cost, econ);
    this.loanLimit = 8;
  }
  override get econ() { return super.econ + this.adjBonus }
}

export class Lake extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (t.nR + t.fR) > 0;
  }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = 1, econ = 0) {
    super('Lake', Lake.isAdj, false, player, Aname, inf, vp, cost, econ);
  }
  override get vp() { return super.vp + this.adjBonus; }
}
