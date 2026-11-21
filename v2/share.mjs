// Mensagem e links de compartilhamento do RSVP. Sem número de telefone: o WhatsApp apresenta os contatos.
import { rsvpMessage, readInvite } from '../domain.mjs?v=202611211911';

export const WA_GENERICO = 'https://wa.me/?text=';
export const MAX_DEMO = 20;

/** Mensagem pronta; no modo demonstrativo leva o prefixo [TESTE]. Lança erro se a resposta não respeitar o convite. */
export function montarMensagem(invite, people, { casal, dataTexto, demo = false }) {
  // Quebras de linha/espaços repetidos nos nomes de acompanhantes viram um espaço (cada pessoa ocupa uma linha da mensagem).
  const limpas = people.map((p, i) => (i === 0 || !p ? p : { ...p, name: String(p.name ?? '').replace(/\s+/g, ' ').trim() }));
  const texto = rsvpMessage(invite, limpas, casal, dataTexto);
  return demo ? `[TESTE] ${texto}` : texto;
}

/** Link do WhatsApp: com número configurado vai direto ao contato; sem número, o convidado escolhe o contato. */
export function linkWhatsApp(mensagem, telefone = '') {
  const digitos = String(telefone || '').replace(/\D/g, '');
  const base = /^\d{10,15}$/.test(digitos) ? `https://wa.me/${digitos}?text=` : WA_GENERICO;
  return base + encodeURIComponent(mensagem);
}

/**
 * Código curto e sem dados pessoais para diagnosticar link com problema (vai na mensagem de resposta alternativa).
 * Ex.: "T95" = token com 95 caracteres (um token íntegro do Gabriel tinha 96 → truncado em 1).
 */
export function codigoDiagnostico(href) {
  try {
    const t = new URL(href).searchParams.get('convite') ?? '';
    return `T${t.length}${/^[\w-]*$/.test(t) ? '' : 'X'}`;
  } catch { return 'U'; }
}

/** Mensagem da resposta sem link pessoal (link inválido ou convite geral): nome digitado + quantidade, sem token. */
export function mensagemAlternativa({ nome, vai, pessoas, casal, dataTexto, codigo, geral = false }) {
  const n = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const corpo = vai
    ? `vou comparecer${pessoas > 1 ? `, com ${pessoas} pessoas no total (incluindo eu)` : ''}`
    : 'não poderei comparecer';
  const nota = geral
    ? '(Resposta enviada pelo convite geral, sem link pessoal.)'
    : `(Resposta enviada pela opção alternativa: o link do convite não abriu corretamente. Código: ${codigo}.)`;
  return `Olá! Sou ${n}. Sobre o convite de ${casal}, em ${dataTexto}: ${corpo}.

${nota}`;
}

/**
 * Interpreta o endereço atual. Retorna { modo: 'convite' | 'demo' | 'geral' | 'invalido', invite, erro }.
 * - ?convite= (v1 ou v2)  -> convite pessoal
 * - ?demo=N (sem convite)  -> convite de demonstração para testes (1..20 vagas; padrão 3)
 * - sem parâmetros         -> convite geral (produção, 20/11/2026): sem nome; a resposta pede nome e quantidade
 */
export function lerContexto(href) {
  const url = new URL(href);
  let invite = null;
  try { invite = readInvite(href); } catch (e) { return { modo: 'invalido', invite: null, erro: e.message, codigo: codigoDiagnostico(href) }; }
  // `?convite=...&demo=1` (links gerados no laboratório/painel em modo demonstração): convite com nomes, mas ambiente de teste
  // (rascunho `jb-rsvp-v2:demo:*`, mensagens com [TESTE]).
  if (invite) return { modo: url.searchParams.get('demo') === '1' ? 'demo' : 'convite', invite: { acompanhantes: [], ...invite } };
  if (!url.searchParams.has('demo')) return { modo: 'geral', invite: null };
  const n = Number(url.searchParams.get('demo'));
  const capacity = Number.isInteger(n) && n >= 1 && n <= MAX_DEMO ? n : 3;
  return {
    modo: 'demo',
    invite: { id: `demo-${capacity}`, name: 'Convidado de demonstração', capacity, acompanhantes: [] },
  };
}

export function chaveRascunho(modo, id) {
  return `jb-rsvp-v2:${modo === 'demo' ? 'demo' : 'convite'}:${id}`;
}

/** Lê o rascunho com validação defensiva (armazenamento pode ter sido alterado ou estar indisponível). */
export function lerRascunho(storage, chave, invite) {
  try {
    const raw = JSON.parse(storage.getItem(chave) || 'null');
    if (!raw || raw.v !== 1 || !Array.isArray(raw.people) || raw.people.length !== invite.capacity) return null;
    const people = raw.people.map((p, i) => ({
      name: i === 0 ? invite.name : String(p?.name ?? '').slice(0, 100),
      status: ['vai', 'nao', 'pendente', ''].includes(p?.status) ? p.status : '',
    }));
    return { people, wa: raw.wa === true };
  } catch { return null; }
}

export function gravarRascunho(storage, chave, dados) {
  try { storage.setItem(chave, JSON.stringify({ v: 1, ts: Date.now(), ...dados })); return true; } catch { return false; }
}
export function apagarRascunho(storage, chave) {
  try { storage.removeItem(chave); } catch { /* indisponível */ }
}
