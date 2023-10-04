import { C, F, S } from "@thegraid/common-lib";
import { Shape, Text } from "@thegraid/easeljs-module";
import { PS } from "./auction-tile";
import { GP } from "./game-play";
import type { Hex, Hex2 } from "./hex";
import type { Player } from "./player";
import { C1, InfRays, PaintableShape } from "./shapes";
import type { DragContext, Table } from "./table";
import { PlayerColor, TP, criminalColor } from "./table-params";
import { Civic, Tile } from "./tile";
import { UnitSource } from "./tile-source";


/** baseShape for Meeple (replaces TileShape/HexShape), see makeShape. */
class MeepleShape extends PaintableShape {
  static fillColor = 'rgba(225,225,225,.7)';
  static backColor = 'rgba(210,210,120,.5)'; // transparent light green

  constructor(public player: Player, public radius = TP.meepleRad) {
    super((color) => this.mscgf(color));
    this.y = TP.meepleY0;
    this.paint();
    this.setMeepleBounds();
    this.backSide = this.makeOverlay(this.y);
  }
  setMeepleBounds(r = this.radius) {
    this.setBounds(-r, -r, 2 * r, 2 * r);
  }

  backSide: Shape;  // visible when Meeple is 'faceDown' after a move.
  makeOverlay(y0: number) {
    const { x, width: w } = this.getBounds();
    const over = new Shape();
    over.graphics.f(MeepleShape.backColor).dc(x + w / 2, y0, w / 2);
    over.visible = false;
    over.name = over[S.Aname] = 'backSide';
    return over;
  }

  /** stroke a ring of colorn, stroke-width = 2, r = radius-2; fill disk with (~WHITE,.7) */
  mscgf(colorn = this.player?.colorn ?? C1.grey, ss = 2, rs = 0) {
    const r = this.radius;
    const g = this.graphics.c().ss(ss).s(colorn).f(MeepleShape.fillColor).dc(0, 0, r - rs - ss/2);  // disk & ring
    return g;
  }
}

type MeepleInf = 0 | 1;
export class Meeple extends Tile {
  static allMeeples: Meeple[] = [];

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get backSide() { return this.baseShape.backSide; }
  override get recycleVerb() { return 'dismissed'; }

  /**
   * Meeple - Leader, Police, Criminal
   * @param Aname
   * @param player (undefined for Chooser)
   * @param civicTile Tile where this Meeple spawns
   */
  constructor(
    Aname: string,
    player?: Player,
    inf: MeepleInf = 1,
    vp = 0,    // 1 for Leader
    cost = 1,  // Inf required to place (1 for Leader/Police, but placing in Civic/PS with Inf)
    econ = -6, // Econ required: -2 for Police, -3 for Criminal [place, not maintain]
  ) {
    super(Aname, player, inf, vp, cost, econ);
    this.addChild(this.backSide);
    this.player = player;
    this.nameText.visible = true;
    this.nameText.y = this.baseShape.y;
    let { x, y, width, height } = this.baseShape.getBounds();
    this.setInfRays();  // cache(x, y, w, y)
    this.paint();
    Meeple.allMeeples.push(this);
  }

  /** the map Hex on which this Meeple sits. */
  override get hex() { return this._hex; }
  /** only one Meep on a Hex, Meep on only one Hex */
  override set hex(hex: Hex) {
    if (this.hex?.meep === this) this.hex.meep = undefined
    this._hex = hex
    if (hex !== undefined) hex.meep = this;
  }

  override get radius() { return TP.meepleRad } // 31.578 vs 60*.4 = 24
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape() { return new MeepleShape(this.player, this.radius); }
  declare baseShape: MeepleShape;

  /** location at start-of-turn; for Meeples.unMove() */
  startHex: Hex;

