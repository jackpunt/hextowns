import { C, F, S } from "@thegraid/common-lib";
import { Shape, Text } from "@thegraid/easeljs-module";
import { PS } from "./auction-tile";
import { GP } from "./game-play";
import type { Hex, Hex2 } from "./hex";
import { H } from "./hex-intfs";
import type { Player } from "./player";
import { C1, InfRays, Paintable } from "./shapes";
import type { DragContext } from "./table";
import { PlayerColor, TP, criminalColor } from "./table-params";
import { Church, Civic, Courthouse, Tile, TownStart, University } from "./tile";
import { UnitSource } from "./tile-source";

class MeepleShape extends Shape implements Paintable {
  static fillColor = 'rgba(225,225,225,.7)';
  static backColor = 'rgba(210,210,120,.5)'; // transparent light green

  constructor(public player: Player, public radius = TP.meepleRad) {
    super();
    this.y = TP.meepleY0;
    this.paint();
    this.backSide = this.makeOverlay();
  }

  backSide: Shape;  // visible when Meeple is 'faceDown' after a move.
  makeOverlay() {
    let {x, y, width: w, height: h} = this.getBounds();
    const over = new Shape();
    over.graphics.f(MeepleShape.backColor).dc(x + w / 2, y + h / 2, w / 2)
    over.visible = false;
    over.name = over[S.Aname] = 'backSide';
    return over;
  }

  /** stroke a ring of colorn, stroke-width = 2, r = radius-2; fill disk with (~WHITE,.7) */
  paint(colorn = this.player?.colorn ?? C1.grey) {
    const x0 = 0, y0 = 0, r = this.radius, ss = 2, rs = 1;
    const g = this.graphics.c().ss(ss).s(colorn).dc(x0, y0, r - rs);
    g.f(MeepleShape.fillColor).dc(x0, y0, r - 1)  // disk
    this.setBounds(x0 - r, y0 - r, 2 * r, 2 * r)
    return g
  }
}

type MeepleInf = 0 | 1;
export class Meeple extends Tile {
  static allMeeples: Meeple[] = [];

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get backSide() { return (this.baseShape as MeepleShape).backSide; }
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
    this.cache(x, y, width, height);
    this.paint();
    Meeple.allMeeples.push(this);
  }

  /** the map Hex on which this Meeple sits. */
  override get hex() { return this._hex; }
  /** only one Meep on a Hex, Meep on only one Hex */
  override set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.meep = undefined
    this._hex = hex
    if (hex !== undefined) hex.meep = this;
  }

  override get radius() { return TP.hexRad / 1.9 }
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): Paintable { return new MeepleShape(this.player); }

  /** start of turn: unmoved */
  faceUp(up = true) {
    this.backSide.visible = !up;
    if (up) this.startHex = this.hex; // set at start of turn.
    this.updateCache();
    GP.gamePlay.hexMap.update();
  }

  override moveTo(hex: Hex): Hex {
    if (hex?.meep) hex.meep.x += 10; // make double occupancy apparent [gamePlay.unMove()]
    const fromHex = this.hex;
    super.moveTo(hex); // this.x/y = hex.x/y;
    this.faceUp(!!hex && (!hex?.isOnMap || !fromHex?.isOnMap || hex === this.startHex));
    return hex;
  }

  override cantBeMovedBy(player: Player, ctx: DragContext) {
    const reason1 = super.cantBeMovedBy(player, ctx);
    if (reason1) return reason1;
    if (this.backSide.visible && !ctx.lastShift) return "already moved"; // no move if not faceUp
    return undefined;
  }

  // Meeple
  /** decorate with influence rays (playerColorn)
   * @param inf 0 ... n (see also: this.infColor)
   */
  override setInfRays(inf = this.inf): void {
    this.removeChildType(InfRays)
    if (inf !== 0) {
      this.addChildAt(new InfRays(inf, this.infColor), this.children.length - 1)
    }
    let radxy = -TP.hexRad, radwh = 2 * TP.hexRad
    this.cache(radxy, radxy, radwh, radwh)
  }

  isOnLine(hex: Hex) {
    return H.infDirs.find(dir => this.hex.hexesInDir(dir).includes(hex)) ? true : false;
  }

  override isLegalTarget(hex: Hex, ctx?: DragContext) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    if (GP.gamePlay.failToPayCost(this, hex, false)) return false;
    // only move in line, to hex with influence:
    let onLine = this.isOnLine(hex), noInf = hex.getInfT(this.infColor) === 0;
    if (this.hex.isOnMap && (!onLine || noInf)) return false;
    return hex.isOnMap;
  }

  override isLegalRecycle(ctx: DragContext) {
    if (this.player !== GP.gamePlay.curPlayer && this.hex.getInfT(GP.gamePlay.curPlayer.color) <= this.hex.getInfT(this.player.color)) return false;
    return true;
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
    this.hex.tile?.setInfRays(); // tile influence after removing meeple
    this.setInfRays();           // show influence rays on this meeple
  }

  // override dropFunc(targetHex: Hex2, ctx: DragContext): void {
  //   GP.gamePlay.placeMeep(this, targetHex); // Drop: isOnMap or recycleHex
  // }

  // Meeple
  override placeTile(toHex: Hex, payCost?: boolean): void {
    const fromHex = this.hex;
    GP.gamePlay.placeEither(this, toHex, payCost); // meep.hex = toHex (OR homeHex; incl undefined)
    fromHex?.tile?.setInfRays(fromHex.getInfP(this.infColor) ?? 0); // recalc after this is removed

    const infP = this.hex?.getInfP(this.infColor) ?? 0; // combined tile & meep influence
    this.hex?.tile?.setInfRays(infP);
    this.setInfRays(infP);
  }

  override sendHome(): void { // Meeple
    this.faceUp();
    super.sendHome()
  }
}

