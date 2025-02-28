import { AT, C, Constructor, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { TileBag } from "./tile-bag";
import { ButtonBox, CostIncCounter, DecimalCounter, NumCounter, NumCounterBox } from "./counters";
import { Debt } from "./debt";
import type { GamePlay } from "./game-play";
import { BonusHex, DebtHex, EventHex, Hex, Hex2, HexMap, IHex, RecycleHex, ResaHex } from "./hex";
import { H, HexDir, XYWH } from "./hex-intfs";
import { BuyEcon, BuyInfl, EconToken, InflToken, StarToken } from "./infl";
import { Criminal, Police } from "./meeple";
import { Player } from "./player";
import { HexShape } from "./shapes";
import type { StatsPanel } from "./stats";
import { PlayerColor, playerColor0, playerColor1, playerColors, TP } from "./table-params";
import { BagTile, BonusTile, Tile, WhiteTile } from "./tile";
import { TileSource } from "./tile-source";
import { PolicyTile } from "./event-tile";
//import { TablePlanner } from "./planner";


/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) {}
}
interface StageTable extends Stage {
  table: Table;
}

type MinDragInfo = { first?: boolean, event?: MouseEvent };

export interface DragContext {
  targetHex: Hex2;      // last isLegalTarget() or fromHex
  lastShift: boolean;   // true if Shift key is down
  lastCtrl: boolean;    // true if control key is down
  info: MinDragInfo;    // we only use { first, event }
  tile: Tile;           // the DisplayObject being dragged
  nLegal?: number;      // number of legal drop tiles (excluding recycle)
}

class TextLog extends Container {
  constructor(public Aname: string, nlines = 6, public size: number = TP.hexRad/2, public lead = 3) {
    super()
    this.lines = new Array<Text>(nlines);
    for (let ndx = 0; ndx < nlines; ndx++) this.lines[ndx] = this.newText(`#0:`)
    this.addChild(...this.lines);
  }

  lines: Text[];
  lastLine = '';
  nReps = 0;

  height(n = this.lines.length) {
    return (this.size + this.lead) * n;
  }

  clear() {
    this.lines.forEach(tline => tline.text = '');
    this.stage?.update();
  }

  private newText(line = '') {
    const text = new Text(line, F.fontSpec(this.size))
    text.textAlign = 'left'
    return text;
  }

  private spaceLines(cy = 0, lead = this.lead) {
    this.lines.forEach(tline => (tline.y = cy, cy += tline.getMeasuredLineHeight() + lead))
  }

  log(line: string, from = '', toConsole = true) {
    toConsole && console.log(stime(`${from}:`), line);
    if (line === this.lastLine) {
      this.lines[this.lines.length - 1].text = `[${++this.nReps}] ${line}`;
    } else {
      this.removeChild(this.lines.shift());
      this.lines.push(this.addChild(this.newText(line)));
      this.spaceLines();
      this.lastLine = line;
      this.nReps = 0;
    }
    this.stage?.update();
  }
}


