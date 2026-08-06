import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import { themeInitScript } from "@/components/ThemeToggle";
import "./globals.css";

// Urbanist es variable font: no hace falta declarar weights.
const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

// Sólo para el slug (turnito.site/tu-negocio), que se muestra monoespaciado.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Turnito — Turnos online para tu negocio",
  description:
    "Barbería, uñas, pestañas, tatuajes o peluquería: tus clientes reservan solos desde un link. Sin apps, sin cuentas. 30 días gratis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      // El script de abajo le pone data-theme antes de pintar. React avisa
      // de la diferencia entre server y cliente si no se lo silencia acá.
      suppressHydrationWarning
      className={`${urbanist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Va inline y bloqueante a propósito: tiene que correr ANTES del
            primer pintado, si no la página arranca en claro y pega un
            flash blanco antes de saltar a oscuro. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
