import { Params } from "@angular/router";
import { C, CycleChoice, DropdownStyle, makeStage, ParamGUI, ParamItem, stime } from "@thegraid/easeljs-lib";
import { Container, Stage } from "@thegraid/easeljs-module";
import { EzPromise } from "@thegraid/ezpromise";
import { EBC, PidChoice } from "./choosers";
import { GamePlay } from "./game-play";
import { InfMark } from "./hex";
import { Meeple } from "./meeple";
import { Player } from "./player";
import { StatsPanel, TableStats } from "./stats";
import { Table } from "./table";
import { TP } from "./table-params";
import { Tile } from "./tile";
import { TileExporter } from "./tile-exporter";

/** show " R" for " N" */
stime.anno = (obj: string | { constructor: { name: string; }; }) => {
  let stage = obj?.['stage'] || obj?.['table']?.['stage']
  return !!stage ? (!!stage.canvas ? " C" : " R") : " -" as string
}
async function imageFromDataURL(dataURL: string, width?, height?) {
  const image = new Image(width, height);
  const rv = new EzPromise<HTMLImageElement>();
  image.onload = () => rv.fulfill(image);
  image.src = dataURL;
  return rv;
}

/** initialize & reset & startup the application/game. */
export class GameSetup {
  stage: Stage;
  gamePlay: GamePlay
  paramGUIs: ParamGUI[]
  netGUI: ParamGUI // paramGUIs[2]

  /**
   * ngAfterViewInit --> start here!
   * @param canvasId supply undefined for 'headless' Stage
   */
  constructor(public canvasId: string, qParams: Params) {
    stime.fmt = "MM-DD kk:mm:ss.SSS"
    this.stage = makeStage(canvasId, false)
    Tile.loader.loadImages((imap) => this.startup(qParams, imap));
  }
  _netState = " " // or "yes" or "ref"
  set netState(val: string) {
    this._netState = (val == "cnx") ? this._netState : val || " "
    this.gamePlay.ll(2) && console.log(stime(this, `.netState('${val}')->'${this._netState}'`))
    this.netGUI?.selectValue("Network", val)
  }
  get netState() { return this._netState }
  set playerId(val: string) { this.netGUI?.selectValue("PlayerId", val || "     ") }

  tileExporter = new TileExporter();

  /** C-s ==> kill game, start a new one, possibly with new dbp */
  restart(nh = TP.nHexes) {
    let netState = this.netState
    // this.gamePlay.closeNetwork('restart')
    // this.gamePlay.logWriter?.closeFile()
    this.gamePlay.forEachPlayer(p => p.endGame())
    Tile.allTiles.forEach(tile => tile.hex = undefined)
    const deContainer = (cont: Container) => {
      cont.children.forEach(dObj => {
        dObj.removeAllEventListeners()
        if (dObj instanceof Container) deContainer(dObj)
      })
      cont.removeAllChildren()
    }
    deContainer(this.stage);
    TP.nHexes = nh;
    TP.fnHexes();
    let rv = this.startup()
    this.netState = " "      // onChange->noop; change to new/join/ref will trigger onChange(val)
    // next tick, new thread...
    setTimeout(() => this.netState = netState, 100) // onChange-> ("new", "join", "ref") initiate a new connection
    return rv
  }

