// V2 · inicialização e estado de navegação.
// Estado: capa -> abrindo -> leitura; leitura <-> resposta (painel RSVP fora do livro). Música é independente.
import { BookController } from './book-controller.mjs';
import { MotionController } from './motion-controller.mjs';
import { AudioController } from './audio-controller.mjs';
import { RsvpController } from './rsvp-controller.mjs';
import { carregarConfig } from './config.mjs';
import { lerContexto } from './share.mjs';

const $ = (id) => document.getElementById(id);
const app = $('app');
const stage = $('stage');
const cover = $('cover');
const status = $('cover-status');
const live = $('live');

const config = carregarConfig();
const sheets = [...$('sheet-store').querySelectorAll('.sheet')];
const motion = new MotionController();

const LOCAL_INDEX = sheets.findIndex((s) => s.dataset.title === 'Celebração');

/* ---- contexto do convite (link v1/v2, demonstração ou link inválido). Textos entram só via textContent. ---- */
const contexto = lerContexto(location.href);
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }

const rsvp = new RsvpController({ root: $('rsvp'), stage, contexto, config, storage, reduced: () => motion.reduced });

function preencherConvite() {
  const para = $('cover-for');
  const inv = contexto.invite;
  const nomeDemo = contexto.modo === 'demo' && inv && inv.name !== 'Convidado de demonstração';
  const vagas = inv ? (inv.capacity === 1 ? '1 pessoa' : `até ${inv.capacity} pessoas`) : '';
  if (contexto.modo === 'convite') { para.textContent = `Para ${inv.name}`; para.hidden = false; }
  else if (contexto.modo === 'demo') { para.textContent = nomeDemo ? `Demonstração · Para ${inv.name}` : 'Convite de demonstração'; para.classList.add('is-demo'); para.hidden = false; }
  else { para.textContent = contexto.erro; para.classList.add('is-warn'); para.hidden = false; }
  const quem = sheets.flatMap((s) => [...s.querySelectorAll('[data-fill=para]')]);
  quem.forEach((el) => {
    el.textContent = contexto.modo === 'convite' ? `Para ${inv.name} · ${vagas}` : (contexto.modo === 'demo' ? `${nomeDemo ? `Demonstração · Para ${inv.name}` : 'Convite de demonstração'} · ${vagas}` : '');
    el.hidden = !el.textContent;
  });
  syncRascunho();
}
function syncRascunho() {
  sheets.flatMap((s) => [...s.querySelectorAll('[data-fill=rascunho]')]).forEach((el) => { el.hidden = !rsvp.temRascunho; });
}
preencherConvite();

/* ---- música opcional ---- */
const audio = new AudioController(config.musica);
const soundBtn = $('sound');
function syncSound(anunciar = false) {
  soundBtn.hidden = !audio.visible;
  if (!audio.visible) return;
  const d = audio.descricao();
  $('sound-text').textContent = d.texto;
  soundBtn.setAttribute('aria-label', d.aria);
  soundBtn.setAttribute('aria-pressed', String(d.pressed));
  soundBtn.disabled = d.desabilitado;
  soundBtn.dataset.estado = audio.state;
  if (anunciar && live) live.textContent = d.aria;
}
audio.onChange(() => syncSound(stage.dataset.state === 'reading'));
soundBtn.addEventListener('click', async () => { await audio.alternar(); syncSound(true); });
// A cada retorno à aba, o rótulo já mostra "Retomar som" (a retomada é oferecida; nunca automática).
document.addEventListener('visibilitychange', () => syncSound(false));

/* ---- escala e layout: --u = px por "unidade de desenho" (360x640 retrato; 640x360 paisagem curta) ---- */
function aplicarEscala() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const wide = h <= 520 && w > h * 1.15;
  stage.dataset.layout = wide ? 'wide' : 'tall';
  app.dataset.layout = stage.dataset.layout;
  const base = wide ? Math.min(w / 640, h / 360) : Math.min(w / 360, h / 640);
  const u = Math.max(0.7, Math.min(1.6, base));
  stage.style.setProperty('--u', u.toFixed(4) + 'px');
  // Telas altas: sobra altura além do desenho 360x640; o mosaico a usa (limitado) para não deixar vazio.
  const fill = wide ? 1 : Math.min(1.55, 1 + Math.max(0, h / u / 640 - 1) * 1.7);
  stage.style.setProperty('--fill', fill.toFixed(3));
  const zone = Math.round(Math.max(72, Math.min(130, u * 100)));
  stage.style.setProperty('--zone', zone + 'px');
  book.setZone(zone);
}

/* ---- dica do canto: fora das folhas; some na primeira virada e não volta ---- */
const hint = $('peek-hint');
let hintDone = false, hintT = 0;
function esconderDica(definitivo = false) {
  clearTimeout(hintT);
  hint.classList.remove('is-on');
  if (definitivo) hintDone = true;
}
function agendarDica() {
  clearTimeout(hintT);
  if (hintDone) return;
  hintT = setTimeout(() => { if (!hintDone && book.index === 0 && stage.dataset.fold === 'read') hint.classList.add('is-on'); }, 2200);
}

