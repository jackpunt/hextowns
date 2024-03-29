import { stime } from "@thegraid/common-lib";
import { GP } from "./game-play";
import { Hex, Hex2 } from "./hex";
import { H } from "./hex-intfs";
import { Player } from "./player";
import { CenterText } from "./shapes";
import { DragContext } from "./table";
import { TP } from "./table-params";
import { AdjBonusId, AuctionBonus, BagTile, BonusId, BonusMark, BonusTile, MapTile, Tile } from "./tile";
import { TileBag } from "./tile-bag";

export class AuctionTile extends MapTile implements BagTile {

  static fillBag(tileBag: TileBag<AuctionTile>) {
    const addTiles = (n: number, claz: new () => AuctionTile) => {
      for (let i = 0; i < n; i++) {
        const tile = new claz();
        tileBag.push(tile);
      }
    };
    tileBag.length = 0;
    addTiles((TP.busiPerPlayer - TP.inMarketPerPlayer['Busi']) * 2, Busi);
    addTiles((TP.resiPerPlayer - TP.inMarketPerPlayer['Resi']) * 2, Resi);
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
    console.log(stime(this, `.sendToBag:`), this.Aname, this.player?.colorn, this);
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
    if (reason1 || reason1 === false)
      return reason1;
    // allow shift-demolish/fire/capture(Tile,Meeple) from map [Debt & EventTile override]
    if (player.actions <= 0 && !this.hex.isOnMap && !ctx?.lastShift)
      return "no Actions";
    // exclude opponent's [unowned] private auction Tiles:
    const gamePlay = GP.gamePlay;
    const ndx = gamePlay.auctionTiles.indexOf(this);
    const plyr = gamePlay.shifter.getPlayer(ndx, true);
    return (plyr === true) ? undefined : (plyr === player) ? undefined : 'Not your Tile';
  }

  override addBonus(type: AuctionBonus) {
    if (GP.gamePlay.auctionTiles.includes(this)) {
      console.log(stime(this, `.addBonus`), { tile: this, type });
    }
    super.addBonus(type);
  }

  override isLegalTarget(toHex: Hex, ctx?: DragContext): boolean {
    if (!super.isLegalTarget(toHex, ctx))
      return false;
    const gamePlay = GP.gamePlay;
    // allows dropping on occupied reserveHexes:
    if (!toHex.isOnMap) {
      if (gamePlay.isReserveHex(toHex)) return true;   // AuctionTile can go toReserve:
      // TODO: during dev/testing: allow return to auctionHexes, if fromReserve
      if (ctx?.lastShift && gamePlay.isReserveHex(this.hex) && gamePlay.isAuctionHex(toHex))
        return true;
      return false;
    }
    // Now consider toHex.isOnMap:
    if (ctx?.lastShift) return true; // Shift key allows map-to-map & failToBalance

    // Cannot move a tile that is already on the map:
    if (this.hex?.isOnMap)
      return false;
    if (gamePlay.failToBalance(this))
      return false;
    // cannot place on meep of other Player or Criminal (AuctionTile can go under own meep)
    if (toHex.meep && (toHex.meep.infColor !== gamePlay.curPlayer.color))
      return false;
    return true;
  }

  override isLegalRecycle(ctx: DragContext): boolean {
    if (GP.gamePlay.isFromResa(this)) return false;
    return super.isLegalRecycle(ctx);
  }

  // AuctionTile
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    this.flipOwner(targetHex, ctx);
    super.dropFunc(targetHex, ctx); // set this.hex = targetHex, this.fromHex.tile = undefined;
    if (GP.gamePlay.isFromResa(this) && targetHex !== this.fromHex ) {
      const gamePlay = GP.gamePlay, table = GP.gamePlay.table;
      table?.setAuctionVis(true);
      gamePlay.resaHexes.forEach(hex => hex.tile?.sendHome());
    }
  }

  override placeTile(hex: Hex, payCost?: boolean): void {
    if (this.fromHex === hex) {
      super.placeTile(hex, payCost);
      return;  // self-drop: nothing to do
    }
    const gamePlay = GP.gamePlay, player = gamePlay.curPlayer;

    gamePlay.removeFromAuction(this);
    gamePlay.removeFromReserve(this);

    const destTile = hex.tile;  // generally undefined; BonusTile, ReserveHexes.tile [& PolicyHexes.tile])
    const bonus = (destTile instanceof BonusTile) && destTile.bonus;
    if (hex?.isOnMap) {                 // not to Reserve!
      player.takeBonus(destTile);       // deposit infl & actn with Player;
      if (!this.fromHex?.isOnMap) {     // ctx.lastCtrl allows map-to-map
        player.takeBonus(this);         // build: takeBonus (infl & actn)
        player.useAction(); // Build
      }
    }

    super.placeTile(hex, payCost);

    // now ok to increase 'cost' of this Tile.
    if (bonus) {
      destTile.moveBonusTo(this);      // Econ & Star; priorTile.sendHome();
    }

    // if from market source:
    if (!this.source?.hex.tile) this.source?.nextUnit();
    gamePlay.updateCostCounters(); // update if fromMarket (or toMarket!)

    // special treatment for where tile landed:
    const toHex = this.hex as Hex2; // where GamePlay.placeTile() put it (recycle: homeHex or undefined)

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
      gamePlay.reserveAction(this, rIndex); // recycle priorTile
      player.useAction(); // Reserve
    }
  }
}
export class Blank extends AuctionTile {
  constructor(Aname?: string, player?: Player, inf = 0, vp = 0, cost = 0, econ = 0) {
    super(Aname, player, inf, vp, cost, econ);
    // no image
  }
}

