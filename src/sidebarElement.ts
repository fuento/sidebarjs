import { HTMLSidebarElement, SidebarBase, SidebarConfig, SidebarPosition } from '../index';

const SIDEBARJS: string = 'sidebarjs';
const SIDEBARJS_CONTENT: string = 'sidebarjs-content';
const IS_VISIBLE: string = `${SIDEBARJS}--is-visible`;
const IS_MOVING: string = `${SIDEBARJS}--is-moving`;
const LEFT_POSITION: SidebarPosition = 'left';
const RIGHT_POSITION: SidebarPosition = 'right';
const TOP_POSITION: SidebarPosition = 'top';
const BOTTOM_POSITION: SidebarPosition = 'bottom';
const POSITIONS: SidebarPosition[] = [LEFT_POSITION, RIGHT_POSITION, TOP_POSITION, BOTTOM_POSITION];

export class SidebarElement implements SidebarBase {
  public position: SidebarPosition;
  public readonly component: HTMLElement;
  public readonly container: HTMLElement;
  public readonly backdrop: HTMLElement;
  public readonly documentMinSwipeX: number;
  public readonly documentMinSwipeY: number;
  public readonly documentSwipeRange: number;
  public readonly nativeSwipe: boolean;
  public readonly nativeSwipeOpen: boolean;
  public readonly responsive: boolean;
  private initialTouch: number;
  private touchMoveSidebar: number;
  private openMovement: number;
  private isStyleMapSupported: boolean;
  private __wasVisible: boolean;
  private readonly backdropOpacity: number;
  private readonly backdropOpacityRatio: number;
  private readonly mainContent: HTMLElement;
  private readonly __emitOnOpen: () => void;
  private readonly __emitOnClose: () => void;
  private readonly __emitOnMoving: () => void;
  private readonly __emitOnChangeVisibility: (changes: { isVisible: boolean }) => void;

  constructor(config: SidebarConfig = {}) {
    const {
      component,
      container,
      backdrop,
      documentMinSwipeX = 10,
      documentMinSwipeY = 10,
      documentSwipeRange = 40,
      nativeSwipe,
      nativeSwipeOpen,
      responsive = false,
      mainContent,
      position = 'left',
      backdropOpacity = 0.3,
      onOpen,
      onMoving,
      onClose,
      onChangeVisibility,
    } = config;
    const hasCustomTransclude = container && backdrop;
    this.component = component || document.querySelector(`[${SIDEBARJS}]`) as HTMLElement;
    this.container = hasCustomTransclude ? container : SidebarElement.create(`${SIDEBARJS}-container`);
    this.backdrop = hasCustomTransclude ? backdrop : SidebarElement.create(`${SIDEBARJS}-backdrop`);
    this.documentMinSwipeX = documentMinSwipeX;
    this.documentMinSwipeY = documentMinSwipeY;
    this.documentSwipeRange = documentSwipeRange;
    this.nativeSwipe = nativeSwipe !== false;
    this.nativeSwipeOpen = nativeSwipeOpen !== false;
    this.isStyleMapSupported = SidebarElement.isStyleMapSupported();
    this.responsive = Boolean(responsive);
    this.mainContent = this.shouldDefineMainContent(mainContent);
    this.backdropOpacity = backdropOpacity;
    this.backdropOpacityRatio = 1 / backdropOpacity;
    this.__emitOnOpen = onOpen;
    this.__emitOnMoving = onMoving;
    this.__emitOnClose = onClose;
    this.__emitOnChangeVisibility = onChangeVisibility;

    if (!hasCustomTransclude) {
      try {
        this.transcludeContent();
      } catch (e) {
        throw new Error('You must define an element with [sidebarjs] attribute');
      }
    }

    this.setSwipeGestures(true);

    if (this.responsive || this.mainContent) {
      this.setResponsive();
    }

    this.setPosition(position);
    this.addAttrsEventsListeners(this.component.getAttribute(SIDEBARJS));
    this.addTransitionListener();
    this.backdrop.addEventListener('click', this.close, {passive: true});
  }

  public toggle = (): void => {
    this.isVisible() ? this.close() : this.open();
  }

  public open = (): void => {
    this.component.classList.add(IS_VISIBLE);
    this.setBackdropOpacity(this.backdropOpacity);
  }

  public close = (): void => {
    this.component.classList.remove(IS_VISIBLE);
    this.clearStyle(this.backdrop);
  }

