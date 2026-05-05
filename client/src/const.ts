export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * URL da tela de login local (email/senha).
 * O OAuth Manus foi removido do fluxo do usuário — acesso é exclusivamente
 * por credenciais cadastradas pelo administrador.
 */
export const getLoginUrl = (): string => "/login";

