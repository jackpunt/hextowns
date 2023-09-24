import { C, F, XY, XYWH, className } from "@thegraid/common-lib";
import { Container, DisplayObject, Graphics, Shape, Text } from "@thegraid/easeljs-module";
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

export interface Paintable extends DisplayObject {
  /** paint with new player color; updateCache() */
  paint(colorn: string, force?: boolean): Graphics;
}

/** Color Graphics Function */
export type CGF = (color?: string) => Graphics;

export class ColorGraphics extends Graphics {

  static circleShape(rad = 30, fillc0 = C.white, strokec = C.black, g0?: Graphics): CGF {
    return (fillc = fillc0) => {
      const g = g0?.clone() ?? new Graphics();
      (fillc ? g.f(fillc) : g.ef());
      (strokec ? g.s(strokec) : g.es());
      g.dc(0, 0, rad);
      return g;
    }
  }
}
/**
 * Usage:
 * - ps = super.makeShape(); // ISA PaintableShape
 * - ps.gf = (color) => new CG(color);
 * - ...
 * - ps.paint(red); --> ps.graphics = gf(red) --> new CG(red);
 * -
 * - const cgf: CGF = (color: string) => {
 * -     return new Graphics().f(this.color).dc(0, 0, rad);
 * -   }
 * - }
 */

export class PaintableShape extends Shape implements Paintable {
  constructor(public _cgf: CGF, public colorn?: string) {
    super();
    this.name = className(this);
  }
  get cgf() { return this._cgf; }
  set cgf(cgf: CGF) {
    this._cgf = cgf;
    if (this.cgfGraphics) {
      this.cgfGraphics = undefined;
      this.paint(this.colorn);
    }
  }
  /** previous/current graphics that were rendered. */
  cgfGraphics: Graphics;
  /** render graphics from cgf. */
  paint(colorn: string = this.colorn, force = false): Graphics {
    if (force || this.graphics !== this.cgfGraphics || this.colorn !== colorn) {
      // need to repaint, even if same color:
      this.graphics.clear();
      this.graphics = this.cgfGraphics = this.cgf(this.colorn = colorn);
      if (this.updateCacheInPaint && this.cacheID) this.updateCache();
    }
    return this.graphics;
  }
  updateCacheInPaint = true;
}

/**
 * The colored PaintableShape that fills a Hex.
 * @param radius in call to drawPolyStar()
 */
export class HexShape extends PaintableShape {
  constructor(
    readonly radius = TP.hexRad,
    readonly tilt = TP.useEwTopo ? 30 : 0,  // ewTopo->30, nsTopo->0
  ) {
    super((fillc) => this.hscgf(fillc));
    this.setHexBounds(radius, tilt); // Assert: radius & tilt are readonly, so bounds never changes!
  }

  setCacheID() {
    const b = this.getBounds();              // Bounds are set
    this.cache(b.x, b.y, b.width, b.height);
  }

  setHexBounds(r = this.radius, tilt = this.tilt) {
    // dp(...6), so tilt: 30 | 0; being nsAxis or ewAxis;
    const w = r * Math.cos(H.degToRadians * tilt);
    const h = r * Math.cos(H.degToRadians * (tilt - 30));
    this.setBounds(-w, -h, 2 * w, 2 * h);
    return { x: -2, y: -H, w: 2 * w, h: 2 * h };
  }

  /**
   * Draw a Hexagon 1/60th inside the given radius.
   * overrides should include call to setHexBounds(radius, angle)
   * or in other way setBounds().
   */
  hscgf(color: string) {
    return this.graphics.f(color).dp(0, 0, Math.floor(this.radius * 59 / 60), 6, 0, this.tilt); // 30 or 0
  }
}


export class CircleShape extends PaintableShape {
  g0: Graphics;
  constructor(public fillc = C.white, public rad = 30, public strokec = C.black, g0?: Graphics) {
    super((fillc) => this.cscgf(fillc));
    this.g0 = g0?.clone();
    this.paint(fillc);
  }

  cscgf(fillc: string) {
    const g = this.g0 ? this.g0.clone() : new Graphics();
    ((this.fillc = fillc) ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.dc(0, 0, this.rad);  // presumably easlejs can determine Bounds of Circle.
    return g;
  }
}
export class PolyShape extends PaintableShape {
  g0: Graphics;
  constructor(public nsides = 4, public tilt = 0, public fillc = C.white, public rad = 30, public strokec = C.black, g0?: Graphics) {
    super((fillc) => this.pscgf(fillc));
    this.g0 = g0?.clone();
    this.paint(fillc);
  }

