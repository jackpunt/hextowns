import { C, XY } from "@thegraid/common-lib";
import { Graphics, Shape } from "@thegraid/easeljs-module";
import { Hex, Hex2 } from "./hex";
import { H, HexDir } from "./hex-intfs";
import { PlayerColor, TP, playerColorRecord } from "./table-params";
import { Meeple } from "./meeple";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey2 = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
  static lightgrey_8 = 'rgb(225,225,225,.8)' // needs to contrast with WHITE influence lines
}

export interface PaintableShape extends Shape {
  /** paint with new player color; updateCache() */
  paint(colorn: string): Graphics;
}

/**
 * The colored PaintableShape that fills a Hex.
 * @param radius in call to drawPolyStar()
 */
export class HexShape extends Shape implements PaintableShape {
  constructor(
    readonly radius = TP.hexRad,
    readonly tiltDir: HexDir = 'NE',
  ) {
    super()
  }

  /** draw a Hexagon 1/60th inside the given radius */
  paint(color: string) {
    let g = this.graphics.c(), tilt = H.dirRot[this.tiltDir];
    return g.f(color).dp(0, 0, Math.floor(this.radius * 59 / 60), 6, 0, tilt);
  }
}

export class TileShape extends HexShape {
  static fillColor = C1.lightgrey_8;// 'rgba(200,200,200,.8)'

  paintDisk(colorn: string) {
    let r2 = this.radius * H.sqrt3 * .5 * (55 / 60);
    return this.graphics.f(TileShape.fillColor).dc(0, 0, r2)
  }

  /** colored HexShape filled with very-lightgrey disk: */
  override paint(colorn: string) {
    super.paint(colorn);                 // solid hexagon
    // calculate bounds of hexagon for cache:
    let r = this.radius, g = this.graphics, tilt = H.dirRot[this.tiltDir];
    let r2 = this.radius * H.sqrt3 * .5 * (55 / 60);
    // dp(...6), so tilt: 30 | 0; being nsAxis or ewAxis;
    let w = r * Math.cos(Hex2.degToRadians * tilt)
    let h = r * Math.cos(Hex2.degToRadians * (tilt - 30))
    this.cache(-w, -h, 2 * w, 2 * h);    // solid hexagon
    g.c().f(C.BLACK).dc(0, 0, r2)
    this.updateCache("destination-out"); // remove disk from solid hexagon
    g.c(); this.paintDisk(colorn)
    this.updateCache("source-over");     // fill with translucent disk
    return g;
  }
}

/** CapMark indicates if hex can be or has been captured. */
export class CapMark extends Shape {
  static capSize = TP.hexRad/4   // depends on HexMap.height
  static xyOffset = playerColorRecord<XY>({ x: -.5, y: .5 }, { x: .5, y: .5 }, { x: 0, y: -.6 })
  constructor(pc: PlayerColor, vis = true, xy = CapMark.xyOffset[pc], rad = TP.hexRad) {
    super()
    this.visible = vis;
    this.mouseEnabled = false;
    this.paint(TP.colorScheme[pc]);
    this.x = xy.x * rad;
    this.y = xy.y * rad;
  }
  // for each Player: hex.tile
  paint(color = Hex.capColor, vis = true) {
    this.graphics.c().f(color).dp(0, 0, CapMark.capSize, 6, 0, 30);
    this.visible = vis;
  }
}
export class MeepCapMark extends CapMark {
  static override xyOffset = playerColorRecord<XY>({ x: -.6, y: .5 }, { x: .6, y: .5 }, { x: 0, y: 1.5 })

  constructor(pc: PlayerColor, vis = true, xy = MeepCapMark.xyOffset[pc], rad = Meeple.radius) {
    super(pc, vis, xy, rad)
  }
}

export class LegalMark extends Shape {
  setOnHex(hex: Hex2) {
    let parent = hex.mapCont.markCont;
    this.mouseEnabled = false;
    this.graphics.f(C.legalGreen).dc(0, 0, TP.hexRad/2);
    hex.cont.parent.localToLocal(hex.x, hex.y, parent, this);
    this.mouseEnabled = false;
    this.visible = false;
    parent.addChild(this);
  }
}
