import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Urbanist es variable font: no hace falta declarar weights.
const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

// Sólo para el slug (turnito.app/tu-negocio), que se muestra monoespaciado.
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
      className={`${urbanist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
