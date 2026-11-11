// Galeria de memórias com quantidade variável de fotos (0 a 20) + modo foco (foto inteira em tela cheia).
//
// Regras (ver docs/V2-IMPLEMENTACAO.md, "Galeria"):
// - organizarFolhas(n) divide as fotos em folhas com layouts editoriais que se alternam:
//     'tres' (mosaico assimétrico) e 'duas' (diagonal), e 'uma' (foto dominante) quando sobra uma só.
//   Sequência 3,2,3,2,... sem deixar uma foto órfã (4 vira 2+2, 6 vira 3+3). 0 fotos = nenhuma folha.
// - montarFolhas() cria as folhas (nós DOM). Textos de alt/legenda entram só via textContent/atributos.
// - FocoFotos é o visualizador: foco preso no diálogo, Esc/botão fecha, setas/botões/deslize trocam de foto.

export const MAX_FOTOS = 20;

/** Recortes provisórios (object-position) para variar as duas bases de demonstração. */
const RECORTES = ['22% 8%', '8% 92%', '50% 48%', '84% 30%', '60% 20%', '30% 70%', '70% 85%', '15% 35%', '90% 60%', '45% 5%'];
const BASES = [
  { src: 'assets/flores-v2-480.webp', srcset: 'assets/flores-v2-480.webp 480w, assets/flores-v2-960.webp 960w', w: 480, h: 720, nome: 'Flores' },
  { src: 'assets/papelaria-v2-480.webp', srcset: 'assets/papelaria-v2-480.webp 480w, assets/papelaria-v2-960.webp 960w', w: 480, h: 320, nome: 'Papelaria' },
];

/** Fotos PROVISÓRIAS de demonstração: só reutilizam as 2 bases existentes (nada é gerado ou baixado). */
export function fotosProvisorias(n) {
  const q = Math.max(0, Math.min(MAX_FOTOS, Math.floor(Number(n) || 0)));
  return Array.from({ length: q }, (_, i) => {
    const b = BASES[i % 2];
    return {
      src: b.src, srcset: b.srcset, w: b.w, h: b.h,
      alt: `Foto provisória ${i + 1}, imagem de demonstração (${b.nome.toLowerCase()})`,
      legenda: `Foto provisória ${i + 1}`,
      foco: RECORTES[(i + Math.floor(i / RECORTES.length) * 3) % RECORTES.length],
    };
  });
}

function srcValido(src) {
  if (typeof src !== 'string' || !src.trim()) return false;
  try {
    const u = new URL(src, 'http://relativo.invalid/');
    if (u.hostname === 'relativo.invalid') return !/^[a-z][a-z0-9+.-]*:/i.test(src.trim()) || false;
    return typeof location !== 'undefined' && u.origin === location.origin;
  } catch { return false; }
}

/** Valida e limita a lista vinda da configuração. Itens sem src/alt válidos são descartados. */
export function normalizarFotos(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  for (const f of lista) {
    if (!f || !srcValido(f.src)) continue;
    out.push({
      src: f.src.trim(),
      srcset: typeof f.srcset === 'string' ? f.srcset : '',
      alt: typeof f.alt === 'string' && f.alt.trim() ? f.alt.trim() : 'Foto do casal',
      legenda: typeof f.legenda === 'string' ? f.legenda.trim() : '',
      foco: typeof f.foco === 'string' && /^[\d.%\s a-z-]{1,24}$/i.test(f.foco) ? f.foco : '',
      w: Number(f.w) > 0 ? Number(f.w) : 4,
      h: Number(f.h) > 0 ? Number(f.h) : 5,
    });
    if (out.length >= MAX_FOTOS) break;
  }
  return out;
}

/** Quantas fotos por folha e qual layout. Retorna [{ layout, indices:number[] }]. */
export function organizarFolhas(n) {
  const folhas = [];
  let resto = Math.max(0, Math.min(MAX_FOTOS, Math.floor(n) || 0));
  let i = 0, k = 0;
  while (resto > 0) {
    let q;
    if (resto <= 3) q = resto;
    else {
      q = k % 2 === 0 ? 3 : 2;
      if (resto - q === 1) q = q === 3 ? 2 : 3;
    }
    folhas.push({ layout: q === 3 ? 'tres' : q === 2 ? 'duas' : 'uma', indices: Array.from({ length: q }, (_, j) => i + j) });
    i += q; resto -= q; k += 1;
  }
  return folhas;
}