  // we need to unMove meeples in the proper order; lest we get 2 meeps on a hex.
  // meepA -> hexC, meepB -> hexA; undo: meepA -> hexA (collides with meepB), meepB -> hexB
  // Assert: if meepA.startHex is occupied by meepB, then meepB is NOT on meepB.startHex;
  // So: recurse to move meepB to its startHex;
  // Note: with multiple/illegal moves, meepA -> hexB, meepB -> hexA; infinite recurse
  // So: remove meepA from hexB before moving meepB -> hexB
  unMove() {
    if (this.hex === this.startHex) return;
    this.placeTile(undefined, false);       // take meepA off the map;
    this.startHex.meep?.unMove();           // recurse to move meepB to meepB.startHex
    this.placeTile(this.startHex, false);   // Move & update influence; Note: no unMove for Hire! (sendHome)
    this.faceUp();
  }

  /** start of turn, faceUp(undefined) --> faceUp; moveTo(true|false) --> faceUp|faceDn */
  faceUp(up = true) {
    this.backSide.visible = !up;
    if (up) this.startHex = this.hex; // set at start of turn.
    this.updateCache();
    if (this.hex?.isOnMap) GP.gamePlay.hexMap.update();
  }

  override moveTo(hex: Hex): Hex {
    const destMeep = hex?.meep;
    if (destMeep && destMeep !== this) {
      destMeep.x += 10; // make double occupancy apparent [until this.unMove()]
      destMeep.unMove();
    }
    const fromHex = this.hex;
    super.moveTo(hex); // hex.set(meep) = this; this.x/y = hex.x/y
    this.faceUp(!!hex && (!hex.isOnMap || !fromHex?.isOnMap || hex === this.startHex));
    return hex;
  }

  override cantBeMovedBy(player: Player, ctx: DragContext) {
    const reason1 = super.cantBeMovedBy(player, ctx);
    if (reason1 || reason1 === false) return reason1;
    // if (!ctx?.lastShift && !this.canAutoUnmove && this.backSide.visible) return "already moved"; // no move if not faceUp
    return undefined;
  }

  // Meeple
  /** decorate with influence rays (playerColorn)
   * @param inf 0 ... n (see also: this.infColor)
   */
  override setInfRays(inf = this.hex?.getInfP(this.infColor) ?? this.infP): void {
    this.removeChildType(InfRays);
    if (inf !== 0) {
      this.addChildAt(new InfRays(inf, TP.colorScheme[this.infColor]), this.children.length - 1);
    }
    const radxy = -TP.hexRad, radwh = 2 * TP.hexRad;
    this.cache(radxy, radxy, radwh, radwh);
  }

  isOnLine(hex0: Hex, fromHex = this.hex) {
    return !!fromHex.linkDirs.find(dir => fromHex.hexesInDir(dir).includes(hex0));
    // return !!fromHex.linkDirs.find(dir => fromHex.findInDir(dir, hex => hex === hex0));
    // return !!fromHex.findLinkHex((hex, dir) => !!hex.findInDir(dir, hex => hex === hex0));
  }

  get canAutoUnmove() { return this.player.allOnMap(Meeple).filter(meep => meep.hex !== meep.startHex).length == 1 }

  /** override markLegal(), if *this* is the only meeple to have moved,
   * unMove it to reset influence; can always move back to startHex; */
  override markLegal(table: Table, setLegal?: (hex: Hex2) => void, ctx?: DragContext): void {
    if (!ctx?.lastShift && !!setLegal && this.canAutoUnmove) {
      this.unMove();          // this.hex = this.startHex;
    }
    super.markLegal(table, setLegal);
    this.startHex.isLegal = !!setLegal;
    return;
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    if (!hex.isOnMap) return false;
    if (!ctx?.lastShift && this.backSide.visible) return false;
    if (GP.gamePlay.failToPayCost(this, hex, false)) return false;
    // only move in line, to hex with influence:
    const onLine = this.isOnLine(hex), noInf = hex.getInfT(this.infColor) === 0;
    if (this.startHex.isOnMap && (!onLine || noInf)) return false;
    return true;
  }

