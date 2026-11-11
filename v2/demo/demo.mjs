// Interface do laboratório V2 (dados fictícios). Textos entram via textContent.
import { adminTotals } from '../../domain.mjs';
import { cenarios, linkCenario, semearDemo, resumoLimpeza, exportarDemo, reiniciarDemo, CHAVE_LISTA_DEMO } from './demo-lab.mjs';

const $ = (id) => document.getElementById(id);
let storage = null;
try { storage = window.localStorage; storage.getItem('jb-demo-v2:__probe'); } catch { storage = null; }

const indexV2 = new URL('../index.html', location.href).href;

function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  n.append(...filhos);
  return n;
}

function desenharCenarios() {
  const alvo = $('cenarios'); alvo.replaceChildren();
  for (const c of cenarios()) {
    const link = linkCenario(indexV2, c);
    const nomeados = c.acompanhantes.filter(Boolean).length;
    const semNome = c.capacity - 1 - nomeados;
    alvo.append(el('div', { class: 'card' },
      el('strong', { text: `${c.name} · ${c.capacity} ${c.capacity === 1 ? 'vaga' : 'vagas'}` }),
      el('small', { text: `${nomeados} acompanhante(s) com nome${semNome > 0 ? `, ${semNome} vaga(s) sem nome` : ''}` }),
      el('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener', 'data-cenario': c.id, text: 'Abrir convite ↗' }),
    ));
  }
}

function resumo() {
  const st = $('resumo');
  if (!storage) { st.textContent = 'Armazenamento do navegador indisponível: a carga e o reinício não funcionam aqui.'; return; }
  const r = resumoLimpeza(storage);
  let extra = '';
  try {
    const lista = JSON.parse(storage.getItem(CHAVE_LISTA_DEMO) || 'null');
    if (Array.isArray(lista?.rows)) { const t = adminTotals(lista.rows); extra = ` Lista demo: ${t.invites} convites, ${t.capacity} vagas.`; }
  } catch { extra = ' Lista demo ilegível.'; }
  st.textContent = r.total ? `${r.total} item(ns) de demonstração guardado(s).${extra}` : 'Nenhum dado de demonstração guardado neste navegador.';
  $('semear').disabled = $('exportar').disabled = $('reiniciar').disabled = false;
}

function baixar(objeto, nome) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: nome }); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportar() {
  if (!storage) return;
  const dados = exportarDemo(storage);
  baixar(dados, `DEMO-backup-${new Date().toISOString().slice(0, 10)}.json`);
  $('reset-status').textContent = `Backup de demonstração preparado (${dados.rows.length} convites, ${Object.keys(dados.rascunhos).length} rascunhos). Marcado como demo.`;
}

$('semear').addEventListener('click', () => {
  if (!storage) return;
  const t = semearDemo(storage);
  $('carga-status').textContent = `Carga gravada: ${t.invites} titulares, ${t.capacity} vagas (${t.confirmado} confirmados, ${t.recusado} recusados, ${t.pendente} pendentes).`;
  resumo();
});
$('exportar').addEventListener('click', exportar);

let abertoDe = null;
function abrirReset() {
  if (!storage) return;
  const r = resumoLimpeza(storage);
  const ul = $('reset-lista'); ul.replaceChildren();
  if (!r.total) ul.append(el('li', { text: 'Nada para remover: não há dados de demonstração.' }));
  for (const i of r.itens) ul.append(el('li', { text: `${i.descricao} — ${i.chave}` }));
  $('reset-confirmar').disabled = !r.total;
  abertoDe = document.activeElement;
  $('reset-panel').hidden = false;
  $('reset-cancelar').focus();
}
function fecharReset() { $('reset-panel').hidden = true; abertoDe?.focus?.(); }
$('reiniciar').addEventListener('click', abrirReset);
$('reset-cancelar').addEventListener('click', () => { fecharReset(); $('reset-status').textContent = 'Reinício cancelado. Nada foi alterado.'; });
$('reset-exportar').addEventListener('click', exportar);
$('reset-confirmar').addEventListener('click', () => {
  const r = reiniciarDemo(storage, { confirmado: true });
  fecharReset();
  $('reset-status').textContent = `Demonstração reiniciada: ${r.removidas.length} item(ns) removido(s). Dados reais não foram tocados.`;
  $('carga-status').textContent = '';
  resumo();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('reset-panel').hidden) { fecharReset(); $('reset-status').textContent = 'Reinício cancelado. Nada foi alterado.'; } });

desenharCenarios();
resumo();