const SIZES = { tres: ['(max-width:560px) 62vw, 340px', '(max-width:560px) 50vw, 260px', '(max-width:560px) 78vw, 440px'], duas: ['(max-width:560px) 66vw, 360px', '(max-width:560px) 58vw, 320px'], uma: ['(max-width:560px) 84vw, 460px'] };
const POSICOES = { tres: ['a', 'b', 'c'], duas: ['a', 'b'], uma: ['a'] };

function h(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v === '' || v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  n.append(...filhos);
  return n;
}

/**
 * Cria as folhas da galeria.
 * @param {object[]} fotos já normalizadas
 * @param {{eyebrow:string,titulo:string[],continuacao:string,provisorias:string}} t textos (textos.mjs)
 * @param {{provisorias?:boolean}} o
 * @returns {HTMLElement[]}
 */
export function montarFolhas(fotos, t, { provisorias = false } = {}) {
  const plano = organizarFolhas(fotos.length);
  return plano.map((p, fi) => {
    const primeira = fi === 0;
    const sheet = h('article', {
      class: `sheet sheet--memories sheet--gal-${p.layout}`,
      'data-title': 'Memórias',
      'aria-label': 'Memórias',
    });
    const inner = h('div', { class: 'sheet__inner' });
    // Só a primeira folha tem sobretítulo e título; as seguintes seguem sem rótulo de etapa.
    const head = h('header', { class: 'mem__head' });
    if (primeira) {
      head.append(h('p', { class: 'eyebrow line', style: '--i:0', text: t.eyebrow }));
      const tit = h('h2', { class: 'mem__title line', style: '--i:1' });
      tit.append(document.createTextNode(`${t.titulo[0]} `), h('em', { text: t.titulo[1] }));
      head.append(tit);
    }
    const gal = h('div', { class: `gal gal--${p.layout}` });
    p.indices.forEach((idx, j) => {
      const f = fotos[idx];
      const pos = POSICOES[p.layout][j];
      const img = h('img', {
        src: f.src, srcset: f.srcset, sizes: SIZES[p.layout][j], width: f.w, height: f.h,
        loading: 'lazy', decoding: 'async', alt: '', style: f.foco ? `object-position:${f.foco}` : '',
      });
      const btn = h('button', { type: 'button', class: 'gal__btn', 'data-foto': String(idx), 'aria-label': `Ampliar foto ${idx + 1} de ${fotos.length}: ${f.alt}` }, img);
      const fig = h('figure', { class: `gal__f gal__f--${pos} line`, style: `--i:${2 + j};--dy:${18 + j * 8}` }, btn);
      if (f.legenda) fig.append(h('figcaption', { class: 'gal__cap', text: f.legenda }));
      gal.append(fig);
    });
    if (primeira) inner.append(head);
    inner.append(gal);
    if (provisorias && (plano.length === 1 || fi === plano.length - 1)) inner.append(h('p', { class: 'mem__note line', style: '--i:6', text: t.provisorias }));
    sheet.append(inner);
    return sheet;
  });
}

/* ------------------------------------------------------------------ modo foco */
export class FocoFotos {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root contêiner do diálogo (fora do palco)
   * @param {HTMLElement} o.stage palco (fica inert enquanto o foco está aberto)
   * @param {object[]} o.fotos
   * @param {()=>boolean} o.reduced
   * @param {(i:number)=>void} [o.onClose] índice da última foto vista
   */
  constructor({ root, stage, fotos, reduced = () => false, onClose = null }) {
    Object.assign(this, { root, stage, fotos, reduced, onClose });
    this.aberto = false;
    this.i = 0;
    this.opener = null;
    this.g = null;
    this.hideT = 0;
    if (!fotos.length) return;
    this.#montar();
  }

