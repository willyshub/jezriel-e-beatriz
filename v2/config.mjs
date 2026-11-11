// Configuração pública da V2. NÃO colocar telefone, tokens ou lista de convidados aqui.
// O destino do WhatsApp nunca é configurado: o convidado escolhe o contato no próprio WhatsApp.
const base = {
  casal: 'Jezriel e Beatriz',
  dataTexto: '27/03/2027',
  /** Trilha opcional. `src` vazio = sem música (Will fornecerá o arquivo em assets/audio/). */
  musica: { src: '', titulo: '', inicioSegundos: 0, loop: true, volumeInicial: 0.5 },
};

/** Gancho de QA: window.__JB_V2_CONFIG__ (definido antes do módulo) mescla a configuração, só no navegador de teste. */
export function carregarConfig() {
  const extra = (typeof window !== 'undefined' && window.__JB_V2_CONFIG__) || {};
  return { ...base, ...extra, musica: { ...base.musica, ...(extra.musica || {}) } };
}
