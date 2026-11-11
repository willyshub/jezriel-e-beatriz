// Música opcional: um único <audio preload="none"> persistente (fora do livro; nunca recriado por folha).
// Estados: sem-faixa | desligada | tocando | pausada (pessoa) | pausada-aba | bloqueada | erro
// Regras: nada baixa antes de pedir música; falha/bloqueio nunca impede abrir; pausa ao ocultar a aba e
// OFERECE retomada (sem reabrir); nunca retoma sozinho após a pessoa silenciar.

export class AudioController {
  constructor(cfg = {}, { doc = document } = {}) {
    this.cfg = { src: '', titulo: '', inicioSegundos: 0, loop: true, volumeInicial: 0.5, ...cfg };
    this.doc = doc;
    this.state = 'desligada';
    this.pediu = false;            // a pessoa pediu música em algum momento
    this.listeners = new Set();
    this.audio = null;
    this.fadeT = 0;
    this.src = this.#validarSrc(this.cfg.src);
    if (!this.src) this.state = 'sem-faixa';
    doc.addEventListener('visibilitychange', () => this.#aoVisibilidade());
    window.addEventListener('pagehide', () => { if (this.state === 'tocando') this.#pausarInterno('pausada-aba'); });
  }

  /** Aceita apenas arquivo do mesmo site (sem origem externa). */
  #validarSrc(src) {
    if (!src || typeof src !== 'string') return '';
    try {
      const u = new URL(src, location.href);
      return u.origin === location.origin ? u.href : '';
    } catch { return ''; }
  }

  get temFaixa() { return !!this.src; }
  /** O controle aparece quando há faixa ou quando a pessoa pediu música e não existe faixa. */
  get visible() { return this.temFaixa || this.pediu; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #set(s) { if (s === this.state) return; this.state = s; this.listeners.forEach((fn) => fn(s)); }

  #criar() {
    if (this.audio) return this.audio;
    const a = this.doc.createElement('audio');
    a.preload = 'none';
    a.hidden = true;
    a.setAttribute('aria-hidden', 'true');
    a.loop = false; // o laço é manual para respeitar `inicioSegundos`
    a.addEventListener('ended', () => {
      if (!this.cfg.loop || this.state !== 'tocando') return;
      try { a.currentTime = this.#inicio(); a.play().catch(() => this.#set('bloqueada')); } catch { /* ok */ }
    });
    a.addEventListener('error', () => { if (this.audio?.src) this.#set('erro'); });
    this.doc.body.append(a);
    this.audio = a;
    return a;
  }
  #inicio() { const n = Number(this.cfg.inicioSegundos); return Number.isFinite(n) && n > 0 ? n : 0; }

  /**
   * Chamar DENTRO do gesto "Abrir com música". Nunca lança: sem faixa ou bloqueio, o convite abre normalmente.
   * @returns {Promise<string>} estado resultante
   */
  async pedirMusica() {
    this.pediu = true;
    if (!this.src) { this.#set('sem-faixa'); this.listeners.forEach((fn) => fn(this.state)); return this.state; }
    return this.tocar();
  }

  /** Inicia/retoma a reprodução (gesto da pessoa). */
  async tocar() {
    if (!this.src) return this.state;
    const a = this.#criar();
    if (!a.src) {
      a.src = this.src;
      const ini = this.#inicio();
      if (ini > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = ini; } catch { /* ok */ } }, { once: true });
    }
    const alvo = Math.max(0, Math.min(1, Number(this.cfg.volumeInicial) || 0.5));
    a.volume = 0;
    try {
      await a.play();
      this.#set('tocando');
      this.#fadeIn(a, alvo);
    } catch (e) {
      a.volume = alvo;
      this.#set(e?.name === 'NotAllowedError' ? 'bloqueada' : 'erro');
    }
    return this.state;
  }

  #fadeIn(a, alvo) {
    clearInterval(this.fadeT);
    const passos = 12; let k = 0;
    this.fadeT = setInterval(() => {
      k += 1; a.volume = Math.min(alvo, (alvo * k) / passos);
      if (k >= passos) clearInterval(this.fadeT);
    }, 50);
  }

  #pausarInterno(novo) {
    clearInterval(this.fadeT);
    try { this.audio?.pause(); } catch { /* ok */ }
    this.#set(novo);
  }

  /** Silenciar por escolha da pessoa: nunca retoma sozinho. */
  silenciar() { if (this.audio) this.#pausarInterno('pausada'); }

  /** Botão do controle: alterna conforme o estado. */
  alternar() {
    if (this.state === 'tocando') { this.silenciar(); return Promise.resolve(this.state); }
    if (this.state === 'sem-faixa') return Promise.resolve(this.state);
    this.pediu = true;
    return this.tocar();
  }

  #aoVisibilidade() {
    if (this.doc.hidden) { if (this.state === 'tocando') this.#pausarInterno('pausada-aba'); }
    // Ao voltar: permanece 'pausada-aba' e o controle oferece "Retomar" (sem reabrir o envelope, sem tocar sozinho).
  }

  /** Rótulos para o controle de som: texto curto visível + descrição acessível. */
  descricao() {
    const t = this.cfg.titulo ? ` (${this.cfg.titulo})` : '';
    switch (this.state) {
      case 'tocando': return { texto: 'Som: ligado', aria: `Música tocando${t}. Tocar para pausar`, pressed: true, desabilitado: false };
      case 'pausada': return { texto: 'Som: pausado', aria: `Música pausada${t}. Tocar para ouvir`, pressed: false, desabilitado: false };
      case 'pausada-aba': return { texto: 'Retomar som', aria: `Música pausada ao sair da aba${t}. Tocar para retomar`, pressed: false, desabilitado: false };
      case 'bloqueada': return { texto: 'Tocar som', aria: 'O navegador bloqueou a música. Tocar para tentar de novo', pressed: false, desabilitado: false };
      case 'erro': return { texto: 'Som indisponível', aria: 'Não foi possível carregar a música. Tocar para tentar de novo', pressed: false, desabilitado: false };
      case 'sem-faixa': return { texto: 'Sem música', aria: 'A música deste convite ainda não foi adicionada', pressed: false, desabilitado: true };
      default: return { texto: 'Som: desligado', aria: `Música desligada${t}. Tocar para ouvir`, pressed: false, desabilitado: false };
    }
  }
}
