// Lista de presentes (20/11/2026). Ver docs/V2-PRESENTES.md.
//
// Arquitetura:
// - Uma FOLHA do livro, logo depois da Celebração: chamada curta + 3 destaques + botão "Ver lista de presentes".
//   A folha tem tamanho fixo (precisa caber na medição, senão o livro cai no modo simples), por isso não lista tudo.
// - Um PAINEL fora do palco (como o de resposta): lista completa em 2 colunas, filtros por faixa de preço e
//   categoria, foto, preço de referência e botão "Presentear" que abre o link de afiliado do Mercado Livre.
// - Dados públicos em presentes-dados.mjs (nada de convidado aqui). Links só https; imagem remota com lazy loading
//   e marcador desenhado se a foto falhar ou faltar.
// - Nada de innerHTML com dados: tudo por textContent/atributos.

export const FAIXAS = [
  { id: 'todos', rotulo: 'Todos', min: 0, max: Infinity },
  { id: 'ate150', rotulo: 'Até R$ 150', min: 0, max: 150 },
  { id: '150a400', rotulo: 'R$ 150 a 400', min: 150, max: 400 },
  { id: 'acima400', rotulo: 'Acima de R$ 400', min: 400, max: Infinity },
];

const fmt = (() => {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { return null; }
})();

