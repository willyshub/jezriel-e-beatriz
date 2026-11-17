// Painel de resposta (RSVP) sobre o cenário, FORA do livro (sem captura de gestos de folha).
// Nunca usa innerHTML com dados do convite/link/rascunho: tudo via textContent/atributos.
import { validatePeople } from '../domain.mjs?v=202611171705';
import { montarMensagem, linkWhatsApp, chaveRascunho, lerRascunho, gravarRascunho, mensagemAlternativa } from './share.mjs?v=202611171705';

const STATUS = [
  { v: 'vai', rotulo: 'Vou' },
  { v: 'nao', rotulo: 'Não vou' },
];
// "Ainda não sei" removido (Will, 17/11/2026). Rascunhos antigos com "pendente" voltam sem resposta marcada.

function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
  return el;
}

export class RsvpController {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root    contêiner do painel (hidden)
   * @param {HTMLElement} o.stage   palco (recebe inert enquanto o painel está aberto)
   * @param {{modo:string,invite:object,erro?:string}} o.contexto
   * @param {{casal:string,dataTexto:string}} o.config
   * @param {Storage|null} [o.storage]
   * @param {()=>boolean} [o.reduced]
   */
  constructor({ root, stage, contexto, config, storage = null, reduced = () => false }) {
    Object.assign(this, { root, stage, contexto, config, reduced });
    this.storage = storage;
    this.demo = contexto.modo === 'demo';
    this.card = root.querySelector('.rsvp__card');
    this.body = root.querySelector('.rsvp__body');
    this.titulo = root.querySelector('.rsvp__title');
    this.badge = root.querySelector('.rsvp__badge');
    this.opener = null;
    this.aberto = false;
    this.view = 'form';
    this.saveT = 0;
    this.aviso = '';
    this.waAberto = false;
    this.rascunhoEncontrado = false;
    if (contexto.invite) {
      this.chave = chaveRascunho(contexto.modo, contexto.invite.id);
      this.#iniciarPessoas();
    }
    root.querySelector('.rsvp__close').addEventListener('click', () => this.close());
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    // O teclado virtual reduz a área visível do painel.
    window.visualViewport?.addEventListener('resize', () => this.#ajustarViewport());
  }

  get invite() { return this.contexto.invite; }
  get temRascunho() { return !!(this.invite && this.#carregar()); }

  #carregar() { return this.storage && this.invite ? lerRascunho(this.storage, this.chave, this.invite) : null; }

  #iniciarPessoas() {
    const inv = this.invite;
    const base = Array.from({ length: inv.capacity }, (_, i) => ({
      name: i === 0 ? inv.name : (inv.acompanhantes?.[i - 1] ?? ''),
      status: '',
    }));
    const rasc = this.#carregar();
    this.people = rasc ? rasc.people.map((p) => ({ ...p, status: p.status === 'pendente' ? '' : p.status })) : base;
    this.waAberto = !!rasc?.wa;
    this.rascunhoEncontrado = !!rasc;
  }

  #salvar(imediato = false) {
    if (!this.storage || !this.invite) return;
    clearTimeout(this.saveT);
    const f = () => gravarRascunho(this.storage, this.chave, { people: this.people, wa: this.waAberto });
    if (imediato) f(); else this.saveT = setTimeout(f, 250);
  }

  /* ------------------------------------------------------------ abrir/fechar */
  open(opener) {
    if (this.aberto) return;
    this.opener = opener || document.activeElement;
    this.aberto = true;
    clearTimeout(this.hideT);
    this.root.hidden = false;
    this.stage.inert = true;
    this.#montarCabecalho();
    if (!this.invite) { this.view = 'erro-link'; this.alt ??= { nome: '', vai: '', pessoas: 1 }; }
    else {
      this.view = 'form';
      this.aviso = this.waAberto
        ? 'Você já abriu o WhatsApp antes com uma resposta. Se mudar algo, confirme de novo.'
        : (this.rascunhoEncontrado ? 'Encontramos um rascunho salvo neste aparelho. Você pode continuar ou editar.' : '');
    }
    this.#render();
    this.#ajustarViewport();
    requestAnimationFrame(() => {
      this.root.classList.add('is-open');
      this.titulo.focus({ preventScroll: true });
    });
    document.dispatchEvent(new CustomEvent('jb:rsvp', { detail: { aberto: true } }));
  }

  close() {
    if (!this.aberto) return;
    this.aberto = false;
    this.#salvar(true);
    this.root.classList.remove('is-open');
    this.stage.inert = false;
    const fim = () => { if (!this.aberto) this.root.hidden = true; };
    this.hideT = setTimeout(fim, this.reduced() ? 20 : 320);
    const alvo = this.opener && document.contains(this.opener) ? this.opener : document.getElementById('next');
    alvo?.focus?.({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('jb:rsvp', { detail: { aberto: false } }));
  }

  #ajustarViewport() {
    const vv = window.visualViewport;
    if (!vv || !this.aberto) { this.root.style.removeProperty('--vvh'); return; }
    this.root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
  }

  #montarCabecalho() {
    this.badge.textContent = this.demo ? 'Convite de demonstração' : 'Responder ao convite';
    this.badge.classList.toggle('is-demo', this.demo);
  }

