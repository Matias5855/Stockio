import type { NextConfig } from 'next'

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/stockflow-indol\.vercel\.app\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'stockflow-pages',
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
        networkTimeoutSeconds: 5,
      },
    },
    {
      urlPattern: /\.(js|css|png|jpg|svg|woff2)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'stockflow-assets',
        expiration: { maxEntries: 100, maxAgeSeconds: 604800 },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /\/api\/.*/,
      handler: 'NetworkOnly',
    },
  ],
})

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',         value: 'on' },
  { key: 'X-Frame-Options',                value: 'DENY' },
  { key: 'X-Content-Type-Options',         value: 'nosniff' },
  { key: 'X-XSS-Protection',              value: '1; mode=block' },
  { key: 'Referrer-Policy',               value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security',     value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "frame-src https://www.mercadopago.com.ar https://www.mercadopago.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          ...securityHeaders,
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)