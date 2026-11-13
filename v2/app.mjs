// V2 · inicialização e estado de navegação.
// Estado: capa (envelope) -> abrindo (carta sai do envelope) -> leitura; leitura <-> resposta (painel RSVP) e foto (modo foco).
// Música é independente. Efeitos de papel (paper-sound.mjs) seguem o controle de som.
import { BookController, loadFlipLib } from './book-controller.mjs';
import { MotionController } from './motion-controller.mjs';
import { AudioController } from './audio-controller.mjs';
import { RsvpController } from './rsvp-controller.mjs';
import { PaperSound } from './paper-sound.mjs';
import { Abertura, Coreografia } from './abertura.mjs';
import { FocoFotos, montarFolhas, normalizarFotos, organizarFolhas, fotosProvisorias } from './fotos.mjs';
import { montarTextos } from './textos.mjs';
import { carregarConfig } from './config.mjs';
import { lerContexto } from './share.mjs';

const $ = (id) => document.getElementById(id);
const app = $('app');
const stage = $('stage');
const cover = $('cover');
const status = $('cover-status');
const live = $('live');

const config = carregarConfig();
const motion = new MotionController();

/* ---- contexto do convite (link v1/v2, demonstração ou link inválido). Textos entram só via textContent. ---- */
const contexto = lerContexto(location.href);
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const inv = contexto.invite;
const nomeDemo = contexto.modo === 'demo' && inv && inv.name !== 'Convidado de demonstração';
const nomeConvite = inv && (contexto.modo === 'convite' || nomeDemo) ? inv.name : null;
const T = montarTextos({ nome: nomeConvite, vagas: inv ? inv.capacity : 1 });

/* ---- galeria: 0 a 20 fotos. Em demonstração, ?fotos=N simula a quantidade (só reutiliza as 2 bases provisórias). ---- */
if (contexto.modo === 'demo') {
  const q = new URL(location.href).searchParams.get('fotos');
  if (q !== null && q !== '' && Number.isFinite(Number(q))) { config.fotos = fotosProvisorias(Number(q)); config.fotosProvisorias = true; }
}
const fotos = normalizarFotos(config.fotos);
const store = $('sheet-store');
const galFolhas = montarFolhas(fotos, T.memorias, { provisorias: !!config.fotosProvisorias });
const ancora = $('gal-ancora');
galFolhas.forEach((f) => store.insertBefore(f, ancora));
// Salmos 126.5 ("semeiam em lágrimas") divide a galeria ao meio quando há 2+ folhas de memórias; senão fica antes dela.
if (galFolhas.length >= 2) store.insertBefore(store.querySelector('.sheet--verso[data-verso=v5]'), galFolhas[Math.ceil(galFolhas.length / 2)]);
store.querySelectorAll('.sheet--verso').forEach((s) => {
  const v = T.versos[s.dataset.verso];
  s.querySelector('.verso__intro').textContent = v.intro;
  s.querySelector('.verso__texto').textContent = `“${v.texto}”`;
  s.querySelector('.verso__ref').textContent = v.ref;
  s.setAttribute('aria-label', `Passagem bíblica, ${v.ref}`);
});
const planoGal = organizarFolhas(fotos.length);

const sheets = [...store.querySelectorAll('.sheet')];
const LOCAL_INDEX = sheets.findIndex((s) => s.dataset.title === 'Celebração');

const rsvp = new RsvpController({ root: $('rsvp'), stage, contexto, config, storage, reduced: () => motion.reduced });

/* ---- textos personalizados (todos vêm de textos.mjs) ---- */
function titulo(el, [a, b]) {
  const em = document.createElement('em'); em.textContent = b;
  el.replaceChildren(document.createTextNode(`${a} `), em);
}
function preencherConvite() {
  const para = $('cover-for');
  // Aviso discreto: demonstração ou link inválido. Em convite real, a capa só mostra o endereçamento no envelope.
  if (contexto.modo === 'demo') { para.textContent = nomeDemo ? `Demonstração · Para ${inv.name}` : 'Convite de demonstração'; para.classList.add('is-demo'); para.hidden = false; }
  else if (contexto.modo === 'invalido') { para.textContent = contexto.erro; para.classList.add('is-warn'); para.hidden = false; }
  $('cover-eyebrow').textContent = T.envelope.eyebrow;
  $('env-para').textContent = T.envelope.para;
  $('env-para').classList.toggle('is-longo', T.envelope.para.length > 26);

  const rev = sheets[0];
  const nome = rev.querySelector('.reveal__nome');
  nome.textContent = T.revelacao.chamada; nome.hidden = !T.revelacao.chamada;
  rev.querySelector('.reveal__frase').textContent = T.revelacao.frase;

  const cel = sheets.find((s) => s.dataset.title === 'Celebração');
  cel.querySelector('.party__fecho').textContent = T.celebracao.fecho;

  const fim = sheets.find((s) => s.classList.contains('sheet--rsvp'));
  titulo(fim.querySelector('.rsvp-cta__title'), T.final.titulo);
  fim.querySelector('.rsvp-cta__title').classList.toggle('is-longo', T.pers);
  fim.querySelector('.rsvp-cta__text').textContent = T.final.texto;
  const quem = fim.querySelector('[data-fill=para]');
  quem.textContent = inv ? `${contexto.modo === 'demo' ? 'Demonstração · ' : ''}${T.final.quem(inv.capacity)}` : '';
  quem.hidden = !quem.textContent;
  syncRascunho();
}
function syncRascunho() {
  sheets.flatMap((s) => [...s.querySelectorAll('[data-fill=rascunho]')]).forEach((el) => { el.hidden = !rsvp.temRascunho; });
}
preencherConvite();

