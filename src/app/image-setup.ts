import { WH, stime } from "@thegraid/common-lib";
import { Container, DisplayObject, Stage } from "@thegraid/easeljs-module";


function makeStage(canvasId: string | HTMLCanvasElement, tick = true) {
  let stage = new Stage(canvasId)
  stage.tickOnUpdate = stage.tickChildren = tick
  if (!stage.canvas) {
    stage.enableMouseOver(0)
    stage.enableDOMEvents(false)
    stage.tickEnabled = stage.tickChildren = false
  }
  return stage
}

export type GridSpec = {
  width: number,  // canvas size
  height: number, // canvas size
  nrow: number,
  ncol: number,
  y0?: number,
  x0?: number,    // even numbered line indent
  x1?: number,    // odd numbered line indent (x1 ?? x0)
  delx?: number,
  dely?: number,
  cardw?: number,
  cardh?: number,
  bleed?: number,
  dpi?: number,   // multiply [x0, y0, delx, dely] to get pixels; default: 1 (already in pixels)
}

export type PageSpec = {
  gridSpec: GridSpec,
  frontObjs: DisplayObject[],
  backObjs?: DisplayObject[],
  canvas?: HTMLCanvasElement,
}

export class ImageGrid {
  // printer paper
  static circle_1_inch: GridSpec = {
    width: 8.433, height: 10.967, // not quite 8.5 X 11.0
    nrow: 10, ncol: 8,
    // width: 2530, height: 3290,
    x0: .9, y0: 1.0,
    delx: (1 + 1 / 8), dely: (1 + 1 / 8),
    dpi: 300,
  }

  /** 5 rows of 7 columns */
  static hexSingle_1_19: GridSpec = {
    width: 3300, height: 2550, nrow: 5, ncol: 7,
    x0: 576, y0: 450,
    delx: 357, dely: 413,
    dpi: 1,
  }

  /** 5 rows of 7 columns */
  static hexDouble_1_19: GridSpec = {
    width: 3300, height: 5100, nrow: 5, ncol: 7,
    x0: 576, y0: 451,        // 245 + 412/2 = 451  (5099 - 245 = 4854) !~== 4854
    delx: 357, dely: 413.1,  // 1.19*300=357; 357/H.sqrt_3_2 = 412.2 === (2308 - 247)/5 == 2061 = 412.2
    dpi: 1,
  }

  /** 8 rows of 8 columns */
  static circDouble_0_79: GridSpec = {
    width: 3300, height: 5100, nrow: 8, ncol: 8,
    x0: 242, y0: 335, x1: 430,
    delx: 375, dely: 375,  // ; 2625/7 = 375 ; 1876/5 = 375.2
    dpi: 1,
  }
    // (define PPG-POKER-18-SPEC '((file "PPGPoker18-0.png") (cardw 1108) (cardh 808)
    // (xmin 120) (ymin 85) (xinc 1125) (yinc 825)
    // (ncol 3) (nrow 6) (bleed 25)))
  static cardSingle_3_5: GridSpec = {
    width: 3600, height: 5400, nrow: 6, ncol: 3, cardw: 1110, cardh: 810, // (w*300 + 2*bleed)
    x0: 120 + 3.5 * 150 + 30, y0: 85 + 3.5 * 150 + 30, delx: 1125, dely: 825, bleed: 30,
  };

  static cardSingle_1_75: GridSpec = {
    width: 3600, height: 5400, nrow: 9, ncol: 4, cardw: 800, cardh: 575,
    x0: 150 + 1.75 * 150 + 30, y0: 100 + 1.75 * 150 + 30, delx: 833, dely: 578.25, bleed: 30,
  };

  stage: Stage;
  canvas: HTMLCanvasElement;

  constructor() {
  }

  setStage(wh: WH, canvasId: string | HTMLCanvasElement = 'gridCanvas') {
    if (typeof canvasId === 'string') {
      this.canvas = (document.getElementById(canvasId) ?? document.createElement('canvas')) as HTMLCanvasElement;
      this.canvas.id = canvasId;
    } else {
      this.canvas = canvasId as HTMLCanvasElement;
    }
    this.stage = makeStage(this.canvas);
    this.stage.removeAllChildren();
    this.setCanvasSize(wh);
  }

  setCanvasSize(wh: WH) {
    this.canvas.width = wh.width;
    this.canvas.height = wh.height;
  }

  makePage(pageSpec: PageSpec, canvas?: HTMLCanvasElement | string ) {
    const gridSpec = pageSpec.gridSpec;
    this.setStage(gridSpec, canvas);
    const nc = this.addObjects(gridSpec, pageSpec.frontObjs, pageSpec.backObjs)
    this.stage.update();
    pageSpec.canvas = this.canvas;

    const { id, width, height } = this.canvas;
    const info = { id, width, height, nc }; // not essential...
    console.log(stime(this, `.makePage: info =`), info);
    return;
  }

  addObjects(gridSpec: GridSpec, frontObjs: DisplayObject[], backObjs: DisplayObject[]) {
    const cont = new Container();
    const def = { x0: 0, y0: 0, delx: 300, dely: 300, dpi: 1 }
    const { width, height, x0, y0, x1, delx, dely, dpi, nrow, ncol } = { ...def, ...gridSpec };

    this.stage.addChild(cont);
    const XX = [x0, x1 ?? x0];
    frontObjs.forEach((dObj, n) => {
      const row = Math.floor(n / ncol);
      const col = n % ncol;
      const frontObj = dObj;
      if (row > nrow) return;
      const X0 = XX[row % 2]; // = ((row % 2) === 0) ? x0 : x1 ?? x0;
      const x = (X0 + col * delx) * dpi;
      const y = (y0 + row * dely) * dpi;
      frontObj.x += x;
      frontObj.y += y;
      cont.addChild(frontObj);
      const backObj = backObjs?.[n];
      if (backObj) {
        backObj.x += x;
        backObj.y += (height * dpi - y); // + 2; // template is asymetric!
        cont.addChild(backObj);
      }
    });
    return cont.numChildren;
  }

  downloadImage(canvas: HTMLCanvasElement, filename = 'image.png', downloadId = 'download') {
    const anchor = document.getElementById(downloadId) as HTMLAnchorElement;
    const imageURL = canvas.toDataURL("image/png");
    const octetURL = imageURL.replace("image/png", "image/octet-stream");
    anchor.download = filename;
    anchor.href = octetURL;
    console.log(stime(this, `.downloadImage: ${canvas.id} -> ${filename} ${octetURL.length}`))
  }
}
