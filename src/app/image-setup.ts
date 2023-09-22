import { Params } from "@angular/router";
import { C, stime } from "@thegraid/common-lib";
import { makeStage } from "@thegraid/easeljs-lib";
import { Bitmap, Container } from "@thegraid/easeljs-module";
import { HexShape } from "./shapes";
import { TP } from "./table-params";
import { Tile } from "./tile";

export type GridDesc = {
  width: number,  // canvas size
  height: number, // canvas size
  x0?: number,
  y0?: number,
  delx?: number,
  dely?: number,
  dpi?: number,
  bleed?: number,
  rad?: number,
}
export class ImageSetup {
  circle_1_inch: GridDesc = {
    width: 8.433, height: 10.967, // not quite 8.5 X 11.0
    // width: 2530, height: 3290,
    x0: .9, y0: 1.0,
    delx: (1 + 1 / 8), dely: (1 + 1 / 8),
    bleed: .05,
    rad: 1.0,
    dpi: 300,
  }
  hexSingle_1_19 = {
    width: 3300, height: 2550,
    x0: 576, y0: 452,
    delx: 357, dely: 413,
    rad: 415,
    bleed: 0, dpi: 1,
  }

  stage: createjs.Stage;
  imageCont = new ImageContainer();
  //loader: ImageLoader = new ImageLoader({root: 'assets/images/', fnames: [], ext: 'png'}); // Citymap tiles: Resi, Busi, Lake, Univ, etc.
  loader = Tile.loader;

  constructor(public canvasId: string, public params: Params) {
    stime.fmt = "MM-DD kk:mm:ss.SSS";
    this.stage = makeStage(canvasId, false);
    TP.useEwTopo = false;
    this.setupDownload();
    // this.loader.loadImages(undefined, (imap: Map<string, HTMLImageElement>) => this.startup(params, imap))
  }

  counts = { Bank: 5, Busi: 5, Resi: 5, Lake: 5, Pstation: 5, Recycle: 0 };
  colors = ['red', 'blue'].map(cs => C.nameToRgbaString(cs, '.9'))
  startup(params: Params, imap: Map<string, HTMLImageElement>) {
    const ic = this.imageCont;
    const gridDesc = this.hexSingle_1_19;
    ic.setGrid(gridDesc);
    this.stage.removeAllChildren();
    this.stage.addChild(ic);
    let row = 0, col = 0;
    imap.forEach((img, key) => {
      this.colors.forEach(color => {
        let count = ((this.counts as any)[key] ?? 2);
        while (count-- > 0) {
          if (row * ic.dely > (ic.height - ic.y0 - ic.y0/2)) break;
          ic.addImage(img, row, col, color, .67);
          this.stage.update();
          if ((++col * ic.delx) > (ic.width - ic.x0 - ic.x0)) {
            col = 0;
            row += 1;
          }
        }
      })
    })
    // now: this.clickButton();
  }

  setupDownload(id = 'download') {
    const button = document.getElementById(id) as HTMLButtonElement;
    button.onclick = (ev) => this.download(id);
  }

  clickButton(id = 'download') {
    const button = document.getElementById(id) as HTMLButtonElement;
    button.click();
  }

  download(id = 'download') {
    const canvas = document.getElementById(this.canvasId) as HTMLCanvasElement;
    const download = document.getElementById(id) as HTMLButtonElement;
    const image = canvas.toDataURL("image/png");
    const octets = image.replace("image/png", "image/octet-stream");
    download.setAttribute("href", octets);
  }

}
class ImageContainer extends Container {
  pxi(inch: number) { return this.dpi * inch; }

  rad = this.pxi(1.0);
  x0 = this.pxi(.9);
  y0 = this.pxi(1.0) ;
  delx = this.pxi(1 + 1 / 8);
  dely = this.delx;
  bleed = this.pxi(.1);
  width = 2500;
  height = 3300;

  constructor(public dpi = 300) {
    super();
  }
  setGrid(layin: GridDesc) {
    const gridDef = { x0: 1, y0: 1, rad: 30, delx: 1.1, dely: 1.1, bleed: .1, dpi: 1 };
    const layout = { ...gridDef, ...layin }
    this.dpi = layout.dpi
    this.rad = this.pxi(layout.rad);
    this.x0 = this.pxi(layout.x0);
    this.y0 = this.pxi(layout.y0);
    this.delx = this.pxi(layout.delx);
    this.dely = this.pxi(layout.dely);
    this.bleed = this.pxi(layout.bleed);
    this.width = this.pxi(layout.width);
    this.height = this.pxi(layout.height);
  }

  paintDisk(color: string, x = 0, y = 0, rad = this.rad) {
    const disk = new HexShape();
    disk.graphics.f(color).dc(0, 0, rad + this.bleed);
    disk.x = x; disk.y = y;
    const hex = new HexShape(rad);
    hex.paint('grey');
    return disk;
  }

  addImage(img: HTMLImageElement, row: number, col: number, color = 'grey', os = 1) {
    const bm = new Bitmap(img);
    bm.regX = img.width / 2;
    bm.regY = img.height / 2;
    const scale = os * this.rad / Math.max(img.height, img.width);
    bm.scaleX = bm.scaleY = scale;
    const cx = this.x0 + col * this.delx;
    const cy = this.y0 + row * this.dely;
    bm.x = cx;
    bm.y = cy;
    bm.rotation = 90;
    this.addChild(this.paintDisk(color, cx, cy, this.rad / 2)); // background: HexShape
    this.addChild(bm); // image
  }
}
