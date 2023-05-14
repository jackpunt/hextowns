import { C, XY } from "@thegraid/common-lib";
import { Graphics, Shape } from "@thegraid/easeljs-module";
import { Hex, Hex2 } from "./hex";
import { H, HexDir } from "./hex-intfs";
import { PlayerColor, TP, playerColorRecord } from "./table-params";

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

/** CapMark indicates if hex has been captured. */
export class CapMark extends Shape {
  static capSize = TP.hexRad/4   // depends on HexMap.height
  static xyOffset = playerColorRecord<XY>({ x: -.3, y: -.5 }, { x: .3, y: -.5 }, { x: 0, y: .3 })
  constructor(hex: Hex2, pc: PlayerColor, vis = true) {
    super()
    let parent = hex.mapCont.markCont;
    this.paint(TP.colorScheme[pc]);
    let { x, y } = CapMark.xyOffset[pc];
    hex.cont.parent.localToLocal(hex.x + x * TP.hexRad, hex.y + y * TP.hexRad, parent, this);
    this.visible = vis;
    this.mouseEnabled = false;
    parent.addChild(this)
  }
  // for each Player: hex.tile
  paint(color = Hex.capColor, vis = true) {
    this.graphics.c().f(color).dp(0, 0, CapMark.capSize, 6, 0, 30);
    this.visible = vis;
  }
}

export class LegalMark extends Shape {
  constructor(hex: Hex2) {
    super();
    let parent = hex.mapCont.markCont;
    this.graphics.f(C.legalGreen).dc(0, 0, TP.hexRad/2);
    //this.paint(C.legalGreen);
    hex.cont.parent.localToLocal(hex.x, hex.y, parent, this);
    this.mouseEnabled = false;
    this.visible = false;
    parent.addChild(this);
  }
}
