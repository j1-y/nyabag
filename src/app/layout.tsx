import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";



const inter = Inter({
  subsets: ["latin"],
  variable: "--font",
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
      <body className={`${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}
