// Laboratório V2: dados de demonstração determinísticos e reinício ISOLADO por namespace.
// Funções puras sobre um `storage` injetado (localStorage no navegador, objeto falso nos testes).
// Regra de ouro: nunca `clear()`; só remove chaves que pertencem a PREFIXOS_DEMO. A lista real (`jb-lista-noivos-v1`)
// e rascunhos de convites reais (`jb-rsvp-v2:convite:*`) jamais entram na lista de remoção.
import { inviteLinkV2, validateRow, adminTotals } from '../../domain.mjs';

export const PREFIXO_DEMO = 'jb-demo-v2:';
export const PREFIXO_RASCUNHO_DEMO = 'jb-rsvp-v2:demo:';
export const PREFIXOS_DEMO = [PREFIXO_DEMO, PREFIXO_RASCUNHO_DEMO];
export const CHAVE_LISTA_DEMO = 'jb-demo-v2:lista';
export const CHAVE_LISTA_REAL = 'jb-lista-noivos-v1'; // referência apenas para testes e avisos; este módulo nunca a lê nem escreve.

export const ehChaveDemo = (chave) => typeof chave === 'string' && PREFIXOS_DEMO.some((p) => chave.startsWith(p));

/** Cenários fixos: titular sozinho, casal, trio e limite técnico (20, com nomes e vagas sem nome). */
export function cenarios() {
  const nomes20 = Array.from({ length: 12 }, (_, i) => `Participante ${String(i + 1).padStart(2, '0')} de Teste`);
  return [
    { id: 'demo-1', name: 'Titular Sozinho de Teste', capacity: 1, acompanhantes: [] },
    { id: 'demo-2', name: 'Casal de Teste', capacity: 2, acompanhantes: ['Acompanhante de Teste'] },
    { id: 'demo-3', name: 'Família de Teste', capacity: 3, acompanhantes: ['Maria-Clara São José de Teste'] },
    { id: 'demo-20', name: 'Grupo de Teste (limite técnico)', capacity: 20, acompanhantes: nomes20 },
  ];
}

/** Carga determinística: 200 titulares somando 400 vagas (50x1, 100x2, 50x3). Status variados para filtros. */
export function carga200() {
  const padrao = [1, 2, 2, 3];
  return Array.from({ length: 200 }, (_, i) => {
    const capacity = padrao[i % 4];
    const n = String(i + 1).padStart(3, '0');
    const status = i % 7 === 0 ? 'recusado' : i % 5 === 0 ? 'confirmado' : 'pendente';
    return validateRow({ id: `demo-c${n}`, name: `Titular de Teste ${n}`, capacity, status, confirmed: status === 'confirmado' ? capacity : 0 });
  });
}

export function linkCenario(baseIndex, cenario) {
  const u = new URL(inviteLinkV2(baseIndex, cenario));
  u.searchParams.set('demo', '1'); // ambiente de teste: rascunho demo e mensagens [TESTE]
  return u.href;
}

/** Grava a carga (substitui apenas a lista demo). Retorna os totais. */
export function semearDemo(storage) {
  const rows = carga200();
  storage.setItem(CHAVE_LISTA_DEMO, JSON.stringify({ version: 1, demo: true, rows }));
  return adminTotals(rows);
}

export function chavesDemo(storage) {
  const chaves = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (ehChaveDemo(k)) chaves.push(k); }
  return chaves.sort();
}

function descreverChave(chave) {
  if (chave === CHAVE_LISTA_DEMO) return 'Lista de demonstração (convites fictícios)';
  if (chave.startsWith(PREFIXO_RASCUNHO_DEMO)) return 'Rascunho de resposta em convite de demonstração';
  return 'Dado auxiliar da demonstração';
}

/** O que seria removido, sem remover nada. */
export function resumoLimpeza(storage) {
  const itens = chavesDemo(storage).map((chave) => ({ chave, descricao: descreverChave(chave), bytes: (storage.getItem(chave) || '').length }));
  return { itens, total: itens.length };
}

/** Backup de demonstração (marcado `demo: true`; compatível com `parseBackup`; a importação na lista real exige escolha explícita no painel). */
export function exportarDemo(storage, agora = () => new Date().toISOString()) {
  let rows = [];
  try { const lista = JSON.parse(storage.getItem(CHAVE_LISTA_DEMO) || 'null'); if (Array.isArray(lista?.rows)) rows = lista.rows; } catch { /* lista ilegível: exporta vazio */ }
  const rascunhos = {};
  for (const k of chavesDemo(storage)) if (k.startsWith(PREFIXO_RASCUNHO_DEMO)) rascunhos[k] = storage.getItem(k);
  return { version: 1, demo: true, exportedAt: agora(), rows, rascunhos };
}

/**
 * Remove SOMENTE as chaves de demonstração. Exige `confirmado === true` (a confirmação é da limpeza, não da exportação).
 * Coleta antes de remover (remover durante a iteração desloca índices) e revalida cada chave.
 */
export function reiniciarDemo(storage, { confirmado } = {}) {
  if (confirmado !== true) return { removidas: [], motivo: 'sem confirmação' };
  const alvo = chavesDemo(storage);
  const removidas = [];
  for (const k of alvo) { if (!ehChaveDemo(k)) continue; storage.removeItem(k); removidas.push(k); }
  return { removidas };
}
