// Adaptador do motor de folhas (dobra própria, 21/11/2026) + gestos + modo simples (deck).
//
// Decisões (ver docs/DECISOES.md D44):
// - Dobra diagonal pelo CANTO INFERIOR DIREITO, desenhada SÓ com transform: cada folha mora numa caixa girada com
//   overflow:hidden alinhada à linha da dobra; a folha dentro dela recebe a rotação inversa e fica parada na tela.
//   O verso (aba dobrada) é papel liso espelhado na linha da dobra. Nada de clip-path por quadro: o conteúdo da folha
//   é rasterizado uma vez e a GPU só move/recorta camadas (a StPageFlip repintava tudo a cada quadro → glitch no Android).
// - A folha seguinte e a anterior ficam montadas por baixo (já pintadas) para o gesto começar sem atraso.
// - Gestos: arrastar/tocar no canto inferior direito vira; canto inferior esquerdo volta; deslize horizontal vira.
// - O motor simples (fade curto) serve a "Reduzir efeitos" e a conteúdo maior que a tela.

/** Mantido por compatibilidade: não há biblioteca externa desde 21/11/2026. */
export function loadFlipLib() { return Promise.resolve(null); }

function limparFolha(sheet) {
  sheet.removeAttribute('style');
  sheet.classList.remove('leaf', 'is-current');
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

/* ------------------------------------------------------------------ geometria (pura, testável) */
/**
 * Prende o canto P ao papel: a folha gira presa pela lombada (borda esquerda), então o canto não pode se afastar
 * mais que a largura do pé da lombada (0,h) nem mais que a diagonal do topo da lombada (0,0).
 */
export function prenderCanto(p, w, h) {
  let { x, y } = p;
  const dB = Math.hypot(x, y - h);
  if (dB > w) { x = (x / dB) * w; y = h + ((y - h) / dB) * w; }
  const D = Math.hypot(w, h), dT = Math.hypot(x, y);
  if (dT > D) { x = (x / dT) * D; y = (y / dT) * D; }
  return { x, y };
}

/** Linha da dobra entre o canto C=(w,h) e o ponto P: meio M, ângulo θ da direção C−P e progresso 0..1. */
export function linhaDaDobra(p, w, h) {
  const dx = w - p.x, dy = h - p.y, len = Math.hypot(dx, dy);
  return { mx: (w + p.x) / 2, my: (h + p.y) / 2, ang: Math.atan2(dy, dx), len, prog: Math.min(1, len / (2 * w)) };
}

/* ------------------------------------------------------------------ motor com dobra */
class FoldEngine {
  type = 'flip';
  constructor(host, sheets, start, size, hooks) {
    this.host = host;
    this.sheets = sheets;
    this.hooks = hooks;
    this.index = start;
    this.st = 'read';
    this.raf = 0;
    this.peekTimer = 0;
    this.root = div('fold');
    this.clips = sheets.map((s) => {
      const c = div('leafclip');
      s.classList.add('leaf');
      c.append(s);
      this.root.append(c);
      return c;
    });
    this.sombra = div('fold-shadow');
    this.abaClip = div('leafclip fold-flapclip');
    this.aba = div('fold-flap');
    this.abaLuz = div('fold-flapshade');
    this.aba.append(this.abaLuz);
    this.abaClip.append(this.aba);
    this.root.append(this.sombra, this.abaClip);
    host.append(this.root);
    this.resize(size.w, size.h);
    this.#layout();
  }

  get state() { return this.st; }
  get busy() { return this.st === 'flipping' || this.st === 'user_fold'; }
  #estado(s) { if (this.st !== s) { this.st = s; this.hooks.onState?.(s); } }

  resize(w, h) {
    this.w = w; this.h = h;
    this.L = Math.ceil(Math.hypot(w, h) * 2.2);
    const L = this.L;
    for (const c of [...this.clips, this.abaClip]) { c.style.width = L + 'px'; c.style.height = 2 * L + 'px'; }
    for (const s of this.sheets) { s.style.width = w + 'px'; s.style.height = h + 'px'; }
    this.aba.style.width = w + 'px'; this.aba.style.height = h + 'px';
    this.abaLuz.style.height = 2 * L + 'px';
    this.sombra.style.height = 2 * L + 'px';
  }

  /** Repouso: atual por cima, anterior e seguinte montadas por baixo (já pintadas). */
  #layout() {
    const i = this.index;
    this.clips.forEach((c, k) => {
      const vis = k === i || k === i + 1 || k === i - 1;
      c.classList.toggle('is-vis', vis);
      c.style.zIndex = k === i ? 3 : 1;
      c.style.transform = '';
      this.sheets[k].style.transform = '';
      this.sheets[k].inert = k !== i;
      this.sheets[k].setAttribute('aria-hidden', k === i ? 'false' : 'true');
      this.sheets[k].classList.toggle('is-current', k === i);
    });
    this.abaClip.classList.remove('is-vis');
    this.sombra.style.opacity = '0';
    this.mov = null;
  }

  /** Prepara uma virada: `mov` é a folha que dobra (por cima), `sob` a que aparece por baixo. */
  #preparar(alvo) {
    if (alvo < 0 || alvo >= this.sheets.length || alvo === this.index) return false;
    const frente = alvo > this.index;
    const mov = frente ? this.index : alvo;
    const sob = frente ? alvo : this.index;
    this.clips.forEach((c, k) => { c.style.zIndex = k === mov ? 3 : k === sob ? 2 : 0; if (k === mov || k === sob) c.classList.add('is-vis'); });
    this.sheets[mov].inert = true;
    this.abaClip.classList.add('is-vis');
    this.mov = mov; this.sob = sob; this.alvo = alvo; this.frente = frente;
    this.hooks.prepare?.(this.sheets[sob]);
    this.#aplicar(frente ? { x: this.w, y: this.h } : { x: -this.w, y: this.h });
    return true;
  }

  #aplicar(p0) {
    const { w, h, L } = this;
    const p = prenderCanto(p0, w, h);
    this.p = p;
    const g = linhaDaDobra(p, w, h);
    const c = this.clips[this.mov], s = this.sheets[this.mov];
    if (g.len < 0.5) {
      c.style.transform = ''; s.style.transform = '';
      this.abaClip.style.transform = 'translate(-99999px,0)';
      this.sombra.style.opacity = '0';
      return;
    }
    const deg = (g.ang * 180) / Math.PI;
    const caixa = `translate(${g.mx}px,${g.my}px) rotate(${deg}deg) translate(${-L}px,${-L}px)`;
    const inversa = `rotate(${-deg}deg) translate(${-g.mx}px,${-g.my}px)`;
    c.style.transform = caixa;
    s.style.transform = `translate(${L}px,${L}px) ${inversa}`;
    this.abaClip.style.transform = caixa;
    this.aba.style.transform = `translate(${L}px,${L}px) scale(-1,1) ${inversa}`;
    this.abaLuz.style.transform = `translate(${g.mx}px,${g.my}px) rotate(${deg}deg) scale(-1,1) translate(-70px,${-L}px)`;
    this.sombra.style.transform = `translate(${g.mx}px,${g.my}px) rotate(${deg}deg) translate(0,${-L}px)`;
    // Sombra na folha de baixo: forte no começo, some quando a folha cobre quase tudo.
    const pr = g.prog;
    this.sombra.style.opacity = String(Math.min(1, pr * 4) * (1 - pr * 0.85));
  }

  #animar(de, para, ms, fim) {
    cancelAnimationFrame(this.raf);
    const t0 = performance.now();
    const lift = this.h * 0.12 * (Math.abs(para.x - de.x) > this.w ? 1 : 0);
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = ease(k);
      this.#aplicar({ x: de.x + (para.x - de.x) * e, y: de.y + (para.y - de.y) * e - Math.sin(Math.PI * e) * lift });
      if (k < 1) this.raf = requestAnimationFrame(passo); else fim();
    };
    this.raf = requestAnimationFrame(passo);
  }

  /** Completa (vira de vez) ou devolve a folha. */
  #soltar(completar, de = this.p) {
    const destino = (this.frente === completar) ? { x: -this.w, y: this.h } : { x: this.w, y: this.h };
    const dist = Math.hypot(destino.x - de.x, destino.y - de.y) / (2 * this.w);
    if (completar) this.hooks.onTurn?.();
    this.#estado('flipping');
    this.#animar(de, destino, 280 + 520 * Math.min(1, dist), () => {
      if (completar) this.index = this.alvo;
      this.#layout();
      this.#estado('read');
      if (completar) this.hooks.onFlip(this.index);
    });
  }

  next() { this.goTo(this.index + 1); }
  prev() { this.goTo(this.index - 1); }
  goTo(i) { if (!this.busy && this.#preparar(i)) this.#soltar(true); }

  cornerStart(p, zone) {
    if (this.busy) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.peekTimer);
    if (this.mov != null) this.#layout();
    const alvo = zone === 'bl' ? this.index - 1 : this.index + 1;
    if (!this.#preparar(alvo)) return;
    this.zona = zone;
    this.#estado('user_fold');
  }
  cornerMove(p) { if (this.st === 'user_fold') this.#aplicar(p); }
  cornerEnd(p, moved, vx) {
    if (this.st !== 'user_fold') return;
    if (!moved) { this.#soltar(true); return; }
    const pos = this.p;
    const virar = this.frente
      ? pos.x < this.w * 0.6 || (vx < -0.45 && pos.x < this.w * 0.92)
      : pos.x > -this.w * 0.2 || vx > 0.45;
    this.#soltar(virar, pos);
  }

  hover(p) {
    if (this.st !== 'read' && this.st !== 'fold_corner') return;
    const z = 90;
    if (p.x > this.w - z && p.y > this.h - z && this.index < this.sheets.length - 1) {
      if (this.st === 'read') { if (!this.#preparar(this.index + 1)) return; this.#estado('fold_corner'); }
      this.#aplicar({ x: Math.min(p.x, this.w - 2), y: Math.min(p.y, this.h - 2) });
    } else if (this.st === 'fold_corner') this.release();
  }
  peek() {
    if (this.st !== 'read' || !this.#preparar(this.index + 1)) return false;
    this.#estado('fold_corner');
    const C = { x: this.w, y: this.h }, P = { x: this.w - Math.min(90, this.w * 0.24), y: this.h - Math.min(70, this.h * 0.1) };
    this.#animar(C, P, 420, () => { this.peekTimer = setTimeout(() => this.release(), 520); });
    return true;
  }
  release() {
    clearTimeout(this.peekTimer);
    if (this.st !== 'fold_corner') return;
    this.#animar(this.p, { x: this.w, y: this.h }, 260, () => { this.#layout(); this.#estado('read'); });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.peekTimer);
    this.sheets.forEach((s) => { s.remove(); limparFolha(s); s.inert = false; s.removeAttribute('aria-hidden'); });
    this.root.remove();
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
    this.hooks.onTurn?.();
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
   * @param {import('./motion-controller.mjs?v=202611211911').MotionController} o.motion
   * @param {(i:number)=>void} o.onChange folha atual mudou (após a virada)
   * @param {(info:object)=>void} [o.onMode] motor/estado mudou
   * @param {(state:string)=>void} [o.onState] estado da dobra mudou
   */
  constructor({ stage, host, sheets, measure, motion, onChange, onMode, onState, onTurn }) {
    Object.assign(this, { stage, host, sheets, measure, motion, onChange, onMode, onState, onTurn });
    this.origem = 'botao';
    this.engine = null;
    this.index = 0;
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
    return (this.motion.reduced || this.overflow) ? 'deck' : 'flip';
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
      c.classList.remove('leaf', 'is-current');
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
    const hooks = { onFlip: (i) => this.#flipped(i), onState: (st) => this.#estado(st), onTurn: () => this.onTurn?.(this.origem) };
    const want = this.#wantedMode();
    if (want === 'flip') {
      try {
        this.engine = new FoldEngine(this.host, this.sheets, start, this.size, { ...hooks, prepare: (s) => this.motion.prefetch(s) });
      } catch (e) {
        console.info('[v2] falha ao iniciar a dobra; modo simples:', e.message);
        this.libFailed = true;
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
    // Som de virada: no início da animação de virada (não ao soltar de volta, nem na espiada).
    if (st === 'flipping' && this.engine?.type === 'flip') {
      if (!this.engine.cancelando && !this.engine.avisado) this.onTurn?.(this.origem);
    }
    if (st === 'read' && this.engine) { this.engine.cancelando = false; this.engine.avisado = false; }
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

  /** `origem` identifica o gesto para o efeito sonoro: botao | teclado | canto | arrasto | deslize. */
  next(origem = 'botao') { if (this.opened && this.index < this.lastIndex) { this.origem = origem; this.engine.next(); } }
  prev(origem = 'botao') { if (this.opened && this.index > 0) { this.origem = origem; this.engine.prev(); } }
  goTo(i, origem = 'botao') { if (this.opened && i !== this.index && i >= 0 && i <= this.lastIndex) { this.origem = origem; this.engine.goTo(i); } }

  /** O ponto (clientX/Y) está numa zona de canto de virada? */
  emZonaDeCanto(e) {
    const r = this.stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, z = this.zone;
    return y > r.height - z && (x > r.width - z || x < z);
  }

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
      if (e.target.closest('button:not(.gal__btn),input,select,textarea,label,summary')) return; // links iniciam o gesto: o clique é suprimido se houver arraste
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
        this.origem = g.moved ? 'arrasto' : 'canto';
        if (cancelled && !g.moved) { this.engine.cornerEnd(p, true, 0, g.zone); return; }
        this.engine.cornerEnd(p, g.moved, g.vx, g.zone);
        return;
      }
      // Correção 21/11/2026 (Will: com efeitos reduzidos, nas fotos não navegava): no celular o navegador pode cancelar o
      // toque sobre a imagem (pointercancel) no meio do deslize. Em vez de descartar, usa a última posição conhecida.
      if (cancelled) {
        if (!g.moved) return;
        const r = this.stage.getBoundingClientRect();
        const cx = g.last.x + r.left - g.x0, cy = g.last.y + r.top - g.y0;
        if (Math.abs(cx) > 48 && Math.abs(cx) > Math.abs(cy) * 1.4) cx < 0 ? this.next('deslize') : this.prev('deslize');
        return;
      }
      // Gesto horizontal fora dos cantos: vira a folha. Diagonal curta ou vertical não vira.
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? this.next('deslize') : this.prev('deslize');
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
