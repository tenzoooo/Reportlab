import type React from "react"
import type { Metadata } from "next"
import { Figtree, Noto_Serif_JP, Instrument_Serif } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-serif-jp",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL('https://reportlab.net'),
  title: 'Reportlab - 理系学生のためのレポート作成支援ツール',
  description: 'PDFの実験手順書からレポートテンプレートを自動生成。実験レポート作成にかかる時間を大幅に短縮します。',
  openGraph: {
    title: 'Reportlab - 理系学生のためのレポート作成支援ツール',
    description: 'PDFの実験手順書からレポートテンプレートを自動生成。実験レポート作成にかかる時間を大幅に短縮します。',
    url: 'https://reportlab.net',
    siteName: 'Reportlab',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <style>{`
html {
  font-family: ${figtree.style.fontFamily};
  --font-sans: ${figtree.variable};
  --font-instrument-serif: ${instrumentSerif.variable};
}
        `}</style>
      </head>
      <body className={`${figtree.variable} ${instrumentSerif.variable} ${notoSerifJP.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
