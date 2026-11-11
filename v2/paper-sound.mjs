// Efeitos sonoros de papel, sintetizados com Web Audio (ruído filtrado). Sem arquivos, sem bibliotecas.
// - Só funciona depois de um gesto (desbloquear() é chamado no toque de abrir ou no controle de som).
// - `ativo()` decide se o efeito pode tocar (controle de som da pessoa). Desligado = nenhum efeito.
// - Volume baixo (master 0,16) para não competir com a música. Cada chamada varia duração, banda e ganho.
// - `registro` guarda cada pedido (tipo, origem, tocou) para os testes de QA.

const rnd = (a, b) => a + Math.random() * (b - a);

export class PaperSound {
  constructor({ ativo = () => false, volume = 0.16 } = {}) {
    this.ativo = ativo;
    this.volume = volume;
    this.ctx = null;
    this.ruido = null;
    this.registro = [];
  }

  /** Cria/retoma o AudioContext. Chamar dentro de um gesto. Nunca lança. */
  async desbloquear() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx ||= new AC();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch { return false; }
  }

  #buffer() {
    if (this.ruido) return this.ruido;
    const c = this.ctx, n = Math.floor(c.sampleRate * 1.2);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (this.ruido = b);
  }

  #pode() { return !!(this.ctx && this.ctx.state === 'running' && this.volume > 0); }

  /** Camada de ruído com banda, ganho e envelope [[tempo, ganho], ...]. */
  #camada({ t0, dur, tipo = 'bandpass', f0, f1, q = 0.8, env, pico }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.#buffer();
    src.loop = true;
    const filtro = c.createBiquadFilter();
    filtro.type = tipo; filtro.Q.value = q;
    filtro.frequency.setValueAtTime(f0, t0);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    for (const [t, v] of env) g.gain.linearRampToValueAtTime(Math.max(0.0001, v * pico), t0 + t * dur);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filtro); filtro.connect(g); g.connect(this.master());
    src.start(t0, Math.random() * 0.8);
    src.stop(t0 + dur + 0.05);
    src.onended = () => { src.disconnect(); filtro.disconnect(); g.disconnect(); };
  }

  master() {
    if (!this._m) { this._m = this.ctx.createGain(); this._m.gain.value = this.volume; this._m.connect(this.ctx.destination); }
    return this._m;
  }

  #registrar(tipo, origem) {
    const tocou = this.ativo() && this.#pode();
    this.registro.push({ tipo, origem, tocou, t: Math.round(performance.now()) });
    return tocou;
  }

  /** Folha passando: "swish" de banda que sobe, fricção grave e um leve estalo no fim. */
  virar(origem = 'botao') {
    if (!this.#registrar('virar', origem)) return false;
    const c = this.ctx, t0 = c.currentTime + 0.005;
    const dur = rnd(0.30, 0.40), pico = rnd(0.8, 1);
    this.#camada({ t0, dur, f0: rnd(1500, 2100), f1: rnd(3800, 5200), q: rnd(0.6, 1.0), pico, env: [[0.18, 0.9], [0.45, 1], [0.8, 0.35]] });
    this.#camada({ t0, dur: dur * 1.1, f0: rnd(420, 560), f1: rnd(900, 1300), q: 0.7, pico: pico * 0.45, env: [[0.25, 0.8], [0.5, 1], [0.85, 0.4]] });
    // fibra do papel: pequenas variações de amplitude
    this.#camada({ t0: t0 + 0.02, dur: dur * 0.9, tipo: 'highpass', f0: 3200, f1: 3600, q: 0.5, pico: pico * 0.22, env: [[0.1, 1], [0.2, 0.3], [0.32, 0.9], [0.45, 0.25], [0.6, 0.7], [0.8, 0.2]] });
    // estalo curto quando a folha assenta
    this.#camada({ t0: t0 + dur * 0.9, dur: 0.045, tipo: 'bandpass', f0: rnd(2200, 3000), f1: 1800, q: 1.2, pico: pico * 0.5, env: [[0.08, 1], [0.4, 0.4]] });
    return true;
  }

  /** Selo de cera cedendo: estalo seco e um pequeno corpo grave. */
  selo(origem = 'abertura') {
    if (!this.#registrar('selo', origem)) return false;
    const c = this.ctx, t0 = c.currentTime + 0.005;
    this.#camada({ t0, dur: 0.07, f0: rnd(1800, 2400), f1: 900, q: 1.4, pico: 0.9, env: [[0.06, 1], [0.35, 0.35]] });
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(rnd(150, 190), t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(g); g.connect(this.master()); o.start(t0); o.stop(t0 + 0.14);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    return true;
  }

  /** Aba do envelope abrindo (roce suave e mais grave) e carta deslizando para fora (swish longo e baixo). */
  aba(origem = 'abertura') {
    if (!this.#registrar('aba', origem)) return false;
    const t0 = this.ctx.currentTime + 0.005, dur = rnd(0.42, 0.5);
    this.#camada({ t0, dur, f0: rnd(500, 650), f1: rnd(1400, 1800), q: 0.7, pico: 0.7, env: [[0.3, 0.8], [0.55, 1], [0.85, 0.3]] });
    return true;
  }
  carta(origem = 'abertura') {
    if (!this.#registrar('carta', origem)) return false;
    const t0 = this.ctx.currentTime + 0.005, dur = rnd(0.7, 0.85);
    this.#camada({ t0, dur, f0: rnd(900, 1200), f1: rnd(2600, 3400), q: 0.6, pico: 0.75, env: [[0.25, 0.6], [0.55, 1], [0.9, 0.25]] });
    this.#camada({ t0, dur, f0: 380, f1: 800, q: 0.6, pico: 0.35, env: [[0.3, 0.7], [0.6, 1], [0.9, 0.3]] });
    return true;
  }
}
