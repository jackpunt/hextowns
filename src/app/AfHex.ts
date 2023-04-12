import { C, S, stime } from "@thegraid/common-lib"
import { Shape, Container } from "@thegraid/easeljs-module"
import { HexDir, H } from "./hex-intfs"
import { TP } from "./table-params"

export namespace AF {
  export const A = 'a' // Arc (was C for circle...)
  export const T = 't'
  export const S = 's'
  export const R = 'r'
  export const G = 'g'
  export const B = 'b'
  export const L = 'l'
  export const F = 'f'
  // to get type Zcolor, we can't use: C.RED, C.GREEN, C.BLUE
  export const zcolor = { r: 'RED', g: 'GREEN', b: 'ORANGE' } as const
  export const fill = { l: 'line', f: 'fill'} as const
}
const ATSa = [AF.A, AF.T, AF.S] as const
export type ATS = typeof ATSa[number];

export const ZColor = [AF.R, AF.B, AF.G] as const
export type AfColor = typeof ZColor[number];

const LSa = [AF.F, AF.L] as const
export type AfFill = typeof LSa[number];

export type ZcolorKey = keyof typeof AF.zcolor;
export type Zcolor = typeof AF.zcolor[ZcolorKey];

/** a Mark (one of six) on the edge of Hex2 to indicate affinity */
class AfMark extends Shape {

  drawAfMark(afType: ATS, afc: AfColor, aff: AfFill) {
    let color: Zcolor = AF.zcolor[afc]
    let wm = (TP.hexRad * .4), w2 = wm / 2;
    let k = -1, wl = 2, y0 = k + TP.hexRad * H.sqrt3 / 2, y1 = w2 * .87 - y0
    let arc0 = 0 * (Math.PI / 2), arclen = Math.PI
    let g = this.graphics
    // ss(wl) = setStrokeStyle(width, caps, joints, miterlimit, ignoreScale)
    // g.s(afc) == beginStroke; g.f(afc) == beginFill
    if (aff == AF.L) { g.ss(wl).s(color) } else { g.f(color) }
    g.mt(-w2, 0 - y0);
    (afType == AF.A) ?
      //g.at(0, y1, w2, 0 - y0, w2) : // one Arc
      g.arc(0, 0 - y0, w2, arc0, arc0 + arclen, false) :
      (afType == AF.T) ?
        g.lt(0, y1).lt(w2, 0 - y0) : // two Lines
        (afType == AF.S) ?
          g.lt(-w2, y1).lt(w2, y1).lt(w2, 0 - y0) : // three Lines
          undefined;
          // endStroke() or endFill()
    if (aff == AF.L) { g.es() } else { g.ef() }
    return g
  }
  // draw in N orientation
  constructor(shape: ATS, color: AfColor, fill: AfFill, ds: HexDir) {
    super()
    this.drawAfMark(shape, color, fill)
    this.mouseEnabled = false
    this.rotation = H.dirRot[ds]
    this[S.Aname] = `AfMark:${shape},${color},${fill}`  // for debug, not production
  }
}

/** Container of AfMark Shapes */
export class AfHex extends Container {
  /** return a cached Container with hex and AfMark[6] */
  constructor(
    public aShapes: ATS[],
    public aColors: AfColor[],
    public aFill: AfFill[],
    public Aname = ``
  ) {
    super()
    for (let ndx in aShapes) {
      let ats = aShapes[ndx], afc = aColors[ndx], aff = aFill[ndx], ds = H.ewDirs[ndx]
      let afm = new AfMark(ats, afc, aff, ds)
      this.addChild(afm)
    }
    let w = TP.hexRad * H.sqrt3, h = TP.hexRad * 2 // see also: Hex2.cache()
    this.cache(-w / 2, -h / 2, w, h)
  }
  override clone() {
    return new AfHex(this.aShapes, this.aColors, this.aFill, this.Aname)
  }

  static allAfHexMap: Map<string, AfHex> = new Map();
  static allAfHex: AfHex[] = [];

