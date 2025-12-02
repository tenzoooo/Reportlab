import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

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
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
