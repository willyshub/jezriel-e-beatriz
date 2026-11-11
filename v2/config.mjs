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
  fotos: fotosProvisorias(3),
  fotosProvisorias: true,
};

/** Gancho de QA: window.__JB_V2_CONFIG__ (definido antes do módulo) mescla a configuração, só no navegador de teste. */
export function carregarConfig() {
  const extra = (typeof window !== 'undefined' && window.__JB_V2_CONFIG__) || {};
  return { ...base, ...extra, musica: { ...base.musica, ...(extra.musica || {}) } };
}