/** "R$ 189,90" (ou "" sem preço). */
export function formatarPreco(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return '';
  return fmt ? fmt.format(v).replace(/ /g, ' ') : `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/** Aceita só http(s); devolve '' para qualquer outra coisa (javascript:, data:, texto solto). */
export function linkSeguro(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch { return ''; }
}

/** Valida e ordena: disponíveis primeiro (destaques na frente), depois os já ganhos. Itens sem nome são descartados. */
export function normalizarPresentes(lista) {
  if (!Array.isArray(lista)) return [];
  const itens = lista
    .filter((p) => p && typeof p.nome === 'string' && p.nome.trim())
    .slice(0, 120)
    .map((p, i) => ({
      id: String(p.id || `p${i + 1}`),
      nome: p.nome.trim().slice(0, 90),
      preco: typeof p.preco === 'number' && p.preco > 0 ? p.preco : null,
      imagem: linkSeguro(p.imagem),
      link: linkSeguro(p.link),
      categoria: typeof p.categoria === 'string' ? p.categoria.trim().slice(0, 30) : '',
      nota: typeof p.nota === 'string' ? p.nota.trim().slice(0, 80) : '',
      destaque: p.destaque === true,
      ganho: p.ganho === true,
      ordem: i,
    }));
  return itens.sort((a, b) => (a.ganho - b.ganho) || (b.destaque - a.destaque) || (a.ordem - b.ordem));
}

export function filtrar(itens, { faixa = 'todos', categoria = '' } = {}) {
  const f = FAIXAS.find((x) => x.id === faixa) || FAIXAS[0];
  return itens.filter((p) => {
    if (categoria && p.categoria !== categoria) return false;
    if (f.id === 'todos') return true;
    return p.preco != null && p.preco >= f.min && p.preco < f.max;
  });
}

export function destaques(itens, n = 3) {
  const disp = itens.filter((p) => !p.ganho);
  const marcados = disp.filter((p) => p.destaque);
  return [...marcados, ...disp.filter((p) => !p.destaque)].slice(0, n);
}

/* ------------------------------------------------------------------ DOM */
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Marcador desenhado (laço de presente) quando a foto falta ou falha: nada é baixado. */
function marcador() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'gift__ph');
  for (const d of ['M8 20h32v22H8z', 'M5 13h38v7H5z', 'M24 13v29', 'M24 13c-3-6-11-8-11-3s8 3 11 3c3 0 11 2 11-3s-8-3-11 3']) {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p);
  }
  return s;
}

function foto(p, { lazy = true, sizes = '45vw' } = {}) {
  const box = h('div', { class: 'gift__img' });
  if (!p.imagem) { box.append(marcador()); return box; }
  const img = h('img', { src: p.imagem, alt: '', loading: lazy ? 'lazy' : 'eager', decoding: 'async', referrerpolicy: 'no-referrer', sizes, width: '300', height: '300' });
  img.addEventListener('error', () => { img.remove(); box.append(marcador()); }, { once: true });
  box.append(img);
  return box;
}

/** Monta a folha do livro. Retorna null sem presentes. */
export function montarFolhaPresentes(itens, t) {
  if (!itens.length) return null;
  const top = destaques(itens, 3);
  const cards = top.map((p) => h('li', { class: 'gift-mini' },
    foto(p, { sizes: '30vw' }),
    h('p', { class: 'gift-mini__nome', text: p.nome }),
    p.preco ? h('p', { class: 'gift-mini__preco', text: formatarPreco(p.preco) }) : null,
  ));
  const titulo = h('h2', { class: 'gifts__title line', style: '--i:1' }, `${t.titulo[0]} `, h('em', { text: t.titulo[1] }));
  return h('article', { class: 'sheet sheet--gifts', 'data-title': 'Presentes', 'aria-label': 'Lista de presentes' },
    h('div', { class: 'sheet__inner' },
      h('span', { class: 'gifts__orn line', style: '--i:0', 'aria-hidden': 'true' }, marcador()),
      h('p', { class: 'eyebrow line', style: '--i:0', text: t.eyebrow }),
      titulo,
      h('p', { class: 'gifts__text line', style: '--i:2', text: t.texto }),
      h('ul', { class: 'gifts__mini line', style: '--i:3', 'aria-label': 'Algumas ideias' }, cards),
      h('p', { class: 'line', style: '--i:4' }, h('button', { type: 'button', class: 'btn btn--primary gifts-open' }, t.botao)),
      h('p', { class: 'gifts__nota line', style: '--i:5', text: t.selo }),
    ),
  );
}

export class PresentesController {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root   contêiner do painel (hidden), fora do palco
   * @param {HTMLElement} o.stage  palco (inert enquanto o painel está aberto)
   * @param {ReturnType<typeof normalizarPresentes>} o.itens
   * @param {object} o.t           textos (textos.mjs → presentes)
   * @param {string} [o.whatsapp]  número do noivo (avisar que presenteou)
   * @param {(url:string)=>string} o.linkWhatsApp
   * @param {()=>boolean} [o.reduced]
   */
  constructor({ root, stage, itens, t, whatsapp = '', linkWhatsApp, reduced = () => false }) {
    Object.assign(this, { root, stage, itens, t, whatsapp, linkWhatsApp, reduced });
    this.aberto = false;
    this.filtro = { faixa: 'todos', categoria: '' };
    this.categorias = [...new Set(itens.map((p) => p.categoria).filter(Boolean))];
    this.#montar();
    window.addEventListener('popstate', () => { if (this.aberto) this.close(true); });
  }

  #montar() {
    const t = this.t;
    this.lista = h('ul', { class: 'gifts-grid', 'aria-live': 'polite' });
    this.vazio = h('p', { class: 'gifts-vazio', hidden: true, text: 'Nenhum presente nesta faixa. Experimente outra.' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por preço' },
      FAIXAS.map((f) => h('button', { type: 'button', class: 'chip', 'data-faixa': f.id, 'aria-pressed': String(f.id === 'todos'), onclick: () => { this.filtro.faixa = f.id; this.#render(); } }, f.rotulo)));
    const cats = this.categorias.length > 1
      ? h('div', { class: 'chips chips--cat', role: 'group', 'aria-label': 'Filtrar por categoria' },
        h('button', { type: 'button', class: 'chip', 'data-cat': '', 'aria-pressed': 'true', onclick: () => { this.filtro.categoria = ''; this.#render(); } }, 'Tudo'),
        this.categorias.map((c) => h('button', { type: 'button', class: 'chip', 'data-cat': c, 'aria-pressed': 'false', onclick: () => { this.filtro.categoria = c; this.#render(); } }, c)))
      : null;
    const avisar = this.whatsapp
      ? h('a', { class: 'btn btn--ghost gifts-avisar', href: this.linkWhatsApp(t.avisarMensagem, this.whatsapp), target: '_blank', rel: 'noopener noreferrer' }, t.avisar)
      : null;
    const card = h('section', { class: 'gifts-panel__card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gifts-title' },
      h('header', { class: 'gifts-panel__head' },
        h('div', {}, h('p', { class: 'eyebrow', text: t.eyebrow }), h('h2', { class: 'gifts-panel__title', id: 'gifts-title', tabindex: '-1', text: t.painelTitulo })),
        h('button', { type: 'button', class: 'rsvp__close', 'aria-label': 'Fechar lista de presentes', onclick: () => this.close() }, h('span', { 'aria-hidden': 'true', text: '×' })),
      ),
      h('p', { class: 'gifts-panel__lead', text: t.painelTexto }),
      chips, cats, this.lista, this.vazio,
      h('div', { class: 'gifts-panel__foot' },
        h('p', { class: 'gifts-panel__entrega', text: t.entrega }),
        avisar,
        h('p', { class: 'gifts-panel__aviso', text: t.afiliado }),
      ),
    );
    this.card = card;
    this.root.replaceChildren(card);
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
  }

  #cartao(p) {
    const preco = formatarPreco(p.preco);
    const acao = p.ganho
      ? h('span', { class: 'gift__ganho', text: this.t.ganho })
      : p.link
        ? h('a', { class: 'btn btn--primary gift__btn', href: p.link, target: '_blank', rel: 'sponsored noopener noreferrer', 'aria-label': `${this.t.presentear}: ${p.nome} (abre o Mercado Livre)` }, this.t.presentear, h('span', { 'aria-hidden': 'true', text: ' ↗' }))
        : h('span', { class: 'gift__breve', text: this.t.emBreve });
    return h('li', { class: 'gift' + (p.ganho ? ' is-ganho' : '') },
      foto(p),
      h('div', { class: 'gift__body' },
        p.categoria ? h('p', { class: 'gift__cat', text: p.categoria }) : null,
        h('h3', { class: 'gift__nome', text: p.nome }),
        p.nota ? h('p', { class: 'gift__nota', text: p.nota }) : null,
        preco ? h('p', { class: 'gift__preco' }, h('span', { class: 'sr-only', text: 'Preço de referência: ' }), preco) : null,
        acao,
      ),
    );
  }

  #render() {
    this.card.querySelectorAll('[data-faixa]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.faixa === this.filtro.faixa)));
    this.card.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === this.filtro.categoria)));
    const itens = filtrar(this.itens, this.filtro);
    this.lista.replaceChildren(...itens.map((p) => this.#cartao(p)));
    this.vazio.hidden = itens.length > 0;
  }

  open(opener) {
    if (this.aberto) return;
    this.opener = opener || document.activeElement;
    this.aberto = true;
    clearTimeout(this.hideT);
    if (!this.lista.childElementCount) this.#render(); // fotos só carregam quando o painel abre pela 1ª vez
    this.root.hidden = false;
    this.stage.inert = true;
    try { history.pushState({ jbPresentes: 1 }, ''); this.pushed = true; } catch { this.pushed = false; }
    requestAnimationFrame(() => { this.root.classList.add('is-open'); this.card.querySelector('#gifts-title').focus({ preventScroll: true }); });
  }

  /** @param {boolean} [peloVoltar] fechado pelo botão Voltar do aparelho (o histórico já voltou) */
  close(peloVoltar = false) {
    if (!this.aberto) return;
    this.aberto = false;
    this.root.classList.remove('is-open');
    this.stage.inert = false;
    if (this.pushed && !peloVoltar) { this.pushed = false; try { history.back(); } catch { /* ok */ } }
    this.pushed = false;
    this.hideT = setTimeout(() => { if (!this.aberto) this.root.hidden = true; }, this.reduced() ? 20 : 320);
    if (this.opener && document.contains(this.opener)) this.opener.focus({ preventScroll: true });
  }
}