/* ---- som: música opcional + efeitos de papel ---- */
const audio = new AudioController(config.musica);
// Efeitos: com faixa, acompanham a música (ligada = efeitos ligados). Sem faixa, o controle liga/desliga só os efeitos.
let efeitosSemFaixa = false;
const paper = new PaperSound({ ativo: () => (audio.temFaixa ? ['tocando', 'carregando'].includes(audio.state) : efeitosSemFaixa) });
const soundBtn = $('sound');
function descSom() {
  if (!audio.temFaixa && audio.pediu) {
    return efeitosSemFaixa
      ? { texto: 'Efeitos: ligados', aria: 'Efeitos sonoros ligados. Tocar para desligar', pressed: true, desabilitado: false }
      : { texto: 'Efeitos: desligados', aria: 'Efeitos sonoros desligados. Tocar para ligar', pressed: false, desabilitado: false };
  }
  return audio.descricao();
}
function syncSound(anunciar = false) {
  soundBtn.hidden = !audio.visible;
  if (!audio.visible) return;
  const d = descSom();
  $('sound-text').textContent = d.texto;
  soundBtn.setAttribute('aria-label', d.aria);
  soundBtn.setAttribute('aria-pressed', String(d.pressed));
  soundBtn.disabled = d.desabilitado;
  soundBtn.dataset.estado = audio.temFaixa ? audio.state : (efeitosSemFaixa ? 'efeitos' : 'sem-efeitos');
  if (anunciar && live) live.textContent = d.aria;
}
audio.onChange(() => syncSound(stage.dataset.state === 'reading'));
soundBtn.addEventListener('click', async () => {
  paper.desbloquear(); // dentro do gesto
  if (!audio.temFaixa) { efeitosSemFaixa = !efeitosSemFaixa; syncSound(true); return; }
  await audio.alternar();
  syncSound(true);
});
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
  // Telas altas: sobra altura além do desenho 360x640; a galeria a usa (limitada) para não deixar vazio.
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
  onTurn: (origem) => paper.virar(origem), // som de folha em cada virada (canto, arrasto, deslize, botão, teclado)
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
prev.addEventListener('click', () => book.prev('botao'));
next.addEventListener('click', () => { esconderDica(true); book.next('botao'); });
$('goto-local').addEventListener('click', () => book.goTo(LOCAL_INDEX, 'botao'));

sheets.forEach((s) => s.querySelectorAll('.rsvp-open').forEach((b) => b.addEventListener('click', () => rsvp.open(b))));
document.addEventListener('jb:rsvp', (e) => { if (!e.detail.aberto) syncRascunho(); });

/* ---- modo foco das fotos ---- */
const foco = new FocoFotos({
  root: $('foco'), stage, fotos, reduced: () => motion.reduced,
  onClose: (i) => { const k = folhaDeFoto(i); if (k >= 0 && k !== book.index) book.goTo(k, 'botao'); },
});
function folhaDeFoto(i) {
  const k = planoGal.findIndex((p) => p.indices.includes(i));
  return k < 0 ? -1 : sheets.indexOf(galFolhas[k]);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.gal__btn');
  if (!b || foco.aberto) return;
  // Toque numa zona de canto vira a folha; só o toque fora dela amplia a foto (teclado, detail 0, sempre amplia).
  if (e.detail !== 0 && book.emZonaDeCanto(e)) return;
  foco.open(Number(b.dataset.foto), b);
});

