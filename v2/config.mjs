// Configuração pública da V2. NÃO colocar telefone, tokens ou lista de convidados aqui.
// O destino do WhatsApp nunca é configurado: o convidado escolhe o contato no próprio WhatsApp.
import { fotosProvisorias } from './fotos.mjs';

const base = {
  casal: 'Jezriel e Beatriz',
  dataTexto: '27/03/2027',
  /**
   * Trilha do convite (AAC 96 kbps, corte que já começa perto do refrão), em site/v2/audio/.
   * Se o arquivo faltar no pacote, o convite funciona sem música ("Sem música").
   */
  musica: { src: 'audio/musica-convite-jezriel-e-beatriz.m4a', titulo: 'Música do convite', inicioSegundos: 0, loop: true, volumeInicial: 0.5 },
  /**
   * Fotos da galeria (0 a 20). Cada item: { src, srcset?, alt, legenda?, foco? } (foco = object-position, ex.: '30% 20%').
   * Sem fotos, a folha de memórias não existe. Enquanto as fotos do casal não chegam, entram 3 imagens PROVISÓRIAS
   * (recortes das duas bases de demonstração). Em demonstração, ?fotos=N simula de 0 a 20.
   */
  // Prévia local para o casal (12/11/2026): as 3 fotos enviadas, repetidas em alternância até o limite de 20.
  // As fotos ficam em assets/fotos/ (fora do Git e fora do pacote público até autorização de publicação).
  fotos: Array.from({ length: 20 }, (_, i) => {
    const n = (i % 3) + 1;
    return { src: `assets/fotos/casal-${n}-480.webp`, srcset: `assets/fotos/casal-${n}-480.webp 480w, assets/fotos/casal-${n}-960.webp 960w`, w: 480, h: 854, alt: 'Jezriel e Beatriz', foco: '50% 38%' };
  }),
  fotosProvisorias: false,
};

/** Gancho de QA: window.__JB_V2_CONFIG__ (definido antes do módulo) mescla a configuração, só no navegador de teste. */
export function carregarConfig() {
  const extra = (typeof window !== 'undefined' && window.__JB_V2_CONFIG__) || {};
  return { ...base, ...extra, musica: { ...base.musica, ...(extra.musica || {}) } };
}
