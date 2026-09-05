/**
 * Senha padrão do sistema.
 *
 * Toda conta nova (e toda conta cuja senha foi restaurada pelo administrador)
 * usa esta senha e fica marcada com `must_change_password`. No primeiro login
 * o sistema exige a troca antes de liberar qualquer página. Em "Esqueci a
 * senha", a pessoa informa o nick + esta senha e define a nova.
 *
 * Pode ser sobrescrita por DEFAULT_USER_PASSWORD no ambiente.
 */
export const DEFAULT_USER_PASSWORD_FALLBACK = 'FZN2026';

export function defaultUserPassword(): string {
  const value = process.env.DEFAULT_USER_PASSWORD?.trim();
  return value && value.length >= 6 ? value : DEFAULT_USER_PASSWORD_FALLBACK;
}