export class Leader extends Meeple {
  /** new Civic Tile with a Leader 'on' it. */
  static makeLeaders(p: Player, nPolice = 10) {
    new Mayor(new TownStart(p))   // King
    new Chancellor(new University(p))   // Rook: Chariot, Rector, Count
    new Priest(new Church(p))     // Bishop
    new Judge(new Courthouse(p))  // Queen
  }

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

class SourcedMeeple extends Meeple {

  static makeSource0<TS extends UnitSource<SourcedMeeple>, T extends SourcedMeeple>(stype: new(type, p, hex) => TS, type: new(p: Player, n: number) => T, player: Player, hex: Hex2, n = 0) {
    const source = new stype(type, player, hex);
    type['source'][player.index] = source; // static source: TS = [];
    for (let i = 0; i < n; i++) source.newUnit(new type(player, i + 1))
    source.nextUnit();  // unit.moveTo(source.hex)
    return source;
  }

  constructor(readonly source: UnitSource<SourcedMeeple>, Aname: string, player?: Player, inf?: MeepleInf, vp?: number, cost?: number, econ?: number) {
    super(Aname, player, inf, vp, cost, econ);
  }

  paintRings(colorn: string, rColor = C.BLACK, ss = 4, rs = 4) {
    const r = (this.baseShape as MeepleShape).radius;
    const g = (this.baseShape as MeepleShape).graphics;
    this.baseShape.paint(colorn);       // [2, 1]
    g.ss(ss).s(rColor).dc(0, 0, r - rs) // stroke a colored ring inside black ring
    this.updateCache();
  }

  override moveTo(hex: Hex) {
    const source = this.source;
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);  // collides with source.hex.meep
    if (fromHex === this.source.hex && fromHex !== toHex) {
      source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  override sendHome(): void { // Criminal
    super.sendHome();         // this.resetTile(); moveTo(this.homeHex = undefined)
    const source = this.source;
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}

export class Police extends SourcedMeeple {
  private static source: UnitSource<Police>[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.policePerPlayer) {
    return SourcedMeeple.makeSource0(UnitSource, Police, player, hex, n);
  }

  // Police
  constructor(player: Player, serial: number) {
    super(Police.source[player.index], `P-${serial}`, player, 1, 0, TP.policeCost, TP.policeEcon);
  }
  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.paintRings(colorn, C.briteGold, 4, 4);
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
export class Criminal extends SourcedMeeple {
  private static source: CriminalSource[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.criminalPerPlayer) {
    return Criminal.source[player.index] = SourcedMeeple.makeSource0(CriminalSource, Criminal, player, hex, n);
  }

  autoCrime = false;  // set true for zero-econ for this unit.

  override get econ(): number { return this.autoCrime ? 0 : super.econ; }

  constructor(player: Player, serial: number) {
    super(Criminal.source[player.index], `C-${serial}`, player, 1, 0, TP.criminalCost, TP.criminalEcon)
  }

  override get infColor(): PlayerColor { return criminalColor; }

  override paint(pColor = this.player?.color, colorn = pColor ? TP.colorScheme[pColor] : C1.grey) {
    this.paintRings(colorn, C.black, ...this.autoCrime ? [4, 4]: [2, 3]);
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

  override isLegalTarget(hex: Hex, ctx?: DragContext): boolean { // Criminal
    if (!super.isLegalTarget(hex, ctx)) return false;
    let plyr = this.player ?? GP.gamePlay.curPlayer; // owner or soon-to-be owner
    // must NOT be on or adj to plyr's Tile:
    if (hex.tile?.player === plyr) return false;
    if (hex.findLinkHex(hex => hex.tile?.player === plyr)) return false;
    // if fromSource, must be to empty cell:
    if (this.hex === this.source.hex && hex.tile) return false;
    // must be on or adj to otherPlayer Tile OR aligned Criminal:
    if (hex.tile?.player && hex.tile.player !== plyr) return true;
    if (hex.findLinkHex(hex =>
      (hex.tile?.player && hex.tile.player !== plyr) ||
      ((hex.meep instanceof Criminal) && hex.meep.player === plyr))
      ) return true;
    return false;
  }
}