  pscgf(fillc: string) {
    const g = this.g0 ? this.g0.clone() : new Graphics();
    ((this.fillc = fillc) ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.dp(0, 0, this.rad, this.nsides, 0, this.tilt * H.degToRadians);
    return g;
  }
}
export class RectShape extends PaintableShape {
  static rectWHXY(w: number, h: number, x = -w / 2, y = -h / 2, g0 = new Graphics()) {
    return g0.dr(x, y, w, h)
  }
  /** draw rectangle suitable for given Text; with border, textAlign. */
  static rectText(t: Text | string, fs?: number, b?: number, align = (t instanceof Text) ? t.textAlign : 'center', g0 = new Graphics()) {
    const txt = (t instanceof Text) ? t : new CenterText(t, fs ?? 30);
    txt.textAlign = align;
    if (txt.text === undefined) return g0; // or RectShape.rectWHXY(0,0,0,0); ??
    if (fs === undefined) fs = txt.getMeasuredHeight();
    if (b === undefined) b = fs * .1;
    const txtw = txt.getMeasuredWidth(), w = b + txtw + b, h = b + fs + b;
    const x = (align == 'right') ? w-b : (align === 'left') ? -b : w / 2;
    return RectShape.rectWHXY(w, h, -x, -h / 2, g0);
  }

  g0: Graphics;
  rect: XYWH;
  constructor({ x = 0, y = 0, w = 30, h = 30 }: XYWH, public fillc = C.white, public strokec = C.black, g0?: Graphics) {
    super((fillc) => this.rscgf(fillc));
    this.rect = { x, y, w: w, h: h }
    this.g0 = g0?.clone();
    this.paint(fillc);
    const g = this.graphics;
    if (fillc) g.f(fillc);
    if (strokec) g.s(strokec);
    g.dr(x ?? 0, y ?? 0, w ?? 30, h ?? 30);
  }

  rscgf(fillc: string) {
    const g = this.g0 ? this.g0.clone() : new Graphics();
    const { x, y, w, h } = this.rect;
    (fillc ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.dr(x ?? 0, y ?? 0, w ?? 30, h ?? 30);
    return g;
  }
}

/** lines showing influence of a Tile. */
export class InfRays extends Shape {
  /**
   * draw 6 rays (around a HexShape)
   * @param inf number of rays to draw (degree of influence)
   * @param infColor color of ray
   * @param yIn start ray @ yIn X TP.hexRad
   * @param yOut end ray @ YOut X TP.hexRad
   * @param xw width of each ray
   */
  constructor(inf = 1, colorn: string, yIn = .7, yOut = .9, xw = 3, g = new Graphics()) {
    super(g);
    const rad = TP.hexRad, y1 = yIn * rad, y2 = yOut * rad;
    const xs = [[0], [-.1 * rad, +.1 * rad], [-.1 * rad, 0, +.1 * rad]][Math.abs(inf) - 1];
    const pts = xs.map(x => { return { mt: { x: x, y: y1 }, lt: { x: x, y: y2 } } })
    const rotpt = (rot: number, x: number, y: number) => {
      return { x: Math.cos(rot) * x + Math.sin(rot) * y, y: Math.cos(rot) * y - Math.sin(rot) * x }
    }
    g.ss(xw).s(colorn);
    const hexDirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;
    hexDirs.forEach((dir: HexDir) => {
      const rot = H.ewDirRot[dir] * H.degToRadians;
      pts.forEach(mtlt => {
        const mt = rotpt(rot, mtlt.mt.x, mtlt.mt.y), lt = rotpt(rot, mtlt.lt.x, mtlt.lt.y);
        g.mt(mt.x, mt.y).lt(lt.x, lt.y);
      });
    })
    this.cache(-rad, -rad, 2 * rad, 2 * rad);
  }
}

export class InfShape extends PaintableShape {
  /** hexagon scaled by TP.hexRad/4 */
  constructor(bgColor = 'grey') {
    super((fillc) => this.iscgf(fillc));
    this.paint(bgColor);
  }

  iscgf(colorn: string) {
    const g = this.graphics;
    g.c().f(colorn).dp(0, 0, TP.hexRad, 6, 0, 30);
    new InfRays(1, undefined, .3, .9, 10, g); // short & wide; it gets scaled down
    return this.graphics;
  }
}
export class TileShape extends HexShape {
  static fillColor = C1.lightgrey_8;// 'rgba(200,200,200,.8)'

