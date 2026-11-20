// Lista de presentes (dados públicos; nada de convidados). Como preencher: docs/V2-PRESENTES.md.
//
// Cada item:
//   nome      obrigatório, até 90 caracteres
//   link      link de afiliado do Mercado Livre (https://mercadolivre.com/sec/... ou o link longo do produto)
//   imagem    URL https da foto do produto (no anúncio: tocar e segurar a foto > copiar endereço da imagem)
//   preco     número de referência em reais (ex.: 189.9); o preço real é o do Mercado Livre na hora da compra
//   categoria texto curto para o filtro (ex.: 'Cozinha'); com uma categoria só, o filtro não aparece
//   nota      frase curta do casal (opcional), ex.: 'Para o nosso café da manhã'
//   destaque  true = aparece na folha do convite (até 3)
//   ganho     true = já ganhamos (vai para o fim, sem botão)
//
// EXEMPLOS PROVISÓRIOS abaixo (sem link: o botão mostra "Link em breve"). Substituir pelos produtos reais antes de
// publicar. Lista vazia = a folha de presentes some do convite.
export const PRESENTES = [
  { nome: 'Jogo de panelas antiaderente', preco: 459.9, categoria: 'Cozinha', destaque: true, nota: 'Para os primeiros almoços de domingo' },
  { nome: 'Air fryer 5 litros', preco: 399, categoria: 'Cozinha', destaque: true },
  { nome: 'Jogo de cama queen 400 fios', preco: 289.9, categoria: 'Quarto', destaque: true },
  { nome: 'Cafeteira elétrica', preco: 149.9, categoria: 'Cozinha', nota: 'Para o nosso café da manhã' },
  { nome: 'Jogo de toalhas de banho', preco: 129.9, categoria: 'Banho' },
  { nome: 'Liquidificador', preco: 189.9, categoria: 'Cozinha' },
  { nome: 'Aparelho de jantar 20 peças', preco: 329, categoria: 'Mesa' },
  { nome: 'Jogo de taças', preco: 99.9, categoria: 'Mesa' },
  { nome: 'Aspirador de pó vertical', preco: 549, categoria: 'Casa' },
  { nome: 'Faqueiro inox 24 peças', preco: 119.9, categoria: 'Mesa' },
];
