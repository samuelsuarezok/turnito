"use client";

import { useSyncExternalStore } from "react";

// `false` en el server y durante la hidratación, `true` una vez montado.
//
// PARA QUÉ: los componentes que salen por un portal (WhatsAppFab,
// SoporteWhatsApp, ContactModal) no pueden renderizar en el server. Si
// devuelven null en el server y el contenido en el primer render del cliente,
// los dos árboles no coinciden y React tira "Hydration failed… the server
// rendered HTML didn't match", regenerando el árbol entero.
//
// POR QUÉ ASÍ Y NO CON useEffect: el patrón conocido es
// `const [m, setM] = useState(false); useEffect(() => setM(true), [])`, y
// funciona, pero es un setState sincrónico dentro de un efecto — justo lo que
// la regla `react-hooks/set-state-in-effect` de React 19 marca como error,
// porque dispara un render en cascada.
//
// useSyncExternalStore está hecho exactamente para esto: tiene un snapshot
// aparte para el server, así que React sabe que durante la hidratación vale
// `false` y recién después pasa a `true`. Sin efecto, sin render extra, sin
// warning. Es el mismo mecanismo que usa ThemeToggle para leer el tema.
const sinSuscripcion = () => () => {};
const enCliente = () => true;
const enServer = () => false;

export function useMontado(): boolean {
  return useSyncExternalStore(sinSuscripcion, enCliente, enServer);
}
