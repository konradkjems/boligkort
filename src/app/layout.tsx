import type { Metadata, Viewport } from "next";
import { DataProvider } from "@/lib/data/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ejendomskort",
  description:
    "Interaktivt Danmarkskort: klik på en matrikel og se BBR, vurdering og adresser fra Datafordeleren.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="h-full">
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  );
}
