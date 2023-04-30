import { AT, C, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, ValueCounter, XY } from "@thegraid/easeljs-lib";
import { Bitmap, Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexM, HexMap, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { H, XYWH } from "./hex-intfs";
//import { TablePlanner } from "./planner";
import { Player } from "./player";
import { Criminal, Police, TileSource } from "./meeple";
import { StatsPanel } from "./stats";
//import { StatsPanel } from "./stats";
import { PlayerColor, playerColor0, playerColor1, TP } from "./table-params";
import { AuctionTile, Busi, Civic, InfShape, Resi, Tile, Tile0 } from "./tile";
import { ValueCounterBox } from "./value-counter-box";


/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) {}
}
interface StageTable extends Stage {
  table: Table;
}

export interface DragContext {
  originHex: Hex2;      // where Tile was picked
  targetHex: Hex2;      // last isLegalHex() or originHex
  lastShift: boolean;
  info: DragInfo;
  tile: Tile;           // the DisplayObject being dragged
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

  auctionCont: AuctionCont;
  leaderHexes: Hex2[][] = [[], []]; // per player
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
  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH) {
    let undoC = this.undoCont; undoC.name = "undo buttons" // holds the undo buttons.
    let { y, w } = this.hexMap.centerHex.xywh()
    undoC.x = w; undoC.y = y * 1.5;
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
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC) // TODO: align with nextHex(x & y)
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
    this.homeRowHexes.forEach(pRow => pRow.forEach(hex => hex.showText(vis)))
    this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
    this.hexMap.update()               // after toggleText & updateCache()
  }
  /** for KeyBinding test */
  shiftAuction() {
    this.auctionCont.shift()
    this.hexMap.update()
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

  homeRowHexes: Hex2[][]; // [pIndex][...leaderHex, academyHex]
  reserveHexes: Hex2[][]; // [pIndex][res0, res1]
  crimeHex: Hex2;
  recycleHex: Hex2;

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    let hexMap = this.hexMap = gamePlay.hexMap

    hexMap.addToMapCont();               // addToMapCont; make Hex2
    hexMap.makeAllDistricts();           // typically: (4,2)

    let mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont)

    // background sized for hexMap:
    let { x: rx, y: ry, width: rw, height: rh } = hexCont.getBounds()
    let rowh = hexMap.rowHeight, colw = hexMap.colWidth
    let miny = ry - rowh, minx = rx - colw
    let bgr: XYWH = { x: 0, y: -rowh * .6, w: rw + 2 * colw, h: rh + 4 * rowh }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = (bgr.w - bgr.x) / 2
    mapCont.y = (bgr.h - bgr.y) / 2

    this.bgRect = this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(bgr.x, bgr.y, hexCont)
    let pbr = this.scaleCont.localToLocal(bgr.w, bgr.h, hexCont)
    hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)

    let x0 = this.hexMap.getCornerHex(H.W).xywh().x
    let x1 = this.hexMap.getCornerHex(H.E).xywh().x
    this.homeRowHexes = [[], [], []]; // pIndex = 2 for non-player Hexes (auctionHexes, crimeHex)
    this.reserveHexes = [[], []];
    const makeHex2 = (row = 0, col = 0, name: string) => {
      let hex = new Hex2(this.gamePlay.hexMap, row, col, name)
      hex.distText.text = name;
      return hex
    }
    const topRowHex = (pIndex: number, name: string, ndx: number, row = -1, dy = -.7 * rowh) => {
      // [[left->right], [right->left], [center->right]]
      let [dx, col] = [[x0, ndx], [x1, -ndx], [0, ndx]][pIndex];
      let hex = makeHex2(row, col, name)
      this.homeRowHexes[pIndex].push(hex);
      hex.x += dx
      hex.y += dy
      return hex
    }
    const secondRowHex = (pIndex: number, name: string, ndx: number, row = 0, y = -.4 * rowh) => {
      return topRowHex(pIndex, name, ndx, row, y)
    }

    this.recycleHex = this.makeRecycleHex(hexMap, 5, -.5)

    this.crimeHex = topRowHex(2, `Barbs`, 6)
    Criminal.makeSource(this.crimeHex, TP.criminalPrePlayer * this.gamePlay.allPlayers.length);
    gamePlay.costIncHexCounters.push([Criminal.source.hex, undefined, -1]);

    [Busi, Resi].forEach((type, ndx) => {
      let hex = topRowHex(2, type.name, 7 + ndx)
      let source = new TileSource<AuctionTile>(type, undefined, hex);
      let tiles = AuctionTile.tileBag.filter(t => t instanceof type).slice(0, 4); // TP.tilesInMarket
      gamePlay.marketSource[type.name] = source;
      tiles.forEach(tile => source.availUnit(AuctionTile.takeTile(tile)))
      source.nextUnit();
      let counter = new CostIncCounter(hex, `${type}-counter`)
      //counter.attachToContainer(hex, '', hexMap.mapCont.counterCont)
      gamePlay.costIncHexCounters.push([hex, counter, 1]);
      // add inf-counter to Hex
    })

    let auctionTiles = this.gamePlay.auctionTiles; auctionTiles.length = TP.auctionSlots;
    this.auctionCont = new AuctionCont(auctionTiles, this, 6, secondRowHex);
    for (let i = 0; i < TP.preShiftCount; i++) this.auctionCont.shift() // Also shift in gamePlay.startTurn()

    this.hexMap.update();

    this.buttonsForPlayer.length = 0; // TODO: maybe deconstruct
    Player.allPlayers.forEach((p, pIndex) => {
      this.makeButtonsForPlayer(p);
      p.makePlayerBits();
      let leaderHexes = p.allLeaders.map((meep, ndx) => topRowHex(pIndex, meep.Aname, ndx))
      let academyHex = topRowHex(pIndex, `Academy:${pIndex}`, leaderHexes.length)
      this.reserveHexes[pIndex].push(...[1, 2].map(i => secondRowHex(pIndex, `Reserve:${pIndex}-${i}`, i)))

      // place [civic/leader, academy/police] meepleHex on Table/Hex (but not on Map)
      this.leaderHexes[pIndex] = leaderHexes;
      p.allLeaders.forEach((meep, i) => meep.homeHex = meep.civicTile.homeHex = meep.civicTile.moveTo(meep.moveTo(leaderHexes[i])))
      Police.makeSource(p, academyHex, TP.policePerPlayer);
    })
    this.hexMap.update();

    this.scaleCont.addChild(this.undoCont)
    this.setupUndoButtons(55, 60, 45, bgr) // & enableHexInspector()

    // this.makeMiniMap(this.scaleCont, -(200+TP.mHexes*TP.hexRad), 600+100*TP.mHexes)

    this.on(S.add, this.gamePlay.playerMoveEvent, this.gamePlay)[S.Aname] = "playerMoveEvent"
  }

  makeRecycleHex(hexMap, row, col) {
    let name = 'Recycle', tile = new Tile(undefined, name)
    let bm = tile.addImageBitmap(name); // scale to hexMap.
    bm.y = -TP.hexRad/2; // recenter
    let hex = new Hex2(hexMap, row, col, name);
    hex.rcText.visible = hex.distText.visible = false;
    hex.setHexColor(C.WHITE);
    hex.cont.addChild(bm);
    hex.cont.updateCache();
    return hex;
  }

  readonly buttonsForPlayer: Container[] = [];
  /** per player buttons to invoke GamePlay */
  makeButtonsForPlayer(player: Player) {
    let parent = this.scaleCont
    let chex = this.hexMap.getCornerHex([H.W, H.E][player.index]) as Hex2;
    let ehex = this.hexMap.getCornerHex(H.NE) as Hex2;
    let { x: cx, y: cy } = chex.xywh();
    let ptc = chex.cont.parent.localToLocal(cx, cy, parent)
    let { x: ex, y: ey, h: eh } = ehex.xywh();
    let pte = chex.cont.parent.localToLocal(ex, ey, parent)
    let cont = new Container();
    cont.x = ptc.x;
    cont.y = pte.y;
    cont.visible = false;
    parent.addChild(cont);

    this.buttonsForPlayer[player.index] = cont;
    let bLabels = ['Start', 'Crime', 'Police', 'Build', 'Reserve', 'Done'];
    let rowy = (i: number) => { return (i - .5) * eh / 2}
    bLabels.forEach((label, i) => {
      let b = new ValueCounterBox(label, label, 'lightgreen', eh / 3);
      b.mouseEnabled = true
      b.attachToContainer(cont, { x: 0, y: rowy(i) }) // just a label
      b.on(S.click, () => this.doButton(label), this)[S.Aname] = `b:${label}`;
    })

    bLabels.forEach(label => {
      let key = label.substring(0, 1).toLowerCase();
      KeyBinder.keyBinder.setKey(key, { thisArg: this, func: this.doButton, argVal: label })
    })

    let layoutCounter = (name: string, color: string, rowy: number, colx = 1 ) => {
      let dir = 1 - player.index * 2
      let cname = `${name}Counter`, cnames = `${name}s`
      let counter = player[cname] = new ValueCounter(`${cname}:${player.index}`, player[cnames], color, TP.hexRad * .75)
      let pt = cont.localToLocal(dir * (colx + 1) * TP.hexRad, rowy, this.scaleCont)
      counter.attachToContainer(this.scaleCont, pt);
      counter.mouseEnabled = true;
      player[cname] = counter;
      return counter
    };
    layoutCounter('action', C.YELLOW, rowy(0)).on(S.click, (evt: MouseEvent) => {
      player.actions = player.actions + (evt.nativeEvent.ctrlKey ? 1 : -1);
    })

    layoutCounter('coin', C.coinGold, rowy(1)).on(S.click, (evt: MouseEvent) => {
      player.coins = player.coins + (evt.nativeEvent.ctrlKey ? 1 : -1);
    })
    layoutCounter('econ', C.GREEN, rowy(1), 2)
    layoutCounter('expense', C.GREEN, rowy(1), 3)

    layoutCounter('capture', 'lightblue', rowy(2));
    layoutCounter('brib', 'grey', rowy(3)).on(S.click, (evt: MouseEvent) => {
      player.bribs = player.bribs + (evt.nativeEvent.ctrlKey ? 1 : -1);
    })
    layoutCounter('vp', C.briteGold, rowy(5))
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
    let player = this.gamePlay.curPlayer, pIndex = player.index, actionsTaken = 0;
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
        this.gamePlay.setNextPlayer()
        break
      }
    }
    player.actionCounter.updateValue(player.actions -= actionsTaken )
    // TODO: if (player.actions <= 0) this.gamePlay.setNextPlayer();
  }

  startGame() {
    // initialize Players & TownStart & draw pile
    let dragger = this.dragger;
    // All Tiles (Civics, Resi, Busi, PStation, Lake, & Meeple) are Draggable:
    Tile.allTiles.forEach(tile => dragger.makeDragable(tile, this, this.dragFunc, this.dropFunc))

    this.gamePlay.forEachPlayer(p => {
      // place Town on hexMap
      p.placeTown()
      this.toggleText(false)
    })
    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])
  }

  hexUnderObj(dragObj: DisplayObject) {
    if (dragObj instanceof Tile) return dragObj.hexUnderObj(this.hexMap);
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.mapCont.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }

  dragContext: DragContext;
  dragFunc(tile: Tile, info: DragInfo) {
    let hex = this.hexUnderObj(tile)
    let ctx = this.dragContext;

    if (info?.first) {
      ctx = this.dragContext = {
        tile: tile,
        originHex: tile.hex as Hex2,      // where Tile was picked
        targetHex: tile.hex as Hex2,      // last isLegalHex() or originHex
        lastShift: undefined,
        info: info,
      }
      this.dragStart(tile, hex, ctx);
    }
    this.checkShift(hex, ctx)
    tile.dragFunc0(hex, this.dragContext)
  }
  checkShift(hex: Hex2, ctx: DragContext) {
    let info = ctx.info
    // track shiftKey because we don't pass 'event' to isLegalTarget(hex)
    const shiftKey = info.event?.nativeEvent?.shiftKey
    if (info.first || shiftKey !== ctx.lastShift || ctx.targetHex !== hex) {
      ctx.lastShift = shiftKey
      // do shift-down/shift-up actions...
      this.dragShift(ctx.tile, shiftKey, ctx);
    }
  }

  dragStart(tile: Tile, hex: Hex2, ctx: DragContext) {
    tile.dragStart(hex, ctx)
  }

  /** state of shiftKey has changed during drag */
  dragShift(tile: Tile, shiftKey: boolean, ctx: DragContext) {
    tile.dragShift(shiftKey, ctx)
  }

  dropFunc(tile: Tile, info: DragInfo) {
    tile.dropFunc0(this.hexUnderObj(tile), this.dragContext)
    this.dragContext.lastShift = undefined;
    this.dragContext.tile = undefined; // mark not dragging
  }

  isDragging() { return this.dragContext.tile !== undefined }

  stopDragging(target: Hex2 = this.dragContext.originHex) {
    //console.log(stime(this, `.stopDragging: dragObj=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (!this.isDragging()) return
    target && (this.dragContext.targetHex = target)
    this.dragger.stopDrag(); // ---> dropFunc(this.dragContext.tile, info)
  }

  /** attach nextHex.stone to mouse-drag */
  dragStone() {
    if (this.isDragging()) {
      this.stopDragging(this.dragContext.targetHex) // drop and make move
    } else {
      this.dragger.dragTarget(undefined, { x: TP.hexRad / 2, y: TP.hexRad / 2 })
    }
  }

  logCurPlayer(curPlayer: Player) {
    const history = this.gamePlay.history
    const tn = this.gamePlay.turnNumber
    const lm = history[0]
    const prev = lm ? `${lm.Aname}${lm.ind}#${tn-1}` : ""
    const board = !!this.hexMap.allStones[0] && lm?.board // TODO: hexMap.allStones>0 but history.len == 0
    const robo = curPlayer.useRobo ? AT.ansiText(['red','bold'],"robo") : "----"
    const info = { turn: `#${tn}`, plyr: curPlayer.Aname, prev, gamePlay: this.gamePlay, board }
    console.log(stime(this, `.logCurPlayer --${robo}--`), info);
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
      KeyBinder.keyBinder.setKey(' ', {thisArg: this, func: this.dragStone})
      KeyBinder.keyBinder.setKey('S-Space', {thisArg: this, func: this.dragStone})
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

export class CostIncCounter extends ValueCounterBox {

  constructor(hex: Hex2, name = `costInc`, initValue?: number) {
    super(name, initValue, 'grey', TP.hexRad / 2)
    let counterCont = hex.mapCont.counterCont;
    let xy = hex.cont.localToLocal(0, TP.hexRad * H.sqrt3/2, counterCont)
    this.attachToContainer(counterCont, xy)
  }
  protected override makeBox(color: string, high: number, wide: number): DisplayObject {
    let box = new InfShape('lightgrey');
    let size = Math.max(high, wide)
    box.scaleX = box.scaleY = .5 * size / TP.hexRad;
    return box
  }

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    let width = text.getMeasuredWidth();
    let height = text.getMeasuredLineHeight();
    let high = height * 1.1;
    let wide = Math.max(width * 1.1, high);
    let rv = { width: wide, height: high, text: text };
    text.x = 0 - (width / 2);
    text.y = 1 - (height / 2); // -1 fudge factor, roundoff?
    return rv;
  }
}

