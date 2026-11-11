// Mensagem e links de compartilhamento do RSVP. Sem número de telefone: o WhatsApp apresenta os contatos.
import { rsvpMessage, readInvite } from '../domain.mjs';

export const WA_GENERICO = 'https://wa.me/?text=';
export const MAX_DEMO = 20;

/** Mensagem pronta; no modo demonstrativo leva o prefixo [TESTE]. Lança erro se a resposta não respeitar o convite. */
export function montarMensagem(invite, people, { casal, dataTexto, demo = false }) {
  // Quebras de linha/espaços repetidos nos nomes de acompanhantes viram um espaço (cada pessoa ocupa uma linha da mensagem).
  const limpas = people.map((p, i) => (i === 0 || !p ? p : { ...p, name: String(p.name ?? '').replace(/\s+/g, ' ').trim() }));
  const texto = rsvpMessage(invite, limpas, casal, dataTexto);
  return demo ? `[TESTE] ${texto}` : texto;
}

/** Link do WhatsApp SEM destinatário (nunca inclui número). */
export function linkWhatsApp(mensagem) {
  return WA_GENERICO + encodeURIComponent(mensagem);
}

/**
 * Interpreta o endereço atual. Retorna { modo: 'convite' | 'demo' | 'invalido', invite, erro }.
 * - ?convite= (v1 ou v2)  -> convite real
 * - sem convite            -> convite de demonstração (?demo=N define 1..20 vagas; padrão 3)
 */
export function lerContexto(href) {
  const url = new URL(href);
  let invite = null;
  try { invite = readInvite(href); } catch (e) { return { modo: 'invalido', invite: null, erro: e.message }; }
  // `?convite=...&demo=1` (links gerados no laboratório/painel em modo demonstração): convite com nomes, mas ambiente de teste
  // (rascunho `jb-rsvp-v2:demo:*`, mensagens com [TESTE]).
  if (invite) return { modo: url.searchParams.get('demo') === '1' ? 'demo' : 'convite', invite: { acompanhantes: [], ...invite } };
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
