import { C, F, S, stime } from "@thegraid/common-lib";
import { ValueCounter } from "@thegraid/easeljs-lib";
import { Shape, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap } from "./hex";
import { H } from "./hex-intfs";
import { Player } from "./player";
import { DragContext } from "./table";
import { TP } from "./table-params";
import { Church, Civic, Courthouse, InfRays, PS, Tile, TownStart, University } from "./tile";
import { PaintableShape, C1 } from "./shapes";

class MeepleShape extends Shape implements PaintableShape {
  static fillColor = 'rgba(225,225,225,.7)';
  static overColor = 'rgba(120,210,120,.5)';

  constructor(public player: Player, public radius = TP.hexRad * .4, public y0 = radius * 5 / 6) {
    super()
    this.paint();
    this.overShape = this.makeOverlay();
  }
  /** stroke a ring of colorn, r=radius-1, width=2; fill disk with (~WHITE,.8) */
  paint(colorn = this.player?.colorn || C1.grey) {
    let x0 = 0, y0 = this.y0, r = this.radius;
    let g = this.graphics.c().ss(2)
    g.s(colorn).dc(x0, y0, r - 1)                 // ring
    g.f(MeepleShape.fillColor).dc(x0, y0, r - 1)  // disk
    this.setBounds(x0 - r, y0 - r, 2 * r, 2 * r)
    return g
  }
  overShape: Shape;
  makeOverlay() {
    let {x, y, width: w, height: h} = this.getBounds();
    const over = new Shape();
    over.graphics.f(MeepleShape.overColor).dc(x + w / 2, y + h / 2, w / 2)
    over.visible = false;
    over.name = over[S.Aname] = 'overShape';
    return over;
  }
}

type MeepleInf = -1 | 0 | 1;
export class Meeple extends Tile {
  static allMeeples: Meeple[] = [];

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get y0() { return (this.childShape as MeepleShape).y0; }
  get overShape() { return (this.childShape as MeepleShape).overShape; }

  /**
   * Meeple - Leader, Police, Criminal
   * @param Aname
   * @param player (undefined for Chooser)
   * @param civicTile Tile where this Meeple spawns
   */
  constructor(
    Aname: string,
    player?: Player,
    inf: MeepleInf = 1,   // -1 for Criminal
    vp = 0,    // 1 for Leader
    cost = 1,  // Inf required to place (1 for Leader/Police, but placing in Civic/PS with Inf)
    econ = -6, // Econ required: -2 for Police, -3 for Criminal [place, not maintain]
  ) {
    super(player, Aname, inf, vp, cost, econ);
    this.addChild(this.overShape);
    this.player = player
    let { x, y, width, height } = this.childShape.getBounds();
    this.nameText.visible = true
    this.nameText.y = y + height/2 - Tile.textSize/2;
    this.cache(x, y, width, height);
    this.paint()
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

  startHex: Hex;       // location at start-of-turn (see also: homeHex -- start-of-game/recycle)

  override get radius() { return TP.hexRad / 1.9 }
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): PaintableShape { return new MeepleShape(this.player); }

  /** start of turn: unmoved */
  faceUp() {
    this.overShape.visible = false;
    this.startHex = this.hex;
    this.updateCache()
    this.table.hexMap.update()
  }

  /** when moved, show grey overlay */
  faceDown() {
    this.overShape.visible = true;
    this.updateCache()
    this.table.hexMap.update()
  }

  override moveTo(hex: Hex): Hex {
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);
    if (toHex.isOnMap) {
      if (fromHex.isOnMap && toHex !== this.startHex) { this.faceDown(); }
      else { this.faceUp(); }
    }
    return hex;
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

  /** here we override for Meeple's y0 offset. */
  override hexUnderObj(hexMap: HexMap) {
    let dragObj = this;
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y + this.y0, hexMap.mapCont.hexCont)
    return hexMap.hexUnderPoint(pt.x, pt.y)
  }

  override isLegalTarget(hex: Hex) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    // no move onto other player's Tile: WHY NOT? ... allow Police to invade opponent's territory.
    // if (hex.tile?.player && hex.tile.player !== this.player) return false;
    return hex.isOnMap;
  }

  override dragStart(hex: Hex2): void {
    this.hex.tile?.setInfRays(this.hex.tile.inf); // removing meeple influence
    this.setInfRays(this.inf);  // show influence rays on this meeple
  }

  // Meeple
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    GamePlay.gamePlay.placeMeep(this, targetHex); // Drop
    const infP = this.hex?.getInfP(this.infColor) ?? 0;
    targetHex.tile?.setInfRays(infP);
    this.setInfRays(infP);
  }
}

