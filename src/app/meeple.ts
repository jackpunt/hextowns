import { C, F, S } from "@thegraid/common-lib";
import { ValueCounter } from "@thegraid/easeljs-lib";
import { Shape, Text } from "@thegraid/easeljs-module";
import { NoZeroCounter } from "./counters";
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap } from "./hex";
import { H } from "./hex-intfs";
import { Player } from "./player";
import { C1, HexShape, PaintableShape } from "./shapes";
import { DragContext } from "./table";
import { PlayerColor, TP, criminalColor } from "./table-params";
import { Church, Civic, Courthouse, InfRays, PS, Tile, TownStart, University } from "./tile";

class MeepleShape extends Shape implements PaintableShape {
  static fillColor = 'rgba(225,225,225,.7)';
  static overColor = 'rgba(120,210,120,.5)'; // transparent light green

  constructor(public player: Player, public radius = TP.hexRad * .4, public y0 = Meeple.radius) {
    super()
    this.paint();
    this.overShape = this.makeOverlay();
  }
  /** stroke a ring of colorn, stroke-width = 2, r = radius-2; fill disk with (~WHITE,.7) */
  paint(colorn = this.player?.colorn ?? C1.grey) {
    const x0 = 0, y0 = this.y0, r = this.radius, ss = 2, rs = 1;
    const g = this.graphics.c().ss(ss).s(colorn).dc(x0, y0, r - rs);
    g.f(MeepleShape.fillColor).dc(x0, y0, r - 1)  // disk
    this.setBounds(x0 - r, y0 - r, 2 * r, 2 * r)
    return g
  }
  overShape: Shape;  // visible when Meeple is 'faceDown' after a move.
  makeOverlay() {
    let {x, y, width: w, height: h} = this.getBounds();
    const over = new Shape();
    over.graphics.f(MeepleShape.overColor).dc(x + w / 2, y + h / 2, w / 2)
    over.visible = false;
    over.name = over[S.Aname] = 'overShape';
    return over;
  }
}

type MeepleInf = -1 | 0 | 1;
export class Meeple extends Tile {
  static allMeeples: Meeple[] = [];
  static radius = TP.hexRad * .4;

  readonly colorValues = C.nameToRgba("blue"); // with alpha component
  get y0() { return (this.baseShape as MeepleShape).y0; }
  get overShape() { return (this.baseShape as MeepleShape).overShape; }

  /**
   * Meeple - Leader, Police, Criminal
   * @param Aname
   * @param player (undefined for Chooser)
   * @param civicTile Tile where this Meeple spawns
   */
  constructor(
    Aname: string,
    player?: Player,
    inf: MeepleInf = 1,   // -1 for Criminal
    vp = 0,    // 1 for Leader
    cost = 1,  // Inf required to place (1 for Leader/Police, but placing in Civic/PS with Inf)
    econ = -6, // Econ required: -2 for Police, -3 for Criminal [place, not maintain]
  ) {
    super(player, Aname, inf, vp, cost, econ);
    this.addChild(this.overShape);
    this.player = player;
    let { x, y, width, height } = this.baseShape.getBounds();
    this.nameText.visible = true;
    this.nameText.y = y + height/2 - Tile.textSize/2;
    this.cache(x, y, width, height);
    this.paint();
    Meeple.allMeeples.push(this);
  }

  /** the map Hex on which this Meeple sits. */
  override get hex() { return this._hex; }
  /** only one Meep on a Hex, Meep on only one Hex */
  override set hex(hex: Hex) {
    if (this.hex !== undefined) this.hex.meep = undefined
    this._hex = hex
    if (hex !== undefined) hex.meep = this;
  }

  startHex: Hex;       // location at start-of-turn (see also: homeHex -- start-of-game/recycle)