const book = new BookController({
  stage,
  host: $('book-host'),
  sheets,
  measure: $('measure'),
  motion,
  onChange: (i, { user }) => { if (user && i !== 0) esconderDica(true); atualizarUI(i, user); },
  onMode: (info) => { stage.dataset.engine = info.engine; stage.dataset.scroll = info.overflow ? 'sim' : 'nao'; },
  onState: (st) => { if (st === 'user_fold' || st === 'flipping') esconderDica(true); },
});

/* ---- UI de navegação ---- */
const prev = $('prev'), next = $('next'), ear = $('dogear');
function atualizarUI(i, anunciar = true) {
  prev.disabled = i <= 0;
  next.disabled = i >= sheets.length - 1;
  ear.classList.toggle('is-hidden', i >= sheets.length - 1);
  stage.dataset.sheet = String(i);
  if (anunciar && live) live.textContent = `Folha ${i + 1} de ${sheets.length}: ${sheets[i].dataset.title}`;
}
prev.addEventListener('click', () => book.prev());
next.addEventListener('click', () => { esconderDica(true); book.next(); });
$('goto-local').addEventListener('click', () => book.goTo(LOCAL_INDEX));

sheets.forEach((s) => s.querySelectorAll('.rsvp-open').forEach((b) => b.addEventListener('click', () => rsvp.open(b))));
document.addEventListener('jb:rsvp', (e) => { if (!e.detail.aberto) syncRascunho(); });

const reduceBtn = $('reduce');
function syncReduceBtn() { reduceBtn.setAttribute('aria-pressed', String(motion.userReduced || motion.systemReduced)); }
reduceBtn.addEventListener('click', () => {
  if (motion.systemReduced) return; // preferência do sistema prevalece
  motion.setUserReduced(!motion.userReduced);
});
motion.onChange(syncReduceBtn);
syncReduceBtn();

document.addEventListener('keydown', (e) => {
  if (stage.dataset.state !== 'reading' || rsvp.aberto || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input,textarea,select')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); book.next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); book.prev(); }
});

/* ---- abertura ---- */
let opening = false;
async function abrir({ musica = false, em = 0 } = {}) {
  if (opening) return;
  opening = true;
  stage.dataset.state = 'opening';
  status.textContent = 'Abrindo a carta…';
  cover.setAttribute('aria-busy', 'true');
  // play() precisa partir do gesto: chamado antes de qualquer espera. Falha ou ausência de faixa não impedem a abertura.
  const musicaP = musica ? audio.pedirMusica() : Promise.resolve(audio.state);
  document.dispatchEvent(new CustomEvent('jb:abrir', { detail: { musica } }));
  aplicarEscala();
  await book.open(em);
  atualizarUI(book.index, false);
  stage.dataset.state = 'reading';
  cover.classList.add('is-opening');
  const fim = () => { cover.hidden = true; status.textContent = ''; };
  setTimeout(fim, motion.reduced ? 220 : 850);
  if (live) live.textContent = `Convite aberto. Folha ${book.index + 1} de ${sheets.length}: ${sheets[book.index].dataset.title}`;
  agendarEspiada();
  agendarDica();
  await musicaP;
  syncSound(false);
  if (musica && live) {
    if (audio.state === 'sem-faixa') live.textContent = 'A música deste convite ainda não foi adicionada. O convite abriu em silêncio.';
    else if (audio.state === 'bloqueada') live.textContent = 'O navegador bloqueou a música. Use o botão de som para tentar de novo.';
    else if (audio.state === 'erro') live.textContent = 'Não foi possível carregar a música. O convite abriu em silêncio.';
  }
}

/* Dica de "espiada" do canto: primeira folha, não depende de hover. Até duas vezes, cancelada ao interagir. */
let espiadas = 0, tEspiada = 0;
function agendarEspiada() {
  clearTimeout(tEspiada);
  if (espiadas >= 2) return;
  tEspiada = setTimeout(() => {
    if (book.index === 0 && !document.hidden && !book.g) { book.peek(); espiadas += 1; agendarEspiada(); }
  }, espiadas === 0 ? 1600 : 7000);
}
stage.addEventListener('pointerdown', () => { clearTimeout(tEspiada); espiadas = 2; }, { capture: true });

$('open-music').addEventListener('click', () => abrir({ musica: true }));
$('open-silent').addEventListener('click', () => abrir({ musica: false }));
$('seal').addEventListener('click', () => abrir({ musica: false }));
$('open-local').addEventListener('click', () => abrir({ musica: false, em: LOCAL_INDEX }));

/* ---- redimensionamento e rotação preservam a folha atual ---- */
let t = 0;
const ro = new ResizeObserver(() => {
  aplicarEscala();
  clearTimeout(t);
  t = setTimeout(() => book.measureSize(), 120);
});
ro.observe(stage);
aplicarEscala();
syncSound();

// Gancho de QA (somente leitura) para os testes automatizados.
window.__v2 = { book, motion, audio, rsvp, contexto, get index() { return book.index; } };
