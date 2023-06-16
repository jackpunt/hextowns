import { Component, HostListener, Inject } from '@angular/core';
import { KeyBinder } from '@thegraid/easeljs-lib';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = `HexTowns - User Guide`;
  timestamp = `${new Date().toLocaleTimeString('en-US')}`;

  constructor(@Inject(KeyBinder) private keyBinder: KeyBinder) { }

  // app.component has access to the 'Host', so we use @HostListener here
  // Listen to all Host events and forward them to our internal EventDispatcher
  @HostListener('document:keyup', ['$event'])
  @HostListener('document:keydown', ['$event'])
  @HostListener('mouseenter', ['$event'])
  @HostListener('mouseleave', ['$event'])
  @HostListener('focus', ['$event'])
  @HostListener('blur', ['$event'])
  dispatchAnEvent(event: Object) {
    // ask before [Cmd-W] closing browser tab: blocks auto-reload!
    // addEventListener(
    //   'beforeunload',
    //   e => { e.stopPropagation(); e.preventDefault(); return false; },
    //   true
    // );
    //console.log("dispatch: "+event.type);
    this.keyBinder.dispatchEvent(event);
  }
}