/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {
  static table: Table
  static stageTable(obj: DisplayObject) {
    return (obj.stage as StageTable).table
  }
  statsPanel: StatsPanel;
  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  bgRect: Shape
  hexMap: HexMap; // from gamePlay.hexMap

  undoCont: Container = new Container()
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape();
  undoText: Text = new Text('', F.fontSpec(30 * TP.hexRad/60));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30 * TP.hexRad/60));  // length of history stack
  winText: Text = new Text('', F.fontSpec(40 * TP.hexRad/60), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(-180, -5, 360, 130))

  dragger: Dragger

  constructor(stage: Stage) {
    super();

    // backpointer so Containers can find their Table (& curMark)
    Table.table = (stage as StageTable).table = this;
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage.canvas) // scaleCont & background
  }
  bagLog = new TextLog('bagLog', 1);    // show 1 line of bag contents
  turnLog = new TextLog('turnLog', 2);  // shows the last 2 start of turn lines
  textLog = new TextLog('textLog', TP.textLogLines); // show other interesting log strings.
  logInBag(from = `logInBag`) {
    this.bagLog.log(this.gamePlay.shifter.tileBag.inTheBagStr(), from, false);
  }
  logTurn(line: string) {
    this.turnLog.log(line, 'table.logTurn'); // in top two lines
  }
  logText(line: string, from = '') {
    this.textLog.log(`#${this.gamePlay.turnNumber}: ${line}`, from); // scrolling lines below
  }
  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH) {
    const undoC = this.undoCont; undoC.name = "undo buttons"; // holds the undo buttons.
    this.scaleCont.addChild(this.undoCont);
    const { x, y } = this.hexMap.getCornerHex('W').xywh();
    this.hexMap.mapCont.hexCont.localToLocal(x - 8 * TP.hexRad, y - this.hexMap.rowHeight * 4, undoC.parent, undoC);
    const progressBg = new Shape(), bgw = 3 * TP.hexRad, bgym = 3 * TP.hexRad, y0 = 0;
    const bgc = C.nameToRgbaString(TP.bgColor, .8);
    progressBg.graphics.f(bgc).r(-bgw / 2, y0, bgw, bgym - y0);
    undoC.addChildAt(progressBg, 0)
    this.enableHexInspector(TP.hexRad / 2);
    this.dragger.makeDragable(undoC)
    if (true && xOffs > 0) return
    this.skipShape.graphics.f("white").dp(0, 0, 40, 4, 0, skipRad)
    this.undoShape.graphics.f("red").dp(-xOffs, 0, bSize, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+xOffs, 0, bSize, 3, 0, 0);
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    let aiControl = this.aiControl('pink', 75); aiControl.x = 0; aiControl.y = 100
    let pmy = 0;
    undoC.addChild(aiControl)
    undoC.addChild(this.winBack);
    undoC.addChild(this.winText);
    this.winText.y = Math.min(pmy, bgrpt.y) // 135 = winBack.y = winBack.h
    this.winBack.visible = this.winText.visible = false
    this.winBack.x = this.winText.x; this.winBack.y = this.winText.y;
  }
  showWinText(msg?: string, color = 'green') {
    this.winText.text = msg || "COLOR WINS:\nSTALEMATE (10 -- 10)\n0 -- 0"
    this.winText.color = color
    this.winText.visible = this.winBack.visible = true
    this.hexMap.update()
  }
  enableHexInspector(qY = 52, cont = this.undoCont) {
    const qShape = new HexShape(TP.hexRad / 3);
    qShape.paint(C.BLACK);
    qShape.y = qY;  // size of 'skip' Triangles
    cont.addChild(qShape);
    this.dragger.makeDragable(qShape, this,
      // dragFunc:
      (qShape: Shape, ctx: DragInfo) => { },
      // dropFunc:
      (qShape: Shape, ctx: DragInfo) => {
        this.downClick = true;
        const hex = this.hexUnderObj(qShape);
        qShape.x = 0; qShape.y = qY; // return to regular location
        cont.addChild(qShape);
        if (!hex) return;
        const info = hex; //{ hex, stone: hex.playerColor, InfName }
        console.log(`HexInspector:`, hex.Aname, info)
      })
    qShape.on(S.click, () => this.toggleText(), this); // toggle visible
    this.toggleText(false);         // set initial visibility
  }

  set showCap(val) { (this.hexMap.mapCont.capCont.visible = val)}
  get showCap() { return this.hexMap.mapCont.capCont.visible}

  set showInf(val) { (this.hexMap.mapCont.infCont.visible = val) ? this.markAllSacrifice() : this.unmarkAllSacrifice() }
  get showInf() { return this.hexMap.mapCont.infCont.visible }
  _showSac = true
  get showSac() { return this._showSac }
  set showSac(val: boolean) { (this._showSac = val) ? this.markAllSacrifice() : this.unmarkAllSacrifice() }
  markAllSacrifice() {}
  unmarkAllSacrifice() {}

  downClick = false;
  isVisible = false;
  /** method invokes closure defined in enableHexInspector. */
  toggleText(vis?: boolean) {
    if (this.downClick) return (this.downClick = false, undefined) // skip one 'click' when pressup/dropfunc
    if (vis === undefined) vis = this.isVisible = !this.isVisible;
    Tile.allTiles.forEach(tile => tile.textVis(vis));
    this.homeRowHexes.forEach(hex => hex.showText(vis));
    this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
    this.hexMap.update()               // after toggleText & updateCache()
  }

  aiControl(color = TP.bgColor, dx = 100, rad = 16) {
    let table = this
    // c m v on buttons
    let makeButton = (dx: number, bc = TP.bgColor, tc = TP.bgColor, text: string, key = text) => {
      let cont = new Container
      let circ = new Graphics().f(bc).drawCircle(0, 0, rad)
      let txt = new Text(text, F.fontSpec(rad), tc)
      txt.y = - rad/2
      txt.textAlign = 'center'
      txt.mouseEnabled = false
      cont.x = dx
      cont.addChild(new Shape(circ))
      cont.addChild(txt)
      cont.on(S.click, (ev) => { KeyBinder.keyBinder.dispatchChar(key) })
      return cont
    }
    let bpanel = new Container()
    let c0 = TP.colorScheme[playerColor0], c1 = TP.colorScheme[playerColor1]
    let cm = "rgba(100,100,100,.5)"
    let bc = makeButton(-dx, c0, c1, 'C', 'c')
    let bv = makeButton(dx, c1, c0, 'V', 'v')
    let bm = makeButton(0, cm, C.BLACK, 'M', 'm'); bm.y -= 10
    let bn = makeButton(0, cm, C.BLACK, 'N', 'n'); bn.y += rad*2
    let bs = makeButton(0, cm, C.BLACK, ' ', ' '); bs.y += rad*5
    bpanel.addChild(bc)
    bpanel.addChild(bv)
    bpanel.addChild(bm)
    bpanel.addChild(bn)
    bpanel.addChild(bs)
    return bpanel
  }

  // pIndex = 2 for non-player Hexes (auctionHexes, crimeHex)
  readonly homeRowHexes: Hex2[] = [];
  get reserveHexes() { return this.gamePlay.reserveHexes }; // [pIndex][res0, res1]
  leaderHexes: Hex2[][] = [[], []]; // per player

  addCostCounter(hex: Hex2, name?: string, ndx = 0, repaint: boolean | Player = false) {
    /** show cost in influence (and coins...) */
    const infCounter = new CostIncCounter(hex, `${name ?? '?'}Inf`, ndx, repaint);
    if (!name) {
      infCounter.parent.removeChild(infCounter); // not used as DisplayObject
    }
    this.gamePlay.costIncHexCounters.set(hex, infCounter);
    return hex;
  }

  newHex2(row = 0, col = 0, name: string, claz: Constructor<Hex2> = Hex2, sy = 0) {
    const hex = new claz(this.hexMap, row, col, name);
    hex.distText.text = name;
    if (row <= 0) {
      hex.y += (sy + row * .5 - .75) * (this.hexMap.radius);
    }
    return hex
  }

  noRowHex(name: string, crxy: { row: number, col: number }, claz: Constructor<Hex2> = BonusHex) {
    const { row, col } = crxy;
    const hex = this.newHex2(row, col, name, claz);
    return hex;
  }

  // row typically 0 or -1; sy[row=0]: 0, -1, -2;
  homeRowHex(name: string, crxy: { row: number, col: number }, sy = 0, claz?: Constructor<Hex2>) {
    const { row, col } = crxy;
    const hex = this.newHex2(row, col, name, claz, sy);
    this.homeRowHexes.push(hex);
    hex.legalMark.setOnHex(hex);
    return hex;
  }
  get col00() { return (15 - TP.auctionSlots) / 2 }
  splitRowHex(name: string, ndx: number, claz?: Constructor<Hex2>) {
    const nm = TP.auctionMerge, col0 = this.col00, row = 0;
    return ndx < nm ? this.homeRowHex(name, { row, col: col0 + ndx }, -2, claz) :      // split: UP 2
      ndx >= 2 * nm ? this.homeRowHex(name, { row, col: col0 + ndx - nm }, -1, claz) : // middle
        /*ndx<2*nm */ this.homeRowHex(name, { row, col: col0 + ndx - nm }, 0, claz);   // split: DOWN 0
  }

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    const hexMap = this.hexMap = gamePlay.hexMap
    hexMap.addToMapCont();               // addToMapCont; make Hex2
    hexMap.makeAllDistricts();           // typically: (4,2)

    const mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont);

    // background sized for hexMap:
    const { x: rx, y: ry, width: rw, height: rh } = hexCont.getBounds();
    const rowh = hexMap.rowHeight, colw = hexMap.colWidth;
    const bgr: XYWH = { x: 0, y: -rowh * .6, w: rw + 5 * colw, h: rh + 4 * rowh }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = (bgr.w - bgr.x) / 2;
    mapCont.y = (bgr.h - bgr.y) / 2;

    this.bgRect = this.setBackground(this.scaleCont, bgr); // bounded by bgr
    const p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, hexCont);
    const pbr = this.scaleCont.localToLocal(bgr.w, bgr.h, hexCont);
    hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y); // cache hexCont (bounded by bgr)

    this.homeRowHexes.length = 0;
    this.reserveHexes.forEach(ary => ary.length = 0);

    this.makeShifter();
    this.makePerPlayer();

    // TP.auctionMerge + TP.auctionSlots
    const colx = this.gamePlay.auctionTiles.length - .2;
    const econH = this.splitRowHex(`econHex`, colx, BonusHex);
    econH.y += TP.hexRad * -0.5;
    BuyEcon.makeSource(undefined, econH, 1);
    const inflH = this.splitRowHex(`inflHex`, colx + .5, BonusHex);
    inflH.y += TP.hexRad * 0.0;
    BuyInfl.makeSource(undefined, inflH, 1);
    const starH = this.splitRowHex(`starHex`, colx, BonusHex);
    starH.y += TP.hexRad * 0.5;
    StarToken.makeSource(undefined, starH, 1);

    this.gamePlay.recycleHex = this.makeRecycleHex(5, -.5);
    this.gamePlay.debtHex = this.makeDebtHex(5, 13.5);
    this.gamePlay.eventHex = this.makeEventHex();
    this.makeResaHexes();
    this.hexMap.update();
    {
      // position turnLog & turnText
      const parent = this.scaleCont, n = TP.nHexes;
      const lhex = this.hexMap.getCornerHex('W');
      let rhex = lhex.links['NE'] as Hex2;
      let rhpt = rhex.cont.parent.localToLocal(rhex.x - (n + 1) * this.hexMap.colWidth, rhex.y, parent)
      this.bagLog.x = rhpt.x; this.bagLog.y = rhpt.y - this.turnLog.height(1);;
      this.turnLog.x = rhpt.x; this.turnLog.y = rhpt.y;
      this.textLog.x = rhpt.x; this.textLog.y = rhpt.y + this.turnLog.height(Player.allPlayers.length + 1);

      parent.addChild(this.bagLog, this.turnLog, this.textLog);
      parent.stage.update()
    }

    this.setupUndoButtons(55, 60, 45, bgr) // & enableHexInspector()

    this.on(S.add, this.gamePlay.playerMoveEvent, this.gamePlay)[S.Aname] = "playerMoveEvent"
  }

  makeShifter() {
    const splitRowHex = (name: string, ndx: number) => this.splitRowHex(name, ndx);
    const auctionTiles = this.gamePlay.auctionTiles, tileBag = this.gamePlay.shifter.tileBag;
    const shifter = this.gamePlay.shifter = new AuctionShifter2(auctionTiles, this, splitRowHex);
    shifter.tileBag.push(...tileBag); tileBag.length = 0; // pour bag into new shifter.

    shifter.hexes.forEach((hex, hexi) => {
      const ndx = shifter.getNdx(hexi);
      const repaint = shifter.getPlayer(hexi, true);  // true -> always repaint, curPlayer
      this.addCostCounter(hex, `Shifter-${hexi}`, ndx, repaint); // auctionHex
    });

    const n2 = Math.min(TP.auctionMerge, TP.preShiftCount);// typically: preShiftCount = min(1, nMerge)
    playerColors.forEach((pc, pNdx) => {
      for (let i = 0; i < n2; i++) {
        this.gamePlay.shifter.shift(pNdx);
      }
    });
    for (let i = 0; i < TP.preShiftCount - n2; i++) {
      this.gamePlay.shiftAuction();
    }
    this.hexMap.update();
  }

  makeRecycleHex(row: number, col: number) {
    const name = 'Recycle'
    const image = new Tile(name).addImageBitmap(name); // ignore Tile, get image.
    image.y = -TP.hexRad / 2; // recenter

    const rHex = this.newHex2(row, col, name, RecycleHex);
    rHex.rcText.visible = rHex.distText.visible = false;
    rHex.setHexColor(C.WHITE);
    rHex.cont.addChild(image);
    rHex.cont.updateCache();
    return rHex;
  }

  makeDebtHex(row: number, col: number) {
    const debtHex = this.newHex2(row, col, 'Debt', DebtHex);
    debtHex.rcText.visible = debtHex.distText.visible = false;

    // Note: debtTile is not draggable, but its children are!
    const debtTile = new WhiteTile('debt', undefined, 0, 0, 0, 0);
    debtTile.moveTo(debtHex);

    const availDebt = 30;
    Debt.makeSource(debtHex, availDebt);
    return debtHex;
  }

  makeEventHex() {
    const eventHex = this.newHex2(0, this.col00, 'eventHex', EventHex, -1);
    // show Mark and Tile enlarged: [note: we only make 1 EventHex]
    const eventCont = eventHex.mapCont.eventCont;
    eventCont.scaleX = eventCont.scaleY = TP.eventScale;
    eventCont.x = eventHex.x; eventCont.y = eventHex.y;  // align EventCont with eventHex
    return eventHex;
  }

  makeResaHexes() {
    const nDraw = TP.nResaDraw;
    const resaCont = this.hexMap.mapCont.resaCont;
    for (let ndx = 0; ndx < nDraw; ndx++) {
      const slot = this.col00 + (TP.auctionSlots - nDraw) + ndx;
      const hex = this.newHex2(0, slot, `resaHex:${ndx}`, ResaHex, -1);
      resaCont.addChild(hex.cont);
      this.gamePlay.resaHexes[ndx] = hex;
    }
  }

  setAuctionVis(vis: boolean) {
    const gamePlay = this.gamePlay;
    gamePlay.auctionHexes.forEach((hex, ndx) => {
      if (hex.tile) hex.tile.visible = vis;
      if (hex instanceof Hex2) {
        hex.cont.visible = vis;
        const counter = gamePlay.costIncHexCounters.get(hex);
        if (counter) counter.visible = vis;
      }
    })
  }

  // col locations, left-right mirrored:
  colf(pIndex: number, icol: number, row: number) {
    const dc = 14 - Math.abs(row) % 2;
    const col = (pIndex == 0 ? (icol) : (dc - icol));
    return { row, col };
  }

  makePerPlayer() {
    this.buttonsForPlayer.length = 0; // TODO: maybe deconstruct
    Player.allPlayers.forEach((p, pIndex) => {
      this.layoutButtonsAndCounters(p);
      p.makePlayerBits();
      const colf = (col: number, row: number) => this.colf(pIndex, col, row);

      let col0 = -2;
      const leaderHexes = p.allLeaders.map((meep, ndx) => this.homeRowHex(meep.Aname, colf(ndx + col0, -1)));
      // place [civic/leader, academy/police] meepleHex on Table/Hex (but not on Map)
      this.leaderHexes[pIndex] = leaderHexes;
      p.allLeaders.forEach((meep, i) => {
        const homeHex = meep.homeHex = meep.civicTile.homeHex = leaderHexes[i];
        meep.moveTo(homeHex);
        meep.civicTile.moveTo(homeHex);
        this.addCostCounter(homeHex, `${meep.Aname}-c`, TP.auctionSlots - 3, p); // leaderHex[plyr]
      })

      const policeHex = this.homeRowHex(`PHex:${pIndex}`, colf(col0++, 0));
      this.addCostCounter(policeHex, undefined, -1, false); // academyHex[plyr]: no Counter, no incr, no repaint
      p.policeSource = Police.makeSource(p, policeHex, TP.policePerPlayer);

      const crimeHex = this.homeRowHex(`Barbs:${pIndex}`, colf(col0++, 0));
      this.addCostCounter(crimeHex, undefined, -1, false);
      p.criminalSource = Criminal.makeSource(p, crimeHex, TP.criminalPerPlayer);

      const locs = { Busi: [col0++, 0], Resi: [col0++, 0], Monument: [col0, -1] };

      this.gamePlay.marketTypes.forEach((type, ndx) => {
        const [col, row] = locs[type.name];
        const hex = this.homeRowHex(type.name, colf(col, row)); // Busi/Resi-MarketHex
        const source = this.gamePlay.marketSource[pIndex][type.name] = new TileSource<Tile>(type, p, hex);
        for (let i = 0; i < TP.inMarketPerPlayer[type.name]; i++) {
          source.availUnit(new type(undefined, p));
        }
        source.nextUnit();
        this.addCostCounter(hex, type.name, TP.auctionSlots - 3, p);  // Busi/Resi/Monument market
        const gamePlay = this.gamePlay, cic = this.gamePlay.costIncHexCounters.get(hex);
        source.counter.on(TileSource.update, () => gamePlay.updateCostCounter(cic), gamePlay);
      })

      // TODO: move to method, use to implemented 'extra reserve' Policy
      const addReserveHex = (pIndex: number, i: number) => {
        const rhex = this.homeRowHex(`Reserve:${pIndex}-${i}`, colf(col0++, 0));
        this.addCostCounter(rhex, `rCost-${i}`, TP.auctionSlots - 3, false); // reserveHexes[plyr]
        this.reserveHexes[pIndex].push(rhex);
      }
      this.reserveHexes[pIndex] = [];
      for (let i = 0; i < TP.reserveSlots; i++) {
        addReserveHex(pIndex, i);
      }

      const pRowCol = [[2, -1], [2, -2], [1, -2], [3, -2], [4, -2], [4, -1]];
      TP.nPolicySlots; p.policyHexes.forEach((hex, ndx, ary) => {
        const [r, c] = pRowCol[ndx];
        const pHex = this.homeRowHex(`policy:${pIndex}-${ndx}`, colf(c, r), 0);
        ary[ndx] = pHex;
      });
      {
        // the [colx, rowy] grid is NOT aligned with hexMap... (although 2 is close...)
        const adjC = (col: number) => ((col - .165) * 1.2);
        const inflH = this.noRowHex(`inflH:${pIndex}`, this.colf(pIndex, adjC(1.5), (2)), BonusHex);
        const econH = this.noRowHex(`econH:${pIndex}`, this.colf(pIndex, adjC(1.21), (2.68)), BonusHex);
        InflToken.makeSource(p, inflH, 0);
        EconToken.makeSource(p, econH, 0);
      }
      {
        // Show Player's balance text:
        const bText = p.balanceText, parent = this.scaleCont, n = TP.nHexes;
        const hexC2 = this.hexMap[n][colf(2, n).col] as Hex2;
        const hexR1 = this.hexMap.getCornerHex('NW') as Hex2;
        const x = hexC2.x, y = hexR1.y - .3 * TP.hexRad * H.sqrt3;
        hexC2.cont.parent.localToLocal(x, y, parent, bText);
        parent.addChild(bText);
      }
      {
        // Win indicators:
        const parent = this.hexMap.mapCont.capCont;
        const cont = this.winIndForPlayer[pIndex] = new Container();
        const refHex = this.hexMap.centerHex;
        const { x, y, w, h } = refHex.xywh();
        const x0 = x - 3 * w * (1 - 2 * pIndex);
        const y0 = y - 8 * this.hexMap.rowHeight;
        refHex.cont.parent.localToLocal(x0, y0, parent, cont);
        parent.addChild(cont);
      }
    });
  }
  readonly winIndForPlayer: Container[] = [];

  readonly buttonsForPlayer: Container[] = [];
  private contForPlayer(index: number) {
    const parent = this.scaleCont;
    const ppt = (dir: HexDir) => {
      const hex = this.hexMap.getCornerHex(dir) as Hex2;
      const { x, y } = hex.xywh(); // on hex.cont.parent = hexMap.mapCont.hexCont
      return hex.cont.parent.localToLocal(x, y, parent);
    }
    const cont = new Container()
    cont.x = ppt([H.W, H.E][index]).x;
    cont.y = ppt(H.NW).y;
    cont.visible = false;
    parent.addChild(cont); // Container for Player's Buttons
    this.buttonsForPlayer[index] = cont;
    return cont;
  }

  /** per player buttons to invoke GamePlay */
  layoutButtonsAndCounters(player: Player) {
    const index = player.index;
    const cont = this.buttonsForPlayer[index] = this.contForPlayer(index);
    const { w, h } = this.hexMap.centerHex.xywh();
    const rowy = (i: number) => { return (i - .5) * h / 2}
    const align = (['left', 'right'] as const)[index], dir = [1, -1][index];
    const bLabels = [{ l: 'reserve', fs: .6, key: 'r' }, { l: 'Done', key: 'd' }] as { l: string, fs?: number, key?: string }[]
    let dw = 0;
    bLabels.forEach(({ l: label, fs, key }, i) => {
      const b = new ButtonBox(label, label, 'lightgreen', TP.hexRad * (fs ?? .6));
      b.attachToContainer(cont, { x: (3.2 * w + dw) * dir, y: rowy(0 - 1.1) }) // just a ['Done'] label/button
      b.boxAlign(align);
      b.on(S.click, () => this.doButton(label), this)[S.Aname] = `b:${label}`;
      dw += (b.wide + 9 * TP.hexRad / 60);
      const k = key ?? label.substring(0, 1).toLowerCase();
      KeyBinder.keyBinder.setKey(k, () => this.doButton(label))
    })
    this.layoutCounters(player, cont, rowy);
  }

  layoutCounters(player: Player, cont: Container, rowy: (row: number) => number) {
    const counterCont = this.scaleCont;
    const col0 = 2;
    const index = player.index, dir = [1, -1][index]
    const colx = (coff = 0) => dir * (col0 + coff) * TP.hexRad * H.sqrt3_2; // half-width column offset from col0
    const layoutCounter = (
      name: string, color: string, rowy: number, coff = 0,
      incr: boolean | NumCounter = true,
      claz = NumCounterBox
    ) => {
      //: new (name?: string, iv?: string | number, color?: string, fSize?: number) => NumCounter
      const cname = `${name}Counter`, fSize = TP.hexRad * .75;
      const counter = player[cname] = new claz(`${cname}:${index}`, 0, color, fSize)
      counter.setLabel(`${name}s`, { x: 0, y: fSize / 2 }, fSize / 4);
      const pt = cont.localToLocal(colx(coff), rowy, counterCont)
      counter.attachToContainer(counterCont, pt);
      counter.clickToInc(incr);
      return counter
    };
    const adjC = (n: number) => (n * 1.2);
    layoutCounter('action', C.YELLOW, rowy(0)); player.actionCounter;
    layoutCounter('coin', C.coinGold, rowy(1)); player.coinCounter;                      // --> player.coins
    layoutCounter('econ', C.GREEN, rowy(1), adjC(1 + index), false); player.econCounter; // --> player.econs
    layoutCounter('expense', C.GREEN, rowy(1), adjC(2 - index), false); player.expenseCounter;
    layoutCounter('Infl', 'grey', rowy(2)); player.InflCounter;
    layoutCounter('Econ', 'white', rowy(3)); player.EconCounter;
    layoutCounter('capture', 'lightblue', rowy(4), adjC(-2)); player.captureCounter;
    layoutCounter('vp', C.briteGold, rowy(4), 0, false); player.vpCounter;
    layoutCounter('vp0', C.briteGold, rowy(4), adjC(-1), player.vpCounter); player.vp0Counter;
    layoutCounter('totalVp', C.briteGold, rowy(5), 0, false, DecimalCounter); player.totalVpCounter;
    layoutCounter('tvp0', C.briteGold, rowy(5), adjC(-1), player.totalVpCounter); player.tvp0Counter;
  }

  /**
  // Start: SetPlayer, RollForCrime, Shift Auction,
  // Do Reserve (add to Reserve Hexes)
  // Do Crime (place, move, attack/resolve)
  // Do Police (place, move, attack/resolve, collateral, dismiss)
  // Do Build (place, move, build)
  // Done: enable other player buttons
  */
  doButton(label: string) {
    const player = this.gamePlay.curPlayer, pIndex = player.index
    console.log(stime(this, `.doButton:`), label)
    switch (label) {
      case 'Start': {
        player.actions = 1;
        break;
      }
      case 'Crime': {
        break;
      }
      case 'Police': {
        break;
      }
      case 'Build': {
        break;
      }
      case 'Reserve': {
        break;
      }
      case 'reserve': {
        this.gamePlay.resaAction();
        break;
      }
      case 'Done': {
        this.gamePlay.endTurn();
        break;
      }
    }
  }
  makeDragable(tile: Tile) {
    const dragger = this.dragger;
    dragger.makeDragable(tile, this, this.dragFunc, this.dropFunc);
    dragger.clickToDrag(tile, true); // also enable clickToDrag;
  }

  startGame() {
    // initialize Players & TownStart & draw pile
    // All Tiles (Civics, Resi, Busi, PStation, Lake, & Meeple) are Draggable:
    Tile.allTiles.filter(tile => tile.isDragable).forEach(tile => {
      this.makeDragable(tile);
    })
    BonusTile.addToMap(this);

    this.gamePlay.forEachPlayer(p => {
      p.initialHex.forEachLinkHex(hex => hex.isLegal = true, true )
      this.hexMap.update();
      // place Town on hexMap
      p.placeTown();
      p.initialHex.forEachLinkHex(hex => hex.isLegal = false, true )
      this.toggleText(false)
    })
    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])
  }

  hexUnderObj(dragObj: DisplayObject) {
    const pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.mapCont.hexCont);
    return this.hexMap.hexUnderPoint(pt.x, pt.y);
  }

  dragContext: DragContext;
  dragFunc(tile: Tile, info: MinDragInfo) {
    const hex = this.hexUnderObj(tile); // clickToDrag 'snaps' to non-original hex!
    this.dragFunc0(tile, info, hex);
  }

  /** interpose inject drag/start actions programatically */
  dragFunc0(tile: Tile, info: MinDragInfo, hex = this.hexUnderObj(tile)) {
    let ctx = this.dragContext;
    if (info?.first) {
      if (ctx?.tile) {
        // clickToDrag intercepting a drag in progress!
        // mouse not over drag object! fix XY in call to dragTarget()
        console.log(stime(this, `.dragFunc: OOPS! adjust XY on dragTarget`), ctx);
        this.stopDragging(ctx.targetHex); // stop original drag
        this.dragger.stopDrag();          // stop new drag;  this.dropFunc(ctx.tile, ctx.info);
        return;
      }
      const event = info.event?.nativeEvent;
      tile.fromHex = tile.hex as Hex2;  // dragStart: set tile.fromHex
      ctx = this.dragContext = {
        tile: tile,                  // ASSERT: hex === tile.hex
        targetHex: tile.fromHex,     // last isLegalTarget() or fromHex
        lastShift: event?.shiftKey,
        lastCtrl:  event?.ctrlKey,
        info: info,
        nLegal: 0,
      }
      this.dragStart(tile, ctx);     // canBeMoved, isLegalTarget, tile.dragStart(ctx);
      if (!ctx.tile) return;         // stopDragging() was invoked
    }
    this.checkShift(hex, ctx);
    tile.dragFunc0(hex, ctx);
  }

  // invoke dragShift 'event' if shift state changes
  checkShift(hex: Hex2, ctx: DragContext) {
    const nativeEvent = ctx.info.event?.nativeEvent
    ctx.lastCtrl = nativeEvent?.ctrlKey;
    // track shiftKey because we don't pass 'event' to isLegalTarget(hex)
    const shiftKey = nativeEvent?.shiftKey;
    if (shiftKey !== ctx.lastShift || ctx.targetHex !== hex) {
      ctx.lastShift = shiftKey;
      // do shift-down/shift-up actions...
      this.dragShift(ctx.tile, shiftKey, ctx); // was interesting for hexmarket
    }
  }

  dragStart(tile: Tile, ctx: DragContext) {
    // press SHIFT to capture [recycle] opponent's Criminals or Tiles
    const reason = tile.cantBeMovedBy(this.gamePlay.curPlayer, ctx);
    if (reason) {
      console.log(stime(this, `.dragStart: ${reason}: ${tile.andInfStr},`), 'ctx=',{...ctx});
      this.logText(`${reason}: ${tile.andInfStr}`, 'Table.dragStart');
      this.stopDragging();
    } else {
      // mark legal targets for tile; SHIFT for all hexes, if payCost
      const hexIsLegal = (hex: Hex2) => ctx.nLegal += ((hex !== tile.hex) && (hex.isLegal = tile.isLegalTarget(hex, ctx)) ? 1 : 0);
      tile.markLegal(this, hexIsLegal, ctx);           // delegate to check each potential target
      this.gamePlay.recycleHex.isLegal = tile.isLegalRecycle(ctx); // do not increment ctx.nLegal!
      tile.dragStart(ctx);  // which *could* reset nLegal ?
      this.gamePlay.eventHex.cont.updateCache();  // <--- QQQ: is this the right place? conditional?
      this.hexMap.update();
      if (ctx.nLegal === 0) {
        tile.noLegal();
        if (!this.gamePlay.recycleHex.isLegal) {
          this.stopDragging(); // actually, maybe let it drag, so we can see beneath...
        }
      }
    }
  }

  /** state of shiftKey has changed during drag */
  dragShift(tile: Tile, shiftKey: boolean, ctx: DragContext) {
    tile?.dragShift(shiftKey, ctx);
  }

  dropFunc(tile: Tile, info: MinDragInfo, hex = this.hexUnderObj(tile)) {
    tile.dropFunc0(hex, this.dragContext);
    tile.markLegal(this); // hex => hex.isLegal = false;
    this.gamePlay.recycleHex.isLegal = false;
    this.dragContext.lastShift = undefined;
    this.dragContext.tile = undefined; // mark not dragging
  }

  /** synthesize dragStart(tile), tile.dragFunc0(hex), dropFunc(tile);  */
  dragStartAndDrop(tile: Tile, toHex: Hex) {
    if (!tile) return; // C-q when no EventTile on eventHex
    const info = { first: true }, hex = toHex as Hex2;
    this.dragFunc0(tile, info, tile.hex as Hex2);  // dragStart()
    tile.dragFunc0(hex, this.dragContext);
    this.dropFunc(tile, info, hex);
  }

  private isDragging() { return this.dragContext?.tile !== undefined; }

  /** Force this.dragger to drop the current drag object on given target Hex */
  stopDragging(target: Hex2 = this.dragContext?.tile?.fromHex) {
    //console.log(stime(this, `.stopDragging: dragObj=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (this.isDragging()) {
      if (target) this.dragContext.targetHex = target;
      this.dragger.stopDrag(); // ---> dropFunc(this.dragContext.tile, info)
    }
  }

  /** Toggle dragging: dragTarget(target) OR stopDragging(targetHex)
   * - attach supplied target to mouse-drag (default is eventHex.tile)
   */
  dragTarget(target: DisplayObject = this.gamePlay.eventHex.tile, xy: XY = { x: TP.hexRad / 2, y: TP.hexRad / 2 }) {
    if (this.isDragging()) {
      this.stopDragging(this.dragContext.targetHex) // drop and make move
    } else if (target) {
      this.dragger.dragTarget(target, xy);
    }
  }

  logCurPlayer(plyr: Player) {
    const history = this.gamePlay.history
    const tn = this.gamePlay.turnNumber
    const dice = this.gamePlay.dice.text.text;
    const lm = history[0]
    const prev = lm ? `${lm.Aname}${lm.ind}#${tn-1}` : ""
    const board = !!this.hexMap.allStones[0] && lm?.board // TODO: hexMap.allStones>0 but history.len == 0
    const robo = plyr.useRobo ? AT.ansiText(['red','bold'],"robo") : "----";
    const coins = plyr.coins, econs = plyr.econs, vps = plyr.vps, tvps = plyr.totalVps, vpr = plyr.vpsPerRound.toFixed(1);
    const info = { turn: `#${tn}`, plyr: plyr.Aname, coins, econs, exp: plyr.expenses, vps, tvps, vpr, prev, gamePlay: this.gamePlay, curPlayer: plyr, board }
    console.log(stime(this, `.logCurPlayer --${robo}--`), info);
    const inc = plyr.econs + plyr.expenses;
    this.logTurn(`#${tn}: ${plyr.Aname} ${dice} \$${coins} ${inc >= 0 ? '+' : '-'}${inc} vp: ${vps} tvp: ${tvps}`);
  }
  showRedoUndoCount() {
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
  }
  showNextPlayer(log: boolean = true) {
    let curPlayer = this.gamePlay.curPlayer // after gamePlay.setNextPlayer()
    if (log) this.logCurPlayer(curPlayer)
    this.showRedoUndoCount()
  }

  _tablePlanner: TablePlanner
  get tablePlanner() {
    return this._tablePlanner ||
    (this._tablePlanner = new TablePlanner(this.gamePlay))
  }
  /**
   * All manual moves feed through this (drop & redo)
   * TablePlanner.logMove(); then dispatchEvent() --> gamePlay.doPlayerMove()
   *
   * New: let Ship (Drag & Drop) do this.
   */
  doTableMove(ihex: IHex) {
  }
  /** All moves (GUI & player) feed through this: */
  moveStoneToHex(ihex: IHex, sc: PlayerColor) {
    // let hex = Hex.ofMap(ihex, this.hexMap)
    // this.hexMap.showMark(hex)
    // this.dispatchEvent(new HexEvent(S.add, hex, sc)) // -> GamePlay.playerMoveEvent(hex, sc)
  }

  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  scaleParams = { initScale: .125, scale0: .05, scaleMax: 4, steps: 30, zscale: .20,  };

  dispatchPressup(target: DisplayObject, ctd = true) { return this.dragger.getDragData(target)  }
  /** Move [dragable] target to mouse as if clickToDrag at {x,y}. */
  dragTargetPatch(target: DisplayObject, dxy: XY = { x: 0, y: 0 }) {
    // invoke 'click' to start drag;
    const dragData = this.dispatchPressup(target);
    // if pressup -> dragStart -> dragStop then dragCtx = undefined!
    if (!dragData.dragCtx) return;
    dragData.dragCtx.dxy = dxy
    target.parent.globalToLocal(target.stage.mouseX, target.stage.mouseY, target) // move target to mouseXY
    target.x -= dxy.x                // offset by dxy
    target.y -= dxy.y
    target.stage.update()            // move and show new position
  }
  /** makeScaleableBack and setup scaleParams
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean): ScaleableContainer {
    /** scaleCont: a scalable background */
    const scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    this.dragger = new Dragger(scaleC);
    this.dragger.dragTarget = this.dragTargetPatch; // PATCH until next easeljs-lib
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale("a", scaleC, 980, TP.hexRad);
      KeyBinder.keyBinder.setKey('Space',   { thisArg: this, func: () => this.dragTarget() });
      KeyBinder.keyBinder.setKey('S-Space', { thisArg: this, func: () => this.dragTarget() });
      KeyBinder.keyBinder.setKey('S-s', { thisArg: this, func: () => StarToken.dragToken() });
    }
    return scaleC;
  }

  /** put a Rectangle Shape at (0,0) with XYWH bounds as given */
  setBackground(parent: Container, bounds: XYWH, bgColor: string = TP.bgColor) {
    let bgRect = new Shape(); bgRect[S.Aname] = "BackgroundRect"
    if (!!bgColor) {
      // specify an Area that is Dragable (mouse won't hit "empty" space)
      bgRect.graphics.f(bgColor).r(bounds.x, bounds.y, bounds.w, bounds.h);
      parent.addChildAt(bgRect, 0);
      //console.log(stime(this, ".makeScalableBack: background="), background);
    }
    return bgRect
  }
  /**
   * @param xos x-offset-to-center in Original Scale
   * @param xos y-offset-to-center in Original Scale
   * @param scale Original Scale
   */
  // bindKeysToScale(scaleC, 800, 0, scale=.324)
  bindKeysToScale(char: string, scaleC: ScaleableContainer, xos: number, yos: number) {
    xos = xos * TP.hexRad / 60;
    let ns0 = scaleC.getScale(), sXY = { x: -scaleC.x, y: -scaleC.y } // generally == 0,0
    let nsA = scaleC.findIndex(.45 * 60 / TP.hexRad), apt = { x: -xos, y: -yos }
    let nsZ = scaleC.findIndex(.30 * 60 / TP.hexRad), zpt = { x: -xos*2, y: -yos }

    // set Keybindings to reset Scale:
    /** xy in [unscaled] model coords; sxy in screen coords */
    const setScaleXY = (si?: number, xy?: XY, sxy: XY = sXY) => {
      let ns = scaleC.setScaleXY(si, xy, sxy)
      //console.log({si, ns, xy, sxy, cw: this.canvas.width, iw: this.map_pixels.width})
      this.stage.update()
    }
    let setScaleZ = () => {
      ns0 = scaleC.getScale()
      nsZ = scaleC.findIndex(ns0)
      zpt = { x: -scaleC.x/ns0, y: -scaleC.y/ns0 }
    };
    let goup = () => {
      this.stage.getObjectsUnderPoint(500, 100, 1)
    }

    // Scale-setting keystrokes:
    KeyBinder.keyBinder.setKey("x", { func: () => setScaleZ() });
    KeyBinder.keyBinder.setKey("z", { func: () => setScaleXY(nsZ, zpt) });
    KeyBinder.keyBinder.setKey("a", { func: () => setScaleXY(nsA, apt) });
    KeyBinder.keyBinder.setKey("p", { func: () => goup(), thisArg: this});
    KeyBinder.keyBinder.dispatchChar(char)
  }
}

