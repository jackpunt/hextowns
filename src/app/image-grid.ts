import { WH, stime } from "@thegraid/common-lib";
import { makeStage } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Stage } from "@thegraid/easeljs-module";


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
  double?:boolean,
}

export type PageSpec = {
  gridSpec: GridSpec,
  frontObjs: DisplayObject[],
  backObjs?: (DisplayObject  | undefined)[] | undefined,
  canvas?: HTMLCanvasElement,
  basename?: string,
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
    x0: 120 + 3.5 * 150 + 30, y0: 83 + 3.5 * 150 + 30, delx: 1125, dely: 825, bleed: 30, double: false,
  };

  // (define PPG-MINI-36-SPEC '((file "PPGMiniCard36-0.png") (cardw 800) (cardh 575)
	// (xmin 150) (ymin 100) (xinc 833) (yinc 578.25)
	// (over 1) (bleed 25) (xlim 3600) (ylim 5400))
  static cardSingle_1_75: GridSpec = {
    width: 3600, height: 5400, nrow: 9, ncol: 4, cardw: 800, cardh: 575,
    x0: 258 + 1.75 * 150 + 30, y0: 96 + 1.75 * 150 + 30, delx: 833, dely: 578.25, bleed: 25,
  };

  stage!: Stage;
  canvas!: HTMLCanvasElement;

  constructor(makePageSpecs: () => PageSpec[], buttonId = 'makePage', label = 'MakePages') {
    this.setAnchorClick(buttonId, label, () => {
      this.downloadPageSpecs(makePageSpecs());
    });
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

  addObjects(gridSpec: GridSpec, frontObjs: DisplayObject[], backObjs: (DisplayObject | undefined)[] | undefined) {
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

  setAnchorClick(id: string, text: string, onclick?: ((ev: MouseEvent) => void) | 'stop') {
    const anchor = document.getElementById(id) as HTMLAnchorElement;
    anchor.innerHTML = `<button type="button">${text}</button>`;
    if (onclick === 'stop') { anchor.href = 'javascript:void(0);'; anchor.onclick = null; }
    else if (onclick) anchor.onclick = onclick;
  }

  downloadPageSpecs(pageSpecs: PageSpec[]) {
    let downClick = 0;
    this.setAnchorClick('download', `Download-P${downClick}`, (ev) => {
      if (downClick >= pageSpecs.length) {
        this.addCanvas(undefined);
        this.setAnchorClick('download', 'Download-done', 'stop');
        return;
      }
      const n = downClick++;
      const pageSpec = pageSpecs[n];
      const canvas = pageSpec.canvas as HTMLCanvasElement;
      const baseName = `${pageSpec.basename ?? 'image'}_${stime.fs("MM-DD_kk_mm_ssL")}`
      const filename = `${baseName}_P${n}.png`;
      // console.log(stime(this, `.downloadClick: ${canvasId} -> ${filename}`))
      this.downloadImage(canvas, filename);
      const next = `${(downClick < pageSpecs.length) ? `P${downClick}`: 'done'}`
      this.setAnchorClick('download', `Download-${next}`);
    });

    let viewClick = 0;
    this.setAnchorClick('viewPage', `ViewPage-P${viewClick}`, () => {
      if (viewClick >= pageSpecs.length) {
        this.addCanvas(undefined);
        this.setAnchorClick('viewPage', 'ViewPage-X', 'stop');
        return;
      }
      const n = viewClick++;
      const pageSpec = pageSpecs[n];
      const canvas = pageSpec.canvas as HTMLCanvasElement;
      canvas.style.border = "2px solid";
      this.addCanvas(canvas);
      const next = `${(viewClick < pageSpecs.length) ? `P${viewClick}`: 'X'}`
      this.setAnchorClick('viewPage', `ViewPage-${next}`);
    })
    return;
  }

  canvasId: string | undefined;
  addCanvas(canvas: HTMLCanvasElement | undefined) {
    const div = document.getElementById('canvasDiv') as HTMLDivElement;
    if (this.canvasId) {
      const elt = document.getElementById(this.canvasId);
      elt?.parentNode?.removeChild(elt);
      this.canvasId = undefined;
    }
    if (canvas) {
      this.canvasId = canvas.id;
      div.appendChild(canvas);
    }
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
