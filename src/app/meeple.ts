import { C, className } from "@thegraid/common-lib";
import { DragInfo, ValueCounter } from "@thegraid/easeljs-lib";
import { Hex, Hex2, HexShape } from "./hex";
import { EwDir, H } from "./hex-intfs";
import { Player } from "./player";
import { C1, Church, Civic, InfMark, PS, PaintableShape, Tile, TownHall, TownStart, University } from "./tile";
import { newPlanner } from "./plan-proxy";
import { TP } from "./table-params";
import { Shape } from "@thegraid/easeljs-module";
import { Table } from "./table";

class MeepleShape extends Shape implements PaintableShape {
  constructor(public player: Player, public radius = TP.hexRad * .4, public y0 = radius - 4) {
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
export class Meeple extends Tile {

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get y0() { return (this.childShape as MeepleShape).y0; }

  newTurn() { }

  /**
   * Meeple - Leader, Police, Criminal
   * @param Aname
   * @param player (undefined for Chooser)
   * @param civicTile Tile where this Meeple spawns
   */
  constructor(
    Aname: string,
    player?: Player,
    inf = 1,   // -1 for Criminal
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
    this.player?.meeples.push(this);
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


  override setInfMark(inf?: number): void {
    // do nothing; use setTileInf(inf)
  }

  setTileInf(inf: number) {
    this.removeChildType(InfMark)
    if (inf !== 0) {
      this.addChildAt(new InfMark(inf), this.children.length - 1)
    }
    let radxy = -TP.hexRad, radwh = 2 * TP.hexRad
    this.cache(radxy, radxy, radwh, radwh)
  }

  override isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    // no move onto other player's Tile:
    if (hex.tile?.player && hex.tile.player !== this.player) return false;
    return hex.isOnMap;
  }

  override dragStart(hex: Hex2): void {
    if (this.inf !== 0) this.setTileInf(this.inf);
  }

  /** move in direction.
   * @return false if move not possible (no Hex, occupied)
   */
  moveDir(dir: EwDir, hex = this.hex.nextHex(dir)) {
    if (hex.meep) return false;
    this.moveTo(hex);
    hex.map.update()    // TODO: invoke in correct place...
    return true
  }

  override moveTo(hex: Hex) {
    //this.hex ? this.hex.tile
    this.hex = hex;
    return hex
  }
}
export class Leader extends Meeple {
  constructor(tile: Civic, abbrev: string) {
    super(`${abbrev}-${tile.player.index}`, tile.player, 1, 1, 1, -6); // 6 Econ to place/maintain
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

  override isLegalTarget(hex: Hex2) {
    if (!super.isLegalTarget(hex)) return false;
    if (this.civicTile && (this.civicTile !== hex.tile) && !(this instanceof Builder)) return false;
    return true
  }

  override dragStart(hex: Hex2): void {
      this.civicTile?.setInfMark(1);
      this.setTileInf(1);
  }

  override dropFunc(hex: Hex2, ctx: DragInfo): void {
    let targetTile = this.targetHex.tile;
    if (this.civicTile && this.civicTile === targetTile) {
      this.civicTile.setInfMark(2)
      this.setTileInf(0);
    }
    super.dropFunc(hex, ctx)
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

class UnitSource<T extends Meeple> {
  readonly Aname: string
  allUnits: T[] = new Array<T>();
  available?: T[];
  counter?: ValueCounter;

  nextUnit(spawn = true) {
    let source = this
    if (!spawn) source.available = source.allUnits.slice();
    let unit = source.available.shift()
    unit?.moveTo(source.hex);
    source.counter?.setValue(source.available.length);
    source.hex.cont.updateCache(); // updateCache of counter on hex
    source.hex.map.update();       // updateCache of hexMap with hex & counter
    return unit;
  }

  constructor(type: new (...args: any) => T, public readonly player: Player, public readonly hex: Hex2) {
    this.Aname = `${type.name}-Source`
    this.available = this.allUnits.slice();
    this.counter = new ValueCounter(`${type.name}:${player?.index || 'any'}`, this.available.length, `lightblue`, TP.hexRad / 2);
    this.counter.attachToContainer(hex.cont, { x: 0, y: -TP.hexRad / 2 })
  }
}

export class Police extends Meeple {
  private static source: UnitSource<Police>[] = [];

  static makeSource(player: Player, hex: Hex2, n = 0) {
    let source = Police.source[player.index] = new UnitSource(Police, player, hex)
    for (let i = 0; i < n; i++) new Police(player, i + 1)
    source.nextUnit(false) // unit.moveTo(source.hex)
  }

  // Police
  constructor(player: Player, index: number) {
    super(`P:${player.index}-${index+1}`, player, 1, 0, 1, -2); // 2 Econ to place & maintain
    Police.source[player.index].allUnits.push(this);
  }

  override moveTo(hex: Hex) {
    let source = Police.source[this.player.index], sourceHex = source.hex;
    super.moveTo(hex);
    if (this.originHex == sourceHex && hex !== sourceHex) {
      Police.source[this.player.index].nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  override isLegalTarget(hex: Hex2): boolean {
    if (!super.isLegalTarget(hex)) return false;
    let sourceHex = Police.source[this.player.index].hex;
    if (this.originHex == sourceHex) return (hex.tile instanceof PS)
    return true;
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
  static index = 0;
  static source: UnitSource<Criminal>;

  static makeSource(hex: Hex2, n = 0) {
    let source = Criminal.source = new UnitSource(Criminal, undefined, hex)
    for (let i = 0; i < n; i++) new Criminal(i + 1);
    source.nextUnit(false); // moveTo(source.hex)
  }

  constructor(index = ++Criminal.index) {
    super(`Barb-${index}`, undefined, -1, 0, 0, -3) // 3 econ to place; not to maintain.
    Criminal.source.allUnits.push(this);
  }

  override paint(pColor = this.player?.color) {
    let r = (this.childShape as MeepleShape).radius, colorn = TP.colorScheme[pColor];
    this.childShape.paint(C.BLACK);
    if (colorn)
      this.childShape.graphics.ss(3).s(colorn).dc(0, this.y0, r - 2)
    this.updateCache()
  }

  override moveTo(hex: Hex) {
    let sourceHex = Criminal.source.hex
    super.moveTo(hex);
    if (this.originHex == sourceHex && hex !== sourceHex) {
      if (!this.player) {
        this.player = (hex instanceof Hex2) && Table.stageTable(hex.cont).gamePlay.curPlayer; // no hex for recycle...
        this.paint()
        this.updateCache()
      }
      Criminal.source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
    return hex;
  }
  super_isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    // Criminal can/must move onto other player tile!
    // if (hex.tile?.player && hex.tile.player !== this.player) return false;
    return hex.isOnMap;
  }
  override isLegalTarget(hex: Hex2): boolean {
    if (!this.super_isLegalTarget(hex)) return false;
    let curPlayer = Table.stageTable(hex.cont).gamePlay.curPlayer
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
}