export interface IAuctionShifter {
  hexes: Hex[];
  /** source of Tiles to shift into this auction. */
  tileBag: TileBag<BagTile> & EventDispatcher;
  /** select a Tile (for curPlayer), shift it into auctionTiles */
  shift(pIndex?: number, alwasyShift?: boolean, type?: new (...args: any[]) => BagTile): void;
  /** names of tiles avail to given Player */
  tileNames(pIndex: number): string;
  /** return Player controlling AuctionTile in absolute-index (based on nMerge) */
  getPlayer(hexi: number, alt: boolean): Player | boolean;
  /** return absolute index associated with given player-relative index. */
  getNdx(hexi: number): number;
}

export class AuctionShifter implements IAuctionShifter {
  readonly hexes: Hex[] = [];
  readonly maxndx: number;
  readonly tileBag = new TileBag<BagTile>() as TileBag<BagTile> & EventDispatcher;

  constructor(
    readonly tiles: BagTile[],
    public nm = TP.auctionMerge,  // merge per-player arrays of length nm into nm * 2; nm-1 --> nm * 2
  ) {
    this.maxndx = tiles.length - 1; // Note: tiles.length = TP.auctionSlots + nm;
  }

  /** process out-shifted tile... */
  outShift(tile: BagTile) {
    tile.sendHome(); // less than recycleTile(tile); no log, no capture/coins
  }

