import { C, Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { AB, Bank, Blank, Busi, Lake, PS, Resi } from "./auction-tile";
import { DebtCircle } from "./debt";
import { EventTile, PolicyTile } from "./event-tile";
import { H } from "./hex-intfs";
import { ImageGrid, PageSpec, type GridSpec } from "./image-grid";
import { ActnToken2, EconToken2, InflToken2, StarToken2 } from "./infl";
import { Player } from "./player";
import { HexShape, PaintableShape, TileShape, type Paintable } from "./shapes";
import { Table } from "./table";
import { BonusTile, Church, Courthouse, Monument2, TownRule, TownStart, University } from "./tile";
// end imports

interface Tile extends DisplayObject {
  baseShape: DisplayObject;
  radius: number;
  setPlayerAndPaint(player?: Player): void;
}

interface Claz extends Constructor<Tile> {
  /** 0 => flip-on-horiz-axiz, 180 => flip-on-vert-axis, undefined => blank */
  rotateBack: number | undefined;
}

export type CountClaz = [count: number, claz: Claz, ...args: any];
export class TileExporter {

  imageGrid = new ImageGrid(() => { return this.makeImagePages() });

  makeImagePages() {
    const u = undefined, p0 = Player.allPlayers[0], p1 = Player.allPlayers[1];
    const fillColor = TileShape.fillColor; TileShape.fillColor = C.WHITE;
    const hexDouble = [
      [2, Monument2, u, u, u, u, u, u, 0],
      [2, Monument2, u, u, u, u, u, u, 1],
      [2, Monument2, u, u, u, u, u, u, 2],
      [1, TownStart, p0], [1, TownStart, p1],
      [1, Church, p0], [1, Church, p1],
      [1, University, p0], [1, University, p1],
      [1, Courthouse, p0], [1, Courthouse, p1],
      [ 7, Lake], // TP.lakePerPlayer * 2, 6,
      [ 7, Bank], // TP.bankPerPlayer * 2, 6,
      [ 7,  PS], // TP.pstaPerPlayer * 2, 6,
      //
      [2, BonusTile, 'actn'],
      [2, BonusTile, 'econ'],
      [2, BonusTile, 'infl'],
      [2, BonusTile, 'star'],
      ...EventTile.allTileArgs.map(clasArgs => [1, EventTile, ...clasArgs]), // 19 + 5 + 3
      //
      ...PolicyTile.allTileArgs.map(clasArgs => [1, PolicyTile, ...clasArgs]), // 14 + 6 + 1
      [1, AB, 'AB', undefined, 1], [1, AB, undefined, 'AB', 0],
      [3, Blank], //
      [20, Busi], // TP.busiPerPlayer * 2, 18,
      [24, Resi], // TP.resiPerPlayer * 2, 22,
    ] as CountClaz[];
    const circDouble = [
      [16, DebtCircle],
      [8, ActnToken2],
      [8, EconToken2],
      [8, InflToken2],
      [8, StarToken2],
    ] as CountClaz[];
    const ruleFront = TownRule.countClaz as CountClaz[];

    const pageSpecs: PageSpec[] = [];
    this.clazToTemplate(circDouble, ImageGrid.circDouble_0_79, pageSpecs);
    this.clazToTemplate(ruleFront, ImageGrid.cardSingle_3_5, pageSpecs);
    this.clazToTemplate(hexDouble, ImageGrid.hexDouble_1_19, pageSpecs);
    TileShape.fillColor = fillColor; // restore
    return pageSpecs;
  }

  /** compose bleed, background and Tile (Tile may be transparent, so white background over bleed) */
  composeTile(claz: Constructor<Tile>, args: any[], player?: Player, edge: 'L' | 'R' | 'C' = 'C', addBleed = 28) {
    const cont = new Container();
    if (claz) {
      const tile = new claz(...args), base = tile.baseShape as PaintableShape;
      tile.setPlayerAndPaint(player);
      const backRad = (base instanceof TileShape) ? tile.radius * H.sqrt3_2 * (55 / 60) : 0;
      // const back = new CircleShape(C.WHITE, backRad);
      const bleed = new HexShape(tile.radius + addBleed); // .09 inch + 1px
      {
        bleed.paint(base.colorn ?? C.grey, true);
        // bleed.paint(C.lightpink, true);
        // trim to fit template, allow extra on first/last column of row:
        const dx0 = (edge === 'L') ? 30 : 0, dw = (edge === 'R') ? 30 : 0;
        const { x, y, width, height } = base.getBounds(), d = -3;
        bleed.setBounds(x, y, width, height);
        bleed.cache(x - dx0, y - d, width + dx0 + dw, height + 2 * d);
      }
      cont.addChild(bleed, tile);
    }
    return cont;
  }

  // when update to TileExporter: override composeTile to repaint as allPlayers[0] or allPlayers[1]
  ct2(claz: Constructor<Tile>, args: any[], gridSpec: GridSpec, back = false, edge: 'L' | 'R' | 'C' = 'C') {
    const cont = this.composeTile(claz, args, /*gridSpec, back,*/ undefined, edge)
    if (back) {
      const allPlayers = Table.table.gamePlay.allPlayers;
      const color = (back ? allPlayers[1] : allPlayers[0]).color;
      cont.children.forEach(dobj => (dobj as Paintable).paint(color)) // [bleed, tile]
    }
  }

  /** each PageSpec will identify the canvas that contains the Tile-Images */
  clazToTemplate(countClaz: CountClaz[], gridSpec = ImageGrid.hexDouble_1_19, pageSpecs: PageSpec[] = []) {
    const both = true, double = gridSpec.double ?? true;
    const frontAry = [] as DisplayObject[][];
    const backAry = [] as (DisplayObject[] | undefined)[];
    const page = pageSpecs.length;
    const { nrow, ncol } = gridSpec, perPage = nrow * ncol;
    let nt = page * perPage;
    countClaz.forEach(([count, claz, ...args]) => {
      const frontPlayer = both ? Player.allPlayers[0] : undefined;
      const backPlayer = both ? Player.allPlayers[1] : undefined;
      const nreps = Math.abs(count);
      for (let i = 0; i < nreps; i++) {
        const n = nt % perPage, pagen = Math.floor(nt++ / perPage);
        const addBleed = (true || n > 3 && n < 32) ? undefined : -10; // for DEBUG: no bleed to see template positioning
        if (!frontAry[pagen]) frontAry[pagen] = [];
        const col = n % ncol, edge = (col === 0) ? 'L' : (col === ncol - 1) ? 'R' : 'C';
        const frontTile = this.composeTile(claz, args, frontPlayer, edge, addBleed);
        frontAry[pagen].push(frontTile);
        if (double) {
          const backAryPagen = backAry[pagen] ?? (backAry[pagen] = []) as (DisplayObject | undefined)[];
          let backTile = undefined;
          if (claz.rotateBack !== undefined) {
            backTile = this.composeTile(claz, args, backPlayer, edge, addBleed);
            const tile = backTile.getChildAt(1); // [bleed, back, tile]
            tile.rotation = claz.rotateBack;
          }
          backAryPagen.push(backTile);
        }
      }
    });
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

}
