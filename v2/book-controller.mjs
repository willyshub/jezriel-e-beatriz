// Adaptador do motor de folhas (StPageFlip, MIT) + gestos + modo simples (deck).
//
// Decisões (ver docs/V2-IMPLEMENTACAO.md):
// - A biblioteca é carregada sob demanda (após o gesto de abrir). Se falhar, o modo simples assume.
// - Os eventos nativos de toque/mouse da biblioteca são bloqueados (capture no host) e substituídos
//   por Pointer Events próprios, que acionam a API pública (startUserTouch/userMove/userStop) da biblioteca.
//   Motivo: o toque rápido da biblioteca não vira folha, o limite de virada exige cruzar a tela inteira
//   e links/botões precisam de proteção contra clique após arrasto.
// - Dobra a partir do CANTO INFERIOR DIREITO: arraste ou toque na zona do canto; "espiada" real via
//   FlipController.showCorner. Voltar: canto inferior esquerdo, gesto para a direita ou botão.
// - O motor simples (fade curto) serve a "Reduzir efeitos", falha da biblioteca e conteúdo maior que a tela.

const LIB_URL = new URL('./vendor/page-flip.browser.js', import.meta.url).href;
let libPromise = null;

export function loadFlipLib(timeoutMs = 7000) {
  if (window.St?.PageFlip) return Promise.resolve(window.St.PageFlip);
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const t = setTimeout(() => { s.remove(); reject(new Error('tempo esgotado ao carregar a biblioteca')); }, timeoutMs);
    s.src = LIB_URL;
    s.async = true;
    s.onload = () => {
      clearTimeout(t);
      window.St?.PageFlip ? resolve(window.St.PageFlip) : reject(new Error('biblioteca sem St.PageFlip'));
    };
    s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('falha ao carregar a biblioteca')); };
    document.head.append(s);
  }).catch((e) => { libPromise = null; throw e; });
  return libPromise;
}

const LIB_CLASSES = ['stf__item', '--soft', '--hard', '--left', '--right', '--simple'];
function limparFolha(sheet) {
  sheet.removeAttribute('style');
  sheet.classList.remove(...LIB_CLASSES, 'is-current');
}