  private __onTouchStart = (e: TouchEvent): void => {
    if(this.hasTopPosition() || this.hasBottomPosition()) {
      const offset = (10 * window.innerHeight / 100);
      this.initialTouch = e.touches[0].clientY + offset;
    } else {
      this.initialTouch = e.touches[0].pageX;
    }
    
    document.querySelector('body').classList.add('ui-block-scrolling');
  }

  private __onTouchMove = (e: TouchEvent): void => {
    let swipeDirection, sidebarMovement, clientContainer;

    if(this.hasTopPosition() || this.hasBottomPosition()) {    
      swipeDirection = -(this.initialTouch - e.touches[0].clientY);  
      sidebarMovement = this.container.clientHeight + (this.hasTopPosition() ? swipeDirection : -swipeDirection);
      clientContainer = this.container.clientHeight;
    } else {
      swipeDirection = -(this.initialTouch - e.touches[0].clientX);  
      sidebarMovement = this.container.clientWidth + (this.hasLeftPosition() ? swipeDirection : -swipeDirection);
      clientContainer = this.container.clientWidth;
    }

    if (sidebarMovement <= clientContainer) {
      this.touchMoveSidebar = Math.abs(swipeDirection);
      this.moveSidebar(swipeDirection);
      if (this.__emitOnMoving) {
        this.__emitOnMoving();
      }
    }
  }

  private __onTouchEnd = (): void => {
    this.component.classList.remove(IS_MOVING);
    this.clearStyle(this.container);
    this.clearStyle(this.backdrop);
    if(this.hasTopPosition() || this.hasBottomPosition()) {
      this.touchMoveSidebar > (this.container.clientHeight / 3.5) ? this.close() : this.open();
    } else {
      this.touchMoveSidebar > (this.container.clientWidth / 3.5) ? this.close() : this.open();  
    }
    
    this.initialTouch = null;
    this.touchMoveSidebar = null;    
  }

  private __onSwipeOpenStart = (e: TouchEvent): void => {
    if (this.targetElementIsBackdrop(e)) {
      return;
    }

    let touchPosition, documentTouch;
    if(this.hasTopPosition() || this.hasBottomPosition()) {
      touchPosition = e.touches[0].clientY;
      documentTouch = this.hasTopPosition() ? touchPosition : window.innerHeight - touchPosition;
    } else {
      touchPosition = e.touches[0].clientX;
      documentTouch = this.hasLeftPosition() ? touchPosition : document.body.clientWidth - touchPosition;
    }
    
    if (documentTouch < this.documentSwipeRange) {
      this.__onTouchStart(e);
    }
  }

  private __onSwipeOpenMove = (e: TouchEvent): void => {
    if (!this.targetElementIsBackdrop(e) && this.initialTouch && !this.isVisible()) {

      let documentSwiped, swipe, sidebarMovement, hasPosition;

      if(this.hasTopPosition() || this.hasBottomPosition()) {
        hasPosition = this.hasTopPosition();
        documentSwiped = e.touches[0].clientY - this.initialTouch;
        swipe = hasPosition ? documentSwiped : -documentSwiped;
        sidebarMovement = this.container.clientHeight - swipe;

        if (sidebarMovement > 0 && swipe >= this.documentMinSwipeY) {
          this.openMovement = hasPosition ? -sidebarMovement : sidebarMovement;
          this.moveSidebar(this.openMovement);        
        }

      } else {
        hasPosition = this.hasLeftPosition();
        documentSwiped = e.touches[0].clientX - this.initialTouch;
        swipe = hasPosition ? documentSwiped : -documentSwiped;
        sidebarMovement = this.container.clientWidth - swipe;        

        if (sidebarMovement > 0 && swipe >= this.documentMinSwipeX) {
          this.openMovement = hasPosition ? -sidebarMovement : sidebarMovement;
          this.moveSidebar(this.openMovement);
        }
      }      
    }
  }

  private __onSwipeOpenEnd = (): void => {    
    if (this.openMovement) {
      this.openMovement = null;
      this.__onTouchEnd();
    }
    document.querySelector('body').classList.remove('ui-block-scrolling');
  }