  constructor(radius?: number, tilt?: number) {
    super(radius, tilt); // sets Bounnds & this.cgf
    this.cgf = this.tscgf;
    this.updateCacheInPaint = false;
  }

  replaceDisk(colorn: string, r2 = this.radius) {
    if (!this.cacheID) this.setCacheID();
    else this.updateCache();               // write curent graphics to cache
    const g = this.graphics;
    g.c().f(C.BLACK).dc(0, 0, r2);       // bits to remove
    this.updateCache("destination-out"); // remove disk from solid hexagon
    g.c().f(colorn).dc(0, 0, r2);        // fill with translucent disk
    this.updateCache("source-over");     // update with new disk
    return g;
  }
  /** colored HexShape filled with very-lightgrey disk: */
  tscgf(colorn: string, super_cgf: CGF = this.hscgf) {
    super_cgf.call(this, colorn); // paint HexShape(colorn)
    const g = this.replaceDisk(TileShape.fillColor, this.radius * H.sqrt3_2 * (55 / 60));
    return g;
  }
}


/** add to Tile to indicate nB, fB, nR, fR.
 * nB is blue disk, fB is blue circle.
 * nR is tan disk, fR is tan circle.
 */
export class BalMark extends Shape {
  static bColor = 'rgba(133,193,233,.8)';
  static rColor = 'rgba(200,180,160,.8)';

  constructor(tile: Tile) {
    super();
    this.name = className(this);
    const { nB, fB, nR, fR } = tile, x0 = TP.hexRad * H.sqrt3_2 * .75;
    this.bMark(nB, fB, x0-5, BalMark.bColor);
    this.bMark(nR, fR, x0-0, BalMark.rColor);
  }

  bMark(n = 0, f = 0, x = 0, color = C.black, ds = [5, 5]) {
    if (n + f <= 0) return;
    const g = this.graphics, y = TP.hexRad / 4;
    if (n) { g.ss(4) } else { g.sd(ds) };
    g.s(color).mt(-x, y).lt(x, y);
    return;
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
  hex2: Hex2;
  setOnHex(hex: Hex2) {
    this.hex2 = hex;
    const parent = hex.mapCont.markCont;
    this.graphics.f(C.legalGreen).dc(0, 0, TP.hexRad/2);
    hex.cont.parent.localToLocal(hex.x, hex.y, parent, this);
    this.hitArea = hex.hexShape; // legal mark is used for hexUnderObject, so need to cover whole hex.
    this.mouseEnabled = true;
    this.visible = false;
    parent.addChild(this);
  }
}

export class UtilButton extends Container implements Paintable {
  blocked: boolean = false
  shape: PaintableShape;
  label: CenterText;
  get label_text() { return this.label.text; }
  set label_text(t: string) {
    this.label.text = t;
    this.paint(undefined, true);
  }

  constructor(color: string, text: string, public fontSize = 30, public textColor = C.black, cgf?: CGF) {
    super();
    this.label = new CenterText(text, fontSize, textColor);
    this.shape = new PaintableShape(cgf ?? ((c) => this.ubcsf(c)));
    this.shape.paint(color);
    this.addChild(this.shape, this.label);
  }

  ubcsf(color: string) {
    return RectShape.rectText(this.label.text, this.fontSize, this.fontSize * .3, this.label.textAlign, new Graphics().f(color))
  }

  paint(color = this.shape.colorn, force = false ) {
    return this.shape.paint(color, force);
  }

  /**
   * Repaint the stage with button visible or not.
   *
   * Allow Chrome to finish stage.update before proceeding with afterUpdate().
   *
   * Other code can watch this.blocked; then call updateWait(false) to reset.
   * @param hide true to hide and disable the turnButton
   * @param afterUpdate callback ('drawend') when stage.update is done [none]
   * @param scope thisArg for afterUpdate [this TurnButton]
   */
  updateWait(hide: boolean, afterUpdate?: (evt?: Object, ...args: any) => void, scope: any = this) {
    this.blocked = hide;
    this.visible = this.mouseEnabled = !hide
    // using @thegraid/easeljs-module@^1.1.8: on(once=true) will now 'just work'
    afterUpdate && this.stage.on('drawend', afterUpdate, scope, true)
    this.stage.update()
  }
}

export class EdgeShape extends Shape {
  constructor(public color: string, public hex: Hex2, public dir: HexDir, parent: Container) {
    super()
    this.reset()
    parent.addChild(this);
  }
  reset(color = this.color) { this.graphics.c().ss(12, 'round', 'round').s(color) }
}
