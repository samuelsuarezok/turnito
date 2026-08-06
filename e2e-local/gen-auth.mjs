// Genera la cookie de sesión de Supabase para un usuario, usando las MISMAS
// funciones que @supabase/ssr (createChunks + base64url) → cero adivinanza.
// Uso: node --env-file=.env e2e-local/gen-auth.mjs <email>
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { writeFileSync } from "fs";
const require = createRequire(import.meta.url);
const { createChunks, stringToBase64URL } = require("@supabase/ssr/dist/main/utils");

const email = process.argv[2];
if (!email) { console.error("Falta el email"); process.exit(1); }

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(URL_).hostname.split(".")[0];
const KEY = `sb-${REF}-auth-token`;

const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (e1) { console.error("generateLink:", e1.message); process.exit(1); }

const app = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error: e2 } = await app.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
if (e2 || !data.session) { console.error("verifyOtp:", e2?.message); process.exit(1); }

const encoded = "base64-" + stringToBase64URL(JSON.stringify(data.session));
const cookies = createChunks(KEY, encoded).map((c) => ({
  name: c.name, value: c.value, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax",
}));
writeFileSync(new URL("./.auth.json", import.meta.url), JSON.stringify(cookies, null, 2));
console.log(`OK: ${cookies.length} cookie(s) para ${email} → e2e-local/.auth.json`);
