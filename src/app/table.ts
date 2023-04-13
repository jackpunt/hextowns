import { AT, C, Dragger, DragInfo, F, KeyBinder, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap, IHex } from "./hex";
import { HexEvent } from "./hex-event";
import { H, XYWH } from "./hex-intfs";
//import { TablePlanner } from "./planner";
import { Player } from "./player";
import { Meeple } from "./meeple";
import { StatsPanel } from "./stats";
//import { StatsPanel } from "./stats";
import { PlayerColor, playerColor0, playerColor1, TP } from "./table-params";
import { Tile } from "./tile";


/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) {}
}

/** layout display components, setup callbacks to GamePlay */
export class Table extends EventDispatcher  {

  statsPanel: StatsPanel;
  gamePlay: GamePlay;
  stage: Stage;
  scaleCont: Container
  bgRect: Shape
  hexMap: HexMap; // from gamePlay.hexMap
  origHex: Hex2
  auctionCont: AuctionCont;
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

    stage['table'] = this // backpointer so Containers can find their Table (& curMark)
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage.canvas) // scaleCont & background
  }
  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH) {
    this.skipShape.graphics.f("white").dp(0, 0, 40, 4, 0, skipRad)
    this.undoShape.graphics.f("red").dp(-xOffs, 0, bSize, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+xOffs, 0, bSize, 3, 0, 0);
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    let undoC = this.undoCont; undoC.name = "undo buttons" // holds the undo buttons.
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC) // TODO: align with nextHex(x & y)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    this.enableHexInspector()
    let aiControl = this.aiControl('pink', 75); aiControl.x = 0; aiControl.y = 100
    undoC.addChild(aiControl)
    let pmy = 0;
    let progressBg = new Shape(), bgw = 200, bgym = 240, y0 = 0
    let bgc = C.nameToRgbaString(TP.bgColor, .8)
    progressBg.graphics.f(bgc).r(-bgw/2, y0, bgw, bgym-y0)
    undoC.addChildAt(progressBg, 0)
    undoC.addChild(this.winBack);
    undoC.addChild(this.winText);
    this.dragger.makeDragable(undoC)
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
  enableHexInspector(qY: number = 100) {
    let qShape = new Shape(), toggle = true
    qShape.graphics.f("black").dp(0, 0, 20, 6, 0, 0)
    qShape.y = qY  // size of skip Triangles
    this.undoCont.addChild(qShape)
    this.dragger.makeDragable(qShape, this,
      // dragFunc:
      (qShape: Shape, ctx: DragInfo) => { },
      // dropFunc:
      (qShape: Shape, ctx: DragInfo) => {
        toggle = false
        let hex = this.hexUnderObj(qShape)
        qShape.x = 0; qShape.y = qY // return to regular location
        this.undoCont.addChild(qShape)
        if (!hex) return
        let info = hex; //{ hex, stone: hex.playerColor, InfName }
        console.log(`HexInspector:`, hex.Aname, info)
      })
    let toggleText = (evt: MouseEvent, vis?: boolean) => {
      if (!toggle) return (toggle = true, undefined) // skip one 'click' when pressup/dropfunc
      this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
      this.hexMap.update()               // after toggleText & updateCache()
    }
    this.toggleText = toggleText         // define method --> closure (for KeyBinding)
    qShape.on(S.click, toggleText, this) // toggle visible
    toggleText(undefined, false)         // set initial visibility
  }
  /** method invokes closure defined in enableHexInspector. */
  toggleText(evt: MouseEvent, vis?: boolean) {}
  /** for KeyBinding test */
  shiftAuction(tile?: Tile) {
    this.auctionCont.shift(tile)
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

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay
    let hexMap = this.hexMap = gamePlay.hexMap

    hexMap.addToMapCont();               // addToMapCont; make Hex2
    hexMap.makeAllDistricts();           // typically: (4,2)

    let mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont)

    let hexRect = hexCont.getBounds()
    // background sized for hexMap:
    let high = hexMap.height, wide = hexMap.width // h=rad*1.5; w=rad*r(3)
    let miny = hexRect.y - high, minx = hexRect.x - wide
    let { width, height } = hexMap.wh
    let bgr: XYWH = { x: 0, y: 0, w: width, h: height + high}
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = (bgr.w) / 2
    mapCont.y = (bgr.h) / 2

    let auctionCont = this.auctionCont = new AuctionCont(this.gamePlay.auction, hexMap, miny);
    let nwCorner = this.hexMap.getCornerHex('W') as Hex2;
    let [x, y, w, h] = nwCorner.xywh();
    this.auctionCont.x = nwCorner.cont.localToLocal(x, y, this.scaleCont).x
    this.scaleCont.addChild(this.auctionCont);
    console.log(stime(this, `.layoutTable: auction.maxlen=`), this.auctionCont.maxlen);
    this.auctionCont.shift()  // select first [+1] Tile
    this.auctionCont.shift()  // select first [+1] Tile
    this.auctionCont.shift()  // select first [+1] Tile

    this.bgRect = this.setBackground(this.scaleCont, bgr) // bounded by bgr
    let p00 = this.scaleCont.localToLocal(0, 0, hexCont)
    let pbr = this.scaleCont.localToLocal(bgr.w, bgr.h, hexCont)
    hexCont.cache(p00.x, p00.y, pbr.x-p00.x, pbr.y-p00.y) // cache hexCont (bounded by bgr)

    auctionCont.parent.localToLocal(auctionCont.x, auctionCont.y+100, this.scaleCont, this.undoCont)
    this.scaleCont.addChild(this.undoCont)
    // this.setupUndoButtons(55, 60, 45, bgr)
    this.enableHexInspector()

    // this.makeMiniMap(this.scaleCont, -(200+TP.mHexes*TP.hexRad), 600+100*TP.mHexes)

    this.on(S.add, this.gamePlay.playerMoveEvent, this.gamePlay)[S.Aname] = "playerMoveEvent"
  }
  lastDrag: Meeple; // last Meeple or Tile to be dragged [debug]
  startGame() {
    // initialize Players & TownStart & draw pile
    this.gamePlay.forEachPlayer(p => {
      p.placeTown()
      p.meeples.forEach(meep => this.dragger.makeDragable(meep, this,
        // dragFunc
        (meep: Meeple, ctx) => {
          this.lastDrag = meep
          let hex = this.hexUnderObj(meep)
          if (hex) meep.dragFunc(hex, ctx)
        },
        // dropFunc
        (meep: Meeple, ctx) => {
          let hex = this.hexUnderObj(meep)
          if (hex) meep.dropFunc(hex, ctx)
        })
      )
      this.hexMap.update()
    })
    this.gamePlay.setNextPlayer(this.gamePlay.allPlayers[0])
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
    // TODO: highlight Player & Ships that can/cannot move
    this.hexMap.update()
  }

  hexUnderObj(dragObj: DisplayObject) {
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.hexMap.mapCont.hexCont)
    return this.hexMap.hexUnderPoint(pt.x, pt.y)
  }
  _dropTarget: Hex2;
  get dropTarget() { return this._dropTarget}
  set dropTarget(hex: Hex2) { hex = (hex || this.origHex); this._dropTarget = hex; this.hexMap.showMark(hex)}

  dragShift = false // last shift state in dragFunc
  dragHex: Hex2 = undefined // last hex in dragFunc
  protoHex: Hex2 = undefined // hex showing protoMove influence & captures
  isDragging() { return this.dragHex !== undefined }

  stopDragging(target: Hex2 = this.origHex) {
    //console.log(stime(this, `.stopDragging: target=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (!this.isDragging()) return
    target && (this.dropTarget = target)
    this.dragger.stopDrag()
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
      this.bindKeysToScale("a", scaleC, 820, 10)
      KeyBinder.keyBinder.setKey(' ', {thisArg: this, func: this.dragStone})
      KeyBinder.keyBinder.setKey('S-Space', {thisArg: this, func: this.dragStone})
    }
    return scaleC
  }
  /** attach nextHex.stone to mouse-drag */
  dragStone() {
    if (this.isDragging()) {
      this.stopDragging(this.dropTarget) // drop and make move
    } else {
      this.dragger.dragTarget(undefined, { x: TP.hexRad / 2, y: TP.hexRad / 2 })
    }
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

class AuctionCont extends Container {
  readonly maxlen;
  readonly hexes: Hex2[] = []
  constructor(readonly tiles: Tile[], hexMap: HexMap, miny: number) {
    super()
    this.maxlen = tiles.length;
    let nwCorner = hexMap.getCornerHex('W') as Hex2;
    let [x, y, w, h] = nwCorner.xywh(TP.hexRad);
    for (let i = 0; i < this.maxlen; i++) {
      let hex = this.hexes[i] = new Hex2(hexMap, undefined, undefined, `auctionHex${i}`)
      // hexMap.mapCont.hexCont.addChild(hex)
      hex.x = x + i * w;
      hex.y = miny + h/2
      hex['Costinc'] = (i == 0) ? 1 : (i == this.maxlen - 1) ? -1 : 0;
    }
  }

  shift(tile: Tile = Tile.selectOne(Tile.tileBag)) {
    let tiles = this.tiles, hexes = this.hexes
    // put tile in slot-n (move previous tile to n+1)
    let shift1 = (tile: Tile, n: number) => {
      if (!!tiles[n]) {
        shift1(tiles[n], n + 1);
      }
      // ASSERT: tiles[n] is undefined | redundant (== slots[n+1])
      tiles[n] = tile;
      tile.hex = hexes[n] // undefined at/above maxlen
    }
    shift1(tile, 0)
    while (tiles[this.maxlen]) {
      let tileN = this.tiles.pop()
      Tile.tileBag.push(tileN);   // put it back into bag
      tileN.hex = undefined       // already done from above?!
      tileN.x = tileN.y = 0;
    }
    return
  }
}
