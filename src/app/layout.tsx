import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorker } from "@/components/layout/service-worker";
import { APP } from "@/config/app";
import "./globals.css";

// Geist para a interface; Geist Mono para horários, datas, tom e BPM.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description: APP.description,
  applicationName: APP.name,
  appleWebApp: { capable: true, title: APP.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#151514" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="pt-BR" data-theme={dataTheme} className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Suspense>
          <Toaster />
        </Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}