  private __onTransitionEnd = (): void => {
    const isVisible = this.isVisible();
    if (isVisible && !this.__wasVisible) {
      this.__wasVisible = true;
      if (this.__emitOnOpen) {
        this.__emitOnOpen();
      }      
    } else if (!isVisible && this.__wasVisible) {
      this.__wasVisible = false;
      if (this.__emitOnClose) {
        this.__emitOnClose();
      }
    }
    if (this.__emitOnChangeVisibility) {
      this.__emitOnChangeVisibility({isVisible});
    }

    document.querySelector('body').classList.remove('ui-block-scrolling');
  }

  public isVisible(): boolean {
    return this.component.classList.contains(IS_VISIBLE);
  }

  public destroy(): void {
    this.removeNativeGestures();
    this.container.removeEventListener('transitionend', this.__onTransitionEnd, <any> {passive: true});
    this.backdrop.removeEventListener('click', this.close, <any> {passive: true});
    this.removeNativeOpenGestures();
    this.removeAttrsEventsListeners(this.component.getAttribute(SIDEBARJS));
    this.removeComponentClassPosition();
    while (this.container.firstElementChild) {
      this.component.appendChild(this.container.firstElementChild);
    }
    this.component.removeChild(this.container);
    this.component.removeChild(this.backdrop);
    Object.keys(this).forEach((key) => this[key] = null);
  }

  public setPosition(position: SidebarPosition): void {
    this.position = POSITIONS.indexOf(position) >= 0 ? position : LEFT_POSITION;
    const resetMainContent = (document.querySelectorAll(`[${SIDEBARJS}]`) || []).length === 1;
    this.removeComponentClassPosition(resetMainContent);
    this.component.classList.add(`${SIDEBARJS}--${this.position}`);
    if (this.responsive && this.mainContent) {
      this.mainContent.classList.add(`${SIDEBARJS_CONTENT}--${this.position}`);
    }
    this.component
  }

  public addAttrsEventsListeners(sidebarName: string): void {
    this.forEachActionElement(sidebarName, (element, action) => {
      if (!SidebarElement.elemHasListener(element)) {
        element.addEventListener('click', this[action], {passive: true});
        SidebarElement.elemHasListener(element, true);
      }
    });
  }

  public removeAttrsEventsListeners(sidebarName: string): void {
    this.forEachActionElement(sidebarName, (element, action) => {
      if (SidebarElement.elemHasListener(<HTMLElement> element)) {
        element.removeEventListener('click', this[action]);
        SidebarElement.elemHasListener(element, false);
      }
    });
  }

  public setSwipeGestures(value: boolean): void {
    if (typeof value !== 'boolean') {
      throw new Error(`You provided a ${typeof value} value but setSwipeGestures needs a boolean value.`);
    }
    if (this.nativeSwipe) {
      value ? this.addNativeGestures() : this.removeNativeGestures();
      if (this.nativeSwipeOpen) {
        value ? this.addNativeOpenGestures() : this.removeNativeOpenGestures();
      }
    }
  }

  private addTransitionListener(): void {
    this.__wasVisible = this.isVisible();
    this.container.addEventListener('transitionend', this.__onTransitionEnd, <any> {passive: true});
  }

  private forEachActionElement(sidebarName: string, func: (element: HTMLElement, action: string) => void): void {
    const actions = ['toggle', 'open', 'close'];
    for (let i = 0; i < actions.length; i++) {
      const elements = document.querySelectorAll(`[${SIDEBARJS}-${actions[i]}="${sidebarName}"]`);
      for (let j = 0; j < elements.length; j++) {
        func(<HTMLElement> elements[j], actions[i]);
      }
    }
  }

  private removeComponentClassPosition(resetMainContent?: boolean): void {
    for (let i = 0; i < POSITIONS.length; i++) {
      this.component.classList.remove(`${SIDEBARJS}--${POSITIONS[i]}`);
      if (resetMainContent && this.mainContent) {
        this.mainContent.classList.remove(`${SIDEBARJS_CONTENT}--${POSITIONS[i]}`);
      }
    }
  }

  private hasLeftPosition(): boolean {
    return this.position === LEFT_POSITION;
  }

  private hasRightPosition(): boolean {
    return this.position === RIGHT_POSITION;
  }

  private hasTopPosition(): boolean {
    return this.position === TOP_POSITION;
  }

  private hasBottomPosition(): boolean {
    return this.position === BOTTOM_POSITION;
  }

