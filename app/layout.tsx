import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Daemon - The AI-Native IDE",
  description:
    "A standalone IDE built for AI-native development. Monaco editor, integrated terminals, Claude Code agent spawning, MCP management, Git panel, Solana wallet, and plugin system.",
  keywords: [
    "IDE",
    "AI",
    "Claude",
    "Monaco Editor",
    "Electron",
    "Developer Tools",
    "MCP",
    "Solana",
  ],
  authors: [{ name: "nullxnothing" }],
  openGraph: {
    title: "Daemon - The AI-Native IDE",
    description: "A standalone IDE built for AI-native development.",
    type: "website",
    images: ["/images/daemon-banner.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Daemon - The AI-Native IDE",
    description: "A standalone IDE built for AI-native development.",
    images: ["/images/daemon-banner.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