export class AB extends Blank {
  constructor(Aname?: string, player?: Player, inf = 0, vp = 0, cost = 0, econ = 0) {
    super(Aname, player, 0, vp, cost, econ);
    this.pid = inf;
    this.abText = new CenterText(Aname, TP.hexRad);
    this.addChild(this.abText);
  }
  pid: number;
  abText: CenterText;
  override setPlayerAndPaint(player: Player): void {
    if (player && this.abText) {
      const ndx = player.index, ab = this.Aname.substring(ndx, ndx + 1);
      this.abText.text = ab;
      super.setPlayerAndPaint(Player.allPlayers[this.pid]);
      return;
    }
    super.setPlayerAndPaint(player);
  }
}

export class Resi extends AuctionTile {
  override get nR() { return 1; } // Resi
  constructor(Aname?: string, player?: Player, inf = 0, vp = 1, cost = TP.tileCost(Resi), econ = 0) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Resi');
    this.loanLimit = 6;
  }
  override get econ() {
    const econ = super.econ;
    const bonus = (this.hex.linkHexes.find(hex => hex.tile instanceof Busi) ? 1 : 0);
    if (bonus && (!this.econEcon || !this.econEcon.visible )) {
      this.drawEcon(econ, true);
    } else if (!bonus && (this.econEcon?.visible)) {
      this.drawEcon(econ, false);
    }
    return econ + bonus;
  }
}

export class Busi extends AuctionTile {
  override get nB() { return 1; } // Busi
  constructor(Aname?: string, player?: Player, inf = 0, vp = 0, cost = TP.tileCost(Busi), econ = 1) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Busi');
    this.loanLimit = 7;
  }
  override get vp() {
    const vp = super.vp;
    const bonus = this.hex.linkHexes.find(hex => hex.tile instanceof Resi) ? 1 : 0;
    if (bonus && (!this.vpStar || !this.vpStar.visible)) {
      this.drawStar(undefined, true);
    } else if (!bonus && (this.vpStar?.visible)) {
      this.drawStar(undefined, false);
    }
    return super.vp + bonus;
  }
}

export class PS extends AuctionTile {
  constructor(Aname?: string, player?: Player, inf = 0, vp = 0, cost = TP.tileCost(PS), econ = 0) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap('Pstation')
  }
}

class AdjBonusTile extends AuctionTile {

  /** dodgy? merging Bonus.type with asset/image name */
  constructor(
    public type: AdjBonusId,
    public isAdjFn = (tile: Tile) => false,
    public anyPlayer = TP.anyPlayerAdj, // true -> bonus for adj tile, even if owner is different
    Aname?: string, player?: Player, inf = 0, vp = 0, cost = 1, econ = 0,
  ) {
    super(Aname, player, inf, vp, cost, econ);
    this.addImageBitmap(type)        // addChild(...myMarks) sometimes FAILS to add! [or get re-added?]
    this.addChildAt(...this.myMarks, this.getChildIndex(this.nameText));  // add all the stars; will tweak visibility during draw
  }

  myMarks = H.ewDirs.map(dir => {
    const mark = new BonusMark(this.type, H.ewDirRot[dir]);
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

  override removeBonus(bonusId?: BonusId, crit?: (bm: BonusMark) => boolean): void {
    if (bonusId && !crit) crit = (bm) => bm.rotation === 0; // <-- or !myMarks.includes(bm) ?
    super.removeBonus(bonusId, crit); // uses removeChildType(bonusId, crit);
  }
}

export class Bank extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (TP.bankAdjBank || !(t instanceof Bank)) && (t.nB + t.fB) > 0;
  }
  override get nB() { return 1; }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = TP.tileCost(Bank), econ = 0) {
    super('Bank', Bank.isAdj, true, Aname, player, inf, vp, cost, econ);
    this.loanLimit = 8;
  }
  override get econ() { return super.econ + this.adjBonus }
}

export class Lake extends AdjBonusTile {
  static isAdj(t: Tile) {
    return (t.nR + t.fR) > 0;
  }
  constructor(player?: Player, Aname?: string, inf = 0, vp = 0, cost = TP.tileCost(Lake), econ = 0) {
    super('Lake', Lake.isAdj, false, Aname, player, inf, vp, cost, econ);
  }
  override get vp() { return super.vp + this.adjBonus; }
}
