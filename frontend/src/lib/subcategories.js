/**
 * Taxonomia de subcategorias por categoria (regra 50/30/20).
 * Usada no formulário de novo lançamento e na edição pós-lançamento.
 * O usuário sempre pode digitar uma subcategoria personalizada ("Outra...").
 */

export const SUBCATEGORIES = {
  necessidades: [
    "Aluguel",
    "Condomínio",
    "Supermercado",
    "Água",
    "Luz",
    "Gás",
    "Internet / Telefone",
    "Contas / Essenciais",
    "Transporte",
    "Combustível",
    "Saúde",
    "Farmácia",
    "Plano de Saúde",
    "Educação",
    "Seguros",
    "Impostos / Taxas",
    "Pets",
  ],
  desejos: [
    "Restaurantes",
    "Delivery / iFood",
    "Bares / Baladas",
    "Cinema / Streaming",
    "Assinaturas",
    "Lazer",
    "Viagens",
    "Compras / Vestuário",
    "Beleza / Cuidados",
    "Hobbies",
    "Presentes",
    "Eletrônicos",
  ],
  investimentos: [
    "Reserva de emergência",
    "Renda fixa",
    "Tesouro Direto",
    "Ações",
    "FIIs",
    "Fundos",
    "Previdência",
    "Cripto",
    "Aplicação",
  ],
};

export const OTHER_OPTION = "__outra__";

/** Lista de subcategorias para a categoria informada (fallback vazio). */
export function subcategoriesFor(category) {
  return SUBCATEGORIES[category] || [];
}
