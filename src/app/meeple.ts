import { C } from "@thegraid/common-lib";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Hex, Hex2, HexShape } from "./hex";
import { EwDir, H } from "./hex-intfs";
import { Player } from "./player";
import { C1, Church, Civic, PaintableShape, Tile, TownHall, TownStart, University } from "./tile";
import { newPlanner } from "./plan-proxy";
import { TP } from "./table-params";
import { Shape } from "@thegraid/easeljs-module";

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

  newTurn() { this.moved = false; }

  /**
   * @param Aname
   * @param player (undefined for Chooser)
   * @param civicTile Tile where this Meeple spawns
   */
  constructor(
    Aname: string,
    player?: Player,
    civicTile?: Civic,
  ) {
    super(player, Aname, 2, 1, 1, 0);
    this.player = player
    this.civicTile = civicTile;
    let { x, y, width, height } = this.childShape.getBounds()
    this.nameText.visible = true
    this.nameText.y = y + height/2 - Tile.textSize/2;
    this.cache(x, y, width, height);
    this.paint()
    this.player.meeples.push(this);
  }

  override get radius() { return TP.hexRad / 1.9 }
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): PaintableShape { return new MeepleShape(this.player); }


  override paint(pColor = this.player?.color) {
    let color = pColor ? TP.colorScheme[pColor] : C1.grey;
    let g = this.childShape.paint(color)
    this.updateCache()
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
    if (this.hex) this.hex.meep = undefined; // remove from prior!
    this.hex = hex;
    hex.meep = this;
    return hex;
  }

  /** the map Hex on which this Meeple sits. */
  override get hex() { return this._hex; }
  /** only one Meep on a Hex, Meep on only one Hex */
  override set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.meep = undefined
    this._hex = hex
    if (hex !== undefined) hex.meep = this;
  }

  startHex: Hex2;       // player.meepleHex[]
  civicTile: Civic;

  override isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.meep) return false;
    // can move from startHex to civicTile
    //if (this.originHex == this.startHex && hex.tile == this.civicTile) return true
    return true;
  }

  // false if [still] available to move this turn
  moved = true;
  /** continue any planned, semi-auto moves toward this.targetHex */
  shipMove() {
    this.moved = this.takeSteps();
    return this.moved; // NOTE: other Steps still in progress!
  }

  takeSteps() {
    return true
  }
}
export class Leader extends Meeple {
  constructor(tile: Civic, abbrev: string) {
    super(`${abbrev}-${tile.player.index}`, tile.player, tile)
  }
  /** new Civic Tile with a Leader 'on' it. */
  static makeLeaders(p: Player, nPolice = 10) {
    new Builder(new TownStart(p))
    new Mayor(new TownHall(p))
    new Dean(new University(p))
    new Priest(new Church(p))
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
export class Police extends Meeple {
  constructor(player: Player, index: number) {
    super(`P:${player.index}-${index+1}`, player)
  }
  override moveTo(hex: Hex) {
    let origHex = this.hex, academy = this.player.policeAcademy.hex;
    super.moveTo(hex);
    if (origHex == academy && hex !== academy) {
      this.player.recruitPolice()   // shift, moveTo(hex), update counter on academy
    }
    return hex;
  }
}
