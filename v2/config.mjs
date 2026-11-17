// Configuração pública da V2. NÃO colocar tokens ou lista de convidados aqui.
// WhatsApp de destino: número do noivo informado e autorizado por Will em 17/11/2026 (ver DECISOES.md).
// Vazio = o convidado escolhe o contato no próprio WhatsApp (comportamento anterior).
import { fotosProvisorias } from './fotos.mjs?v=202611171705';

const base = {
  casal: 'Jezriel e Beatriz',
  dataTexto: '27/03/2027',
  whatsapp: '558781324530',
  /**
   * Trilha instrumental do convite (Will, 17/11/2026; AAC 96 kbps, sem metadados), em site/v2/audio/.
   * Se o arquivo faltar no pacote, o convite funciona sem música ("Sem música").
   */
  musica: { src: 'audio/musica-convite-instrumental.m4a', titulo: 'Música do convite', inicioSegundos: 0, loop: true, volumeInicial: 0.5 },
  /**
   * Fotos da galeria (0 a 20). Cada item: { src, srcset?, alt, legenda?, foco? } (foco = object-position, ex.: '30% 20%').
   * Sem fotos, a folha de memórias não existe. Enquanto as fotos do casal não chegam, entram 3 imagens PROVISÓRIAS
   * (recortes das duas bases de demonstração). Em demonstração, ?fotos=N simula de 0 a 20.
   */
  // Prévia local para o casal (12/11/2026): as 3 fotos enviadas, repetidas em alternância até o limite de 20.
  // As fotos ficam em assets/fotos/ (fora do Git e fora do pacote público até autorização de publicação).
  // 17/11/2026: uma foto entre cada versículo (3 fotos do casal, sem repetição).
  fotos: [1, 2, 3].map((n) => ({ src: `assets/fotos/casal-${n}-480.webp`, srcset: `assets/fotos/casal-${n}-480.webp 480w, assets/fotos/casal-${n}-960.webp 960w`, w: 480, h: 854, alt: 'Jezriel e Beatriz', foco: '50% 38%' })),
  fotosProvisorias: false,
};

/** Gancho de QA: window.__JB_V2_CONFIG__ (definido antes do módulo) mescla a configuração, só no navegador de teste. */
export function carregarConfig() {
  const extra = (typeof window !== 'undefined' && window.__JB_V2_CONFIG__) || {};
  return { ...base, ...extra, musica: { ...base.musica, ...(extra.musica || {}) } };
}
