// Traducción de los mensajes de error de Supabase Auth (vienen en inglés y no
// se pueden configurar desde el dashboard de Auth).
//
// Se matchea por subcadena case-insensitive y no por igualdad exacta: Supabase
// cambia el wording entre versiones y preferimos caer en una traducción
// cercana antes que volver a mostrar inglés.
//
// El fallback NO muestra el mensaje original: un error desconocido en inglés
// le dice menos al usuario que una frase genérica en español. El original se
// loguea a consola para poder agregarlo al mapa.

const MAPA: [RegExp, string][] = [
  [/invalid login credentials/i, "Email o contraseña incorrectos."],
  [/user already registered/i, "Ya existe una cuenta con ese email. Probá ingresar."],
  [/email not confirmed/i, "Tenés que confirmar tu email antes de ingresar."],
  [/user not found/i, "No encontramos una cuenta con ese email."],
  [/unable to validate email|invalid.*email|email.*invalid/i, "Ese email no parece válido."],
  [/signup requires a valid password|password should be at least|weak password/i, "La contraseña necesita al menos 6 caracteres."],
  [/new password should be different|same password/i, "La nueva contraseña no puede ser igual a la anterior."],
  [/rate limit|too many requests|only request this.*after/i, "Demasiados intentos. Esperá un rato y probá de nuevo."],
  // El link de recuperación venció o ya se usó (session missing / expired).
  [/session.*missing|auth session missing|expired|invalid.*token/i, "El link venció o ya se usó. Pedí uno nuevo."],
  [/failed to fetch|fetch failed|network/i, "No hay conexión. Revisá tu internet y probá de nuevo."],
];

export function traducirErrorAuth(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  for (const [re, texto] of MAPA) {
    if (re.test(msg)) return texto;
  }
  console.error("[auth] mensaje de Supabase sin traducir:", msg);
  return "No se pudo completar. Probá de nuevo en un minuto.";
}
