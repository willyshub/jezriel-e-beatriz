// Motor de folhas próprio (virada 3D pela lombada) + gestos + modo simples (deck).
//
// Decisão de 20/11/2026 (ver docs/DECISOES.md, D37): a StPageFlip foi substituída. Ela recortava a folha com um
// clip-path novo a cada quadro; com desfoque (blur), máscaras e zoom lento nas folhas, o celular repintava a página
// inteira em cada quadro: blocos vazios durante a virada (visto por Will num Android) e sensação de travamento.
//
// Agora a folha gira em 3D pela lombada (borda esquerda), só com transform e opacity: o navegador pinta a folha uma
// vez e a GPU apenas a move. A borda da folha acompanha o dedo (ângulo = acos(x / largura)).
// - Gestos: arrastar a partir do canto inferior direito (ou em qualquer ponto, na horizontal) vira a folha seguindo
//   o dedo; soltar além de ~45° (ou gesto rápido) completa, antes disso a folha volta. Toque no canto vira inteira.
//   Voltar: canto inferior esquerdo, gesto para a direita ou teclado.
// - Animações finais por transição CSS (rodam no compositor mesmo com o processador ocupado).
// - O motor simples (fade curto) continua servindo a "Reduzir efeitos" e a conteúdo maior que a tela.

/** Mantido por compatibilidade com chamadas antigas: não há mais biblioteca para carregar. */
export function loadFlipLib() { return Promise.resolve(null); }

const ANG_FIM = 104;           // graus: além de 90° a face some (backface hidden); folga para o canto sumir de vez
const LIMIAR = 46;             // graus: soltar além disto completa a virada
const EASE = 'cubic-bezier(.22,.61,.24,1)';

function limparFolha(sheet) {
  sheet.removeAttribute('style');
  sheet.classList.remove('leaf', 'is-current', 'is-next', 'is-under', 'is-turning');
  sheet.querySelectorAll(':scope > .leaf-shade').forEach((n) => n.remove());
}

const suporta3D = () => typeof CSS !== 'undefined' && CSS.supports?.('transform', 'rotateY(10deg)') && CSS.supports?.('backface-visibility', 'hidden');

/* ------------------------------------------------------------------ motor com virada 3D */
class FlipEngine {
  type = 'flip';
  constructor(host, sheets, start, size, hooks) {
    this.sheets = sheets;
    this.hooks = hooks;
    this.size = size;
    this.index = start;
    this.el = document.createElement('div');
    this.el.className = 'book3d';
    this.under = document.createElement('div');
    this.under.className = 'under-shade';
    this.shade = document.createElement('div');
    this.shade.className = 'leaf-shade';
    sheets.forEach((s) => { limparFolha(s); s.classList.add('leaf'); this.el.append(s); });
    this.el.append(this.under);
    host.append(this.el);
    this.t = null;          // virada em andamento: { leaf, base, dir, alvo, ang }
    this.st = 'read';
    this.peekTimer = 0;
    this.endTimer = 0;
    this.avisado = false;   // compatibilidade com o controlador (som já emitido nesta virada)
    this.cancelando = false;
    this.#show(start);
  }

  get state() { return this.st; }
  get busy() { return this.st === 'flipping'; }
  #estado(s) { if (this.st !== s) { this.st = s; this.hooks.onState?.(s); } }

