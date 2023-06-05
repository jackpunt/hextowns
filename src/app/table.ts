import { AT, C, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { ButtonBox, CostIncCounter, NumCounter, NumCounterBox, PerRoundCounter } from "./counters";
import { Debt } from "./debt";
import type { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { H, XYWH } from "./hex-intfs";
import { Criminal, Police } from "./meeple";
import { Player } from "./player";
import type { StatsPanel } from "./stats";
import { PlayerColor, playerColor0, playerColor1, playerColors, TP } from "./table-params";
import { AuctionTile, NoDragTile, Tile, TileBag } from "./tile";
import { TileSource } from "./tile-source";
//import { TablePlanner } from "./planner";


/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) {}
}
interface StageTable extends Stage {
  table: Table;
}

export interface DragContext {
  originHex: Hex2;      // where Tile was picked
  targetHex: Hex2;      // last isLegalTarget() or originHex
  lastShift: boolean;   // true if Shift key is down
  lastCtrl: boolean;    // true if control key is down
  info: DragInfo;
  tile: Tile;           // the DisplayObject being dragged
}

class TextLog extends Container {
  constructor(public Aname: string, nlines = 6, public size: number = 30, public lead = 3) {
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

  log(line: string) {
    console.log(stime(this, ` ${this.Aname}.log:`), line);
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
  undoText: Text = new Text('', F.fontSpec(30));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30));  // length of history stack
  winText: Text = new Text('', F.fontSpec(40), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(-180, -5, 360, 130))

  dragger: Dragger

