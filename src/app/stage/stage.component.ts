import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { stime } from '@thegraid/easeljs-lib';
//import { } from 'wicg-file-system-access';
import { GameSetup } from '../game-setup';
import { buildURL, TP } from '../table-params';

@Component({
  selector: 'stage-comp',
  templateUrl: './stage.component.html',
  styleUrls: ['./stage.component.css']
})
export class StageComponent implements OnInit {

  static idnum: number = 0;
  getId(): string {
    return "T" + (StageComponent.idnum = StageComponent.idnum + 1);
  };
  /** the query string: ?a=...&b=...&c=... =>{a: ..., b: ..., c:...} */
  @Input('params')
  qParams: Params = {};


  @Input('width')
  width = 1600.0;   // [pixels] size of "Viewport" of the canvas / Stage
  @Input('height')
  height = 800.0;   // [pixels] size of "Viewport" of the canvas / Stage

  /** HTML make a \<canvas/> with this ID: */
  mapCanvasId = "mapCanvas" + this.getId(); // argument to new Stage(this.canvasId)

  constructor(private activatedRoute: ActivatedRoute) {}
  ngOnInit() {
    console.log(stime(this, ".noOnInit---"))
    this.activatedRoute.params.subscribe(params => {
      console.log(stime(this, ".ngOnInit: params="), params)
    })
    this.activatedRoute.queryParams.subscribe(params => {
      console.log(stime(this, ".ngOnInit: queryParams="), params);
      this.qParams = params;
    });
  }

  ngAfterViewInit() {
    setTimeout(()=>this.ngAfterViewInit2(), 250) //https://bugs.chromium.org/p/chromium/issues/detail?id=1229541
  }
  ngAfterViewInit2() {
    let href: string = document.location.href;
    console.log(stime(this, ".ngAfterViewInit---"), href, "qParams=", this.qParams);
    if (href.endsWith("startup")) {

    }
    // disable browser contextmenu
    // console.log(stime(this, `.ngAfterViewInit--- preventDefault contextmenu`))
    window.addEventListener('contextmenu', (evt: MouseEvent) => evt.preventDefault())
    const urlParams = new URLSearchParams(window.location.search);
    TP.ghost = urlParams.get('host') || TP.ghost
    TP.gport = Number.parseInt(urlParams.get('port') || TP.gport.toString(10), 10)
    TP.networkUrl = buildURL(undefined)
    let extstr = urlParams.get('ext')
    new GameSetup(this.mapCanvasId, this.qParams) // load images; new GamePlay
  }
  // see: stream-writer.setButton
  // static enableOpenFilePicker(method: 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker',
  //   options: OpenFilePickerOptions & { multiple?: false; } & SaveFilePickerOptions & DirectoryPickerOptions,
  //   cb: (fileHandleAry: any) => void) {
  //   const picker = window[method]       // showSaveFilePicker showDirectoryPicker
  //   const fsOpenButton = document.getElementById("fsOpenFileButton")
  //   fsOpenButton.onclick = async () => {
  //     picker(options).then((value: any) => cb(value), (rej: any) => {
  //       console.warn(`showOpenFilePicker failed: `, rej)
  //     });
  //   }
  // }
}