  #show(i) {
    this.index = i;
    this.sheets.forEach((s, k) => {
      s.classList.toggle('is-current', k === i);
      s.classList.toggle('is-next', k === i + 1); // já pintada por baixo: nada a pintar quando o gesto começa
      s.classList.remove('is-under', 'is-turning');
      s.style.transform = ''; s.style.transition = '';
      s.inert = k !== i;
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
  }

  resize(w, h) { this.size = { w, h }; }

  /* ---- preparação: `leaf` gira; `base` fica parada por baixo ---- */
  #preparar(alvo) {
    if (this.t || alvo === this.index || alvo < 0 || alvo >= this.sheets.length) return false;
    clearTimeout(this.peekTimer);
    const dir = alvo > this.index ? 'next' : 'prev';
    const cur = this.sheets[this.index], dest = this.sheets[alvo];
    // Avançar: a folha atual gira para a esquerda revelando a seguinte. Voltar: a anterior volta por cima da atual.
    const leaf = dir === 'next' ? cur : dest;
    const base = dir === 'next' ? dest : cur;
    base.classList.add('is-under');
    leaf.classList.add('is-turning');
    leaf.append(this.shade);
    this.hooks.onPrepare?.(base); // as linhas da folha de baixo surgem enquanto ela é descoberta
    this.t = { leaf, base, dir, alvo, ang: dir === 'next' ? 0 : ANG_FIM };
    this.#aplicar(this.t.ang, false);
    return true;
  }

