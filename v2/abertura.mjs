// Abertura: a carta sai do envelope e se torna a primeira folha do livro.
//
// Como funciona (ver docs/V2-IMPLEMENTACAO.md, "Abertura"):
// - A "carta" é um clone da folha 1 com o tamanho exato do palco, reduzido com transform: scale() para caber no envelope.
//   Ao crescer até scale(1) ela fica pixel a pixel igual à folha 1 do livro; a troca (handoff) é só um fade entre imagens iguais.
// - Linha do tempo (2,2 s): selo cede e racha (0-0,5 s) -> aba gira em 3D (0,2-0,6 s) -> carta sobe (0,55-1,15 s)
//   -> carta cresce até a tela enquanto o envelope desce, opaco, e sai da tela (1,15-2,2 s).
// - Só transform e opacity (Web Animations API). Um toque durante a animação pula para o fim (pular()).
// - A coreografia com música (Coreografia) é cosmética: revela os nomes pelo tempo REAL da faixa e nunca bloqueia nada.

const DUR = 2200;
const EASE_RISE = 'cubic-bezier(.3,.1,.3,1)';
const EASE_GROW = 'cubic-bezier(.45,.05,.25,1)';

export class Abertura {
  /**
   * @param {object} o
   * @param {HTMLElement} o.cover  seção da capa
   * @param {HTMLElement} o.stage  palco
   * @param {HTMLElement} o.sheet  folha 1 original (será clonada)
   * @param {import('./paper-sound.mjs').PaperSound} o.sound
   */
  constructor({ cover, stage, sheet, sound }) {
    Object.assign(this, { cover, stage, sheet, sound });
    this.scene = cover.querySelector('#scene');
    this.slot = cover.querySelector('#slot');
    this.letter = null;
    this.anims = [];
    this.timers = [];
    this.tocando = false;
  }

  /** @returns {Promise<void>} resolve quando a carta ocupa a tela (ou após pular()) */
  async tocar({ coreo = false } = {}) {
    const { stage, scene, slot, cover } = this;
    this.tocando = true;
    cover.classList.add('is-playing');
    const sr = stage.getBoundingClientRect();
    const er = scene.getBoundingClientRect();
    const sw = Math.round(sr.width), sh = Math.round(sr.height);
    const ew = er.width, eh = er.height;
    const sceneLeft = er.left - sr.left, sceneTop = er.top - sr.top;

    // carta = clone da folha 1, no tamanho do palco
    const letter = this.sheet.cloneNode(true);
    letter.classList.remove('stf__item', 'is-current', 'is-in');
    letter.classList.add('letter');
    if (!coreo) letter.classList.add('is-in', 'no-trans');
    letter.removeAttribute('style');
    letter.setAttribute('aria-hidden', 'true');
    letter.inert = true;
    letter.style.width = sw + 'px';
    letter.style.height = sh + 'px';
    slot.replaceChildren(letter);
    this.letter = letter;

    // geometria (coordenadas do palco)
    // A cena desce até o envelope sair inteiro da tela (opaco, sem fade): a carta só aparece pela boca do envelope.
    const dy = sh - sceneTop + 12;
    const s0 = (0.8 * ew) / sw;
    const x0 = (sw - sw * s0) / 2;
    const y0 = sceneTop + 0.3 * eh + dy;
    const y1 = Math.max(sh * 0.05 + dy, y0 - 0.9 * eh);
    // O slot desce junto com a cena: estende-se para cima em `dy` para continuar cobrindo o palco inteiro ao final.
    // Coordenadas do slot = coordenadas do palco + dy.
    slot.style.cssText = `left:${-sceneLeft}px;top:${-sceneTop - dy}px;width:${sw}px;height:${sceneTop + dy + eh}px`;
    const T = (x, y, s) => `translate(${x}px,${y}px) scale(${s})`;
    const opt = { duration: DUR, fill: 'forwards' };
    const A = [];

    // a cena inteira desce na última parte; a carta compensa para ir ao lugar certo na tela
    A.push(scene.animate([
      { transform: 'translateY(0)', offset: 0 },
      { transform: 'translateY(0)', offset: 0.52, easing: EASE_GROW },
      { transform: `translateY(${dy}px)`, offset: 1 },
    ], opt));
    A.push(letter.animate([
      { transform: T(x0, y0, s0), offset: 0 },
      { transform: T(x0, y0, s0), offset: 0.25, easing: EASE_RISE },
      { transform: T(x0, y1, s0), offset: 0.52, easing: EASE_GROW },
      { transform: T(0, 0, 1), offset: 1 },
    ], opt));

    // aba em 3D: gira sobre a borda de cima; passa por trás da carta no meio do giro
    const P = Math.round(ew * 2.6);
    A.push(scene.querySelector('#flap').animate([
      { transform: `perspective(${P}px) rotateX(0deg)`, zIndex: 5, offset: 0 },
      { transform: `perspective(${P}px) rotateX(0deg)`, zIndex: 5, offset: 0.09, easing: 'cubic-bezier(.4,0,.2,1)' },
      { transform: `perspective(${P}px) rotateX(180deg)`, zIndex: 1, offset: 0.27 },
      { transform: `perspective(${P}px) rotateX(180deg)`, zIndex: 1, offset: 1 },
    ], opt));
    // sombra da aba some ao abrir, interior escurece
    const sh1 = scene.querySelector('.env__fsh');
    if (sh1) A.push(sh1.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.09 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 1 }], opt));

    // selo: pressão, rachadura e queda das duas metades
    const seal = scene.querySelector('#seal');
    const hl = seal.querySelector('.seal__h--l'), hr = seal.querySelector('.seal__h--r');
    const u = ew / 310;
    A.push(seal.animate([{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(.9)', offset: 0.04 }, { transform: 'scale(1)', offset: 0.07 }, { transform: 'scale(1)', offset: 1 }], opt));
    A.push(hl.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0 },
      { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0.05 },
      { transform: `translate(${-18 * u}px,${34 * u}px) rotate(-24deg)`, opacity: 0, offset: 0.24 },
      { transform: `translate(${-18 * u}px,${34 * u}px) rotate(-24deg)`, opacity: 0, offset: 1 },
    ], opt));
    A.push(hr.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0 },
      { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0.05 },
      { transform: `translate(${20 * u}px,${40 * u}px) rotate(20deg)`, opacity: 0, offset: 0.26 },
      { transform: `translate(${20 * u}px,${40 * u}px) rotate(20deg)`, opacity: 0, offset: 1 },
    ], opt));

    // botões e cabeçalho saem de cena
    A.push(cover.querySelector('.cover__action').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }));
    A.push(cover.querySelector('.cover__head').animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: DUR * 0.7, fill: 'forwards' }));
    this.anims = A;

    // efeitos sonoros (cosméticos): selo, aba, carta
    this.timers = [
      setTimeout(() => this.sound?.selo('abertura'), 20),
      setTimeout(() => this.sound?.aba('abertura'), DUR * 0.09),
      setTimeout(() => this.sound?.carta('abertura'), DUR * 0.25),
    ];
    this.aoFim = Promise.all(A.map((a) => a.finished.catch(() => {}))).then(() => { this.tocando = false; });
    return this.aoFim;
  }

  /** Toque durante a animação: vai direto ao fim. */
  pular() {
    if (!this.tocando) return;
    this.timers.forEach(clearTimeout);
    this.anims.forEach((a) => { try { a.finish(); } catch { /* já terminou */ } });
  }

  /** Depois do handoff: remove a carta e os estilos de animação. */
  limpar() {
    this.timers.forEach(clearTimeout);
    this.anims.forEach((a) => { try { a.cancel(); } catch { /* ok */ } });
    this.anims = [];
    this.slot.replaceChildren();
    this.letter = null;
  }
}