  override get radius() { return TP.hexRad / 1.9 }
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): PaintableShape { return new MeepleShape(this.player); }

  /** start of turn: unmoved */
  faceUp() {
    this.overShape.visible = false;
    this.startHex = this.hex;
    this.updateCache()
    GamePlay.gamePlay.hexMap.update();
  }

  /** when moved, show grey overlay */
  faceDown() {
    this.overShape.visible = true;
    this.updateCache()
    GamePlay.gamePlay.hexMap.update();
  }

  override moveTo(hex: Hex): Hex {
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);
    if (toHex.isOnMap) {
      if (fromHex.isOnMap && toHex !== this.startHex) { this.faceDown(); }
      else { this.faceUp(); }
    }
    return hex;
  }
   // Meeple
  /** decorate with influence rays (playerColorn)
   * @param inf 0 ... n (see also: this.infColor)
   */
  override setInfRays(inf = this.inf): void {
    this.removeChildType(InfRays)
    if (inf !== 0) {
      this.addChildAt(new InfRays(inf, this.infColor), this.children.length - 1)
    }
    let radxy = -TP.hexRad, radwh = 2 * TP.hexRad
    this.cache(radxy, radxy, radwh, radwh)
  }

  /** here we override for Meeple's y0 offset. */
  override hexUnderObj(hexMap: HexMap) {
    let dragObj = this;
    let pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y + this.y0, hexMap.mapCont.hexCont)
    return hexMap.hexUnderPoint(pt.x, pt.y)
  }

  isOnLine(hex: Hex) {
    return H.infDirs.find(dir => this.hex.hexesInDir(dir).includes(hex)) ? true : false;
  }

  override isLegalTarget(hex: Hex) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;    // no move onto meeple
    if (GamePlay.gamePlay.failToPayCost(this, hex, false)) return false;
    // only move in line, to hex with influence:
    let onLine = this.isOnLine(hex), noInf = hex.getInfT(this.infColor) === 0;
    if (this.hex.isOnMap && (!onLine || noInf)) return false;
    return hex.isOnMap;
  }

  override dragStart(hex: Hex2): void {
    this.hex.tile?.setInfRays(this.hex.tile.inf); // removing meeple influence
    this.setInfRays(this.inf);  // show influence rays on this meeple
  }

  // Meeple
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    GamePlay.gamePlay.placeMeep(this, targetHex); // Drop
    const infP = this.hex?.getInfP(this.infColor) ?? 0;
    targetHex.tile?.setInfRays(infP);
    this.setInfRays(infP);
  }
}

export class Leader extends Meeple {
  /** new Civic Tile with a Leader 'on' it. */
  static makeLeaders(p: Player, nPolice = 10) {
    new Mayor(new TownStart(p))   // King
    new Priest(new Church(p))     // Bishop
    new Chancellor(new University(p))   // Rook: Chariot, Rector, Count
    new Judge(new Courthouse(p))  // Queen
  }

  civicTile: Civic;               // Leader deploys to civicTile & extra VP when on civicTile

  // VP bonus when Leader is on CivicTile
  override get vp()   { return super.vp   + (this.civicTile !== this.hex.tile ? 0 : TP.vpOnCivic); }
  // InfP bonus when Leader is on CivicTile [if enabled by TP.infOnCivic]
  override get infP() { return super.infP + (this.civicTile !== this.hex.tile ? 0 : TP.infOnCivic); }

  constructor(tile: Civic, abbrev: string) {  // Leader(name, player, inf, vp, cost, econ)
    super(`${abbrev}:${tile.player.index}`, tile.player, 1, 0, TP.leaderCost, TP.leaderEcon);
    this.civicTile = tile;
    const mark = this.addBonus('star');
    this.addChildAt(mark, 1); // move bonus-star just above MeepleShape
    this.paint()
    this.markCivicWithLetter();
  }

  markCivicWithLetter(civic = this.civicTile) {
    const letterText = new Text(this.Aname.substring(0, 1), F.fontSpec(civic.radius / 2));
    letterText.visible = true;
    letterText.textAlign = 'center';
    letterText.y -= civic.radius * .75;
    civic.addChild(letterText);
    civic.paint();
  }