  constructor(stage: Stage) {
    super();

    // backpointer so Containers can find their Table (& curMark)
    Table.table = (stage as StageTable).table = this;
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage.canvas) // scaleCont & background
  }
  turnLog = new TextLog('turnLog', 2);  // shows the last 2 start of turn lines
  textLog = new TextLog('textLog', TP.textLogLines); // show other interesting log strings.
  logTurn(line: string) {
    this.turnLog.log(line);
  }
  logText(line: string) {
    this.textLog.log(`#${this.gamePlay.turnNumber}: ${line}`);
  }
  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH) {
    let undoC = this.undoCont; undoC.name = "undo buttons" // holds the undo buttons.
    this.scaleCont.addChild(this.undoCont)
    let { x: wx, y: wy} = this.hexMap.getCornerHex('W').xywh()
    this.hexMap.mapCont.hexCont.localToLocal(wx, wy + this.hexMap.rowHeight * 3, undoC.parent, undoC);
    let progressBg = new Shape(), bgw = 200, bgym = 240, y0 = 0
    let bgc = C.nameToRgbaString(TP.bgColor, .8)
    progressBg.graphics.f(bgc).r(-bgw/2, y0, bgw, bgym-y0)
    undoC.addChildAt(progressBg, 0)
    this.enableHexInspector()
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
  enableHexInspector(qY = 52) {
    let qShape = new Shape()
    qShape.graphics.f("black").dp(0, 0, 20, 6, 0, 0)
    qShape.y = qY  // size of 'skip' Triangles
    this.undoCont.addChild(qShape)
    this.dragger.makeDragable(qShape, this,
      // dragFunc:
      (qShape: Shape, ctx: DragInfo) => { },
      // dropFunc:
      (qShape: Shape, ctx: DragInfo) => {
        this.downClick = true
        let hex = this.hexUnderObj(qShape)
        qShape.x = 0; qShape.y = qY // return to regular location
        this.undoCont.addChild(qShape)
        if (!hex) return
        let info = hex; //{ hex, stone: hex.playerColor, InfName }
        console.log(`HexInspector:`, hex.Aname, info)
      })
    qShape.on(S.click, () => this.toggleText(), this) // toggle visible
    this.toggleText(false)         // set initial visibility
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
    let infCounter = new CostIncCounter(hex, `${name ?? '?'}Inf`, ndx, repaint);
    if (!name) {
      infCounter.parent.removeChild(infCounter); // not used as DisplayObject
    }
    this.gamePlay.costIncHexCounters.set(hex, infCounter);
    return hex;
  }

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    const hexMap = this.hexMap = gamePlay.hexMap
    hexMap.addToMapCont();               // addToMapCont; make Hex2
    hexMap.makeAllDistricts();           // typically: (4,2)

    const mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont)

    // background sized for hexMap:
    const { x: rx, y: ry, width: rw, height: rh } = hexCont.getBounds()
    const rowh = hexMap.rowHeight, colw = hexMap.colWidth
    const bgr: XYWH = { x: 0, y: -rowh * .6, w: rw + 2 * colw, h: rh + 4 * rowh }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = (bgr.w - bgr.x) / 2
    mapCont.y = (bgr.h - bgr.y) / 2

    this.bgRect = this.setBackground(this.scaleCont, bgr) // bounded by bgr
    const p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, hexCont)
    const pbr = this.scaleCont.localToLocal(bgr.w, bgr.h, hexCont)
    hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)

    this.homeRowHexes.length = 0;
    this.reserveHexes.forEach(ary => ary.length = 0);
    const makeHex2 = (row = 0, col = 0, name: string) => {
      const hex = new Hex2(this.gamePlay.hexMap, row, col, name)
      hex.distText.text = name;
      return hex
    }

    const topRowHex = (name: string, crxy = { col: 7, row: -1 }, dy = 0) => {
      const {col, row} = crxy;
      const sy = (-.4 + .3 * row) * rowh // {-1: -.7, 0: -.4}
      const hex = makeHex2(row, col, name)
      this.homeRowHexes.push(hex);
      hex.y += (sy + dy)
      hex.legalMark.setOnHex(hex);
      return hex
    }

    const nm = TP.auctionMerge;
    const splitRowHex = (name: string, ndx: number) => {
      const col0 = 5.5, row = 0;
      return ndx < nm ? topRowHex(name, {col: col0 + ndx, row}, -TP.hexRad * 2) : // shift UP 2 when split
        ndx < 2 * nm ? topRowHex(name, {col: col0 + ndx - nm, row}) :             // stay DOWN when split
          topRowHex(name, {col: col0 + ndx - nm, row}, -rowh * .65);              // shift to middle, not split
    }
    const auctionTiles = this.gamePlay.auctionTiles, tileBag = this.gamePlay.shifter.tileBag;
    const shifter = this.gamePlay.shifter = new AuctionShifter2(auctionTiles, this, splitRowHex);
    shifter.tileBag.push(...tileBag); tileBag.length = 0; // pour bag into new shifter.

    shifter.hexes.forEach((hex, hexi) => {
      const ndx = shifter.getNdx(hexi);
      const repaint = shifter.getPlayer(hexi, true)
      this.addCostCounter(hex, `Shifter-${hexi}`, ndx, repaint); // auctionHex
    });

    playerColors.forEach((pc, pNdx) => {
      for (let i = 0; i < TP.preShiftCount; i++) { // typically: preShiftCount = min(1, nMerge)
        this.gamePlay.shiftAuction(pNdx); // Also shift in gamePlay.startTurn()
      }
    });

    this.hexMap.update();

    this.buttonsForPlayer.length = 0; // TODO: maybe deconstruct
    Player.allPlayers.forEach((p, pIndex) => {
      this.layoutButtonsAndCounters(p);
      p.makePlayerBits();
      const offcc = 0;
      // column index for Hex in topRow(row = -1)
      const colf1 = (ndx = 7, offc = offcc) => (pIndex == 0 ? (ndx - offc) - 1 : 14 - (ndx - offc));
      // column index for Hex in 2ndRow(row = 0)
      const colf2 = (ndx = 7, offc = offcc) => (pIndex == 0 ? (ndx - offc) : 14 - (ndx - offc));
      const colf = (ndx = 7, row = -1) => { return { row, col: (row === -1) ? colf1(ndx) : colf2(ndx) } };

      const leaderHexes = p.allLeaders.map((meep, ndx) => topRowHex(meep.Aname, colf(ndx, -1)));
      // place [civic/leader, academy/police] meepleHex on Table/Hex (but not on Map)
      this.leaderHexes[pIndex] = leaderHexes;
      p.allLeaders.forEach((meep, i) => {
        const homeHex = meep.civicTile.moveTo(meep.moveTo(leaderHexes[i])) as Hex2;
        meep.homeHex = meep.civicTile.homeHex = homeHex;
        this.addCostCounter(homeHex, `${meep.Aname}-c`, 1, p); // leaderHex[plyr]
      })
      let col0 = -1;

      const academyHex = topRowHex(`Academy:${pIndex}`, colf(col0++, 0));
      this.addCostCounter(academyHex, undefined, -1, false); // academyHex[plyr]: no Counter, no incr, no repaint
      p.policeSource = Police.makeSource(p, academyHex, TP.policePerPlayer);

      const crimeHex = topRowHex(`Barbs:${pIndex}`, colf(col0++, 0));
      this.addCostCounter(crimeHex, undefined, -1, false);
      p.criminalSource = Criminal.makeSource(p, crimeHex, TP.criminalPerPlayer);

      const locs = { Busi: [col0++, 0], Resi: [col0++, 0], Monument: [col0 + 1, -1] };

      gamePlay.marketTypes.forEach((type, ndx) => {
        const [col, row] = locs[type.name];
        const hex = topRowHex(type.name, colf(col, row)); // Busi/Resi-MarketHex
        const source = gamePlay.marketSource[pIndex][type.name] = new TileSource<Tile>(type, p, hex);
        for (let i = 0; i < TP.inMarket[type.name]; i++) {
          source.availUnit(new type(p));
        }
        source.nextUnit();
        this.addCostCounter(hex, type.name, 1, p);  // Busi/Resi/Monument market
      })

      this.reserveHexes[pIndex] = [];
      for (let i = 0; i < TP.reserveSlots; i++) {
        const rhex = topRowHex(`Reserve:${pIndex}-${i}`, colf(col0++, 0));
        this.addCostCounter(rhex, `rCost-${i}`, 1, false); // reserveHexes[plyr]
        this.reserveHexes[pIndex].push(rhex);
      }


      {
        const bText = p.balanceText, parent = this.scaleCont;
        const hexC2 = this.hexMap[8][colf2(2, 0)] as Hex2, hexR1 = this.hexMap[1][3] as Hex2;
        const x = hexC2.x, y = hexR1.y - .3 * TP.hexRad * H.sqrt3;
        hexC2.cont.parent.localToLocal(x, y, parent, bText);
        parent.addChild(bText);
      }

    });

    this.gamePlay.recycleHex = this.makeRecycleHex(hexMap, 5, -.5);
    this.gamePlay.debtHex = this.makeDebtHex(hexMap, 5, 13.5);

    this.hexMap.update();
    {
      // postition turnLog & turnText
      let parent = this.scaleCont
      let rhex = this.hexMap[7][0] as Hex2; //getCornerHex('W') as Hex2;
      let rhpt = rhex.cont.parent.localToLocal(rhex.x - 9 * this.hexMap.colWidth, rhex.y, parent)
      this.turnLog.x = rhpt.x; this.turnLog.y = rhpt.y;
      this.textLog.x = rhpt.x; this.textLog.y = rhpt.y + this.turnLog.height(Player.allPlayers.length + 1);

      parent.addChild(this.turnLog, this.textLog);
      parent.stage.update()
    }

    this.setupUndoButtons(55, 60, 45, bgr) // & enableHexInspector()

    this.on(S.add, this.gamePlay.playerMoveEvent, this.gamePlay)[S.Aname] = "playerMoveEvent"
  }

  makeRecycleHex(hexMap: HexMap, row: number, col: number) {
    const name = 'Recycle', recycleTile = new Tile(undefined, name)
    const image = recycleTile.addImageBitmap(name); // scale to hexMap.
    image.y = -TP.hexRad / 2; // recenter
    const hex = new Hex2(hexMap, row, col, name);
    hex.rcText.visible = hex.distText.visible = false;
    hex.setHexColor(C.WHITE);
    hex.cont.addChild(image);
    hex.cont.updateCache();
    return hex;
  }

  makeDebtHex(hexMap: HexMap, row: number, col: number) {
    const hex = new Hex2(hexMap, row, col, 'Debt');
    const debtTile = new NoDragTile(undefined, 'debt', 0, 0, 0, 0);
    debtTile.paint(undefined, C.debtRust);
    debtTile.moveTo(hex);
    // Note: debtTile is not draggable, but its children are!

    hex.rcText.visible = hex.distText.visible = false;
    hex.setHexColor(C.grey);
    hex.cont.updateCache();

    const availDebt = 30;
    Debt.makeSource(hex, availDebt);
    return hex;
  }

  readonly buttonsForPlayer: Container[] = [];
  /** per player buttons to invoke GamePlay */
  layoutButtonsAndCounters(player: Player) {
    const parent = this.scaleCont, index = player.index;
    const chex = this.hexMap.getCornerHex([H.W, H.E][index]) as Hex2;
    const ehex = this.hexMap.getCornerHex(H.NE) as Hex2;
    const { x: cx, y: cy } = chex.xywh();
    const ptc = chex.cont.parent.localToLocal(cx, cy, parent)
    const { x: ex, y: ey, h: eh } = ehex.xywh();
    const pte = chex.cont.parent.localToLocal(ex, ey, parent)
    const cont = new Container(), offx = TP.hexRad * H.sqrt3_2;
    cont.x = ptc.x + [offx, -offx][index];
    cont.y = pte.y;
    cont.visible = false;
    parent.addChild(cont); // Container for Player's Buttons

    this.buttonsForPlayer[index] = cont;
    const bLabels = ['Start', 'Crime', 'Police', 'Build', 'Reserve', 'Done'];
    const align = (['right', 'left'] as const)[index];
    const rowy = (i: number) => { return (i - .5) * eh / 2}
    bLabels.forEach((label, i) => {
      const b = new ButtonBox(label, label, 'lightgreen', TP.hexRad * .75); // eh/3
      b.mouseEnabled = true
      b.attachToContainer(cont, { x: 0, y: rowy(i) }) // just a label
      b.setValue(label);
      b.boxAlign(align);
      b.on(S.click, () => this.doButton(label), this)[S.Aname] = `b:${label}`;
      const key = label.substring(0, 1).toLowerCase();
      KeyBinder.keyBinder.setKey(key, { thisArg: this, func: this.doButton, argVal: label })
    })
    this.layoutCounters(player, cont, rowy);
  }

  layoutCounters(player: Player, cont: Container, rowy: (row: number) => number) {
    const index = player.index, dir = [1, -1][index];
    const counterCont = this.scaleCont;
    const layoutCounter = (name: string, color: string, rowy: number, colx = 1, incr = true,
      claz = NumCounterBox) => {
      //: new (name?: string, iv?: string | number, color?: string, fSize?: number) => NumCounter
      const cname = `${name}Counter`, fSize = TP.hexRad * .75;
      const counter = player[cname] = new claz(`${cname}:${index}`, 0, color, fSize)
      counter.setLabel(`${name}s`, { x: 0, y: fSize/2 }, 12);
      const pt = cont.localToLocal(dir * (colx ) * TP.hexRad, rowy, counterCont)
      counter.attachToContainer(counterCont, pt);
      counter.mouseEnabled = true;
      if (incr) counter.on(S.click, (evt: MouseEvent) => counter.incValue((evt.nativeEvent.ctrlKey ? -1 : 1) * (evt.nativeEvent.shiftKey ? 10 : 1)));
      player[cname] = counter;
      return counter
    };
    layoutCounter('action', C.YELLOW, rowy(0));
    layoutCounter('coin', C.coinGold, rowy(1));
    layoutCounter('econ', C.GREEN, rowy(1), 2 + index, false);
    layoutCounter('expense', C.GREEN, rowy(1), 3 - index, false);
    layoutCounter('capture', 'lightblue', rowy(2));
    layoutCounter('brib', 'grey', rowy(3));
    layoutCounter('vp', C.briteGold, rowy(5), 1, false);
    layoutCounter('totalVp', C.briteGold, rowy(4), 1, false, PerRoundCounter);
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
    let actionsTaken = 0;
    console.log(stime(this, `.doButton:`), label)
    switch (label) {
      case 'Start': {
        if (player.coins >= 0) {
          player.actions += 1; // try update Actions.
        }
        break;
      }
      case 'Crime': {
        actionsTaken = 1;
        break;
      }
      case 'Police': {
        actionsTaken = 1;
        break;
      }
      case 'Build': {
        actionsTaken = 1;
        break;
      }
      case 'Reserve': {
        actionsTaken = 1;
        // dragPick (auctionCont.hexes[0, 1, 2]); click OR space to cycle through...
        let legalTargets = this.reserveHexes[pIndex];
        // on Drop(hex, tile): recycle targetHex.tile; hex.tile = targetHex;
        break;
      }
      case 'Done': {
        this.gamePlay.endTurn();
        this.gamePlay.setNextPlayer();
        break
      }
    }
    player.actionCounter.updateValue(player.actions -= actionsTaken )
    // TODO: if (player.actions <= 0) this.gamePlay.setNextPlayer();
  }

  startGame() {
    // initialize Players & TownStart & draw pile
    const dragger = this.dragger;
    // All Tiles (Civics, Resi, Busi, PStation, Lake, & Meeple) are Draggable:
    Tile.allTiles.filter(tile => !(tile instanceof NoDragTile)).forEach(tile => {
      dragger.makeDragable(tile, this, this.dragFunc, this.dropFunc);
      dragger.clickToDrag(tile, true); // also enable clickToDrag;
    })
    this.forEachTargetHex(hex => hex.isLegal = false); // redundant?

    this.gamePlay.addBonusTiles();

    this.gamePlay.forEachPlayer(p => {
      p.startHex.forEachLinkHex(hex => hex.isLegal = true, true )
      this.hexMap.update();
      // place Town on hexMap
      p.placeTown();
      p.startHex.forEachLinkHex(hex => hex.isLegal = false, true )
      this.toggleText(false)
    })
    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])
  }

  hexUnderObj(dragObj: DisplayObject) {
    if (dragObj instanceof Tile) return dragObj.hexUnderObj(this.hexMap);
    const pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.mapCont.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }

  dragContext: DragContext;
  dragFunc(tile: Tile, info: DragInfo) {
    const hex = this.hexUnderObj(tile);
    let ctx = this.dragContext;

    if (info?.first) {
      const event = info.event?.nativeEvent;
      ctx = this.dragContext = {
        tile: tile,                  // ASSERT: hex === tile.hex
        originHex: hex,              // where Tile was picked
        targetHex: hex,              // last isLegalTarget() or originHex
        lastShift: event?.shiftKey,
        lastCtrl:  event?.ctrlKey,
        info: info,
      }
      this.dragStart(tile, ctx);     // canBeMoved, isLegalTarget, tile.dragStart(ctx);
      if (!ctx.tile) return;         // stopDragging() was invoked
    }
    this.checkShift(hex, ctx);
    tile.dragFunc0(hex, ctx);
  }

  // invoke dragShift 'event' if shift state changes
  checkShift(hex: Hex2, ctx: DragContext) {
    let info = ctx.info
    ctx.lastCtrl = info.event?.nativeEvent?.ctrlKey;
    // track shiftKey because we don't pass 'event' to isLegalTarget(hex)
    const shiftKey = info.event?.nativeEvent?.shiftKey
    if (shiftKey !== ctx.lastShift || ctx.targetHex !== hex) {
      ctx.lastShift = shiftKey
      // do shift-down/shift-up actions...
      this.dragShift(ctx.tile, shiftKey, ctx); // was interesting for hexmarket
    }
  }

  forEachTargetHex(fn: (hex: Hex2) => void, inclRecycle = true) {
    for (let hex of this.homeRowHexes) { hex !== undefined && fn(hex) };
    this.hexMap.forEachHex(fn);
    fn(this.gamePlay.debtHex as Hex2);
    if (inclRecycle) fn(this.gamePlay.recycleHex as Hex2);
  }

  dragStart(tile: Tile, ctx: DragContext) {
    // press SHIFT to capture [recycle] opponent's Criminals or Tiles
    const infStr = tile?.hex?.infStr ?? '';
    if (!tile.canBeMovedBy(this.gamePlay.curPlayer, ctx)) {
      console.log(stime(this, `.dragStart: Not your tile: ${tile} ${infStr},`), 'ctx=',{...ctx});
      this.logText(`Not your tile: ${tile} ${infStr}`)
      this.stopDragging();
    } else {
      // mark legal targets for tile; SHIFT for all hexes, if payCost
      let nLegal = 0;    // hexMap & homeRowHexes & recycleHex & debtHex
      this.forEachTargetHex(hex => nLegal += (hex.isLegal = tile.isLegalTarget(hex, ctx) && hex !== tile.hex) ? 1 : 0, false);
      const isRecycle = this.gamePlay.setIsLegalRecycle(tile, ctx) ? true : false;
      if (!tile.hex.isOnMap) tile.showCostMark();
      this.hexMap.update();
      if (nLegal === 0) {
        const [infR, coinR] = this.gamePlay.getInfR(tile);
        this.logText(`No placement for ${tile} ${infStr} infR=${infR} coinR=${coinR}`)
        if (!isRecycle) {
          this.stopDragging();
          return;
        }
      }
      else tile.dragStart(ctx)
    }
  }

  /** state of shiftKey has changed during drag */
  dragShift(tile: Tile, shiftKey: boolean, ctx: DragContext) {
    tile?.dragShift(shiftKey, ctx);
  }

  dropFunc(tile: Tile, info: DragInfo) {
    tile.dropFunc0(this.hexUnderObj(tile), this.dragContext)
    this.forEachTargetHex(hex => (hex.isLegal = false))
    this.dragContext.lastShift = undefined;
    this.dragContext.tile = undefined; // mark not dragging
  }

  isDragging() { return this.dragContext?.tile !== undefined }

  /** Force this.dragger to drop the current drag object on given target Hex */
  stopDragging(target: Hex2 = this.dragContext.originHex) {
    //console.log(stime(this, `.stopDragging: dragObj=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (!this.isDragging()) return
    target && (this.dragContext.targetHex = target)
    this.dragger.stopDrag(); // ---> dropFunc(this.dragContext.tile, info)
  }

  /** attach supplied target to mouse-drag (default was CityMap.nextHex) */
  dragTarget(target?: DisplayObject) {
    if (this.isDragging()) {
      this.stopDragging(this.dragContext.targetHex) // drop and make move
    } else if (target) {
      this.dragger.dragTarget(target, { x: TP.hexRad / 2, y: TP.hexRad / 2 })
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
    const info = { turn: `#${tn}`, plyr: plyr.Aname, coins, econs, vps, tvps, vpr, prev, gamePlay: this.gamePlay, board }
    console.log(stime(this, `.logCurPlayer --${robo}--`), info);
    const inc = plyr.econs + plyr.expenses;
    this.logTurn(`#${tn}: ${plyr.Aname} ${dice} \$${plyr.coins} ${inc >= 0 ? '+' : '-'}${inc} vp: ${plyr.vps} vp/r: ${vpr}`);
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

  /** makeScaleableBack and setup scaleParams
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean): ScaleableContainer {
    /** scaleCont: a scalable background */
    let scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    this.dragger = new Dragger(scaleC)
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale("a", scaleC, 820, TP.hexRad)
      KeyBinder.keyBinder.setKey(' ', {thisArg: this, func: this.dragTarget})
      KeyBinder.keyBinder.setKey('S-Space', {thisArg: this, func: this.dragTarget})
    }
    return scaleC
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
    let ns0 = scaleC.getScale(), sXY = { x: -scaleC.x, y: -scaleC.y } // generally == 0,0
    let nsA = scaleC.findIndex(.5), apt = { x: -xos, y: -yos }
    let nsZ = scaleC.findIndex(ns0), zpt = { x: -xos, y: -yos }

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
  tileBag: TileBag<AuctionTile> & EventDispatcher;
  /** select a Tile (for curPlayer), shift it into auctionTiles */
  shift(pIndex?: number, alwasyShift?: boolean): void;
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
  readonly tileBag = new TileBag<AuctionTile>() as any as TileBag<AuctionTile> & EventDispatcher;

  constructor(
    readonly tiles: AuctionTile[],
    public nm = TP.auctionMerge,  // merge per-player arrays of length nm into nm * 2; nm-1 --> nm * 2
  ) {
    this.maxndx = tiles.length - 1; // Note: tiles.length = TP.auctionSlots + nm;
  }

  drawTile(type: new () => Tile) {
    return this.tileBag.find((tile, ndx, bag) => (tile instanceof type) && (bag.splice(ndx, 1), true));
  }

  /** process out-shifted tile... */
  outShift(tile: AuctionTile) {
    tile.sendHome(); // less than recycleTile(tile); no log, no capture/coins
  }
  isEmptySlot(pIndex: number) {
    const nm = this.nm, tiles = this.tiles;
    for (let n = pIndex * nm; n < tiles.length; n += (nm > 0 && n == nm - 1) ? nm + 1 : 1 ) {
      if (!tiles[n]) return true;
    }
    return false;
  }

  shift(pIndex = 0, alwaysShift = TP.alwaysShift) {
    if (!alwaysShift && !this.isEmptySlot(pIndex)) return; // nothing to shift
    const nm = this.nm, tiles = this.tiles
    const tile = this.tileBag.selectOne();
    const hexes = this.hexes
    tile.setPlayerAndPaint(Player.allPlayers[pIndex]);

    // put tile in slot-n (move previous tile to n+1)
    let shift1 = (tile: AuctionTile, n: number) => {
      if (!!tiles[n]) {
        if (n < this.maxndx) {
          shift1(tiles[n], (nm > 0 && n == nm - 1) ? 2 * nm : n + 1);
        } else {
          this.outShift(tiles[n]);
        }
        tiles[n] = undefined
      }
      // ASSERT: tiles[n] is undefined
      tiles[n] = tile;
      tile.moveTo(hexes[n])
    }
    shift1(tile, pIndex * nm);  // [0, this.nm][pIndex]
    console.log(stime(this, `.shift`), tiles)
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
    tiles: AuctionTile[],
    readonly table: Table,
    newHex: (name: string, ndx: number) => Hex2,
  ) {
    super(tiles);
    for (let i = 0; i <= this.maxndx; i++) {
      // make auctionHex:
      // from Table.layoutTable(); sets parent = hexMap.mapCont.hexCont; hex.x, hex.y
      this.hexes.push(newHex(`auction${i}`, i))
    }
    const counterCont = table.hexMap.mapCont.counterCont;
    const x0 = this.hexes[0].x, y0 = (this.hexes[0].y + this.hexes[this.nm].y) / 2, rad = TP.hexRad;
    this.tileCounter = new NumCounter('tileCounter', this.tileBag.length, 'lightblue', rad/2)
    this.tileCounter.attachToContainer(counterCont, { x: x0 -1.5 * rad, y: y0 - .2 * rad }, this.tileBag, TileBag.event, );
    table.gamePlay.dice.setContainer(counterCont, x0 -1.5 * rad, y0 - 1 * rad);
  }
}