/* ------------------------------------------------------------------ coreografia com música */
const PASSOS = [
  // [seletor, segundo da faixa em que a linha entra, refrão?]
  ['.reveal__lead', 2.4, false],
  ['.names__a', 4.4, false],
  ['.names__amp', 5.2, false],
  ['.names__b', 5.5, false],
  ['.reveal__date', 6.0, true], // o refrão entra aos 6,0 s do arquivo
];

/**
 * Revela a folha 1 pelo tempo REAL da música (audio.tempo). Se a música atrasa ou não toca, segue o relógio normal
 * (a revelação nunca espera). Qualquer interação, troca de folha ou falha da música revela tudo de uma vez.
 */
export class Coreografia {
  constructor({ sheet, audio, t0 = performance.now(), onFim = () => {} }) {
    Object.assign(this, { sheet, audio, t0, onFim });
    this.pend = PASSOS.map(([sel, t, refrao]) => ({ el: sheet.querySelector(sel), t, refrao })).filter((p) => p.el);
    this.fim = false;
    this.raf = 0;
    this.log = [];
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  loop() {
    if (this.fim) return;
    const virt = (performance.now() - this.t0) / 1000;
    const st = this.audio.state;
    if (!['carregando', 'tocando'].includes(st)) { this.revelarTudo('musica-' + st); return; }
    const au = this.audio.tempo;
    for (const p of [...this.pend]) {
      const sincronizado = au >= 0 && au >= p.t;
      const relogio = virt >= p.t + (au >= 0 ? 1.2 : 0);
      if (sincronizado || relogio) this.disparar(p, au, virt, sincronizado ? 'faixa' : 'relogio');
    }
    if (!this.pend.length) { setTimeout(() => this.encerrar('completa'), 1900); return; }
    this.raf = requestAnimationFrame(this.loop);
  }

  disparar(p, au, virt, por) {
    this.pend = this.pend.filter((x) => x !== p);
    p.el.classList.add('is-on');
    if (p.refrao) {
      this.sheet.classList.add('is-refrao');
      setTimeout(() => this.sheet.classList.remove('is-refrao'), 2200);
    }
    this.log.push({ sel: p.el.className.split(' ')[0], audio: au >= 0 ? +au.toFixed(2) : null, relogio: +virt.toFixed(2), por });
  }

  revelarTudo(motivo = 'interacao') {
    if (this.fim) return;
    this.log.push({ revelarTudo: motivo });
    for (const p of this.pend) p.el.classList.add('is-on');
    this.pend = [];
    this.encerrar(motivo);
  }

  encerrar(motivo) {
    if (this.fim) return;
    this.fim = true;
    cancelAnimationFrame(this.raf);
    this.motivoFim = motivo;
    this.sheet.classList.add('is-in');
    delete this.sheet.dataset.coreo;
    this.onFim(motivo);
  }
}