  override isLegalTarget(hex: Hex) { // Leader
    if (!super.isLegalTarget(hex)) return false;
    if (!this.hex.isOnMap && (hex !== this.civicTile.hex)) return false; // deploy ONLY to civicTile.
    return true
  }

}
export class Mayor extends Leader {
  constructor(tile: Civic) {
    super(tile, 'M')
  }
}

export class Judge extends Leader {
  constructor(tile: Civic) {
    super(tile, 'J')
  }
}

export class Chancellor extends Leader {
  constructor(tile: Civic) {
    super(tile, 'C')
  }
}

export class Priest extends Leader {
  constructor(tile: Civic) {
    super(tile, 'P')
  }
}

/** a Dispenser of a set of Tiles. */
export class TileSource<T extends Tile> {
  readonly Aname: string
  private readonly allUnits: T[] = new Array<T>();
  private readonly available: T[] = new Array<T>();
  readonly counter?: ValueCounter;   // counter of available units.

  /** mark unit available for later deployment */
  availUnit(unit: T) {
    if (!this.available.includes(unit)) {
      this.available.push(unit);
      unit.hex = undefined;
      unit.visible = false;
    }
    this.updateCounter();
  }

  /** enroll a new Unit to this source. */
  newUnit(unit: T) {
      unit.homeHex = this.hex;
      this.allUnits.push(unit);
      this.availUnit(unit);
    }

  /** move next available unit to source.hex, make visible */
  nextUnit() {
    let unit = this.available.shift();    // remove from available
    if (!unit) return unit;
    unit.visible = true;
    unit.moveTo(this.hex);     // and try push to available
    if (!unit.player) unit.paint(GamePlay.gamePlay.curPlayer?.color)
    this.updateCounter();
    return unit;
  }

  updateCounter() {
    this.counter.parent.setChildIndex(this.counter, this.counter.parent.numChildren - 1);
    this.counter?.setValue(this.available.length);
    this.hex.cont.updateCache(); // updateCache of counter on hex
    this.hex.map.update();       // updateCache of hexMap with hex & counter
  }

  constructor(type: new (...args: any) => T, public readonly player: Player, public readonly hex: Hex2) {
    this.Aname = `${type.name}-Source`;
    this.counter = new ValueCounter(`${type.name}:${player?.index || 'any'}`, this.available.length, `lightblue`, TP.hexRad / 2);
    const cont = GamePlay.gamePlay.hexMap.mapCont.counterCont;
    const xy = hex.cont.localToLocal(0, -TP.hexRad / H.sqrt3, cont);
    this.counter.attachToContainer(cont, xy);
  }
}

class UnitSource<T extends Meeple> extends TileSource<T> {

}

export class Police extends Meeple {
  static source: UnitSource<Police>[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.policePerPlayer) {
    const source = Police.source[player.index] = new UnitSource(Police, player, hex)
    for (let i = 0; i < n; i++) {
      source.newUnit(new Police(player, i + 1));
    }
    source.nextUnit();  // unit.moveTo(source.hex)
  }

  // Police
  constructor(player: Player, index: number) {
    super(`P-${index}`, player, 1, 0, TP.policeCost, TP.policeEcon);
  }

  override paint(pColor = this.player?.color ?? criminalColor) {
    const [ss, rs] = [4, 4];
    const r = (this.baseShape as MeepleShape).radius, colorn = TP.colorScheme[pColor];
    const g = this.baseShape.paint(colorn); // [2, 1]
    g.ss(ss).s(C.briteGold).dc(0, this.y0, r - rs) // stroke a colored ring inside black ring
    this.updateCache();
  }

  override moveTo(hex: Hex) {
    const source = Police.source[this.player.index]
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);
    if (fromHex === source.hex && fromHex !== toHex) {
      source.nextUnit()   // Police: shift; moveTo(source.hex); update source counter
    }
    return hex;
  }

  override isLegalTarget(hex: Hex) { // Police
    if (!super.isLegalTarget(hex)) return false;
    let sourceHex = Police.source[this.player.index].hex;
    if (this.hex === sourceHex && !((hex.tile instanceof PS) && hex.tile.player === this.player)) return false;
    return true;
  }

  override sendHome(): void {
    super.sendHome();
    let source = Police.source[this.player.index]
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}