  #montar() {
    const r = this.root;
    r.replaceChildren();
    r.className = 'foco';
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', 'Foto ampliada');
    r.hidden = true;
    this.contador = h('p', { class: 'foco__count', 'aria-live': 'polite' });
    this.fechar = h('button', { type: 'button', class: 'foco__close', 'aria-label': 'Fechar foto' }, h('span', { 'aria-hidden': 'true', text: '×' }));
    this.ant = h('button', { type: 'button', class: 'foco__nav foco__nav--prev', 'aria-label': 'Foto anterior' }, h('span', { 'aria-hidden': 'true', text: '‹' }));
    this.prox = h('button', { type: 'button', class: 'foco__nav foco__nav--next', 'aria-label': 'Próxima foto' }, h('span', { 'aria-hidden': 'true', text: '›' }));
    this.img = h('img', { class: 'foco__img', alt: '', decoding: 'async', draggable: 'false' });
    this.legenda = h('p', { class: 'foco__legenda' });
    this.area = h('div', { class: 'foco__area' }, this.img);
    r.append(h('div', { class: 'foco__bar' }, this.contador, this.fechar), this.area, this.ant, this.prox, this.legenda);
    this.fechar.addEventListener('click', () => this.close());
    this.ant.addEventListener('click', () => this.ir(-1));
    this.prox.addEventListener('click', () => this.ir(1));
    r.addEventListener('keydown', (e) => this.#tecla(e));
    // fundo (fora da foto e dos botões) fecha
    r.addEventListener('click', (e) => { if (e.target === r || e.target === this.area) this.close(); });
    // deslizar horizontalmente troca de foto (sem relação com o gesto de virar folha: o palco está inert)
    this.area.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; this.g = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    const fim = (e, cancel) => {
      const g = this.g; if (!g || g.id !== e.pointerId) return; this.g = null;
      if (cancel) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) this.ir(dx < 0 ? 1 : -1);
    };
    this.area.addEventListener('pointerup', (e) => fim(e, false));
    this.area.addEventListener('pointercancel', (e) => fim(e, true));
  }

  #tecla(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.ir(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.ir(-1); }
    else if (e.key === 'Tab') {
      const foc = [this.fechar, this.ant, this.prox].filter((b) => !b.disabled);
      if (!foc.length) return;
      const k = foc.indexOf(document.activeElement);
      if (e.shiftKey && (k <= 0)) { e.preventDefault(); foc[foc.length - 1].focus(); }
      else if (!e.shiftKey && (k === foc.length - 1 || k === -1)) { e.preventDefault(); foc[0].focus(); }
    }
  }

  #mostrar(i) {
    const f = this.fotos[i];
    this.i = i;
    this.img.removeAttribute('srcset');
    this.img.src = f.src;
    if (f.srcset) { this.img.srcset = f.srcset; this.img.sizes = '100vw'; }
    this.img.alt = f.alt;
    this.legenda.textContent = f.legenda || '';
    this.legenda.hidden = !f.legenda;
    this.contador.textContent = `${i + 1} de ${this.fotos.length}`;
    this.ant.disabled = i <= 0;
    this.prox.disabled = i >= this.fotos.length - 1;
    // antecipa as vizinhas (somente depois de aberto)
    for (const v of [i - 1, i + 1]) if (this.fotos[v]) { const p = new Image(); p.src = this.fotos[v].src; }
  }

  open(i, opener) {
    if (this.aberto || !this.fotos[i]) return;
    this.opener = opener || document.activeElement;
    this.aberto = true;
    clearTimeout(this.hideT);
    this.root.hidden = false;
    this.stage.inert = true;
    this.#mostrar(i);
    requestAnimationFrame(() => { this.root.classList.add('is-open'); this.fechar.focus({ preventScroll: true }); });
    document.dispatchEvent(new CustomEvent('jb:foco', { detail: { aberto: true, i } }));
  }

  ir(delta) {
    const n = this.i + delta;
    if (!this.aberto || n < 0 || n >= this.fotos.length) return;
    this.#mostrar(n);
    if (document.activeElement?.disabled) this.fechar.focus({ preventScroll: true });
  }

  close() {
    if (!this.aberto) return;
    this.aberto = false;
    this.root.classList.remove('is-open');
    this.stage.inert = false;
    this.hideT = setTimeout(() => { if (!this.aberto) this.root.hidden = true; }, this.reduced() ? 20 : 260);
    const alvo = this.opener && document.contains(this.opener) ? this.opener : document.getElementById('next');
    alvo?.focus?.({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('jb:foco', { detail: { aberto: false, i: this.i } }));
    this.onClose?.(this.i);
  }
}
