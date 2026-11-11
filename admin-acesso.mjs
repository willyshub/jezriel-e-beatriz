// Proteção local por senha do painel dos noivos (WebCrypto, sem dependências).
// Não é segurança de servidor: dissuade quem apenas pega o aparelho/navegador e protege o localStorage em repouso.
// A senha nunca é guardada; só um verificador derivado (PBKDF2-SHA-256 + sal aleatório) e a lista cifrada (AES-GCM, IV novo a cada gravação).
import { parseBackup } from './domain.mjs';

export const ITERACOES = 250_000;
export const SENHA_MIN = 8;
export const INATIVIDADE_MS = 15 * 60_000;
export const OCULTA_MS = 5 * 60_000;
export const CHAVE_COFRE = 'jb-lista-noivos-v2';
export const CHAVE_LEGADA = 'jb-lista-noivos-v1';
export const CHAVE_META = 'jb-lista-noivos-meta';
export const CHAVE_TENTATIVAS = 'jb-lista-noivos-tentativas';

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const normaliza = (senha) => String(senha).normalize('NFC');

export function validarSenhaNova(senha, confirmacao) {
  if (typeof senha !== 'string' || [...senha].length < SENHA_MIN) throw Error(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (senha !== confirmacao) throw Error('A confirmação não confere com a senha.');
  return true;
}

async function derivar(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normaliza(senha)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base, 512));
  // 256 bits para a chave AES (não extraível) e 256 bits independentes para o verificador.
  const chave = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { chave, verificador: b64(bits.slice(32)) };
}
function iguais(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

async function cifrar(chave, linhas) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc.encode(JSON.stringify({ version: 1, rows: linhas })));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decifrar(chave, cofre) {
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(cofre.iv) }, chave, unb64(cofre.ct));
    return parseBackup(dec.decode(claro));
  } catch { throw Error('Os dados cifrados não puderam ser lidos. Restaure um backup.'); }
}

/** Valida a forma do cofre guardado (sem tocar nos dados). */
export function lerCofre(texto) {
  let c; try { c = JSON.parse(texto); } catch { throw Error('Armazenamento do painel ilegível.'); }
  const ok = c && c.version === 2 && c.kdf === 'PBKDF2-SHA-256' && Number.isInteger(c.iter) && c.iter >= 100_000 && ['salt', 'verificador', 'iv', 'ct'].every((k) => typeof c[k] === 'string');
  if (!ok) throw Error('Armazenamento do painel em formato desconhecido.');
  return c;
}

/** Cria um cofre novo (sal novo) com a senha dada e a lista cifrada. */
export async function criarCofre(senha, linhas = [], iteracoes = ITERACOES) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const { chave, verificador } = await derivar(senha, sal, iteracoes);
  const dados = await cifrar(chave, parseBackup(JSON.stringify({ version: 1, rows: linhas })));
  return { cofre: { version: 2, kdf: 'PBKDF2-SHA-256', iter: iteracoes, salt: b64(sal), verificador, ...dados }, chave };
}

/** Verifica a senha e decifra. Senha errada -> Error('Senha incorreta.'). */
export async function abrirCofre(cofre, senha) {
  const { chave, verificador } = await derivar(senha, unb64(cofre.salt), cofre.iter);
  if (!iguais(verificador, cofre.verificador)) throw Error('Senha incorreta.');
  return { chave, linhas: await decifrar(chave, cofre) };
}

/** Regrava a lista com IV novo, mantendo sal e verificador. */
export async function gravarCofre(cofre, chave, linhas) {
  const dados = await cifrar(chave, parseBackup(JSON.stringify({ version: 1, rows: linhas })));
  return { ...cofre, ...dados };
}

export async function trocarSenha(cofre, atual, nova, confirmacao, iteracoes = ITERACOES) {
  validarSenhaNova(nova, confirmacao);
  const { linhas } = await abrirCofre(cofre, atual);
  return { ...(await criarCofre(nova, linhas, iteracoes)), linhas };
}

/** Migração: lista antiga em texto puro (v1) -> cofre. Falha (sem perder nada) se a lista antiga for inválida. */
export async function migrarLegado(textoLegado, senha, iteracoes = ITERACOES) {
  const linhas = parseBackup(textoLegado);
  return { ...(await criarCofre(senha, linhas, iteracoes)), linhas };
}

/** Atraso (ms) antes de aceitar nova tentativa após `falhas` erros seguidos: 0 até 2, depois 2s, 4s, 8s... até 5 min. Só dissuasão. */
export function atrasoTentativas(falhas) { return falhas < 3 ? 0 : Math.min(2 ** (falhas - 2) * 1000, 300_000); }

/** Backup: contador de alterações e data do último backup (sem dados pessoais). */
export const metaVazia = () => ({ alteracoes: 0, ultimoBackup: null });
export function lerMeta(texto) {
  try { const m = JSON.parse(texto); return { alteracoes: Number.isInteger(m.alteracoes) && m.alteracoes >= 0 ? m.alteracoes : 0, ultimoBackup: typeof m.ultimoBackup === 'string' ? m.ultimoBackup : null }; } catch { return metaVazia(); }
}
export const registrarAlteracao = (m) => ({ ...m, alteracoes: m.alteracoes + 1 });
export const registrarBackup = (m, quando = new Date().toISOString()) => ({ alteracoes: 0, ultimoBackup: quando });

/** Conteúdo do backup JSON (legível, não cifrado, compatível com parseBackup). */
export function montarBackup(linhas, { demo = false, quando = new Date().toISOString() } = {}) {
  return JSON.stringify({ version: 1, ...(demo ? { demo: true } : {}), exportedAt: quando, rows: linhas }, null, 2);
}