  /** player's leftmost tile; the latest tile selected and shifted in. */
  tile0(pIndex: number) {
    return this.tiles[pIndex * this.nm];
  }

  isEmptySlot(pIndex: number) {
    const nm = this.nm, tiles = this.tiles;
    for (let n = pIndex * nm; n < tiles.length; n += (nm > 0 && n == nm - 1) ? nm + 1 : 1 ) {
      if (!tiles[n]) return true;
    }
    return false;
  }

  isPolicy(pIndex: number) {
    const nm = this.nm, tiles = this.tiles;
    for (let n = pIndex * nm; n < tiles.length; n += (nm > 0 && n == nm - 1) ? nm + 1 : 1 ) {
      if (tiles[n] instanceof PolicyTile) return true;
    }
    return false;
  }

  shift(pIndex = 0, alwaysShift = TP.alwaysShift, drawType?: Constructor<BagTile>) {
    const shiftForPolicy = TP.alwaysShiftPolicy && this.isPolicy(pIndex);
    if (!shiftForPolicy && !alwaysShift && !this.isEmptySlot(pIndex)) return; // nothing to shift
    const nm = this.nm, tiles = this.tiles
    const tile = drawType ? this.tileBag.takeType(drawType) : this.tileBag.selectOne();
    const hexes = this.hexes
    tile?.setPlayerAndPaint(Player.allPlayers[pIndex]);

    // put tile in slot-n (move previous tile to n+1)
    const shift1 = (tile: BagTile, n: number) => {
      if (!!tiles[n]) {
        if (n < this.maxndx) {
          shift1(tiles[n], (nm > 0 && n == nm - 1) ? 2 * nm : n + 1);
        } else {
          this.outShift(tiles[n]);
        }
        tiles[n] = undefined
      }
      tile?.moveTo(hexes[n])
      // ASSERT: tiles[n] is undefined
      tiles[n] = tile;
    }
    shift1(tile, pIndex * nm);  // [0, this.nm][pIndex]
    console.log(stime(this, `.shift(${drawType?.name ?? ''})`), tiles.slice())
  }