/* ------------------------------------------------------------------ motor com dobra */
class FlipEngine {
  type = 'flip';
  constructor(PageFlip, host, sheets, start, size, hooks) {
    this.host = host;
    this.sheets = sheets;
    this.hooks = hooks;
    this.mount = document.createElement('div');
    host.append(this.mount);
    this.pf = new PageFlip(this.mount, {
      width: size.w, height: size.h,
      size: 'stretch',
      // Retrato sempre (uma folha por vez, preenchendo a tela): a biblioteca escolhe retrato quando
      // a largura do bloco < minWidth*2; os estilos inline de min-width são zerados abaixo.
      minWidth: 20000, maxWidth: 40000, minHeight: 100, maxHeight: 40000,
      autoSize: false, usePortrait: true, showCover: false,
      drawShadow: true, maxShadowOpacity: 0.3, flippingTime: 800,
      mobileScrollSupport: true, showPageCorners: false, clickEventForward: true,
      useMouseEvents: true, // necessário para o destroy() remover os ouvintes; os eventos de entrada são bloqueados abaixo
      startPage: start, startZIndex: 0, swipeDistance: 30,
    });
    this.mount.style.minWidth = '0';
    this.mount.style.minHeight = '0';
    // Bloqueia mousedown/touchstart nativos da biblioteca (os gestos são nossos).
    for (const t of ['mousedown', 'touchstart']) {
      this.mount.addEventListener(t, (e) => e.stopPropagation(), { capture: true });
    }
    this.pf.on('flip', (e) => hooks.onFlip(e.data));
    this.pf.on('changeState', (e) => hooks.onState?.(e.data));
    this.pf.loadFromHTML(sheets);
    this.peekTimer = 0;
  }
  get state() { return this.pf.getState(); }
  get busy() { return this.state === 'flipping' || this.state === 'user_fold'; }
  resize(w, h) {
    const s = this.pf.getSettings();
    s.width = w; s.height = h;   // a proporção da folha acompanha a área útil (folha ocupa a tela)
    this.pf.update();
  }
  next() { if (!this.busy) this.pf.flipNext('bottom'); }
  prev() { if (!this.busy) this.pf.flipPrev('bottom'); }
  goTo(i) { if (!this.busy) this.pf.flip(i, 'bottom'); }
  cornerStart(p) { this.pf.startUserTouch(p); }
  cornerMove(p) { this.pf.userMove(p, true); }
  cornerEnd(p, moved, vx) {
    if (!moved) { this.pf.userStop(p, false); return; } // toque: animação de dobra a partir do canto
    const fc = this.pf.getFlipController();
    const calc = fc.getCalculation();
    if (!calc) { this.pf.userStop(p, true); return; }
    // Limite de virada próprio: passar de ~40% da largura (ou gesto rápido) vira; a biblioteca exigiria cruzar a tela toda.
    const rect = this.pf.getBoundsRect();
    const pos = calc.getPosition();
    const rapido = vx < -0.45 && pos.x < rect.pageWidth * 0.92;
    const virar = pos.x < rect.pageWidth * 0.6 || rapido;
    const y = calc.getCorner() === 'bottom' ? rect.height : 0;
    this.pf.userStop(p, true); // encerra o estado de toque sem acionar o limite padrão
    try {
      fc.animateFlippingTo(pos, { x: virar ? -rect.pageWidth : rect.pageWidth, y }, virar);
    } catch { this.pf.userStop(p, false); }
  }
  hover(p) {
    if (this.state === 'read' || this.state === 'fold_corner') this.pf.getFlipController().showCorner(p);
  }
  peek(size) {
    if (this.state !== 'read') return false;
    const fc = this.pf.getFlipController();
    clearTimeout(this.peekTimer);
    fc.showCorner({ x: size.w - 4, y: size.h - 4 });            // levanta o canto de verdade
    this.peekTimer = setTimeout(() => this.release(size), 1100);  // e solta de volta
    return true;
  }
  release(size) {
    clearTimeout(this.peekTimer);
    if (this.state === 'fold_corner') this.pf.getFlipController().showCorner({ x: size.w / 2, y: size.h / 2 });
  }
  destroy() {
    clearTimeout(this.peekTimer);
    this.sheets.forEach((s) => s.remove());
    try { this.pf.destroy(); } catch { /* já removido */ }
    this.mount.remove();
    this.sheets.forEach(limparFolha);
  }
}

