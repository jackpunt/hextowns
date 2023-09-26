import { C, Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { AuctionTile, Bank, Busi, Lake, PS, Resi } from "./auction-tile";
import { EventTile, PolicyTile } from "./event-tile";
import { H } from "./hex-intfs";
import { ImageGrid, PageSpec } from "./image-setup";
import { Player } from "./player";
import { CircleShape, HexShape, PaintableShape } from "./shapes";
import { BonusTile, Church, Courthouse, Monument, Tile, TownStart, University } from "./tile";

type CountClaz = [count: number, claz: Constructor<Tile>, ...args: any];
export class TileExporter {
  constructor(buttonId = 'makePage', label = 'MakePages') {
    this.setAnchorClick(buttonId, label, () => this.makeImagePages());
  }
  imageGrid = new ImageGrid();

  setAnchorClick(id: string, text: string, onclick?: ((ev) => void) | 'stop') {
    const anchor = document.getElementById(id) as HTMLAnchorElement;
    anchor.innerHTML = `<button type="button">${text}</button>`;
    if (onclick === 'stop') { anchor.href = 'javascript:void(0);'; anchor.onclick = undefined; }
    else if (onclick) anchor.onclick = onclick;
  }

  makeImagePages() {
    const u = undefined, p0 = Player.allPlayers[0], p1 = Player.allPlayers[1];
    const doubleSided = [
      [2, BonusTile, 'star'],
      [2, BonusTile, 'econ'],
      [2, BonusTile, 'infl'],
      [1, BonusTile, 'actn'],
      [2, Monument, u, u, u, u, u, u, 0],
      [2, Monument, u, u, u, u, u, u, 1],
      [2, Monument, u, u, u, u, u, u, 2],
      [1, TownStart, p0], [1, TownStart, p1],
      [1, Church, p0], [1, Church, p1],
      [1, University, p0], [1, University, p1],
      [1, Courthouse, p0], [1, Courthouse, p1],
      [ 7, Lake], // TP.lakePerPlayer * 2, 6,
      [ 7, Bank], // TP.bankPerPlayer * 2, 6,
      [ 7,  PS], // TP.pstaPerPlayer * 2, 6,
      [25, Resi], // TP.resiPerPlayer * 2, 22,
      [21, Busi], // TP.busiPerPlayer * 2, 18,
      [3, BonusTile, 'actn'],
      ...PolicyTile.allTileArgs.map(clasArgs => [1, PolicyTile, ...clasArgs]),
      [3, undefined],
      ...EventTile.allTileArgs.map(clasArgs => [1, EventTile, ...clasArgs]),
    ] as CountClaz[];
    const pageSpecs = [];
    this.tilesToTemplate(doubleSided, 'both', pageSpecs);
    // this.tilesToTemplate(singleSided1, undefined, pageSpecs);
    // this.tilesToTemplate(singleSided2, undefined, pageSpecs);
    this.downloadPageSpecs(pageSpecs);
  }

  composeTile(claz: Constructor<Tile>, args: any[], player: Player, n: number, wbkg = true) {
    const cont = new Container();
    if (claz) {
      const tile = new claz(...args);
      tile.setPlayerAndPaint(player);
      const circ = new CircleShape(C.WHITE, tile.radius * H.sqrt3_2 * (55 / 60));
      const bkg = new HexShape(tile.radius + (wbkg ? 40 : -10)); // 1/6 inch
      {
        bkg.paint((tile.baseShape as PaintableShape).colorn ?? C.grey, true);
        // trim to fit template, allow extra on first/last column of row:
        const col = n % 7, dx0 = col === 0 ? 30 : 0, dw = col === 6 ? 30 : 0;
        const { x, y, width, height } = tile.baseShape.getBounds(), d = -3;
        bkg.setBounds(x, y, width, height);
        bkg.cache(x - dx0, y - d, width + dx0 + dw, height + 2 * d);
      }
      cont.addChild(bkg, circ, tile);
    }
    return cont;
  }

  tilesToTemplate(countClaz: CountClaz[], player?: (Player | 'both'), pageSpecs: PageSpec[] = []) {
    const both = (player === 'both'), double = true;
    const frontAry = [] as DisplayObject[][];
    const backAry = [] as DisplayObject[][];
    const page = pageSpecs.length;
    let nt = page * 35;
    countClaz.forEach(([count, claz, ...args]) => {
      const frontPlayer = both ? Player.allPlayers[0] : player;
      const backPlayer = both ? Player.allPlayers[1] : player;
      const nreps = Math.abs(count);
      for (let i = 0; i < nreps; i++) {
        const n = nt % 35, pagen = Math.floor(nt++ / 35);
        const wbkg = true || n > 3 && n < 32;
        if (!frontAry[pagen]) frontAry[pagen] = [];
        const frontTile = this.composeTile(claz, args, frontPlayer, n, wbkg)
        frontAry[pagen].push(frontTile);
        if (double) {
          if (!backAry[pagen]) backAry[pagen] = [];
          const backTile = (claz === BonusTile) ? undefined : this.composeTile(claz, args, backPlayer, n, wbkg);
          backAry[pagen].push(backTile);
        }
      }
    });
    const gridSpec = double ? ImageGrid.hexDouble_1_19 : ImageGrid.hexSingle_1_19;
    frontAry.forEach((ary, pagen) => {
      const frontObjs = frontAry[pagen], backObjs = double ? backAry[pagen] : undefined;
      const canvasId = `canvas_P${pagen}`;
      const pageSpec = { gridSpec, frontObjs, backObjs };
      pageSpecs[pagen] = pageSpec;
      console.log(stime(this, `.makePage: canvasId=${canvasId}, pageSpec=`), pageSpec);
      this.imageGrid.makePage(pageSpec, canvasId);  // make canvas with images, but do not download [yet]
    })
    return pageSpecs;
  }

  downloadPageSpecs(pageSpecs: PageSpec[], baseName = `image_${stime.fs("MM-DD_kk_mm_ssL")}`) {
    let nclick = 0;
    this.setAnchorClick('download', `Download-P${nclick}`, (ev) => {
      if (nclick >= pageSpecs.length) {
        this.setAnchorClick('download', 'Download-done', 'stop');
        return;
      }
      const n = nclick++;
      const pageSpec = pageSpecs[n];
      const canvas = pageSpec.canvas;
      const filename = `${baseName}_P${n}.png`;
      // console.log(stime(this, `.downloadClick: ${canvasId} -> ${filename}`))
      this.imageGrid.downloadImage(canvas, filename);
      const next = `${(nclick < pageSpecs.length) ? `P${nclick}`: 'done'}`
      this.setAnchorClick('download', `Download-${next}`);
    });

    const bagTiles = {
    };
    BonusTile.allTiles;
    EventTile.allTiles;   // EvalTile
    PolicyTile.allTiles;  // EvalTile


    return;
  }
}