const reduceBtn = $('reduce');
function syncReduceBtn() { reduceBtn.setAttribute('aria-pressed', String(motion.userReduced || motion.systemReduced)); }
reduceBtn.addEventListener('click', () => {
  if (motion.systemReduced) return; // preferência do sistema prevalece
  motion.setUserReduced(!motion.userReduced);
});
motion.onChange(syncReduceBtn);
syncReduceBtn();

document.addEventListener('keydown', (e) => {
  if (stage.dataset.state !== 'reading' || rsvp.aberto || foco.aberto || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input,textarea,select')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); book.next('teclado'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); book.prev('teclado'); }
});

/* ---- abertura ---- */
const abertura = new Abertura({ cover, stage, sheet: sheets[0], sound: paper });
let coreo = null;
let opening = false;
// Um toque durante a animação do envelope pula para o fim.
cover.addEventListener('pointerdown', () => { if (abertura.tocando) abertura.pular(); });
document.addEventListener('keydown', () => { if (abertura.tocando) abertura.pular(); });
// Qualquer interação revela de uma vez a folha que a coreografia da música ainda estava revelando.
stage.addEventListener('pointerdown', () => coreo?.revelarTudo('interacao'), { capture: true });
document.addEventListener('keydown', () => coreo?.revelarTudo('interacao'));

async function abrir({ musica = false, em = 0 } = {}) {
  if (opening) return;
  opening = true;
  const t0 = performance.now();
  stage.dataset.state = 'opening';
  status.textContent = 'Abrindo a carta…';
  cover.setAttribute('aria-busy', 'true');
  // Tudo que depende do gesto (play, AudioContext) é chamado antes de qualquer espera.
  efeitosSemFaixa = musica && !audio.temFaixa;
  if (musica) paper.desbloquear();
  const musicaP = musica ? audio.pedirMusica() : Promise.resolve(audio.state);
  document.dispatchEvent(new CustomEvent('jb:abrir', { detail: { musica } }));
  aplicarEscala();

  const cena = em === 0 && !motion.reduced;      // carta saindo do envelope
  const comCoreo = cena && musica && audio.temFaixa; // revelação guiada pelo tempo da faixa
  const rev = sheets[0];
  if (cena) {
    if (comCoreo) rev.dataset.coreo = '1';
    else rev.classList.add('is-in', 'no-trans');   // a carta e a folha 1 já nascem iguais e reveladas
    const fim = abertura.tocar({ coreo: comCoreo });
    loadFlipLib().catch(() => {});                  // a biblioteca carrega em paralelo à animação
    await fim;
  }
  await book.open(cena ? 0 : em);
  atualizarUI(book.index, false);
  stage.dataset.state = 'reading';
  // Troca: a carta em tela cheia é idêntica à folha 1, então basta um fade curto.
  cover.classList.add(cena ? 'is-handoff' : 'is-opening');
  setTimeout(() => {
    cover.hidden = true; status.textContent = '';
    abertura.limpar();
    rev.classList.remove('no-trans');
  }, cena ? 320 : (motion.reduced ? 220 : 850));
  if (live) live.textContent = `Convite aberto. Folha ${book.index + 1} de ${sheets.length}: ${sheets[book.index].dataset.title}`;

  const depois = () => { agendarEspiada(); agendarDica(); };
  if (comCoreo) { coreo = new Coreografia({ sheet: rev, audio, t0, onFim: () => { depois(); } }); window.__v2.coreo = coreo; }
  else depois();

  await musicaP;
  syncSound(false);
  if (musica && live) {
    if (audio.state === 'sem-faixa') live.textContent = 'A música deste convite não está disponível. O convite abriu em silêncio.';
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

/* ---- pré-carregamento com a página ociosa (envelope parado): biblioteca, imagens da 1ª/2ª folha e metadados da música ---- */
function ocioso(fn) { (window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 1500))(fn); }
function precarregarImagens() {
  for (const img of [...sheets[0].querySelectorAll('img'), ...(sheets[1]?.querySelectorAll('img') ?? [])]) {
    const p = new Image();
    if (img.sizes) p.sizes = img.sizes;
    if (img.srcset) p.srcset = img.srcset;
    p.src = img.currentSrc || img.getAttribute('src');
  }
}
function aoOciar() {
  if (stage.dataset.state !== 'cover') return;
  loadFlipLib().catch(() => {});
  precarregarImagens();
  audio.prepararMetadata(); // só cabeçalho do arquivo; nada com economia de dados ou 2g
}
if (document.readyState === 'complete') ocioso(aoOciar); else window.addEventListener('load', () => ocioso(aoOciar), { once: true });

// Gancho de QA (somente leitura) para os testes automatizados.
window.__v2 = { book, motion, audio, rsvp, paper, foco, abertura, contexto, textos: T, fotos, get index() { return book.index; } };
