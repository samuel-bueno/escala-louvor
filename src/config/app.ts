/**
 * Identidade do produto centralizada. Para renomear o app, altere apenas aqui
 * (e o manifest/ícones são gerados a partir destes valores).
 */
export const APP = {
  name: "Escala Louvor",
  shortName: "Escala",
  description: "Escalas, disponibilidade e repertório do ministério de louvor em um só lugar.",
  themeColor: "#1B1A18",
  backgroundColor: "#FBFAF8",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  /**
   * Foto de fundo opcional do destaque da tela do músico. Coloque o arquivo (com direito de uso) em
   * /public/brand e informe o caminho, ex.: "/brand/foto.jpg". Sem foto (null), usa o fundo escuro com a marca do app.
   */
  heroImage: null as string | null,
} as const;
