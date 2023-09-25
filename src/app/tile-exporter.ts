import { C, Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { AuctionTile, Bank, Busi, Lake, PS, Resi } from "./auction-tile";
import { EventTile, PolicyTile } from "./event-tile";
import { H } from "./hex-intfs";
import { ImageGrid, PageSpec } from "./image-setup";
import { Player } from "./player";
import { CircleShape, HexShape } from "./shapes";
import { BonusTile, Tile } from "./tile";

export class TileExporter {
  constructor(buttonId = 'makePage', label = 'MakePages') {
    this.setAnchorClick(buttonId, label, () => this.makeImagePages());
  }

  setAnchorClick(id: string, text: string, onclick?: ((ev) => void) | 'stop') {
    const anchor = document.getElementById(id) as HTMLAnchorElement;
    anchor.innerHTML = `<button type="button">${text}</button>`;
    if (onclick === 'stop') { anchor.href = 'javascript:void(0);'; anchor.onclick = undefined; }
    else if (onclick) anchor.onclick = onclick;
  }

  imageGrid = new ImageGrid();
  composeTile(claz: Constructor<Tile>, player: Player, n: number, wbkg = true) {
    const tile = new claz();
    tile.setPlayerAndPaint(player);
    const bkg = new HexShape(tile.radius + (wbkg ? 40 : -10)); // 1/6 inch
    const c = new CircleShape(C.WHITE, tile.radius * H.sqrt3_2 * (55 / 60));
    {
      bkg.paint(player.colorn, true);
      const col = n % 7, dx0 = col === 0 ? 30 : 0, dw = col === 6 ? 30 : 0;
      const { x, y, width, height } = tile.baseShape.getBounds(), d = 30;
      bkg.setBounds(x, y, width, height);
      bkg.cache(x - dx0, y - d, width + dx0 + dw , height + 2 * d);
    }
    const cont = new Container();
    cont.addChild(bkg, c, tile);
    return cont;
  }
  makeImagePages() {
    // 2-sided: Busi(9), Resi(11)
    const allTiles = Tile.allTiles;
    const auctionTile = allTiles.filter(t => (t instanceof AuctionTile) );
    // console.log(stime(this, `.makeImagePages: allInBag=`), allInBag);
    console.log(stime(this, `.makeImagePages: doubleSided=`), auctionTile); // 58 instances
    const player0 = Player.allPlayers[0];
    const player1 = Player.allPlayers[1];
    const doubleSided = [
      [Resi, 25], // TP.resiPerPlayer * 2, 22,
      [Busi, 21], // TP.busiPerPlayer * 2, 18,
      [Lake, 8], // TP.lakePerPlayer * 2, 6,
      [Bank, 8], // TP.bankPerPlayer * 2, 6,
      [PS,   8], // TP.pstaPerPlayer * 2, 6,
    ] as [Constructor<Tile>, number][];

    const frontAry = [[]] as DisplayObject[][];
    const backAry = [[]] as DisplayObject[][];
    const pageSpecs = [] as PageSpec[];
    let nt = 0, nh = 1;
    doubleSided.forEach(([claz, count]) => {
      // const tile = false ? new claz() : this.gamePlay.shifter.tileBag.takeType(claz as Constructor<BagTile>);
      // tile.hex = this.gamePlay.hexMap[8][nh++];
      // this.gamePlay.hexMap.update();
      for (let i = 0; i < count; i++) {
        const n = nt % 35, page = Math.floor(nt++ / 35);
        const wbkg = n > 3 && n < 32;
        if (!frontAry[page]) frontAry[page] = [];
        if (!backAry[page]) backAry[page] = [];
        frontAry[page].push(this.composeTile(claz, player0, n, wbkg));
        backAry[page].push(this.composeTile(claz, player1, n, wbkg));
      }
    });
    const gridSpec = ImageGrid.hexDouble_1_19;
    const image = `image_${stime.fs("MM-DD_kk_mm_ss")}`;
    frontAry.forEach((ary, n) => {
      const frontObjs = frontAry[n], backObjs = backAry[n];
      const canvasId = `canvas_P${n}`;
      const pageSpec = { gridSpec, frontObjs, backObjs };
      pageSpecs[n] = pageSpec;
      console.log(stime(this, `.makePage: canvasId=${canvasId}, pageSpec=`), pageSpec);
      this.imageGrid.makePage(pageSpec, canvasId);  // make canvas with images, but do not download [yet]
    })
    let nclick = 0;
    this.setAnchorClick('download', `Download-P${nclick}`, (ev) => {
      if (nclick >= pageSpecs.length) {
        this.setAnchorClick('download', 'Download-done', 'stop');
        return;
      }
      const n = nclick++;
      const pageSpec = pageSpecs[n];
      const canvas = pageSpec.canvas;
      const filename = `${image}_P${n}.png`;
      // console.log(stime(this, `.downloadClick: ${canvasId} -> ${filename}`))
      this.imageGrid.downloadImage(canvas, filename);
      const next = `${(nclick < pageSpecs.length) ? `P${nclick}`: 'done'}`
      this.setAnchorClick('download', `Download-${next}`);
    });

    const bagTiles = {
    };
    BonusTile.allTiles;
    EventTile.allTiles;
    PolicyTile.allTiles;


    return;
  }
}
