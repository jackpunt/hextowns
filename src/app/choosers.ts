import { C } from "@thegraid/common-lib"
import { BoolChoice, ChoiceItem, ChoiceStyle, Chooser, DropdownButton, DropdownChoice, DropdownItem, DropdownStyle, EditBox, KeyBinder, ParamItem, ParamLine, TextStyle } from "@thegraid/easeljs-lib"
import { Ship } from "./ship"

/** no choice: a DropdownChoice with 1 mutable item that can be set by setValue(...) */
export class NC extends DropdownChoice {
  static style(defStyle: DropdownStyle) {
    let baseStyle = DropdownButton.mergeStyle(defStyle)
    let pidStyle = { arrowColor: 'transparent', textAlign: 'right' }
    return DropdownButton.mergeStyle(pidStyle, baseStyle)
  }
  constructor(items: DropdownItem[], item_w: number, item_h: number, defStyle?: DropdownStyle) {
    super(items, item_w, item_h, NC.style(defStyle))
  }
  /** never expand */
  override rootclick(): void {}

  override setValue(value: string, item: ParamItem, target: object): boolean {
    item.value = value // for reference?
    this._rootButton.text.text = value
    return true
  }
}

/** Chooser with an EditBox */
export class EBC extends Chooser {
  editBox: EditBox;
  constructor(items: ChoiceItem[], item_w: number, item_h: number, style?: ChoiceStyle & TextStyle) {
    super(items, item_w, item_h, style)
    style && (style.bgColor = style.fillColor)
    style && (style.textColor = C.BLACK)
    this.editBox = new EditBox({ x: 0, y: 0, w: item_w, h: item_h * 1 }, style)
    this.addChild(this.editBox)
    let scope = this.editBox.keyScope
    KeyBinder.keyBinder.setKey('M-v', { func: this.pasteClipboard, thisArg: this }, scope)
  }
  pasteClipboard(arg?: any) {
    let paste = async () => {
      let text = await navigator.clipboard.readText()
      this.editBox.setText(text)
    }
    paste()
  }

  override setValue(value: any, item?: ChoiceItem, target?: object): boolean {
    this.editBox.setText(value)
    return true
  }
}

/** like StatsPanel: read-only output field */
export class PidChoice extends NC {
  readonly playerShip: Ship = new Ship()
  paintPid(pid: number) {
    let ship = this.playerShip, color = ship.player?.afColor
    ship.paint(color)
    ship.visible = true
    if (!ship.parent) {
      let line = this.parent as ParamLine
      ship.scaleX = ship.scaleY = (line.height - 2) / ship.radius
      ship.x = ship.scaleY * ship.radius * 2 + 1
      ship.y = line.height / 2
      this.addChild(ship)
    }
  }
  override setValue(value: any, item: ParamItem, target: object) {
    //target[item.fieldName] = item.value
    this.paintPid(item ? item.value : "   ") // do NOT set any fieldName/value
    return false
  }
}

/** present [false, true] with any pair of string: ['false', 'true'] */
export class BC extends BoolChoice {}
