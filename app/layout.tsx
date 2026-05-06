import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decoder IA — ¿Qué siente realmente cuando te escribe?",
  description:
    "Pega la conversación de WhatsApp. La IA analiza cada palabra y te dice qué siente, qué esconde y exactamente qué responderle.",
  openGraph: {
    title: "Decoder IA — ¿Qué siente realmente cuando te escribe?",
    description:
      "Análisis IA de conversaciones de WhatsApp. Descubre el nivel de interés real, señales ocultas y el mensaje exacto para responder.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