class AuctionCont extends Container {
  readonly maxndx: number;
  readonly hexes: Hex2[] = []
  readonly counters: ValueCounter[] = [];
  readonly costInc = this.costIncMatrix()

  constructor(
    readonly tiles: AuctionTile[],
    readonly table: Table,
    col0: number,
    newHex: (pIndex: number, name: string, ndx: number) => Hex2,
  )
  {
    super()
    this.maxndx = tiles.length - 1;
    this.hexes.length = 0;
    let hexMap = table.hexMap, gamePlay = GamePlay.gamePlay as GamePlay;
    for (let i = 0; i <= this.maxndx; i++) {
      // make auctionHex:
      // from Table.layoutTable() sets parent=hexMap.mapCont.hexCont; hex.x, hex.y
      let hex = newHex(2, `auction${i}`, col0 + i);
      this.hexes.push(hex)
      // use InfMark(1, .3, 10) for counter Shape?
      let counter = new CostIncCounter(hex, `costInc${i}`, 0)
      //counter.attachToContainer(hexMap.mapCont.counterCont, { x: hex.x, y: hex.y + TP.hexRad })
      gamePlay.costIncHexCounters.push([hex, counter, i]);

      this.counters.push(counter);   // same index as hex!
    }
    let x0 = this.hexes[0].x, y0 = this.hexes[0].y
    this.tileCounter = new ValueCounter('tileCounter', AuctionTile.tileBag.length, 'lightblue', TP.hexRad/2)
    this.tileCounter.attachToContainer(hexMap.mapCont.counterCont, { x: x0 -1.5 * TP.hexRad, y: y0 })
  }