  override isLegalRecycle(ctx: DragContext) {
    if (this.player === GP.gamePlay.curPlayer) return true;
    if (this.hex.getInfT(GP.gamePlay.curPlayer.color) > this.hex.getInfT(this.infColor)) return true;
    return false;
  }

  override showCostMark(show?: boolean): void {
    super.showCostMark(show, -.4);
  }

  override drawStar() {
    const mark = super.drawStar();
    mark.y -= .2 * TP.hexRad;
    return mark;
  }

  override drawEcon(econ?: number) {
    const mark = super.drawEcon(econ);
    mark.visible = false;
    return mark;
  }

  override dragStart(ctx?: DragContext): void {
    super.dragStart(ctx);
    if (this.infP > 0) this.setInfRays(this.infP);   // meeple influence w/o tile
    this.hex.tile?.setInfRays(this.hex.tile.infP);   // tile influence w/o meeple
  }

  override sendHome(): void { // Meeple
    this.faceUp();
    super.sendHome();
  }

  /**
   * Draw a circle with a thick stroke, making a ring.
   * @param colorn baseShape fill color
   * @param rColor ring color (stroke color)
   * @param ss stroke size
   * @param rs ring size (reduction in radius)
   */
  paintRing(colorn: string, rColor = C.BLACK, ss = 4, rs = 4) {
    const r = (this.baseShape as MeepleShape).radius;
    const g = (this.baseShape as MeepleShape).graphics;
    // this.baseShape.paint(colorn);       // [4, 2]
    g.ss(ss * TP.hexRad / 60).s(rColor).dc(0, 0, r - (rs * TP.hexRad / 60)) // stroke a colored ring inside black ring
    this.updateCache();
  }
}

export class Leader extends Meeple {
  civicTile: Civic;               // Leader deploys to civicTile & extra VP when on civicTile

  // VP bonus when Leader is on CivicTile
  override get vp()   { return super.vp   + (this.civicTile !== this.hex?.tile ? 0 : TP.vpOnCivic); }
  // InfP bonus when Leader is on CivicTile [if enabled by TP.infOnCivic]
  override get infP() { return super.infP + (this.civicTile !== this.hex?.tile ? 0 : TP.infOnCivic); }

  constructor(tile: Civic, abbrev: string) {  // Leader(name, player, inf, vp, cost, econ)
    super(`${abbrev}:${tile.player.index}`, tile.player, 1, 1, TP.leaderCost, TP.leaderEcon);
    this.civicTile = tile;
    this.addChild(this.nameText); // on top
    this.paint();
    this.markCivicWithLetter();
  }

  markCivicWithLetter(civic = this.civicTile) {
    const letterText = new Text(this.Aname.substring(0, 1), F.fontSpec(civic.radius / 2));
    letterText.visible = true;
    letterText.textAlign = 'center';
    letterText.y -= civic.radius * .75;
    civic.addChild(letterText);
    civic.paint();
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext) { // Leader
    if (!super.isLegalTarget(hex, ctx)) return false;
    if (!this.hex.isOnMap && (hex !== this.civicTile.hex)) return false; // deploy ONLY to civicTile.
    return true
  }

}
export class Mayor extends Leader {
  constructor(tile: Civic) {
    super(tile, 'M')
  }
}

export class Judge extends Leader {
  constructor(tile: Civic) {
    super(tile, 'J')
  }
}

export class Chancellor extends Leader {
  constructor(tile: Civic) {
    super(tile, 'C')
  }
}

export class Priest extends Leader {
  constructor(tile: Civic) {
    super(tile, 'P')
  }
}


export class Police extends Meeple {
  static source: UnitSource<Police>[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.policePerPlayer) {
    return Police.makeSource0(UnitSource, Police, player, hex, n);
  }

  // Police
  constructor(player: Player, serial: number) {
    super(`P-${serial}`, player, 1, 0, TP.policeCost, TP.policeEcon);
  }
  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    super.paint(pColor, colorn);
    this.paintRing(colorn, C.briteGold, 4, 6);
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext) { // Police
    if (!super.isLegalTarget(hex, ctx)) return false;
    if (this.hex === this.source.hex && !((hex.tile instanceof PS) && hex.tile.player === this.player)) return false;
    return true;
  }
}

