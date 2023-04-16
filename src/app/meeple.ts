import { C } from "@thegraid/common-lib";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Hex2, HexShape } from "./hex";
import { EwDir } from "./hex-intfs";
import { Player } from "./player";
import { Church, Civic, Tile, TownHall, TownStart, University } from "./tile";
import { newPlanner } from "./plan-proxy";
import { TP } from "./table-params";

export class Meeple extends Tile {

  readonly colorValues = C.nameToRgba("blue"); // with alpha component

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
    //this.startHex = player.meepleHex.find(hex => hex.Aname.startsWith(Aname.substring(0, 5)))
  }
  override get radius() { return TP.hexRad / 1.2 }

  /** move to hex, incur cost to fuel.
   * @return false if move not possible (no Hex, insufficient fuel)
   */
  move(dir: EwDir, hex = this.hex.nextHex(dir)) {
    if (hex.occupied) return false;
    this.hex = hex;
    hex.map.update()    // TODO: invoke in correct place...
    return true
  }

  startHex: Hex2;       // player.meepleHex[]
  civicTile: Civic;
  originHex: Hex2;      // where meeple was picked [dragStart]
  targetHex: Hex2;      // where meeple was placed [dropFunc] (if legal dropTarget; else originHex)
  lastShift: boolean;

  isLegalTarget(hex: Hex2) {
    if (!hex) return false;
    if (hex.occupied) return false;
    // can move from startHex to civicTile
    if (this.originHex == this.startHex && hex.tile == this.civicTile) return true
    return false;
  }
  // highlight legal targets, record targetHex when meeple is over a legal target hex.
  dragFunc(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2  // player.meepleHex[]
      this.targetHex = this.originHex;
      this.lastShift = undefined
    }
    if (this.isLegalTarget(hex)) {
      this.targetHex = hex
      //hex.showMark(true);
    } else {
      this.targetHex = this.originHex;
      //hex.showMark(false)
    }
    if (!hex || hex.occupied) return; // do not move over non-existant or occupied hex

    const shiftKey = ctx?.event?.nativeEvent?.shiftKey
    if (shiftKey === this.lastShift && !ctx?.first && this.targetHex === hex) return;   // nothing new (unless/until ShiftKey)
    this.lastShift = shiftKey
    // do shift-down/shift-up actions...
  }

  dropFunc(hex: Hex2, ctx: DragInfo) {
    this.hex = this.targetHex
    this.hex.meep = this;
    //
    this.lastShift = undefined
  }

  dragBack() {
    this.hex = this.targetHex = this.originHex
    this.originHex.meep = this;
    this.hex.map.update()
  }
  dragAgain() {
    let targetHex = this.targetHex;
    // this.pCont.removeAllChildren()
    this.dragBack()
    this.dragFunc(this.hex as Hex2, undefined); // targetHex = this.hex; removeChildren
    this.hex.map.update()
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
    this.player.meeples.push(this);
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
  static index = 0;
  constructor(player: Player) {
    super(`P:${player.index}-${Police.index++}`, player)
  }
}
