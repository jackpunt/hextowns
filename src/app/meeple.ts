import { C, F, stime } from "@thegraid/common-lib";
import { DragInfo } from "@thegraid/easeljs-lib";
import { Container, Graphics, Shape, Text } from "@thegraid/easeljs-module";
import { Hex, Hex2 } from "./hex";
import { EwDir, H, HexDir } from "./hex-intfs";
import { Player } from "./player";
import { TP } from "./table-params";

class PathElt<T extends Hex> {
  constructor(public dir: HexDir, public hex: T, public step: Step<T>) {  }
}
type Path<T extends Hex> = PathElt<T>[]

/** changes in ship for each transit Step */
type ZConfig = {
  fuel: number,
}
export class Meeple extends Container {
  /** intrinsic cost for each Step (0 or 1); start of turn pays 1 for null 'shape' */
  static step1 = 1;
  static maxZ = 3;       // for now: {shape + color + color}
  static idCounter = 0;
  static fuelPerStep = 0;
  static initCoins = 200;

  readonly radius = this.z0 * 10;
  readonly gShape: Shape = new Shape();
  readonly Aname: string = `S${Meeple.idCounter++}`

  /** current location of this Ship. */
  _hex: Hex;
  get hex() { return this._hex; }
  set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.meep = undefined
    this._hex = hex
    hex.meep = this
  }
  pCont: Container

  readonly colorValues = C.nameToRgba("blue"); // with alpha component

  // maxLoad = [0, 8, 12, 16]
  // maxFuel = mL = (mF - z0 - 1)/mZ;  mF = mL*mZ+z0+1
  readonly maxFuel = [0, 24+2, 36+3, 48+4][this.z0]; // [26,39,52]
  readonly maxLoad = (this.maxFuel - this.z0 - Meeple.step1) / Meeple.maxZ; // calc maxLoad
  newTurn() { this.moved = false; }

  //initially: expect maxFuel = (10 + z0*5) = {15, 20, 25}
  /**
   *
   * @param player (undefined for Chooser)
   * @param z0 = basic impedance of ship (== this.size !!)
   * @param size 1: scout, 2: freighter, 3: heavy
   */
  constructor(
    public readonly player?: Player,
    public readonly z0 = 2,
  ) {
    super()
    this.addChild(this.gShape)
    let textSize = 16, nameText = new Text(this.Aname, F.fontSpec(textSize))
    nameText.textAlign = 'center'
    nameText.y = -textSize / 2;
    this.addChild(nameText)
    this.paint()  // TODO: makeDraggable/Dropable on hexMap
    this.pCont = player?.table.hexMap.mapCont.pathConts[player?.index]
  }

  /**
   * show meeple
   */
  paint() {
    this.updateCache();
  }

  /** move to hex, incur cost to fuel.
   * @return false if move not possible (no Hex, insufficient fuel)
   */
  move(dir: EwDir, hex = this.hex.nextHex(dir)) {
    if (hex.occupied) return false;
    this.hex = hex;
    hex.map.update()    // TODO: invoke in correct place...
    return true
  }

  drawDirect(target: Hex2, g: Graphics, cl: string , wl = 2) {
    let hex0 = this.hex as Hex2
    g.ss(wl).s(cl).mt(hex0.x, hex0.y).lt(target.x, target.y).es()
  }
  /**
   *
   * @param step the final step, work back until step.prevHex === undefined
   * @param g Graphics
   * @param cl color of line
   * @param wl width of line
   */
  drawPath(path: Path<Hex2>, cl: string, wl = 2) {
    // setStrokeStyle().beginStroke(color).moveto(center).lineto(edge=hex0,dir)
    // [arcto(hex1,~dir)]*, lineto(center), endStroke
    let pShape = new Shape(), g = pShape.graphics
    pShape.mouseEnabled = false;
    let showTurn = (hex, turn, c = cl) => {
      let tn = new Text(turn.toFixed(0), F.fontSpec(16), c)
      tn.textAlign = 'center'; tn.mouseEnabled = false;
        tn.x = hex.x; tn.y = hex.y - 39
        this.pCont.addChildAt(tn, 0) // turn number on hexN
    }
    // Path: [dir, hex] in proper order
    let [{ hex: hex0 }, { dir: dir0 }] = path      // Initial Hex and direction of FIRST Step
    let ep = hex0.edgePoint(dir0)
    g.ss(wl).s(cl).mt(hex0.x, hex0.y).lt(ep.x, ep.y)

    // all the intermediate steps of the path: coming in on pdir, out on ndir
    path.slice(1, - 1).forEach(({ dir: pdir, hex: hexN, step }, index) => {
      showTurn(hexN, step.turn)
      // step into & across hexN
      let { dir: ndir } = path[index + 2] // exit direction
      ep = hexN.edgePoint(ndir)
      if (ndir == pdir) {
        g.lt(ep.x, ep.y)        // straight across
      } else {
        g.at(hexN.x, hexN.y, ep.x, ep.y, hexN.radius/2) // arcTo
      }
    })
    let { dir, hex: hexZ, step } = path[path.length - 1]
    showTurn(hexZ, step.turn)
    g.lt(hexZ.x, hexZ.y)        // draw line (final step)
    g.es()
    return pShape
  }

  pathColor(n: number = 0, alpha?: number | string, decr = 20) {
    let v = this.colorValues.map(vn => vn + n * (vn > 230 ? -decr : decr))
    v[3] = 255    // reset alpha
    return `rgba(${v[0]},${v[1]},${v[2]},${alpha || (v[3]/255).toFixed(2)})`
  }

  async drawDirect2(hex: Hex2) {
    let dshape = new Shape()
    dshape.mouseEnabled = false;
    this.drawDirect(hex, dshape.graphics, 'rgba(250,250,250,.5')
    this.pCont.addChild(dshape)
    hex.map.update()
    return new Promise<void>((resolve) => {
      setTimeout(() => { resolve() }, 1);
    });
  }

  path0: Path<Hex2>
  showPaths(targetHex: Hex2, limit = 1) {
    this.pCont.removeAllChildren()
    this.pCont.parent.addChild(this.pCont);  // put *this* pathCont on top
    if (targetHex !== this.targetHex) return // without changing display! [if target has moved]
    this.pCont.stage.update()
  }

  showPath(stepZ: Step<Hex2>, pcolor: string) {
    let path = stepZ.toPath()
    let pshape = this.drawPath(path, pcolor, 2)
    this.pCont.addChildAt(pshape, 0) // push under the better paths (and tn Text)
    return pshape
  }

  targetHex: Hex2;
  originHex: Hex2;
  lastShift: boolean;

  // expand from open node with least (radialDist + metric) <-- DID THIS
  // get estimate of 'minMetric' to prune far branches <-- DID THIS
  dragFunc(hex: Hex2, ctx: DragInfo) {
    if (ctx?.first) {
      this.originHex = this.hex as Hex2
      this.lastShift = undefined
    }
    if (hex == this.originHex) {
      this.targetHex = hex
      this.pCont.removeAllChildren()
    }
    if (!hex || hex.occupied) return; // do not move over non-existant or occupied hex

    const shiftKey = ctx?.event?.nativeEvent?.shiftKey
    if (shiftKey === this.lastShift && !ctx?.first && this.targetHex === hex) return;   // nothing new (unless/until ShiftKey)
    this.lastShift = shiftKey

    this.pCont.removeAllChildren()
    this.targetHex = hex;
    if (!shiftKey) return         // no path requested
    this.drawDirect2(hex).then(() => {
      this.showPaths(hex, 1)      // show extra paths
    })
  }

  dropFunc(hex: Hex2, ctx: DragInfo) {
    this.hex = this.originHex;
    this.paint()
    //
    const shiftKey = ctx?.event?.nativeEvent?.shiftKey
    if (!shiftKey) this.pCont.removeAllChildren();
    this.lastShift = undefined
  }

  dragBack() {
    this.hex = this.targetHex = this.originHex
    this.originHex.meep = this;
    this.hex.map.update()
  }
  dragAgain() {
    let targetHex = this.targetHex;
    // this.pCont.removeAllChildren()
    this.dragBack()
    this.dragFunc(this.hex as Hex2, undefined); // targetHex = this.hex; removeChildren
    this.showPaths(this.targetHex = targetHex);
    this.hex.map.update()
  }
  // false if [still] available to move this turn
  moved = true;
  /** continue any planned, semi-auto moves toward this.targetHex */
  shipMove() {
    // TODO: continue move if available fuel
    if (this.moved || this.path0?.length == 0) return this.moved
    if (!this.path0[0].dir) this.path0.shift();           // skip initial non-Step
    if (this.pathHasOccupiedHex()) {
      this.showPaths(this.targetHex)  // make a new plan (unless targetHex is occupied!)
      if (!this.path0) return false   // targetHex now occupied!
      this.path0.shift();             // skip initial non-Step
    }
    this.moved = this.takeSteps();
    return this.moved; // NOTE: other Steps still in progress!
  }
  /** assert this.path0 is defined. */
  pathHasOccupiedHex() {
    let turn0 = this.path0[0]?.step.turn
    return this.path0.find(elt => elt.step.turn === turn0 && elt.hex.occupied);
  }

  takeSteps() {
    let elt = this.path0[0]
    if (!elt) return false; // illegal step
    let dir = elt.dir as EwDir, hex = this.hex.nextHex(dir)
    if (hex.occupied) {
      // find alternate path...?
    }
    if (!this.move(dir, hex)) return false
    this.path0.shift()
    setTimeout(() => { this.takeSteps() }, TP.stepDwell) // and do other moves this turn
    return true
  }

}

