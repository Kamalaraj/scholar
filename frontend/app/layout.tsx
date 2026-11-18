import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { SkipLink } from "@/components/layout/skip-link";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { clerkAppearance } from "@/lib/clerk-appearance";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scholar",
  description: "Research briefs, written by a team of agents you direct.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${sourceSerif.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          telemetry={false}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SkipLink />
            <Providers>{children}</Providers>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