export class Leader extends Meeple {
  /** new Civic Tile with a Leader 'on' it. */
  static makeLeaders(p: Player, nPolice = 10) {
    new Mayor(new TownStart(p))   // King
    new Priest(new Church(p))     // Bishop
    new Judge(new Courthouse(p))  // Queen
    new Chancellor(new University(p))   // Rook: Chariot, Rector, Count
  }

  civicTile: Civic;               // Leader deploys to civicTile & extra VP when on civicTile

  // VP bonus when Leader is on CivicTile
  override get vp()   { return super.vp   + (this.civicTile !== this.hex.tile ? 0 : TP.vpOnCivic); }
  // InfP bonus when Leader is on CivicTile [if enabled by TP.infOnCivic]
  override get infP() { return super.infP + (this.civicTile !== this.hex.tile ? 0 : TP.infOnCivic); }

  constructor(tile: Civic, abbrev: string) {
    super(`${abbrev}:${tile.player.index}`, tile.player, 1, 0, TP.leaderCost, TP.leaderEcon);
    this.civicTile = tile;
    const mark = this.addBonus('star');
    this.addChildAt(mark, 1); // move bonus-star just above MeepleShape
    this.paint()
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

  override isLegalTarget(hex: Hex) { // Leader
    if (!super.isLegalTarget(hex)) return false;
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

/** a Dispenser of a set of Tiles. */
export class TileSource<T extends Tile> {
  readonly Aname: string
  private readonly allUnits: T[] = new Array<T>();
  private available?: T[];
  readonly counter?: ValueCounter;

  availUnit(unit: T) {
    if (!this.available.includes(unit)) {
      this.available.push(unit);
      unit.hex = undefined;
      unit.visible = false;
    }
    this.updateCounter()
  }

  newUnit(unit: T) { this.allUnits.push(unit); this.availUnit(unit); }

  /** move next unit to source.hex, make visible */
  nextUnit() {
    let unit = this.available[0];
    if (!unit) return unit;
    unit.visible = true;
    unit.moveTo(this.hex);     // and try push to available
    this.available.shift();    // remove from available
    if (!unit.player) unit.paint(GamePlay.gamePlay.curPlayer?.color)
    this.updateCounter();
    return unit;
  }

  updateCounter() {
    this.counter.parent.setChildIndex(this.counter, this.counter.parent.numChildren - 1);
    this.counter?.setValue(this.available.length);
    this.hex.cont.updateCache(); // updateCache of counter on hex
    this.hex.map.update();       // updateCache of hexMap with hex & counter
  }

  constructor(type: new (...args: any) => T, public readonly player: Player, public readonly hex: Hex2) {
    this.Aname = `${type.name}-Source`
    this.available = this.allUnits.slice();
    this.counter = new ValueCounter(`${type.name}:${player?.index || 'any'}`, this.available.length, `lightblue`, TP.hexRad / 2);
    let cont = GamePlay.gamePlay.hexMap.mapCont.counterCont;
    let xy = hex.cont.localToLocal(0, -TP.hexRad/H.sqrt3, cont)
    this.counter.attachToContainer(cont, xy)
  }
}
class UnitSource<T extends Meeple> extends TileSource<T> {

}

class CriminalSource extends UnitSource<Criminal> {
  override availUnit(unit: Criminal): void {
    super.availUnit(unit);
    unit.autoCrime = false;
  }
  get hexMeep() { return this.hex.meep as Criminal; }
}

export class Police extends Meeple {
  static source: UnitSource<Police>[] = [];

  static makeSource(player: Player, hex: Hex2, n = 0) {
    let source = Police.source[player.index] = new UnitSource(Police, player, hex)
    for (let i = 0; i < n; i++) new Police(player, i + 1).homeHex = hex // dubious: (i+1) -- use serial?
    source.nextUnit();  // unit.moveTo(source.hex)
  }

  // Police
  constructor(player: Player, index: number) {
    super(`P:${player.index}-${index}`, player, 1, 0, TP.policeCost, TP.policeEcon);
    Police.source[player.index].newUnit(this);
  }

  override moveTo(hex: Hex) {
    let source = Police.source[this.player.index]
    let fromSrc = (this.hex == source.hex), toSrc = (hex == source.hex);
    super.moveTo(hex);
    if (toSrc && fromSrc) {
      // nothing
    } else if (toSrc) {
      // nothing
    } else if (fromSrc) {
      source.nextUnit()   // Police: shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  override isLegalTarget(hex: Hex) { // Police
    if (!super.isLegalTarget(hex)) return false;
    let sourceHex = Police.source[this.player.index].hex;
    if (this.hex == sourceHex && !(hex.tile instanceof PS)) return false;
    return true;
  }

  override sendHome(): void {
    let source = Police.source[GamePlay.gamePlay.curPlayer.index]
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}

/**
 * Criminal, Barbarian, Insurgent, Looter, Rioter...
 *
 * They swarm and destroy civil and economic resources:
 * if negative influence exceeds positive influence on hex, meep or tile is removed.
 *
 * Owned & Operated by Player, to destroy Tiles of the opposition.
 */
export class Criminal extends Meeple {
  static index = 0; // vs static override serial
  static source: CriminalSource;

  static makeSource(hex: Hex2, n = 0) {
    let source = Criminal.source = new CriminalSource(Criminal, undefined, hex)
    for (let i = 0; i < n; i++) new Criminal(i + 1).homeHex = hex;
    source.nextUnit(); // moveTo(source.hex)
  }

  autoCrime = false;  // set true for zero-econ for this unit.

  override get econ(): number { return this.autoCrime ? 0 : super.econ; }

  constructor(serial = ++Criminal.index) {
    super(`Barb-${serial}`, undefined, 1, 0, TP.criminalCost, TP.criminalEcon)
    Criminal.source.newUnit(this);
  }

  override get infColor(): "b" | "w" | "c" { return 'c'; }

  override paint(pColor = this.player?.color || 'c') {
    let r = (this.childShape as MeepleShape).radius, colorn = TP.colorScheme[pColor];
    let g = this.childShape.paint(C.BLACK);
    if (colorn)
      g.ss(3).s(colorn).dc(0, this.y0, r - 2) // stroke a colored ring inside black ring
    this.updateCache()
  }

  override moveTo(hex: Hex) {
    let source = Criminal.source
    let fromHex = this.hex;
    let toHex = super.moveTo(hex);
    let fromSrc = (fromHex == source.hex), toSrc = (toHex == source.hex);
    if (toSrc) {   // birth or recycle
      this.player = undefined;
      this.paint()
      this.updateCache()
    } else if (fromSrc) { // Assert: isOnMap from isLegalTarget
      this.player = GamePlay.gamePlay.curPlayer; // no hex for recycle... (prev curPlayer for autoCrime)
      this.paint()
      this.updateCache()
      source.nextUnit()   // Criminal: shift; moveTo(source.hex); update source counter
    }
    return toHex;
  }

  override canBeMovedBy(player: Player, ctx: DragContext): boolean {
    // TODO: allow to player move some autoCrime criminals
    if (!super.canBeMovedBy(player, ctx)) return false;
    return true;
  }

  override isLegalTarget(hex: Hex): boolean { // Criminal
    if (!super.isLegalTarget(hex)) return false;
    let plyr = this.player ?? GamePlay.gamePlay.curPlayer; // owner or soon-to-be owner
    // must NOT be on or adj to plyr's Tile:
    if (hex.tile?.player == plyr) return false;
    if (hex.findLinkHex(hex => { return (hex.tile?.player == plyr); })) return false;
    // must be on or adj to otherPlayer Tile OR aligned Criminal:
    if (hex.tile?.player && hex.tile.player !== plyr) return true;
    if (hex.findLinkHex(hex =>
      (hex.tile?.player && hex.tile.player !== plyr) ||
      ((hex.meep instanceof Criminal) && hex.meep.player === plyr))
      ) return true;
    return false;
  }

  override sendHome(): void {
    let source = Criminal.source
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}
