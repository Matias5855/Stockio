import type { Metadata, Viewport } from 'next'
import './globals.css'

const SITE_URL = 'https://stockio.com.ar'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Stockio — Gestión inteligente para tu PyME',
    template: '%s · Stockio',
  },
  description: 'Stock, ventas, cuotas y facturación en un solo lugar. Hecho para comercios de indumentaria en Argentina.',
  applicationName: 'Stockio',
  authors: [{ name: 'Stockio' }],
  keywords: [
    'gestión PyME', 'stock', 'inventario', 'punto de venta', 'cuotas',
    'facturación', 'indumentaria', 'Chaco', 'Argentina', 'AFIP', 'Mercado Pago',
  ],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Stockio',
  },
  // Iconos en todos los formatos que pide cada plataforma.
  // Next emite los <link rel="icon"> automaticamente desde acá.
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png',      sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png',      sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  // Open Graph — preview en WhatsApp, Facebook, LinkedIn, Discord, etc.
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: SITE_URL,
    siteName: 'Stockio',
    title: 'Stockio — Gestión inteligente para tu PyME',
    description: 'Stock, ventas, cuotas y facturación en un solo lugar. Pensado para comercios de indumentaria en Argentina.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Stockio — Gestión inteligente para tu PyME',
        type: 'image/png',
      },
    ],
  },
  // Twitter / X — usa la misma imagen pero con su propia card
  twitter: {
    card: 'summary_large_image',
    title: 'Stockio — Gestión inteligente para tu PyME',
    description: 'Stock, ventas, cuotas y facturación en un solo lugar.',
    images: ['/og-image.png'],
  },
  // SEO basico
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#0D9488',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