  /**
   * make all the allAfHex.
   *
   * affinity defined by (2x3x2) permutation of each of shape[c,s,t] & color[r,g,b] & fill[line|solid]
   *
   * each "AfHex" is a [cached] Container of 6 AfMark Shapes (on each edge of Hex)
   * annotated with shape[6]: [a,s,t] and color[6]: [r,g,b] and fill[6]: [l,f]
   * each annotation rotated to align with ewDirs
   */
  static makeAllAfHex() {
    // TODO synthesize all permutations
    let atsPerm = AfHex.findPermutations([AF.S, AF.S, AF.S, AF.S, AF.S, AF.S])
    //let atsPerm = AfHex.findPermutations([AF.A, AF.A, AF.T, AF.T, AF.S, AF.S])
    let afcPerm = AfHex.findPermutations([AF.R, AF.R, AF.G, AF.G, AF.B, AF.B])
    let affPerm = AfHex.findPermutations([AF.F, AF.F, AF.F, AF.F, AF.F, AF.F])
    console.log(stime(`AfHex`, `.makeAllAfHex: atsPerm`), atsPerm)
    console.log(stime(`AfHex`, `.makeAllAfHex: afcPerm`), afcPerm)
    console.log(stime(`AfHex`, `.makeAllAfHex: affPerm`), affPerm)

    // pick a random rotation of each factor:
    // expect 16 x 16 x 4 = 1024 generated.
    for (let ats of atsPerm) {
      // let atsr = AfHex.rotateAf(atsn, Math.round(Math.random() * atsn.length))
      // rotated when placed on Hex2
      let atss = ats.join('');
      for (let afc of afcPerm) {
        let afcr = AfHex.rotateAf(afc, Math.round(Math.random() * afcPerm.length))
        let afcs = afcr.join('')
        for (let aff of affPerm) {
          let affr = AfHex.rotateAf(aff, Math.round(Math.random() * affPerm.length))
          let affs = affr.join('')
          let afhex = new AfHex(ats, afc, aff, `${atss}:${afcs}:${affs}`);
          afhex.Aname = `${atss}:${afcs}:${affs}`;
          AfHex.allAfHexMap.set(afhex.Aname, afhex);
          AfHex.allAfHex.push(afhex);
        }
      }
    }
  }
  static findPermutations(ary: any[]) {
    return AfHex.chooseNext(ary)
  }
  /**
   * choose next item (when distinct from previous choice) append to choosen
   * when all items have been chosen, push 'chosen' to found.
   *
   * @param items items to choose (sorted)
   * @param found permutations already found (push new perms to this array)
   * @param chosen items already chosen (in order)
   * @returns
   */
  static chooseNext(items: any[], found: any[][] = [], chosen: any[] = []) {
    // assert: left is sorted
    // done: 0012 left: 12 --> 001212, 001221
    // append lowest(left) to done, then chooseNext
    for (let ndx = 0; ndx < items.length; ndx++) {
      let next = items[ndx]
      if (next === items[ndx - 1]) continue // because 'sorted': skip all identical elements
      let ritems = items.slice() // copy of remaining items
      ritems.splice(ndx, 1)      // remove 'next' item from remaining items
      let nchosen = chosen.slice()
      nchosen.push(next)         // append 'next' item to chosen
      if (ritems.length === 0) {
        if (AfHex.newFound(nchosen, found)) found.push(nchosen);
        return found
      }
      AfHex.chooseNext(ritems, found, nchosen)
    }
    return found
  }
  static newFound(target: any[], exists: any[][]) {
    let rt = target.slice()
    for (let r = 0; r < rt.length; r++) {
      if (exists.find(exary => !exary.find((v, ndx) => rt[ndx] !== v))) return false;
      rt = AfHex.rotateAf(rt, 1)
    }
    return true // no rotation of target matches an existing array element.
  }

  /** rotate elements of array by n positions. */
  static rotateAf(str: any[], n = 1, cw = true) {
    // abcdef: n=1 -> bcdefa; n=2 -> cdefab (CCW)
    // abcdef: n=1 -> fabcde; n=2 -> efabcd (CW)
    if (cw) n = str.length - n
    let tail = str.slice(n)
    let head = str.slice(0, n)
    tail.push(...head)
    return tail
  }
}