  private transcludeContent(): void {
    while (this.component.firstChild) {
      this.container.appendChild(this.component.firstChild);
    }
    while (this.component.firstChild) {
      this.component.removeChild(this.component.firstChild);
    }
    this.component.appendChild(this.container);
    this.component.appendChild(this.backdrop);
  }

  private addNativeGestures(): void {
    this.component.addEventListener('touchstart', this.__onTouchStart, {passive: true});
    this.component.addEventListener('touchmove', this.__onTouchMove, {passive: true});
    this.component.addEventListener('touchend', this.__onTouchEnd, {passive: true});
  }

  private removeNativeGestures(): void {
    this.component.removeEventListener('touchstart', this.__onTouchStart, <any> {passive: true});
    this.component.removeEventListener('touchmove', this.__onTouchMove, <any> {passive: true});
    this.component.removeEventListener('touchend', this.__onTouchEnd, <any> {passive: true});
  }

  private addNativeOpenGestures(): void {
    document.addEventListener('touchstart', this.__onSwipeOpenStart, {passive: true});
    document.addEventListener('touchmove', this.__onSwipeOpenMove, {passive: true});
    document.addEventListener('touchend', this.__onSwipeOpenEnd, {passive: true});
  }

  private removeNativeOpenGestures(): void {
    document.removeEventListener('touchstart', this.__onSwipeOpenStart, <any> {passive: true});
    document.removeEventListener('touchmove', this.__onSwipeOpenMove, <any> {passive: true});
    document.removeEventListener('touchend', this.__onSwipeOpenEnd, <any> {passive: true});
  }

  private moveSidebar(movement: number): void {
    this.component.classList.add(IS_MOVING);
    if(this.hasTopPosition() || this.hasBottomPosition()) {
      this.applyStyle(this.container, 'transform', `translate3d(0, ${movement}px, 0)`, true);
    } else {
      this.applyStyle(this.container, 'transform', `translate3d(${movement}px, 0, 0)`, true);  
    }
    
    this.updateBackdropOpacity(movement);

    if (this.__emitOnMoving) {
      this.__emitOnMoving();
    }
  }

  private updateBackdropOpacity(movement: number): void {
    const swipeProgress = 1 - (Math.abs(movement) / this.container.clientWidth);
    const opacity = swipeProgress / this.backdropOpacityRatio;
    this.setBackdropOpacity(opacity);
  }

  private setBackdropOpacity(opacity: number): void {
    this.applyStyle(this.backdrop, 'opacity', opacity.toString());
  }

  private targetElementIsBackdrop(e: TouchEvent): boolean {
    return (<HTMLElement> e.target).hasAttribute(`${SIDEBARJS}-backdrop`);
  }

  private setResponsive(): void {
    if (!this.responsive && this.mainContent) {
      throw new Error(`You provide a [${SIDEBARJS_CONTENT}] element without set {responsive: true}`);
    }
    if (this.responsive && !this.mainContent) {
      throw new Error(`You have set {responsive: true} without provide a [${SIDEBARJS_CONTENT}] element`);
    }
    this.component.classList.add('sidebarjs--responsive');
  }

  private shouldDefineMainContent(mainContent?: HTMLElement): HTMLElement {
    if (mainContent) {
      mainContent.setAttribute(SIDEBARJS_CONTENT, '');
      return mainContent;
    } else {
      return document.querySelector(`[${SIDEBARJS_CONTENT}]`) as HTMLElement;
    }
  }

  private applyStyle(el: HTMLElement, prop: string, val: string, vendorify?: boolean): void {
    if (this.isStyleMapSupported) {
      (el as any).attributeStyleMap.set(prop, val);
    } else {
      el.style[prop] = val;
      if (vendorify) {
        el.style['Webkit' + prop.charAt(0).toUpperCase() + prop.slice(1)] = val;
      }
    }
  }

  private clearStyle(el: HTMLElement): void {
    if (this.isStyleMapSupported) {
      (el as any).attributeStyleMap.clear();
    } else {
      el.removeAttribute('style');
    }
  }

  public static isStyleMapSupported(): boolean {
    return Boolean((window as any).CSS && (CSS as any).number);
  }

  public static create(element: string): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute(element, '');
    return el;
  }

  public static elemHasListener(elem: HTMLSidebarElement, value?: boolean): boolean {
    return elem && typeof value === 'boolean' ? elem.sidebarjsListener = value : !!elem.sidebarjsListener;
  }
}