  #aplicar(ang, anim, dur = 0) {
    const { leaf } = this.t;
    const p = Math.min(1, Math.max(0, ang / 90));
    const tr = anim ? `transform ${dur}ms ${EASE}` : 'none';
    const to = anim ? `opacity ${dur}ms ${EASE}` : 'none';
    leaf.style.transition = tr;
    leaf.style.transform = `rotateY(${-ang}deg)`;
    // Luz: a face escurece ao se afastar da luz; sombra projetada sobre a folha de baixo, forte perto da lombada.
    this.shade.style.transition = to;
    this.shade.style.opacity = (Math.sin(p * Math.PI / 2) * 0.85).toFixed(3);
    this.under.style.transition = to;
    this.under.style.opacity = (p >= 1 ? 0 : Math.min(1, p * 5) * (1 - p) * 1.25).toFixed(3);
    this.t.ang = ang;
  }

  /** Anima até o fim (completa) ou de volta (cancela). */
  #soltar(completar) {
    const t = this.t;
    if (!t) return;
    const alvoAng = (t.dir === 'next') === completar ? ANG_FIM : 0;
    const resto = Math.abs(alvoAng - t.ang) / ANG_FIM;
    const dur = Math.round(240 + 560 * resto);
    this.cancelando = !completar;
    if (completar && !this.avisado) { this.avisado = true; this.hooks.onTurn?.(); }
    this.#estado('flipping');
    // Força o cálculo de estilo do ponto de partida antes de ligar a transição (sem depender de requestAnimationFrame,
    // que para em aba oculta).
    void t.leaf.offsetWidth;
    this.#aplicar(alvoAng, true, dur);
    const fim = () => this.#concluir(t, completar);
    t.leaf.addEventListener('transitionend', function h(e) { if (e.target === t.leaf && e.propertyName === 'transform') { t.leaf.removeEventListener('transitionend', h); fim(); } });
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(fim, dur + 120); // transitionend pode não vir (aba oculta, mesmo valor)
  }

  #concluir(t, completar) {
    if (this.t !== t) return;
    clearTimeout(this.endTimer);
    this.t = null;
    this.shade.remove();
    this.under.style.transition = 'none';
    this.under.style.opacity = '0';
    const novo = completar ? t.alvo : this.index;
    this.#show(novo);
    this.avisado = false; this.cancelando = false;
    this.#estado('read');
    if (completar) this.hooks.onFlip(novo);
  }

  /* ---- API do controlador ---- */
  next() { this.goTo(this.index + 1); }
  prev() { this.goTo(this.index - 1); }
  goTo(i) { if (this.st !== 'flipping' && !this.t && this.#preparar(i)) this.#soltar(true); }

  /** Arrasto: começa a virada na direção pedida. Retorna false se não for possível. */
  dragStart(dir) {
    if (this.st === 'flipping' || this.t) return false;
    if (!this.#preparar(this.index + (dir === 'next' ? 1 : -1))) return false;
    this.#estado('user_fold');
    return true;
  }
  dragMove(p) {
    if (!this.t) return;
    const { w } = this.size;
    // A borda livre da folha acompanha o dedo: x = largura · cos(ângulo).
    const ang = Math.acos(Math.min(1, Math.max(-0.2, p.x / w))) * 180 / Math.PI;
    this.#aplicar(Math.min(ANG_FIM, ang), false);
  }
  dragEnd(vx, cancelado = false) {
    const t = this.t;
    if (!t) return;
    if (cancelado) { this.#soltar(false); return; } // volta ao estado anterior
    // Avançar completa se passou do limiar ou foi um gesto rápido para a esquerda; voltar, o espelho disso.
    // Gesto rápido só conta depois de a folha sair um pouco do lugar (evita virar com um esbarrão).
    const completar = t.dir === 'next'
      ? (t.ang > LIMIAR || (vx < -0.45 && t.ang > 14)) && !(vx > 0.45)
      : (t.ang < ANG_FIM - LIMIAR || (vx > 0.45 && t.ang < ANG_FIM - 14)) && !(vx < -0.45);
    this.#soltar(completar);
  }

  /** Mouse perto do canto (computador): a folha se ergue um pouco. */
  hover(p) {
    if (this.st !== 'read' && this.st !== 'fold_corner') return;
    const { w, h } = this.size;
    const perto = p.x > w - 90 && p.y > h - 90 && this.index < this.sheets.length - 1;
    if (perto && this.st === 'read') this.#ergue(12);
    else if (!perto && this.st === 'fold_corner') this.#baixa();
  }
  #ergue(ang) {
    const cur = this.sheets[this.index], prox = this.sheets[this.index + 1];
    if (!prox) return false;
    prox.classList.add('is-under');
    cur.classList.add('is-turning');
    cur.style.transition = `transform 420ms ${EASE}`;
    cur.style.transform = `rotateY(${-ang}deg)`;
    this.#estado('fold_corner');
    return true;
  }
  #baixa() {
    const cur = this.sheets[this.index];
    cur.style.transition = `transform 380ms ${EASE}`;
    cur.style.transform = 'rotateY(0deg)';
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => { if (this.st === 'fold_corner') this.#show(this.index); this.#estado('read'); }, 400);
  }
  /** Espiada: a folha se ergue pela borda e volta (dica de que dá para virar). */
  peek() {
    if (this.st !== 'read' || this.t) return false;
    if (!this.#ergue(16)) return false;
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.#baixa(), 650);
    return true;
  }
  release() { if (this.st === 'fold_corner') this.#baixa(); }

  destroy() {
    clearTimeout(this.peekTimer); clearTimeout(this.endTimer);
    this.t = null;
    this.sheets.forEach((s) => { s.remove(); limparFolha(s); s.inert = false; s.removeAttribute('aria-hidden'); });
    this.el.remove();
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
  get state() { return 'read'; }
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
  dragStart() { return false; }
  dragMove() {}
  dragEnd() {}
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
   * @param {import('./motion-controller.mjs?v=202611200440').MotionController} o.motion
   * @param {(i:number)=>void} o.onChange folha atual mudou (após a virada)
   * @param {(info:object)=>void} [o.onMode] motor/estado mudou
   * @param {(state:string)=>void} [o.onState] estado da dobra mudou (read | fold_corner | user_fold | flipping)
   */
  constructor({ stage, host, sheets, measure, motion, onChange, onMode, onState, onTurn }) {
    Object.assign(this, { stage, host, sheets, measure, motion, onChange, onMode, onState, onTurn });
    this.origem = 'botao';
    this.engine = null;
    this.index = 0;
    this.libFailed = !suporta3D();
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

  /** Monta o livro na folha pedida. */
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
    return (this.libFailed || this.motion.reduced || this.overflow) ? 'deck' : 'flip';
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
      c.classList.remove('leaf', 'is-current', 'is-next', 'is-under', 'is-turning');
      this.measure.append(c);
      const inner = c.querySelector(':scope > .sheet__inner');
      if (inner && (inner.scrollHeight > h + 1 || inner.scrollWidth > w + 1)) over = true;
    }
    this.measure.replaceChildren();
    return over;
  }

  #mount(start) {
    this.engine?.destroy();
    this.engine = null;
    this.stage.dataset.fold = 'read';
    const hooks = { onPrepare: (s) => this.motion.activate(s), onFlip: (i) => this.#flipped(i), onState: (st) => this.#estado(st), onTurn: () => this.onTurn?.(this.origem) };
    if (this.#wantedMode() === 'flip') {
      try { this.engine = new FlipEngine(this.host, this.sheets, start, this.size, hooks); }
      catch (e) { console.info('[v2] falha ao iniciar a virada; modo simples:', e.message); this.libFailed = true; this.sheets.forEach(limparFolha); }
    }
    if (!this.engine) this.engine = new DeckEngine(this.host, this.sheets, start, { scroll: this.overflow, reduced: this.motion.reduced }, hooks);
    this.index = start;
    this.#announceMode();
    this.#syncCurrent(false);
  }

  #announceMode() {
    this.stage.dataset.engine = this.engine.type;
    this.onMode?.({ engine: this.engine.type, overflow: this.overflow, libFailed: this.libFailed });
  }

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
    this.motion.prefetch(this.sheets[this.index + 2]);
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

  /** Dica de "espiada": a folha se ergue pela borda e volta. Sem hover, funciona em celular. */
  peek() {
    if (!this.opened || this.index >= this.lastIndex || this.motion.reduced) return false;
    const ear = this.stage.querySelector('.dogear');
    if (this.engine.type === 'flip') {
      const ok = this.engine.peek();
      if (ok) { ear?.classList.add('is-peeking'); setTimeout(() => ear?.classList.remove('is-peeking'), 1200); }
      return ok;
    }
    ear?.classList.add('is-pulse');
    setTimeout(() => ear?.classList.remove('is-pulse'), 1000);
    return true;
  }
  cancelPeek() { if (this.engine?.type === 'flip') this.engine.release(); }

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
      this.g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, zone: this.#zoneAt(p), moved: false, drag: false, ignorar: false, last: p, lastT: performance.now(), vx: 0 };
    });
    st.addEventListener('pointermove', (e) => {
      const g = this.g;
      if (!g) {
        if (e.pointerType === 'mouse' && this.opened && this.engine?.type === 'flip') this.engine.hover(this.#local(e));
        return;
      }
      if (g.id !== e.pointerId) return;
      const p = this.#local(e);
      const now = performance.now();
      g.vx = 0.6 * g.vx + 0.4 * ((p.x - g.last.x) / Math.max(1, now - g.lastT));
      g.last = p; g.lastT = now;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 8) {
        g.moved = true;
        // Direção do arrasto: canto define; fora dele, só gesto claramente horizontal (o vertical fica para a rolagem).
        let dir = null;
        if (g.zone) dir = g.zone === 'br' ? 'next' : 'prev';
        else if (Math.abs(dx) > Math.abs(dy) * 1.2) dir = dx < 0 ? 'next' : 'prev';
        else g.ignorar = true;
        if (dir === 'next' && this.index >= this.lastIndex) dir = null;
        if (dir === 'prev' && this.index <= 0) dir = null;
        if (dir) {
          this.origem = g.zone ? 'arrasto' : 'deslize';
          g.dir = dir;
          g.drag = this.engine.dragStart(dir);
        }
        // Captura só ao arrastar: capturar no início redirecionaria o clique de links para o palco.
        try { st.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      }
      if (g.drag) this.engine.dragMove(p);
    });
    const finish = (e, cancelled) => {
      const g = this.g;
      if (!g || g.id !== e.pointerId) return;
      this.g = null;
      try { st.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (g.moved) this.suppressClickUntil = performance.now() + 450;
      if (g.drag) { this.engine.dragEnd(g.vx, cancelled); return; }
      if (cancelled || g.ignorar) return;
      if (g.zone && !g.moved) { g.zone === 'br' ? this.next('canto') : this.prev('canto'); return; }
      // Motor simples: gesto horizontal vira a folha ao soltar.
      if (g.dir && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) g.dir === 'next' ? this.next('deslize') : this.prev('deslize');
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
