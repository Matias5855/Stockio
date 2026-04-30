import type { Metadata } from 'next'
import './globals.css'
import SWRegister from './sw-register'

export const metadata: Metadata = {
  title: 'StockFlow — Gestión inteligente para tu negocio',
  description: 'Controlá tu stock, ventas, caja y archivos desde un solo lugar.',
  manifest: '/manifest.json',
  themeColor: '#7C6FE0',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StockFlow',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7C6FE0" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="StockFlow" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body><SWRegister />{children}</body>
    </html>
  )
}