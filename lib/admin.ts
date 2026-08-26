// Quién puede entrar a /admin.
//
// ════════════════════════════════════════════════════════════════════════
// ESTO NO ES RLS, Y NO PUEDE SERLO
//
// El resto de Turnito se protege en la base: la página corre en el browser,
// habla con Supabase directo y la policy decide qué ve. /admin es lo contrario
// — necesita ver TODOS los negocios, o sea que corre con la service role key,
// o sea que corre en el SERVIDOR y nada más. Si algún día aparece un
// "use client" arriba de una pantalla de /admin, la clave se filtró.
//
// Por eso la lista de admins vive en una variable de entorno del servidor y no
// en una tabla: una tabla habría que protegerla con una policy, y una policy mal
// escrita en la tabla que decide quién es admin es exactamente el agujero que
// esto evita. Un mail de más en ADMIN_EMAILS requiere acceso a Vercel.
//
// FALLA CERRADA: sin ADMIN_EMAILS no hay admins, y /admin es un 404 para todo
// el mundo, incluido el dueño. Es la única forma segura de fallar acá.
//
// ⚠️ El mail que pongas en ADMIN_EMAILS TIENE que ser el de una cuenta que ya
// exista en Turnito. Si no existe, cualquiera puede registrarse con ese mail en
// /login y quedar adentro. Registrala primero, después agregá la variable.
// ════════════════════════════════════════════════════════════════════════

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Tres respuestas distintas, porque cada una se trata distinto:
 *
 *   anonimo → no hay sesión. Va a /login, que es lo útil.
 *   ajeno   → hay sesión y no es admin. Recibe un 404, no un "no tenés
 *             permiso": nadie que no sea admin necesita enterarse de que
 *             /admin existe.
 *   admin   → pasa.
 */
export type Acceso =
  | { estado: "anonimo" }
  | { estado: "ajeno" }
  | { estado: "admin"; email: string };

function listaAdmins(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * `cache` de React, no un cache de datos: dedupe DENTRO de un mismo request.
 * La página y cada server action la llaman por su cuenta (ninguna confía en que
 * otra ya chequeó), y sin esto serían tres verificaciones de sesión idénticas
 * contra Supabase en el mismo render.
 */
export const identificarAdmin = cache(async (): Promise<Acceso> => {
  const admins = listaAdmins();

  const supabase = await createSessionClient();
  // getUser() y no getSession(): getSession lee la cookie y le cree. getUser
  // valida el token contra Supabase, que es lo que corresponde cuando de eso
  // depende ver los datos de todos los clientes.
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();

  if (!email) return { estado: "anonimo" };

  // El rechazo es un 404 mudo a propósito, pero eso también deja a ciegas al
  // dueño cuando el que falla es el setup. Estos dos logs sólo van al servidor
  // (Vercel → Logs) y distinguen las dos causas, que se arreglan distinto.
  if (admins.length === 0) {
    console.warn(
      "admin: ADMIN_EMAILS no llegó al runtime — /admin es 404 para todos. " +
        "Si la acabás de agregar en Vercel, falta REDEPLOYAR: las variables se " +
        "aplican al deploy siguiente, no al que ya está corriendo."
    );
    return { estado: "ajeno" };
  }
  if (!admins.includes(email)) {
    console.warn(`admin: ${email} no está en ADMIN_EMAILS (${admins.length} configurado/s).`);
    return { estado: "ajeno" };
  }

  return { estado: "admin", email };
});