  getNdx(hexi: number) {
    return (hexi < this.nm) ? hexi : (hexi - this.nm);
  }

  getPlayer(hexi: number, alt: boolean = undefined): Player | boolean {
    return (hexi < 0) ? alt :
      hexi < this.nm ? Player.allPlayers[0] :
        hexi < 2 * this.nm ? Player.allPlayers[1] :
          alt;
  }

  tileNames(pIndex: number): string {
    const names: string[] = [];
    for (let i = pIndex * this.nm; i <= this.maxndx; i = (i == this.nm - 1) ? (2 * this.nm) : (i + 1)) {
      names.push(this.tiles[i]?.Aname ?? '---');
    }
    return names.reduce((pv, cv, ci) => `${pv}${ci === 0 ? '' : ', '}${cv}`);
  }
}

/** with a Table & tileCounter (& position dice!) */
export class AuctionShifter2 extends AuctionShifter {
  override hexes: Hex2[] = [];

  tileCounter: NumCounter;  // number of Tiles in tileBag

  constructor(
    tiles: BagTile[],
    readonly table: Table,
    newHex: (name: string, ndx: number) => Hex2,
  ) {
    super(tiles);
    for (let i = 0; i <= this.maxndx; i++) {
      // make auctionHex:
      // from Table.layoutTable(); sets parent = hexMap.mapCont.hexCont; hex.x, hex.y
      this.hexes.push(newHex(`auction${i}`, i))
    }
    const counterCont = table.hexMap.mapCont.counterCont, gamePlay = table.gamePlay, rad = TP.hexRad;
    const counter = this.tileCounter = new NumCounter('tileCounter', this.tileBag.length, 'lightblue', rad / 2);
    // show counter (& dice) to side of hexes:
    const hex0 = this.hexes[0], x0 = hex0.x, x = x0 - 1.5 * rad, y0 = (hex0.y + this.hexes[this.nm].y) / 2;
    counter.attachToContainer(counterCont, { x, y: y0 - .2 * rad }, this.tileBag, TileBag.event, );
    gamePlay.dice.setContainer(counterCont,  x,    y0 + .7 * rad);
    counter.mouseEnabled = true;
    //counter.on(S.click, (evt) => table.logInBag('onClick'), table);
    this.tileBag.on(TileBag.event, table.logInBag, table);
  }
}
