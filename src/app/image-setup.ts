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
  filename?: string,
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
    x0: 576, y0: 451, // 244 + (659 - 244) / 2,
    delx: 357, dely: 413.1,
    dpi: 1,
  }

  stage: Stage;
  canvas: HTMLCanvasElement;

  constructor(pageSpec?: PageSpec, anchorId?: string) {
    stime.fmt = "MM-DD kk:mm:ss.SSS";
    this.setupButtons(pageSpec, anchorId);
  }

  setStage(wh: WH, canvasId: string | HTMLCanvasElement = 'gridCanvas') {
    if (!this.canvas) {
      if (typeof canvasId === 'string') {
        this.canvas = (document.getElementById(canvasId) ?? document.createElement('canvas')) as HTMLCanvasElement;
      } else {
        this.canvas = canvasId as HTMLCanvasElement;
      }
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

  makePage(pageSpec: PageSpec, click = false, canvasId?: HTMLCanvasElement | string ) {
    const gridSpec = pageSpec.gridSpec, filename = pageSpec.filename;
    this.setStage(gridSpec, canvasId);
    const nc = this.addObjects(gridSpec, pageSpec.frontObjs, pageSpec.backObjs)
    this.stage.update();
    // afterUpdate(this.stage, () => {
      if (click) this.clickButton(filename);
    // });
    const wh = { width: this.canvas.width, height: this.canvas.height, nc, filename }; // not essential...
    console.log(stime(this, `.makeImagePages: canvasSize=`), wh);
    return;
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
        backObj.y += (height * dpi - y) + 3; // template is asymetric!
        cont.addChild(backObj);
      }
      col += 1;
      if ((col * delx) > (width - x0 - x0)) {
        col = 0;
        row += 1;
      }
    });
    return cont.numChildren;
  }

  anchorId = 'download';
  setupButtons(pageSpec?: PageSpec, id = this.anchorId) {
    this.anchorId = id;
    const anchor1 = document.getElementById('makePage') as HTMLAnchorElement;
    anchor1.onclick = (ev) => this.makePage(pageSpec, false);
    const anchor2 = document.getElementById(this.anchorId) as HTMLAnchorElement;
    anchor2.onclick = (ev) => this.downloadImage(pageSpec.filename);
  }

  clickButton(filename = 'image.png') {
    const anchor = document.getElementById(this.anchorId) as HTMLAnchorElement;
    anchor.download = filename;
    anchor.click();
  }

  downloadImage(filename = 'image.png') {
    const anchor = document.getElementById(this.anchorId) as HTMLAnchorElement;
    const image = this.canvas.toDataURL("image/png");
    const octets = image.replace("image/png", "image/octet-stream");
    anchor.setAttribute("download", filename);
    anchor.setAttribute("href", octets);
    console.log(stime(this, `.downloadImage: ${anchor.download}`))
  }
}