class CriminalSource extends UnitSource<Criminal> {
  override availUnit(unit: Criminal): void {
    super.availUnit(unit);
    unit.autoCrime = false;
    unit.paint();
  }
  get hexMeep() { return this.hex.meep as Criminal; }
}

/**
 * Criminal, Barbarian, Insurgent, Looter, Rioter...
 *
 * They swarm and destroy civil and economic resources:
 * if negative influence exceeds positive influence on hex, meep or tile is removed.
 *
 * Owned & Operated by Player, to destroy Tiles of the opposition.
 */
export class Criminal extends Meeple {
  static source: CriminalSource[] = [];

  static makeSource(player: Player, hex: Hex2, n = TP.criminalPerPlayer) {
    const source = Criminal.source[player.index] = new CriminalSource(Criminal, player, hex)
    for (let i = 0; i < n; i++) {
      source.newUnit(new Criminal(player, i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
  }

  autoCrime = false;  // set true for zero-econ for this unit.

  override get econ(): number { return this.autoCrime ? 0 : super.econ; }

  constructor(player: Player, serial: number) {
    super(`C-${serial}`, player, 1, 0, TP.criminalCost, TP.criminalEcon)
  }

  override get infColor(): PlayerColor { return criminalColor; }

  override paint(pColor = this.player?.color ?? criminalColor) {
    const [ss, rs] = this.autoCrime ? [4, 4]: [2, 3] ;
    const r = (this.baseShape as MeepleShape).radius, colorn = TP.colorScheme[pColor];
    const g = this.baseShape.paint(colorn);   // [2, 1]
    g.ss(ss).s(C.black).dc(0, this.y0, r - rs) // stroke a colored ring inside black ring
    this.updateCache();
  }

  override moveTo(hex: Hex) {
    const source = Criminal.source[this.player.index];
    const fromHex = this.hex;
    const toHex = super.moveTo(hex);
    if (fromHex === source.hex) {
      if (this.autoCrime) {
        this.paint();
      }
      if (fromHex !== toHex) {
        source.nextUnit()   // Criminal: shift; moveTo(source.hex); update source counter
      }
    }
    const gamePlay = GamePlay.gamePlay, curPlayer = gamePlay.curPlayer;
    if (toHex === gamePlay.recycleHex && this.player !== curPlayer) {
      curPlayer.coins -= this.econ;   // capturing player gets this Criminal's salary (0 if autoCrime)
    }
    return toHex;
  }

  override canBeMovedBy(player: Player, ctx: DragContext): boolean {
    // TODO: allow to player move some autoCrime criminals
    if (!super.canBeMovedBy(player, ctx)) return false;
    return true;
  }

  override isLegalTarget(hex: Hex): boolean { // Criminal
    if (!super.isLegalTarget(hex)) return false;
    let plyr = this.player ?? GamePlay.gamePlay.curPlayer; // owner or soon-to-be owner
    // must NOT be on or adj to plyr's Tile:
    if (hex.tile?.player == plyr) return false;
    if (hex.findLinkHex(hex => hex.tile?.player == plyr)) return false;
    // must be on or adj to otherPlayer Tile OR aligned Criminal:
    if (hex.tile?.player && hex.tile.player !== plyr) return true;
    if (hex.findLinkHex(hex =>
      (hex.tile?.player && hex.tile.player !== plyr) ||
      ((hex.meep instanceof Criminal) && hex.meep.player === plyr))
      ) return true;
    return false;
  }

  override sendHome(): void {
    super.sendHome(); // this.resetTile(); moveTo(this.homeHex)
    const source = Criminal.source[this.player.index];
    source.availUnit(this);
    if (!source.hex.meep) source.nextUnit();
  }
}

export class DebtSource extends TileSource<Debt> {
  constructor(hex: Hex2) {
    super(Debt, undefined, hex)
  }
  // availUnit(unit) -> unit.hex = undefined

  override nextUnit(): Debt {
    const debt = super.nextUnit();
    this.hex.tile.debt = debt;
    return debt;
  }
}

/**
 * Debt is 'sourced'; Debt moved to a hex is attached to the Tile on that hex.
 */
export class Debt extends Tile {
  static source: DebtSource;

  static makeSource(hex: Hex2, n = 30) {
    const source = Debt.source = new DebtSource(hex)
    for (let i = 0; i < n; i++) {
      source.newUnit(new Debt(i + 1));
    }
    source.nextUnit(); // moveTo(source.hex)
    return source;
  }

  constructor(serial: number) {
    super(undefined, `Debt-${serial}`, 0, 0, 0, 0);
    this.counter.attachToContainer(this, {x: 0, y: this.baseShape.y});
  }

  counter = new NoZeroCounter(`${this.Aname}C`, 0, 'rgba(0,0,0,0)', this.radius * .7);
  get balance() { return this.counter.getValue(); }
  set balance(v: number) {
    this.counter.stage ? this.counter.updateValue(v) : this.counter.setValue(v);
    this.updateCache();
    this.tile?.updateCache();
  }

  override makeShape(): PaintableShape {
    const shape = new HexShape(this.radius * .5);
    shape.y += this.radius * .3
    return shape;
  }
  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, C.debtRust); // TODO: override paint() --> solid hexagon (also: with Counter)
  }
  override textVis(vis?: boolean): void {
    super.textVis(vis);
    this.tile?.updateCache();
  }

  override get hex() { return this._tile?.hex; }
  override set hex(hex: Hex) { this.tile = hex?.tile; }

  _tile: Tile;
  get tile() { return this._tile; }
  set tile(tile: Tile) {
    if (this._tile && this._tile !== tile) {
      this._tile.removeChild(this);
      this._tile.debt = undefined;
      // expect this.balance === 0;?
      // expect [new] tile is undefined or debtSource
    }
    this._tile = tile;
    if (tile) {
      tile.debt = this;
      tile.addChild(this);
      this.x = this.y = 0;
      tile.paint();
    }
  }

  override dragStart(hex: Hex2, ctx: DragContext): void {
    this.tile?.updateCache();
    super.dragStart(hex, ctx);
  }

  override isLegalTarget(hex: Hex): boolean {
    if (hex === GamePlay.gamePlay.recycleHex) return this.hex.isOnMap;
    if (!hex.isOnMap) return false;
    if (this.balance > 0) return false;
    if (hex?.tile?.player !== GamePlay.gamePlay.curPlayer) return false;
    if (hex.tile.loanLimit <= 0) return false; // no first mortgage.
    if (hex.tile.debt) return false;           // no second mortgage.
    return true;
  }

  // nextUnit() --> unit.moveTo(source.hex)
  override moveTo(toHex: Hex) {
    const source = Debt.source; //[this.player.index]
    const fromHex = this.hex;
    if (toHex === fromHex) {
      this.tile = toHex.tile;
      return toHex;
    }
    const tile = toHex.tile;
    if (!tile) debugger;        // sendHome...?
    this.tile = tile;           // super.moveTo(hex);    // super.moveTo(hex);
    if (this.tile?.player) {
      this.balance = tile?.loanLimit ?? 0;
      this.tile.player.coins += this.balance;
    }
    if (fromHex === source.hex) {
      source.nextUnit();
    }
    return toHex;
  }

  override sendHome(): void {
    let source = Debt.source; //[this.player.index]
    if (this.tile) {
      this.tile.player.coins -= this.balance;
    }
    this.balance = 0;
    this.tile = undefined;
    super.sendHome();
    source.availUnit(this);
    if (!source.hex.tile) source.nextUnit();
  }
}
