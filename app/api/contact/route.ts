// Formulario de consultas de la landing → mail a CONTACT_TO.
//
// El envío de mails hoy puede estar apagado (ver el header de lib/email.ts).
// En ese caso devolvemos 503 con code EMAIL_NOT_CONFIGURED y el formulario le
// ofrece al visitante la salida directa, en vez de decirle "enviado" y que la
// consulta se pierda en el aire.

import { NextResponse } from "next/server";
import { CONTACT_TO, contactEmail, isValidEmail, sendEmail } from "@/lib/email";

const MAX_NAME = 80;
const MAX_MESSAGE = 2000;

// Rate limit simple, en memoria. Es best-effort a propósito: en serverless cada
// instancia tiene su propio Map, así que no es una barrera dura — sirve para
// frenar el envío repetido desde una misma pestaña, no para un ataque real.
// Si algún día hace falta de verdad, va contra una tabla o un KV.
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 3;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_HITS) {
    HITS.set(ip, prev);
    return true;
  }
  prev.push(now);
  HITS.set(ip, prev);
  return false;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { name, email, message, rubro, website } = body;

  // Honeypot: un campo que el humano no ve y el bot completa. Respondemos 200
  // para no darle pistas de que lo detectamos, pero no mandamos nada.
  if (typeof website === "string" && website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Escribí tu nombre" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Ese email no parece válido" }, { status: 400 });
  }
  if (typeof message !== "string" || message.trim().length < 10) {
    return NextResponse.json({ error: "Contanos un poco más, así te respondemos bien" }, { status: 400 });
  }
  if (name.length > MAX_NAME || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "desconocida";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Ya nos mandaste varias consultas. Esperá unos minutos o escribinos por WhatsApp." },
      { status: 429 }
    );
  }

  const { subject, html, text } = contactEmail({
    name: name.trim(),
    email: String(email).trim().toLowerCase(),
    rubro: typeof rubro === "string" && rubro.trim() ? rubro.trim() : null,
    message: message.trim(),
  });

  const sent = await sendEmail({
    to: CONTACT_TO,
    subject,
    html,
    text,
    // Responder desde la casilla contesta directo a quien consultó.
    replyTo: { email: String(email).trim().toLowerCase(), name: name.trim() },
  });

  if (!sent.ok) {
    if (sent.error === "EMAIL_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "El envío de mails todavía no está activo.", code: "EMAIL_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    console.error("Error al enviar consulta:", sent.error);
    return NextResponse.json(
      { error: "No pudimos enviar tu consulta.", code: "SEND_FAILED" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