  /* ------------------------------------------------------------ renderização */
  #render() {
    this.body.replaceChildren();
    this.erroResumo = null;
    if (this.view === 'erro-link') return this.#viewErroLink();
    if (this.view === 'enviado') return this.#viewEnviado();
    return this.#viewForm();
  }

  /** Link inválido/incompleto: o convidado não fica preso. Responde digitando o nome e a quantidade, direto no WhatsApp. */
  #viewErroLink() {
    const a = this.alt;
    const codigo = this.contexto.codigo || 'U';
    this.titulo.textContent = 'Responder mesmo assim';
    const erro = h('p', { class: 'person__error', hidden: true, role: 'alert' });
    const nome = h('input', { type: 'text', id: 'alt-nome', class: 'field', maxlength: '100', autocomplete: 'name', autocapitalize: 'words', placeholder: 'Seu nome' });
    nome.value = a.nome;
    nome.addEventListener('input', () => { a.nome = nome.value; erro.hidden = true; });
    const grupo = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Sua resposta' });
    const qtd = h('select', { id: 'alt-qtd', class: 'field' });
    for (let n = 1; n <= 10; n++) qtd.append(h('option', { value: n }, n === 1 ? 'Só eu' : `${n} pessoas (incluindo eu)`));
    qtd.value = String(a.pessoas);
    qtd.addEventListener('change', () => { a.pessoas = Number(qtd.value); });
    const blocoQtd = h('div', { hidden: a.vai !== 'vai' }, h('label', { class: 'field__label', for: 'alt-qtd' }, 'Quantas pessoas do seu convite vão?'), qtd);
    for (const st of STATUS) {
      const input = h('input', { type: 'radio', name: 'alt-st', id: `alt-${st.v}`, value: st.v });
      input.checked = a.vai === st.v;
      input.addEventListener('change', () => { a.vai = st.v; blocoQtd.hidden = st.v !== 'vai'; erro.hidden = true; });
      grupo.append(h('label', { class: 'seg__opt', for: `alt-${st.v}` }, input, h('span', {}, st.rotulo)));
    }
    const form = h('form', { class: 'rsvp__form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const falta = !a.nome.trim() ? 'Escreva seu nome.' : !a.vai ? 'Marque se você vai ou não.' : '';
      if (falta) { erro.textContent = falta; erro.hidden = false; (a.nome.trim() ? grupo.querySelector('input') : nome).focus(); return; }
      const msg = mensagemAlternativa({ nome: a.nome, vai: a.vai === 'vai', pessoas: a.vai === 'vai' ? a.pessoas : 0, casal: this.config.casal, dataTexto: this.config.dataTexto, codigo });
      this.#enviar(msg);
    } },
      h('fieldset', { class: 'person' }, h('legend', { class: 'person__legend' }, 'Seu nome'), nome),
      h('fieldset', { class: 'person' }, h('legend', { class: 'person__legend' }, 'Você vai?'), grupo, blocoQtd),
      erro,
      h('button', { type: 'submit', class: 'btn btn--primary rsvp__submit' }, 'Confirmar no WhatsApp'),
    );
    this.body.append(
      h('p', { class: 'rsvp__lead' }, 'O link deste convite não abriu por completo, mas você pode responder agora mesmo.'),
      form,
      h('p', { class: 'rsvp__hint' }, `Se preferir, peça o link novamente aos noivos. Código para os noivos: ${codigo}.`),
    );
  }

  #viewForm() {
    const inv = this.invite;
    this.titulo.textContent = 'Confirmar presença';
    const vagas = inv.capacity === 1 ? '1 pessoa' : `até ${inv.capacity} pessoas`;
    this.body.append(
      h('p', { class: 'rsvp__lead' }, this.demo
        ? `Convite de demonstração, com ${vagas}. As mensagens levam o prefixo [TESTE].`
        : `Convite de ${inv.name}, para ${vagas}, incluindo você.`),
    );
    if (this.aviso) this.body.append(h('p', { class: 'rsvp__notice', role: 'status' }, this.aviso));
    this.erroResumo = h('div', { class: 'rsvp__errors', role: 'alert', tabindex: '-1', hidden: true });
    this.body.append(this.erroResumo);

    const form = h('form', { class: 'rsvp__form', novalidate: true, autocomplete: 'off', onsubmit: (e) => { e.preventDefault(); this.#confirmar(); } });
    this.people.forEach((p, i) => form.append(this.#pessoa(p, i)));
    form.append(
      h('button', { type: 'submit', class: 'btn btn--primary rsvp__submit' }, 'Confirmar no WhatsApp'),
      h('p', { class: 'rsvp__hint' }, 'O WhatsApp abre com a mensagem pronta para o noivo. Toque em enviar para concluir.'),
    );
    this.body.append(form);
  }

  #pessoa(p, i) {
    const titular = i === 0;
    const legenda = titular ? 'Você' : `Acompanhante ${i}`;
    const fs = h('fieldset', { class: 'person', 'data-i': i });
    fs.append(h('legend', { class: 'person__legend' }, legenda));
    if (titular) fs.append(h('p', { class: 'person__name' }, this.invite.name));
    const grupo = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Resposta de ${titular ? this.invite.name : legenda.toLowerCase()}` });
    for (const s of STATUS) {
      const id = `st-${i}-${s.v}`;
      const input = h('input', { type: 'radio', name: `st-${i}`, id, value: s.v });
      input.checked = p.status === s.v;
      input.addEventListener('change', () => { this.people[i].status = s.v; this.#limparErro(i); this.#salvar(true); });
      grupo.append(h('label', { class: 'seg__opt', for: id }, input, h('span', {}, s.rotulo)));
    }
    fs.append(grupo);
    if (!titular) {
      const id = `nome-${i}`;
      const nome = h('input', { type: 'text', id, class: 'field', maxlength: '100', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'data-nome': i, placeholder: 'Nome completo do acompanhante' });
      nome.value = p.name;
      nome.addEventListener('input', () => { this.people[i].name = nome.value; this.#limparErro(i); this.#salvar(); });
      fs.append(h('label', { class: 'field__label', for: id }, `Nome do acompanhante ${i}`, h('small', {}, ' (obrigatório se for)')), nome);
    }
    fs.append(h('p', { class: 'person__error', id: `err-${i}`, hidden: true }));
    return fs;
  }

  #limparErro(i) {
    const e = this.body.querySelector(`#err-${i}`);
    if (e) { e.hidden = true; e.textContent = ''; }
  }

  /* ------------------------------------------------------------ validação */
  /** Retorna lista de erros { i, campo: 'status'|'nome', msg }. Vazia = válido para revisão. */
  validar() {
    const erros = [];
    const going = new Map();
    this.people.forEach((p, i) => {
      const nome = String(p.name ?? '').trim();
      const quem = i === 0 ? 'você' : `Acompanhante ${i}`;
      if (!p.status) erros.push({ i, campo: 'status', msg: `Responda por ${quem}.` });
      else if (p.status === 'vai' && !nome) erros.push({ i, campo: 'nome', msg: `Escreva o nome de Acompanhante ${i}, que vai comparecer.` });
      if (nome.length > 100) erros.push({ i, campo: 'nome', msg: 'Use nomes com até 100 caracteres.' });
      if (p.status === 'vai' && nome) {
        const k = nome.toLocaleLowerCase('pt-BR');
        if (going.has(k)) erros.push({ i, campo: i === 0 ? 'status' : 'nome', msg: `O nome “${nome}” se repete entre as pessoas que vão. Diferencie os nomes.` });
        else going.set(k, i);
      }
    });
    return erros;
  }

  #mostrarErros(erros) {
    this.body.querySelectorAll('.person__error').forEach((e) => { e.hidden = true; e.textContent = ''; });
    for (const er of erros) {
      const el = this.body.querySelector(`#err-${er.i}`);
      if (el) { el.hidden = false; el.textContent = el.textContent ? `${el.textContent} ${er.msg}` : er.msg; }
    }
    this.erroResumo.hidden = false;
    this.erroResumo.replaceChildren(
      h('strong', {}, erros.length === 1 ? 'Há 1 ponto para ajustar:' : `Há ${erros.length} pontos para ajustar:`),
      h('ul', {}, erros.map((er) => h('li', {}, er.msg))),
    );
    const primeiro = erros[0];
    const alvo = primeiro.campo === 'nome'
      ? this.body.querySelector(`[data-nome="${primeiro.i}"]`)
      : this.body.querySelector(`input[name="st-${primeiro.i}"]`);
    (alvo || this.erroResumo).focus();
  }

  #normalizadas() {
    return this.people.map((p, i) => ({ name: i === 0 ? this.invite.name : String(p.name ?? '').trim(), status: p.status }));
  }

  mensagem() {
    return montarMensagem(this.invite, this.#normalizadas(), { casal: this.config.casal, dataTexto: this.config.dataTexto, demo: this.demo });
  }

  #confirmar() {
    const erros = this.validar();
    if (erros.length) return this.#mostrarErros(erros);
    let msg;
    try { validatePeople(this.invite, this.#normalizadas()); msg = this.mensagem(); } catch (e) {
      this.erroResumo.hidden = false; this.erroResumo.textContent = e.message; this.erroResumo.focus(); return;
    }
    this.#enviar(msg);
  }

  /** Abre o WhatsApp (no próprio toque, para não ser bloqueado) e mostra a conclusão com alternativas. */
  #enviar(msg) {
    const url = linkWhatsApp(msg, this.config.whatsapp);
    this.ultima = { msg, url };
    this.waAberto = true;
    this.aviso = '';
    this.#salvar(true);
    let janela = null;
    try { janela = window.open(url, '_blank', 'noopener'); } catch { /* bloqueado */ }
    this.view = 'enviado';
    this.#render();
    this.card.scrollTop = 0;
    this.titulo.focus({ preventScroll: true });
    // Com 'noopener' alguns navegadores retornam null mesmo abrindo; por isso só navega na própria aba se a página
    // continuar visível (nova aba/app não abriu). O rascunho já está salvo.
    if (!janela && !window.__JB_V2_NO_NAV__) setTimeout(() => { if (!document.hidden) { try { location.href = url; } catch { /* segue a tela */ } } }, 700);
  }

  #viewEnviado() {
    const { msg, url } = this.ultima;
    this.titulo.textContent = 'Falta só enviar';
    const copiaStatus = h('p', { class: 'rsvp__hint', role: 'status', id: 'copia-status' });
    const area = h('textarea', { class: 'field review__msg', id: 'msg', readonly: true, rows: '7' });
    area.value = msg;
    const tel = String(this.config.whatsapp || '').replace(/\D/g, '');
    const telFmt = tel.length >= 12 ? `+${tel.slice(0, 2)} ${tel.slice(2, 4)} ${tel.slice(4, -4)}-${tel.slice(-4)}` : '';
    this.body.append(
      h('p', { class: 'rsvp__lead rsvp__lead--strong' }, 'O WhatsApp foi aberto com sua mensagem. Toque em enviar lá para concluir.'),
      h('a', { class: 'btn btn--primary', id: 'wa-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir o WhatsApp de novo'),
      h('button', { type: 'button', class: 'btn btn--ghost', id: 'copiar', onclick: () => this.#copiar(msg, area, copiaStatus) }, 'Copiar mensagem'),
      copiaStatus,
      telFmt ? h('p', { class: 'rsvp__hint' }, `Se o WhatsApp não abrir, copie a mensagem e envie para o noivo: ${telFmt}.`) : null,
      h('label', { class: 'field__label', for: 'msg' }, 'Sua mensagem'),
      area,
      h('button', { type: 'button', class: 'btn btn--link', id: 'editar', onclick: () => this.#editar() }, 'Mudar resposta'),
    );
  }

  #editar() {
    this.view = this.invite ? 'form' : 'erro-link';
    this.aviso = 'Se mudar algo, confirme de novo para enviar a mensagem atualizada.';
    this.#render();
    this.card.scrollTop = 0;
    this.titulo.focus({ preventScroll: true });
  }

  async #copiar(msg, area, status) {
    try {
      await navigator.clipboard.writeText(msg);
      status.textContent = 'Mensagem copiada.';
    } catch {
      try {
        area.focus(); area.select();
        const ok = document.execCommand?.('copy');
        status.textContent = ok ? 'Mensagem copiada.' : 'Não foi possível copiar automaticamente. A mensagem está selecionada: copie manualmente.';
      } catch {
        status.textContent = 'Não foi possível copiar automaticamente. Selecione o texto da mensagem e copie manualmente.';
      }
    }
  }
}
