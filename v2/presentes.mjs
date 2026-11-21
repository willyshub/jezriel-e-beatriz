// Lista de presentes por LINK EXTERNO (21/11/2026, pedido dos noivos via Will). Ver docs/V2-PRESENTES.md.
//
// - Uma FOLHA do livro, logo depois da Celebração: chamada curta + botão "Ver lista de presentes ↗",
//   que abre a página da lista no site Lista Ideal em nova aba. A reserva sem repetição fica com o site da lista.
// - O link vem de config.mjs → presentes.link. Vazio = o botão aparece desativado com "Link da lista em breve".
// - Só http(s) é aceito (javascript:, data: e texto solto viram ''). Nada de innerHTML: tudo por textContent/atributos.

/** Aceita só http(s); devolve '' para qualquer outra coisa. */
export function linkSeguro(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch { return ''; }
}

function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Ornamento desenhado (laço de presente): nada é baixado. */
function laco() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'gift__ph');
  for (const d of ['M8 20h32v22H8z', 'M5 13h38v7H5z', 'M24 13v29', 'M24 13c-3-6-11-8-11-3s8 3 11 3c3 0 11 2 11-3s-8-3-11 3']) {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.append(p);
  }
  return s;
}

/**
 * Monta a folha do livro.
 * @param {{link?:string, site?:string}} cfg config.mjs → presentes
 * @param {object} t textos.mjs → presentes
 * @param {{ativa?:boolean}} [o] ativa=false remove a folha (casal decidiu não ter lista)
 * @returns {HTMLElement|null}
 */
export function montarFolhaPresentes(cfg = {}, t, { ativa = true } = {}) {
  if (!ativa || cfg.ativa === false) return null;
  const link = linkSeguro(cfg.link);
  const site = String(cfg.site || '').trim().slice(0, 40);
  const titulo = h('h2', { class: 'gifts__title line', style: '--i:1' }, `${t.titulo[0]} `, h('em', { text: t.titulo[1] }));
  const botao = link
    ? h('a', { class: 'btn btn--primary gifts-link', href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${t.botao} (abre ${site || 'o site da lista'} em nova aba)` },
      t.botao, h('span', { 'aria-hidden': 'true', text: '↗' }))
    : h('span', { class: 'btn btn--primary gifts-link is-off', role: 'link', 'aria-disabled': 'true' }, t.botao);
  const nota = link ? (site ? t.nota(site) : '') : t.emBreve;
  return h('article', { class: 'sheet sheet--gifts', 'data-title': 'Presentes', 'aria-label': 'Lista de presentes' },
    h('div', { class: 'sheet__inner' },
      h('span', { class: 'gifts__orn line', style: '--i:0', 'aria-hidden': 'true' }, laco()),
      h('p', { class: 'eyebrow line', style: '--i:0', text: t.eyebrow }),
      titulo,
      h('p', { class: 'gifts__text line', style: '--i:2', text: t.texto }),
      h('p', { class: 'line', style: '--i:3' }, botao),
      nota ? h('p', { class: 'gifts__nota line', style: '--i:4', text: nota }) : null,
    ),
  );
}