export class CriminalSource extends UnitSource<Criminal> {
  override availUnit(unit: Criminal): void {
    super.availUnit(unit);
    unit.autoCrime = false;
    unit.paint();
  }
  get hexMeep() { return this.hex.meep as Criminal; }
}

/**
 * Criminal, Barbarian, Insurgent, Looter, Rioter...
 *
 * They swarm and destroy civil and economic resources:
 * if negative influence exceeds positive influence on hex, meep or tile is removed.
 *
 * Owned & Operated by Player, to destroy Tiles of the opposition.
 *
 * if autoCrime, then owning Player is not charged for econ cost.
 */
export class Criminal extends Meeple {
  static source: CriminalSource[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.criminalPerPlayer) {
    return Criminal.makeSource0(CriminalSource, Criminal, player, hex, n);
  }

  autoCrime = false;  // set true for zero-econ for this unit.

  override get econ(): number { return this.autoCrime ? 0 : super.econ; }

  constructor(player: Player, serial: number) {
    super(`C-${serial}`, player, 1, 0, TP.criminalCost, TP.criminalEcon)
  }

  override get infColor(): PlayerColor { return criminalColor; }

  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    super.paint(pColor, colorn);
    this.paintRing(colorn, C.black, 3, 5); // less than Police, because BLACK is 'bold'...
    if (this.autoCrime) {
      (this.baseShape as MeepleShape).graphics.es().f(C1.grey).dp(0, this.radius / 2, this.radius / 3, 4, 0, 45);
      this.updateCache();
    }
  }

  override moveTo(hex: Hex) {
    if (this.hex === this.source.hex && this.autoCrime) this.paint();
    const toHex = super.moveTo(hex);
    const curPlayer = GP.gamePlay.curPlayer;
    if (toHex === GP.gamePlay.recycleHex && this.player !== curPlayer) {
      curPlayer.coins -= this.econ;   // capturing player gets this Criminal's salary (0 if autoCrime)
    }
    return toHex;
  }

  private get startAutoCrime() { return this.autoCrime && (this.startHex === this.source.hex); }

  override faceUp(up?: boolean): void {
    const sac = this.startAutoCrime; // before faceUp changes startHex
    super.faceUp(up === false ? sac : up);
    if (up !== undefined && sac) this.startHex = this.source.hex; // until next turn (up == undefined)
  }

  override isOnLine(hex: Hex): boolean {
    return this.startAutoCrime ? true : super.isOnLine(hex);
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext): boolean { // Criminal
    if (!super.isLegalTarget(hex, ctx)) return false;
    const plyr = this.player ?? GP.gamePlay.curPlayer; // owner or soon-to-be owner
    // must NOT be on or adj to plyr's Tile:
    if (hex.tile?.player === plyr) return false;
    if (hex.findLinkHex(hex => hex.tile?.player === plyr)) return false;
    // if fromSource, must be to empty cell:
    if (this.startHex === this.source.hex && hex.tile) return false;
    // must be on or adj to otherPlayer Tile OR aligned Criminal:
    if (hex.tile?.player && hex.tile.player !== plyr) return true;
    const sac = this.startAutoCrime;
    if (hex.findLinkHex(adj =>
      (adj.tile?.player && adj.tile.player !== plyr) ||
      ((adj.meep instanceof Criminal) && adj.meep.player === plyr) && (sac ? adj.meep !== this : true))
      ) return true;
    return false;
  }

  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean {
    if (this.isLegalRecycle(ctx)) return false;
    if (!ctx?.lastShift && player !== this.player) return "not your criminal";
    if (!ctx?.lastShift && this.backSide.visible) return "already moved"; // no move if not faceUp
    return undefined;
  }
  // don't 'auto-unmove' Criminals (without lastShift)
  override get canAutoUnmove(): boolean {
    return false;
  }
}
