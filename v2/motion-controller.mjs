// Revelações por linha, antecipação de imagens e preferência de redução de movimento.
// Não conhece a biblioteca de folhas: só recebe a folha (elemento) que acabou de chegar.

const CHAVE = 'jb-v2-reduzir-efeitos';

function lerPreferencia() {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
function gravarPreferencia(v) {
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* armazenamento indisponível: sem persistência */ }
}

export class MotionController {
  constructor(root = document.documentElement) {
    this.root = root;
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.userReduced = lerPreferencia();
    this.listeners = new Set();
    const aoMudar = () => this.#apply();
    this.mq.addEventListener?.('change', aoMudar);
    this.#apply(false);
  }

  get reduced() { return this.mq.matches || this.userReduced; }
  get systemReduced() { return this.mq.matches; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setUserReduced(v) {
    this.userReduced = !!v;
    gravarPreferencia(this.userReduced);
    this.#apply();
  }

  #apply(notify = true) {
    this.root.classList.toggle('reduce', this.reduced);
    if (notify) this.listeners.forEach((fn) => fn(this.reduced));
  }

  /** Marca a folha como revelada. O CSS cuida de linhas, atrasos e redução. Fica revelada ao voltar. */
  activate(sheet) {
    if (!sheet) return;
    // requestAnimationFrame garante que o estado inicial (oculto) tenha sido pintado antes da transição.
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-in')));
  }

  /** Carrega com antecedência as imagens da folha seguinte (elas nascem lazy e fora da tela). */
  prefetch(sheet) {
    sheet?.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  }
}
