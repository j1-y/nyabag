import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";



const inter = Inter({
  subsets: ["latin"],
  variable: "--font",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.nyabag.com"),
  title: "Nyabag App",
  description:
    "Nyabag is a visual memory workspace for saving, organizing, and rediscovering design references, bookmarks, screenshots, notes, and creative inspiration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
