import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobAI",
  description: "Suivi et analyse de recherche d'emploi — région de Québec.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  );
}