  /**
   * Make new Table/layout & gamePlay/hexMap & Players.
   * @param ext Extensions from URL
   */
  startup(qParams?: Params, imap?: Map<string, HTMLImageElement>) {
    Tile.allTiles = [];
    Meeple.allMeeples = [];
    Player.allPlayers = [];

    const table = new Table(this.stage)        // EventDispatcher, ScaleCont, GUI-Player
    const gamePlay = new GamePlay(table, this) // hexMap, players, fillBag, gStats, mouse/keyboard->GamePlay
    this.gamePlay = gamePlay
    table.layoutTable(gamePlay)              // mutual injection, all the GUI components, fill hexMap
    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup
    if (this.stage.canvas) {
      const statsx = -TP.hexRad * 5, statsy = 30
      const statsPanel = this.makeStatsPanel(gamePlay.gStats, table.scaleCont, statsx, statsy)
      table.statsPanel = statsPanel
      const guiy = statsPanel.y + statsPanel.ymax + statsPanel.lead * 2
      console.groupCollapsed('initParamGUI')
      this.paramGUIs = this.makeParamGUI(table, table.scaleCont, statsx, guiy) // modify TP.params...
      const [gui, gui2] = this.paramGUIs
      // table.miniMap.mapCont.y = Math.max(gui.ymax, gui2.ymax) + gui.y + table.miniMap.wh.height / 2
      console.groupEnd()
    }
    table.startGame(); // allTiles.makeDragable(); placeStartTowns(); setNextPlayer();
    return gamePlay
  }
  /** reporting stats. values also used by AI Player. */
  makeStatsPanel(gStats: TableStats, parent: Container, x: number, y: number): StatsPanel {
    let panel = new StatsPanel(gStats, { fontSize: TP.fontSize }) // a ReadOnly ParamGUI reading gStats [& pstat(color)]
    panel.makeParamSpec("nCoins")     // implicit: opts = { chooser: StatChoice }
    panel.makeParamSpec("score", [], {name: `score: ${TP.nVictory}`})
    panel.makeParamSpec("sStat", [1])

    parent.addChild(panel)
    panel.x = x
    panel.y = y
    panel.makeLines()
    panel.stage.update()
    return panel
  }
  /** affects the rules of the game & board
   *
   * ParamGUI   --> board & rules [under stats panel]
   * ParamGUI2  --> AI Player     [left of ParamGUI]
   * NetworkGUI --> network       [below ParamGUI2]
   */
  makeParamGUI(table: Table, parent: Container, x: number, y: number) {
    let restart = false
    const gui = new ParamGUI(TP, { textAlign: 'right', fontSize: TP.fontSize })
    const schemeAry = TP.schemeNames.map(n => { return { text: n, value: TP[n] } })
    const setSize = (nh = TP.nHexes) => { restart && this.restart.call(this, nh) };
    gui.makeParamSpec("nh", [7, 8, 9], { fontColor: "red" });
    gui.makeParamSpec("nCivics", [4, 3, 2, 1], { fontColor: "green" }); TP.nCivics;
    gui.makeParamSpec("auctionSlots", [5, 4, 3], { fontColor: "green" }); TP.auctionSlots;
    gui.makeParamSpec("auctionMerge", [0, 1, 2, 3], { fontColor: "green" }); TP.auctionMerge;
    gui.makeParamSpec("colorScheme", schemeAry, { chooser: CycleChoice, style: { textAlign: 'center' } });

    gui.spec("nh").onChange = (item: ParamItem) => { setSize(item.value) }; TP.nHexes;
    gui.spec('auctionSlots').onChange = (item: ParamItem) => {
      gui.setValue(item);
      TP.preShiftCount = Math.max(1, TP.auctionSlots - 2);
      restart && this.restart();
    }
    gui.spec('auctionMerge').onChange = (item: ParamItem) => {
      if (item.value > TP.auctionSlots) return;
      gui.setValue(item);
      restart && this.restart();
    }
    const infName = "inf:cap"
    gui.makeParamSpec(infName, ['1:1', '1:0', '0:1', '0:0'], { name: infName, target: table, fontColor: 'green' })
    const infSpec = gui.spec(infName);
    table[infSpec.fieldName] = infSpec.choices[0].text
    infSpec.onChange = (item: ParamItem) => {
      const v = item.value as string
      table.showInf = v.startsWith('1')
      //table.showSac = v.endsWith('1')
      table.showCap = v.endsWith('1')
    }
    gui.spec("colorScheme").onChange = (item: ParamItem) => {
      gui.setValue(item)
      Tile.allTiles.forEach(tile => { tile.paint() }); // tile.player or C1.grey
      InfMark.setInfGraphics();
      this.gamePlay.paintForPlayer();  // re-paint ActionCont tiles
      this.gamePlay.hexMap.update()
    }
    parent.addChild(gui)
    gui.x = x // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = y
    gui.makeLines()
    const xoff = TP.hexRad * (320/60);
    const gui2 = this.makeParamGUI2(parent, x - xoff, y)
    const gui3 = this.makeNetworkGUI(parent, x - xoff, y + gui.ymax + 200 )
    gui.parent.addChild(gui) // bring to top
    gui.stage.update()
    restart = true // *after* makeLines has stablilized selectValue
    return [gui, gui2, gui3]
  }
  /** configures the AI player */
  makeParamGUI2(parent: Container, x: number, y: number) {
    const gui = new ParamGUI(TP, { textAlign: 'center', fontSize: TP.fontSize  })
    gui.makeParamSpec("log", [-1, 0, 1, 2], { style: { textAlign: 'right' } }); TP.log
    gui.makeParamSpec("maxPlys", [1, 2, 3, 4, 5, 6, 7, 8], { fontColor: "blue" }); TP.maxPlys
    gui.makeParamSpec("maxBreadth", [5, 6, 7, 8, 9, 10], { fontColor: "blue" }); TP.maxBreadth
    gui.makeParamSpec('infOnCivic', [0, 1]); TP.infOnCivic;
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    gui.stage.update()
    return gui
  }
  netColor: string = "rgba(160,160,160, .8)"
  netStyle: DropdownStyle = { textAlign: 'right', fontSize: TP.fontSize  };
  /** controls multiplayer network participation */
  makeNetworkGUI (parent: Container, x: number, y: number) {
    const gui = this.netGUI = new ParamGUI(TP, this.netStyle)
    gui.makeParamSpec("Network", [" ", "new", "join", "no", "ref", "cnx"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", ["     ", 0, 1, 2, 3, "ref"], { chooser: PidChoice, fontColor: "red" })
    gui.makeParamSpec("networkGroup", [TP.networkGroup], { chooser: EBC, name: 'gid', fontColor: C.GREEN, style: { textColor: C.BLACK } }); TP.networkGroup

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (['new', 'join', 'ref'].includes(item.value)) {
        const group = (gui.findLine('networkGroup').chooser as EBC).editBox.innerText
        // this.gamePlay.closeNetwork()
        // this.gamePlay.network(item.value, gui, group)
      }
      // if (item.value == "no") this.gamePlay.closeNetwork()     // provoked by ckey
    }
    (this.stage.canvas as HTMLCanvasElement)?.parentElement?.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('Text')
      ;(gui.findLine('networkGroup').chooser as EBC).setValue(text)
    });
    this.showNetworkGroup()
    parent.addChild(gui)
    gui.makeLines()
    gui.x = x; gui.y = y
    parent.stage.update()
    return gui
  }
  showNetworkGroup(group_name = TP.networkGroup) {
    document.getElementById('group_name').innerText = group_name
    const line = this.netGUI.findLine("networkGroup"), chooser = line?.chooser
    chooser?.setValue(group_name, chooser.items[0], undefined)
  }
}
