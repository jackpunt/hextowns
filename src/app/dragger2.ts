import { DragInfo, Dragger } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, MouseEvent, Matrix2D } from '@thegraid/easeljs-module';

const S_stagemousemove = 'stagemousemove'
type OnHandler = Function
type DnDFunc = (c: DisplayObject | Container, ctx?: DragInfo) => void
type DragData = {
  scope: Object,        // 'this' for dragFunc/dropFunc()
  dragfunc: DnDFunc,
  dropfunc: DnDFunc,
  dragCtx?: DragInfo,
  pressmove?: OnHandler,
  pressup?: OnHandler,
  stagemousemove?: OnHandler,
  clickToDrag?: boolean,
  isScaleCont?: boolean,
  dragStopped?: boolean, // true if stopDrag(target) was called, else undefined
}

export class Dragger2 extends Dragger {
  override pressmove(event: MouseEvent, data: { scope: Object; dragfunc: (c: Container | DisplayObject, ctx?: DragInfo) => void; dropfunc: (c: Container | DisplayObject, ctx?: DragInfo) => void; dragCtx?: DragInfo; pressmove?: Function; pressup?: Function; stagemousemove?: Function; clickToDrag?: boolean; isScaleCont?: boolean; dragStopped?: boolean; }): void {
    if (event.nativeEvent?.button !== 0) return;
    super.pressmove(event, data);
  }

  // a click, or end-of-drag or synthetic, from stopDrag()
  override pressup(e: MouseEvent, data: DragData) {
    let { dropfunc, dragCtx } = data
    let obj: DisplayObject = e.currentTarget // the SC in phase-3
    data.dragCtx = undefined; // drag is done... mousebutton is up
    data.dragStopped = false; // indicates that it *was* stopped vs undefined (never stopped)
    let stage = obj.stage
    if (data.clickToDrag && data.stagemousemove) {
      stage.removeEventListener(S_stagemousemove, data.stagemousemove)
      data.stagemousemove = undefined;
    }
    if (!dragCtx) {
      // pressup without a dragCtx: a click; if clickToDrag convert stagemousemove to pressmove:
      if (!!data.clickToDrag && e.nativeEvent.button == 0) {
        // mouse is NOT down; to get 'drag' events we listen for stagemousemove:
        let stageDrag = (e: MouseEvent, data?: DragData) => {
          e.currentTarget = obj
          this.pressmove(e, data)
        }
        data.stagemousemove = stage.on(S_stagemousemove, stageDrag, this, false, data)
        this.pressmove(e, data)  // data.dragCtx = startDrag()
      }
      return     // a click, not a Drag+Drop
    }
    dragCtx.event = e
    e.stopPropagation()
    obj.rotation = dragCtx.rotation
    let par = dragCtx.lastCont || dragCtx.srcCont
    // last dropTarget CardContainer under the dragged Card  (or orig parent)
    //    console.log(stime(this, ".pressup: target.name="), e.target.name, "dropfunc?", dropfunc, " dragCtx?", dragCtx,
    //     "\n   obj.parent=", obj.parent.name,"obj=", obj, "\n   par.name=",par.name, "(dragCtx.lastCont) par=", par,"\n   event=", e)
    if (par) {
      // Drop obj onto Parent=lastCont in apparent position:
      let inx = obj.x, iny = obj.y                    // record for debugger
      obj.parent.localToLocal(obj.x, obj.y, par, obj)
      // console.log(stime(this, ".pressup: obj="), obj.name, obj, "x=", obj.x, obj.parent.x,
      // "\n   ", par.x, "dropParent=", par.name, par, " obj_pt=", obj_pt)
      par.addChild(obj); // transfer parentage from DragLayerContainer to dropTarget
    }
    if (typeof (dropfunc) === "function") {
      try {
        dropfunc.call(data.scope || obj.parent, obj, dragCtx);
      } catch (err) {
        let msg = "Dragger.pressup: dragfunc FAILED="
        console.error(msg, err)
        alert(msg)
      }
    }
    stage?.update();
  }
}
