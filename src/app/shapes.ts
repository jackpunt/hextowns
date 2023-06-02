import { C, F, XY } from "@thegraid/common-lib";
import { Container, Graphics, Shape, Text } from "@thegraid/easeljs-module";
import type { Hex2 } from "./hex";
import { H, HexDir } from "./hex-intfs";
import { PlayerColor, PlayerColorRecord, TP, playerColorRecord } from "./table-params";
import type { Tile } from "./tile";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey2 = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
  static lightgrey_8 = 'rgb(225,225,225,.8)' // needs to contrast with WHITE influence lines
}

export class CenterText extends Text {
  constructor(text?: string, size = TP.hexRad / 2, color?: string) {
    super(text, F.fontSpec(size), color);
    this.textAlign = 'center';
    this.textBaseline = 'middle';
  }
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

/** lines showing influence of a Tile. */
export class InfRays extends Container {
  /**
   * draw 6 rays (around a HexShape)
   * @param inf number of rays to draw
   * @param infColor color of ray
   * @param y0 start of ray (ends at .9) X TP.hexRad
   * @param xw width of each ray
   */
  constructor(inf = 1, infColor?: PlayerColor, y0 = .7, xw = 3) {
    super()
    let color = infColor ? TP.colorScheme[infColor] : C.WHITE;
    let rad = TP.hexRad, y1 = y0 * rad, y2 = .9 * rad;
    let xs = [[0], [-.1 * rad, +.1 * rad], [-.1 * rad, 0, +.1 * rad]][Math.abs(inf) - 1];
    H.ewDirs.forEach(dir => {
      let sl = new Shape(), gl = sl.graphics
      gl.ss(xw).s(color)
      xs.forEach(x => gl.mt(x, y1).lt(x, y2))
      sl.rotation = H.dirRot[dir]
      this.addChild(sl)
    })
    this.cache(-rad, -rad, 2 * rad, 2 * rad)
  }
}

export class InfShape extends Container {
  /** hexagon scaled by TP.hexRad/4 */
  constructor(bgColor = 'grey') {
    super()
    let s = new Shape(), c = this;
    s.graphics.f(bgColor).dp(0, 0, TP.hexRad, 6, 0, 30)
    c.addChild(s)
    c.addChild(new InfRays(1, undefined, .3, 10)) // short & wide; it gets scaled down
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
    let w = r * Math.cos(H.degToRadians * tilt)
    let h = r * Math.cos(H.degToRadians * (tilt - 30))
    this.cache(-w, -h, 2 * w, 2 * h);    // solid hexagon
    g.c().f(C.BLACK).dc(0, 0, r2)
    this.updateCache("destination-out"); // remove disk from solid hexagon
    g.c(); this.paintDisk(colorn)
    this.updateCache("source-over");     // fill with translucent disk
    return g;
  }
}

function mulPCR(b: XY, w: XY, c: XY, scale: number) {
  const rv: PlayerColorRecord<XY> = playerColorRecord();
  const pcr = playerColorRecord(b, w, c);
  Object.keys(pcr).forEach((pc: PlayerColor) => { rv[pc] = { x: pcr[pc].x * scale, y: pcr[pc].y * scale } });
  return rv;
}

/** CapMark indicates if hex can be or has been captured. */
export class CapMark extends Shape {
  static capColor = H.capColor1    // dynamic bind in GamePlay.doProtoMove()
  static capSize = TP.hexRad / 4   // depends on HexMap.height
  static xyOffset = mulPCR({ x: -.5, y: .4 }, { x: .5, y: .4 }, { x: 0, y: -.6 }, TP.hexRad);
  constructor(pc: PlayerColor, vis = true, xy = CapMark.xyOffset[pc], rad = TP.hexRad) {
    super()
    this.visible = vis;
    this.mouseEnabled = false;
    this.paint(TP.colorScheme[pc]);
    this.setXY(pc);
  }

  setXY(pc: PlayerColor, tile?: Tile, cont?: Container, xyOff = CapMark.xyOffset) {
    const xy = xyOff[pc];
    tile?.localToLocal(xy.x, xy.y, cont, this);
    cont?.addChild(this);
  }

  // for each Player: hex.tile
  paint(color = CapMark.capColor, vis = true) {
    this.graphics.c().f(color).dp(0, 0, CapMark.capSize, 6, 0, 30);
    this.visible = vis;
  }
}

export class MeepCapMark extends CapMark {
  static override xyOffset = mulPCR({ x: -.6, y: .4 }, { x: .6, y: .4 }, { x: 0, y: 1.5 }, TP.meepleRad);

  override setXY(pc: PlayerColor, tile?: Tile, cont?: Container, xyOff = MeepCapMark.xyOffset) {
    super.setXY(pc, tile, cont, xyOff);
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