  // Costinc [0] = curPlayer.civics.filter(civ => civ.hex.isOnMap).length + 1
  // each succeeding is 1 less; to min of 1, except last slot is min of 0;
  // initially: 2 1 1 0;
  // Array<nCivOnMap,slotN> => [1, 1, 1, 0], [2, 1, 1, 0], [3, 2, 1, 0], [4, 3, 2, 1], [5, 4, 3, 2]
  costIncMatrix(maxCivs = 4, nSlots = TP.auctionSlots) {
    // [0...maxCivs]
    return new Array(maxCivs + 1).fill(1).map((civElt, nCivs) => {
      // [0...nSlots-1]
      return new Array(nSlots).fill(1).map((costIncElt, iSlot) => {
        let minVal = (iSlot < (nSlots - 1)) ? 1 : 0;
        return Math.max(minVal, (nCivs + 1) - iSlot)
      })
    })
  }
  tileCounter: ValueCounter;  // number of Tiles in tileBag

  shift(tile = AuctionTile.selectOne()) {
    tile.paint(this.table.gamePlay.curPlayer?.color)
    let tiles = this.tiles, hexes = this.hexes
    // put tile in slot-n (move previous tile to n+1)
    let shift1 = (tile: AuctionTile, n: number) => {
      if (!!tiles[n]) {
        if (n < this.maxndx)
          shift1(tiles[n], n + 1);
        else
          tiles[n].recycle();   // tile.hex = auction[= maxndx] --> tileBag
          tiles[n] = undefined
      }
      // ASSERT: tiles[n] is undefined
      tiles[n] = tile;
      tile.moveTo(hexes[n])
    }
    shift1(tile, 0)
    this.tileCounter.stage && this.tileCounter.setValue(AuctionTile.tileBag.length)
    console.log(stime(this, `.shift`), tiles)
    return tiles[0]
  }
}