class Step<T extends Hex> {
  constructor(
    public turn: number, // incremental, relative turn?
    public curHex: T,
    public dir: EwDir,
    public prevStep: Step<T>,
    public config: ZConfig,
    public cost: number,             // cost for this Step
    targetHex: T,  // crow-fly distance to target from curHex
  ) {
    this.metricb = this.metric + this.curHex.radialDist(targetHex)
  }
  /** Actual cost from original Hex to this Step */
  readonly metric = this.cost + (this.prevStep?.metric || 0);
  /** best-case metric from this(curHex & config) to targetHex, assume zero config cost */
  readonly metricb: number;

  /** used as predicate for find (ignore ndx & obj) */
  isMatchingElement(s: Step<T>, ndx?: number, obj?: Step<T>[]) {
    return s.curHex === this.curHex
  }

  /**
   * find (and possibly replace) best metric to this Step)
   * if this is better than existing open Step, replace 's' with this
   */
  isExistingPath(s: Step<T>, ndx: number, obj: Step<T>[]) {
    if (!s.isMatchingElement(this)) return false
    //if (this.metric == s.metric) return false  // try see parallel/equiv paths
    if (this.metric < s.metric) {
      obj[ndx] = this
    }
    return true
  }

  /** reverse chain of Steps to an Array [HexDir, Hex, Step<T>] */
  toPath() {
    let rv: Path<T> = [], cs = this as Step<T>
    while (cs !== undefined) {
      rv.unshift(new PathElt<T>(cs.dir, cs.curHex, cs))
      cs = cs.prevStep
    }
    return rv;
  }

  toString() {
    return this.toPath().map((pe) => `${pe.dir||'0'}->${pe.hex.Aname}$${pe.step.cost}#${pe.step.turn}`).toString()
  }
}
