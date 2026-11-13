// Textos do convite V2, todos num só lugar para o casal ajustar depois (ver docs/V2-TEXTOS.md).
//
// montarTextos({ nome, vagas }) devolve as frases já resolvidas:
//   nome  = nome do titular do link (ou null: versão genérica, sem convite/demonstração sem nome)
//   vagas = capacidade do convite (1 = singular "você"; 2 ou mais = plural "vocês")
// O nome entra SEMPRE como texto (textContent), nunca como HTML. Frases com duas partes (texto + destaque em
// itálico) são pares [normal, destaque]; a página monta o destaque com <em>.

export function montarTextos({ nome = null, vagas = 1 } = {}) {
  const n = nome ? String(nome).trim() : '';
  const plural = Number(vagas) > 1;
  const voce = plural ? 'vocês' : 'você';
    const ao = plural ? 'ao lado de vocês' : 'ao seu lado';
  const pers = Boolean(n);

  return {
    pers,
    plural,
    // ---- Envelope (capa)
    envelope: {
      eyebrow: 'Uma carta para você',
      para: pers ? `Para ${n}` : 'Para você',
      selo: 'Romper o selo e abrir em silêncio',
    },
    // ---- Folha 1: revelação. [nome com vírgula, resto da frase]
    revelacao: {
      chamada: pers ? `${n},` : '',
      frase: pers ? `há uma data que queremos viver ${ao}` : 'Há uma data que queremos viver ao seu lado',
    },
    // ---- Memórias: título [normal, destaque]
    memorias: {
      eyebrow: 'Memórias',
      titulo: pers
        ? ['Pedaços da nossa história,', `que queremos dividir com ${voce}.`]
        : ['Pedaços de afeto,', 'guardados com carinho.'],
      continuacao: 'Mais memórias',
      provisorias: 'Imagens provisórias. As fotos do casal entram aqui.',
    },
    // ---- Celebração
    celebracao: {
      eyebrow: 'Guarde esta data',
      fecho: plural ? 'E a presença de vocês faz parte dela.' : 'E a sua presença faz parte dela.',
    },
    // ---- Passagens bíblicas (Salmos 126, tradução ARA conforme enviada por Will em 12/11/2026).
    // Cada uma tem uma folha própria de destaque. `intro` é a ponte contextual na voz do casal (rascunho para revisão).
    versos: {
      v3: {
        intro: 'Quando olhamos para o caminho até aqui, só conseguimos dizer:',
        texto: 'Grandes coisas fez o Senhor por nós, e, por isso, estamos alegres.',
        ref: 'Salmos 126.3',
      },
      v5: {
        intro: 'Ao longo desta história, aprendemos que',
        texto: 'Os que semeiam em lágrimas segarão com alegria.',
        ref: 'Salmos 126.5',
      },
      v6: {
        intro: 'E agora chegou o tempo da colheita.',
        texto: 'Aquele que leva a preciosa semente, andando e chorando, voltará, sem dúvida, com alegria, trazendo consigo os seus molhos.',
        ref: 'Salmos 126.6',
      },
      v2: {
        intro: plural ? 'Queremos vocês entre os que vão ver isso de perto:' : 'Queremos você entre os que vão ver isso de perto:',
        texto: 'Então, a nossa boca se encheu de riso, e a nossa língua, de cânticos; então, se dizia entre as nações: Grandes coisas fez o Senhor a estes.',
        ref: 'Salmos 126.2',
      },
    },
    // ---- Folha final: título [normal, destaque]
    final: {
      eyebrow: 'Sua presença',
      titulo: pers ? [`${n},`, `guardamos um lugar para ${voce}.`] : ['Vamos', 'comemorar juntos?'],
      quem: (cap) => (cap === 1 ? 'Um lugar reservado neste convite.' : `Até ${cap} lugares reservados neste convite.`),
      texto: plural || !pers
        ? 'Responda por você e pelas pessoas do seu convite. Você revisa a mensagem e escolhe o contato do noivo ou da noiva no WhatsApp.'
        : 'Responda por você. Você revisa a mensagem e escolhe o contato do noivo ou da noiva no WhatsApp.',
    },
  };
}
