import { WH, stime } from "@thegraid/common-lib";
// import { makeStage } from "@thegraid/easeljs-lib";
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
  x0?: number,
  y0?: number,
  delx?: number,
  dely?: number,
  dpi?: number,   // multiply [x0, y0, delx, dely] to get pixels; default: 1 (already in pixels)
}

export type PageSpec = {
  gridSpec: GridSpec,
  frontObjs: DisplayObject[],
  backObjs?: DisplayObject[],
}

export class ImageGrid {
  static circle_1_inch: GridSpec = {
    width: 8.433, height: 10.967, // not quite 8.5 X 11.0
    // width: 2530, height: 3290,
    x0: .9, y0: 1.0,
    delx: (1 + 1 / 8), dely: (1 + 1 / 8),
    dpi: 300,
  }

  static hexSingle_1_19: GridSpec = {
    width: 3300, height: 2550,
    x0: 576, y0: 452,
    delx: 357, dely: 413,
    dpi: 1,
  }

  static hexDouble_1_19: GridSpec = {
    width: 3300, height: 5100,
    x0: 576, y0: 452,
    delx: 357, dely: 413,
    dpi: 1,
  }

  stage: Stage;
  canvas: HTMLCanvasElement;

  constructor() {
    stime.fmt = "MM-DD kk:mm:ss.SSS";
    this.setupDownload();
  }

  setStage(wh: WH) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    if (!this.stage) {
      this.stage = makeStage(this.canvas);
    }
    this.setCanvasSize(wh);
  }

  setCanvasSize(wh: WH) {
    this.canvas.width = wh.width;
    this.canvas.height = wh.height;
  }

  makePages(pageSpecs?: PageSpec[]) {
    pageSpecs.forEach(pageSpec => this.makePage(pageSpec, true));
  }

  makePage(pageSpec: PageSpec, click = false) {
    const gridSpec = pageSpec.gridSpec;
    this.setStage(gridSpec);
    this.addObjects(gridSpec, pageSpec.frontObjs, pageSpec.backObjs)
    if (click) this.clickButton();
    return { width: this.canvas.width, height: this.canvas.height }; // not essential...
  }

  addObjects(gridSpec: GridSpec, frontObjs: DisplayObject[], backObjs: DisplayObject[]) {
    const cont = new Container();
    const def = { x0: 0, y0: 0, delx: 300, dely: 300, dpi: 1 }
    const { width, height, x0, y0, delx, dely, dpi } = { ...def, ...gridSpec };
    const ymax = backObjs ? height / 2 : height;

    this.stage.addChild(cont);
    let row = 0, col = 0;
    frontObjs.forEach((dObj, n) => {
      const frontObj = dObj;
      if (row * dely > (ymax - y0 - y0 / 2)) return;
      const x = (x0 + col * delx) * dpi;
      const y = (y0 + row * dely) * dpi;
      frontObj.x += x;
      frontObj.y += y;
      cont.addChild(frontObj);
      const backObj = backObjs?.[n];
      if (backObj) {
        backObj.x += x;
        backObj.y += (height * dpi - y); // + 3?
        cont.addChild(backObj);
      }
      this.stage.update();
      col += 1;
      if ((col * delx) > (width - x0 - x0)) {
        col = 0;
        row += 1;
      }
    });
  }

  anchorId = 'download';
  setupDownload(id = this.anchorId) {
    this.anchorId = id;
    const anchor = document.getElementById(this.anchorId) as HTMLAnchorElement;
    anchor.onclick = (ev) => this.downloadImage();
  }

  clickButton(filename='image.png') {
    const anchor = document.getElementById(this.anchorId) as HTMLAnchorElement;
    anchor.download = filename;
    anchor.click();
  }

  downloadImage() {
    const anchor = document.getElementById(this.anchorId) as HTMLAnchorElement;
    const image = this.canvas.toDataURL("image/png");
    const octets = image.replace("image/png", "image/octet-stream");
    anchor.setAttribute("href", octets);
  }
}