/* ------------------------------------------------------------------ motor simples */
class DeckEngine {
  type = 'deck';
  constructor(host, sheets, start, { scroll, reduced }, hooks) {
    this.sheets = sheets;
    this.hooks = hooks;
    this.index = start;
    this.el = document.createElement('div');
    this.el.className = 'deck' + (scroll ? ' deck--scroll' : '') + (reduced ? ' deck--reduced' : '');
    sheets.forEach((s) => { limparFolha(s); this.el.append(s); });
    host.append(this.el);
    this.#show(start);
  }
  #show(i) {
    this.index = i;
    this.sheets.forEach((s, k) => {
      s.classList.toggle('is-current', k === i);
      s.inert = k !== i;
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
  }
  get busy() { return false; }
  resize() {}
  #to(i) {
    if (i < 0 || i >= this.sheets.length || i === this.index) return;
    this.#show(i);
    this.hooks.onFlip(i);
  }
  next() { this.#to(this.index + 1); }
  prev() { this.#to(this.index - 1); }
  goTo(i) { this.#to(i); }
  cornerStart() {}
  cornerMove() {}
  cornerEnd(p, moved, vx, zone) {
    if (!moved) zone === 'br' ? this.next() : this.prev();
  }
  hover() {}
  peek() { return false; }
  release() {}
  destroy() {
    this.sheets.forEach((s) => { s.remove(); limparFolha(s); s.inert = false; s.removeAttribute('aria-hidden'); });
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ controlador */
export class BookController {
  /**
   * @param {object} o
   * @param {HTMLElement} o.stage área útil (gestos e medidas)
   * @param {HTMLElement} o.host onde o livro é montado
   * @param {HTMLElement[]} o.sheets folhas (nós do DOM, movidos entre motores)
   * @param {HTMLElement} o.measure contêiner invisível para medir se o conteúdo cabe
   * @param {import('./motion-controller.mjs').MotionController} o.motion
   * @param {(i:number)=>void} o.onChange folha atual mudou (após a virada)
   * @param {(info:object)=>void} [o.onMode] motor/estado mudou
   * @param {(state:string)=>void} [o.onState] estado da dobra mudou
   */
  constructor({ stage, host, sheets, measure, motion, onChange, onMode, onState }) {
    Object.assign(this, { stage, host, sheets, measure, motion, onChange, onMode, onState });
    this.engine = null;
    this.index = 0;
    this.PageFlip = null;
    this.libFailed = false;
    this.overflow = false;
    this.size = { w: 0, h: 0 };
    this.zone = 88;
    this.opened = false;
    this.suppressClickUntil = 0;
    this.g = null;
    this.#bindGestures();
    motion.onChange(() => this.#remode());
  }

  get count() { return this.sheets.length; }
  get mode() { return this.engine?.type ?? null; }
  get lastIndex() { return this.sheets.length - 1; }

  /** Carrega a biblioteca (se possível) e monta o livro na folha pedida. */
  async open(start = 0) {
    try { this.PageFlip = await loadFlipLib(); } catch (e) { this.libFailed = true; console.info('[v2] modo simples:', e.message); }
    this.index = start;
    this.host.inert = false;
    const r = this.stage.getBoundingClientRect();
    this.size = { w: Math.round(r.width), h: Math.round(r.height) };
    this.overflow = this.#measureOverflow();
    this.#mount(start);
    this.opened = true;
  }

  /** Chamar quando a área útil mudar (ResizeObserver). */
  measureSize(force = false) {
    const r = this.stage.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    if (!force && w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    if (!this.opened) return;
    this.overflow = this.#measureOverflow();
    const want = this.#wantedMode();
    if (this.engine.type !== want) this.#mount(this.index);
    else { this.engine.resize(w, h); this.#syncScroll(); }
  }

  #wantedMode() {
    return (!this.PageFlip || this.motion.reduced || this.overflow) ? 'deck' : 'flip';
  }
  #syncScroll() { if (this.engine?.type === 'deck') this.engine.el.classList.toggle('deck--scroll', this.overflow); }
  #remode() {
    if (!this.opened) return;
    this.overflow = this.#measureOverflow();
    if (this.engine.type !== this.#wantedMode()) this.#mount(this.index);
    else if (this.engine.type === 'deck') this.engine.el.classList.toggle('deck--reduced', this.motion.reduced);
  }

  // Mede o conteúdo em clones fora da tela, com o tamanho exato da folha.
  #measureOverflow() {
    const { w, h } = this.size;
    this.measure.replaceChildren();
    this.measure.style.width = w + 'px';
    this.measure.style.height = h + 'px';
    let over = false;
    for (const s of this.sheets) {
      const c = s.cloneNode(true);
      c.style.cssText = `width:${w}px;height:${h}px;display:block`;
      c.classList.remove('stf__item', 'is-current');
      this.measure.append(c);
      const inner = c.firstElementChild;
      if (inner && (inner.scrollHeight > h + 1 || inner.scrollWidth > w + 1)) over = true;
    }
    this.measure.replaceChildren();
    return over;
  }

  #mount(start) {
    this.engine?.destroy();
    this.engine = null;
    this.stage.dataset.fold = 'read';
    const hooks = { onFlip: (i) => this.#flipped(i), onState: (st) => this.#estado(st) };
    const want = this.#wantedMode();
    if (want === 'flip') {
      try {
        this.engine = new FlipEngine(this.PageFlip, this.host, this.sheets, start, this.size, hooks);
      } catch (e) {
        console.info('[v2] falha ao iniciar a dobra; modo simples:', e.message);
        this.libFailed = true; this.PageFlip = null;
        this.sheets.forEach(limparFolha);
      }
    }
    if (!this.engine) {
      this.engine = new DeckEngine(this.host, this.sheets, start, { scroll: this.overflow, reduced: this.motion.reduced }, hooks);
    }
    this.index = start;
    this.#announceMode();
    this.#syncCurrent(false);
  }

  #announceMode() {
    this.stage.dataset.engine = this.engine.type;
    this.onMode?.({ engine: this.engine.type, overflow: this.overflow, libFailed: this.libFailed });
  }

  /** Estado da dobra (read | fold_corner | user_fold | flipping): a orelha e a dica se escondem quando não é 'read'. */
  #estado(st) {
    this.stage.dataset.fold = st;
    this.onState?.(st);
  }

  #flipped(i) {
    this.index = i;
    this.#syncCurrent(true);
  }
  #syncCurrent(user) {
    this.motion.activate(this.sheets[this.index]);
    this.motion.prefetch(this.sheets[this.index + 1]);
    this.onChange?.(this.index, { user });
  }

  next() { if (this.opened && this.index < this.lastIndex) this.engine.next(); }
  prev() { if (this.opened && this.index > 0) this.engine.prev(); }
  goTo(i) { if (this.opened && i !== this.index && i >= 0 && i <= this.lastIndex) this.engine.goTo(i); }

  /** Dica de "espiada": levanta o canto inferior direito e solta. Sem hover, funciona em celular. */
  peek() {
    if (!this.opened || this.index >= this.lastIndex || this.motion.reduced) return false;
    const ear = this.stage.querySelector('.dogear');
    if (this.engine.type === 'flip') {
      const ok = this.engine.peek(this.size);
      if (ok) {
        ear?.classList.add('is-peeking');
        setTimeout(() => ear?.classList.remove('is-peeking'), 1500);
      }
      return ok;
    }
    ear?.classList.add('is-pulse');
    setTimeout(() => ear?.classList.remove('is-pulse'), 1000);
    return true;
  }
  cancelPeek() {
    if (this.engine?.type === 'flip') this.engine.release(this.size);
  }

  /* ---------------------------------------------------------------- gestos */
  #local(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  #zoneAt(p) {
    const { w, h } = this.size, z = this.zone;
    if (p.y < h - z) return null;
    if (p.x > w - z && this.index < this.lastIndex) return 'br';
    if (p.x < z && this.index > 0) return 'bl';
    return null;
  }
  #bindGestures() {
    const st = this.stage;
    st.addEventListener('pointerdown', (e) => {
      if (!this.opened || !this.engine || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest('button,input,select,textarea,label,summary')) return; // links iniciam o gesto: o clique é suprimido se houver arraste
      if (this.g) return;
      this.cancelPeek();
      const p = this.#local(e);
      const zone = this.#zoneAt(p);
      this.g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), zone, moved: false, last: p, lastT: performance.now(), vx: 0 };
      if (zone) this.engine.cornerStart(p, zone);
    });
    st.addEventListener('pointermove', (e) => {
      const g = this.g;
      if (!g) {
        if (e.pointerType === 'mouse' && this.opened && this.engine?.type === 'flip' && this.index < this.lastIndex) {
          const p = this.#local(e);
          this.engine.hover(p);
        }
        return;
      }
      if (g.id !== e.pointerId) return;
      const p = this.#local(e);
      const now = performance.now();
      g.vx = 0.6 * g.vx + 0.4 * ((p.x - g.last.x) / Math.max(1, now - g.lastT));
      g.last = p; g.lastT = now;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8) {
        g.moved = true;
        // Captura só ao arrastar: capturar no início redirecionaria o clique de links para o palco.
        try { st.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      }
      if (g.zone && g.moved) this.engine.cornerMove(p);
    });
    const finish = (e, cancelled) => {
      const g = this.g;
      if (!g || g.id !== e.pointerId) return;
      this.g = null;
      try { st.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      const p = this.#local(e);
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (g.moved) this.suppressClickUntil = performance.now() + 450;
      if (g.zone) {
        if (cancelled && !g.moved) { this.engine.cornerEnd(p, true, 0, g.zone); return; }
        this.engine.cornerEnd(p, g.moved, g.vx, g.zone);
        return;
      }
      if (cancelled) return;
      // Gesto horizontal fora dos cantos: vira a folha. Diagonal curta ou vertical não vira.
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? this.next() : this.prev();
    };
    st.addEventListener('pointerup', (e) => finish(e, false));
    st.addEventListener('pointercancel', (e) => finish(e, true));
    // Arraste não pode disparar clique em links/botões.
    st.addEventListener('click', (e) => {
      if (performance.now() < this.suppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });
    st.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.g && this.engine?.type === 'flip') this.engine.hover({ x: -50, y: -50 });
    });
  }

  setZone(px) { this.zone = px; }
}
