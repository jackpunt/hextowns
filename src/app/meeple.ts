import { C, className } from "@thegraid/common-lib";
import { DragInfo, ValueCounter } from "@thegraid/easeljs-lib";
import { Hex, Hex2, HexMap, HexShape } from "./hex";
import { EwDir, H } from "./hex-intfs";
import { Player } from "./player";
import { C1, Church, Civic, InfMark, PS, PaintableShape, Tile, TownHall, TownStart, University } from "./tile";
import { newPlanner } from "./plan-proxy";
import { TP } from "./table-params";
import { Shape } from "@thegraid/easeljs-module";
import { DragContext } from "./table";
import { GamePlay } from "./game-play";

class MeepleShape extends Shape implements PaintableShape {
  constructor(public player: Player, public radius = TP.hexRad * .4, public y0 = radius * 5 / 6) {
    super()
  }
  paint(colorn = this.player?.colorn || C1.grey) {
    let x0 = 0, y0 = this.y0, r = this.radius;
    let g = this.graphics.c().ss(2)
    g.s(colorn).dc(x0, y0, r - 1)
    g.f('rgba(250,250,250,.8)').dc(x0, y0, r - 1)
    this.setBounds(x0 - r, y0 - r, 2 * r, 2 * r)
    return g
  }
}

type MeepleInf = -1 | 0 | 1;
export class Meeple extends Tile {
  static allMeeples = [];

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get y0() { return (this.childShape as MeepleShape).y0; }

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
    this.player = player
    let { x, y, width, height } = this.childShape.getBounds()
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

  startHex: Hex2;       // in player.meepleHex[]

  override get radius() { return TP.hexRad / 1.9 }
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): PaintableShape { return new MeepleShape(this.player); }


   // Meeple
  /** decorate with influence rays (white or black)
   * @param inf +1 | -1
   */
  override setInfMark(inf: number): void {
    this.removeChildType(InfMark)
    if (inf !== 0) {
      this.addChildAt(new InfMark(inf), this.children.length - 1)
    }
    let radxy = -TP.hexRad, radwh = 2 * TP.hexRad
    this.cache(radxy, radxy, radwh, radwh)
  }

  /** override for Meeple's y0 offset. */
  override hexUnderObj(hexMap: HexMap) {
    let dragObj = this;
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y + this.y0, hexMap.mapCont.hexCont)
    return hexMap.hexUnderPoint(pt.x, pt.y)
  }

  override isLegalTarget(hex: Hex) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    // no move onto other player's Tile:
    if (hex.tile?.player && hex.tile.player !== this.player) return false;
    return hex.isOnMap;
  }

  override dragStart(hex: Hex2): void {
    this.hex.tile?.setInfMark(this.hex.tile.inf); // removing meeple influence
    this.setInfMark(this.inf);  // show influence rays on this meeple
  }

  // Meeple
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    this.dropInf(targetHex);   // setInfMark
    super.dropFunc(targetHex, ctx);
  }

  dropInf(targetHex: Hex2): void {
    let targetTile = targetHex.tile
    let totalInf = this.inf + (targetTile?.inf ?? 0);
    targetTile?.setInfMark(totalInf);
    this.setInfMark(totalInf);
  }
}

export class Leader extends Meeple {
  constructor(tile: Civic, abbrev: string) {
    super(`${abbrev}:${tile.player.index}`, tile.player, 1, 1, 1, -6); // 6 Econ to place/maintain
    this.civicTile = tile;
    this.addBonus('star');
    this.paint()
  }
  /** new Civic Tile with a Leader 'on' it. */
  static makeLeaders(p: Player, nPolice = 10) {
    new Builder(new TownStart(p)) // Rook: Chariot, Rector, Count
    new Mayor(new TownHall(p))    // King
    new Dean(new University(p))   // Queen
    new Priest(new Church(p))     // Bishop
  }
  civicTile: Civic;     // the special tile for this Meeple/Leader

  override isLegalTarget(hex: Hex) { // Leader
    if (!super.isLegalTarget(hex)) return false;
    if (!this.hex.isOnMap && (hex !== this.civicTile.hex)) return false; // deploy ONLY to civicTile
    return true
  }

}
export class Builder extends Leader {
  constructor(tile: Civic) {
    super(tile, 'B')
  }
}

export class Mayor extends Leader {
  constructor(tile: Civic) {
    super(tile, 'M')
  }
}

export class Dean extends Leader {
  constructor(tile: Civic) {
    super(tile, 'D')
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
class UnitSource<T extends Meeple> extends TileSource<Meeple> {

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
    super(`P:${player.index}-${index}`, player, 1, 0, 1, -2); // 2 Econ to place & maintain
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
 * Not owned by any Player, are played against the opposition.
 */
export class Criminal extends Meeple {
  static index = 0; // vs static override serial
  static source: UnitSource<Criminal>;

  static makeSource(hex: Hex2, n = 0) {
    let source = Criminal.source = new UnitSource(Criminal, undefined, hex)
    for (let i = 0; i < n; i++) new Criminal(i + 1).homeHex = hex;
    source.nextUnit(); // moveTo(source.hex)
  }

  constructor(serial = ++Criminal.index) {
    super(`Barb-${serial}`, undefined, -1, 0, 0, -3) // 3 econ to place; not to maintain.
    Criminal.source.newUnit(this);
  }

  override paint(pColor = this.player?.color) {
    let r = (this.childShape as MeepleShape).radius, colorn = TP.colorScheme[pColor];
    this.childShape.paint(C.BLACK);
    if (colorn)
      this.childShape.graphics.ss(3).s(colorn).dc(0, this.y0, r - 2)
    this.updateCache()
  }

  override moveTo(hex: Hex) {
    let source = Criminal.source
    let fromSrc = (this.hex == source.hex), toSrc = (hex == source.hex);
    super.moveTo(hex);
    if (toSrc && fromSrc) {
      // nothing
    } else if (toSrc) {
      this.player = undefined;
      this.paint()
      this.updateCache()
    } else if (fromSrc) {
      this.player = GamePlay.gamePlay.curPlayer; // no hex for recycle...
      this.paint()
      this.updateCache()
      source.nextUnit()   // Criminal: shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  super_isLegalTarget(hex: Hex) {
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    // Criminal can/must move onto other player tile!
    // if (hex.tile?.player && hex.tile.player !== this.player) return false;
    return hex.isOnMap;
  }

  override isLegalTarget(hex: Hex): boolean { // Criminal
    if (!this.super_isLegalTarget(hex)) return false;
    let curPlayer = GamePlay.gamePlay.curPlayer
    if (this.player && this.player !== curPlayer) return false;  // may not move Criminals placed by opponent.
    let otherPlayer = curPlayer.otherPlayer();
    // must NOT be on or adj to curPlayer Tile:
    if (hex.tile?.player == curPlayer) return false;
    if (hex.neighbors.find(hex => hex.tile?.player == curPlayer)) return false;
    // must be on or adj to otherPlayer Tile:
    if (hex.tile?.player && hex.tile.player !== curPlayer) return true;
    if (hex.neighbors.find(hex => hex.tile?.player && hex.tile.player !== curPlayer)) return true;
    return false;
  }

  override sendHome() {
    let source = Criminal.source
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}
