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
      // Nunca cachear llamadas a Supabase ni a la API propia
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /\/api\/.*/,
      handler: 'NetworkOnly',
    },
  ],
})

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  // Oculta el header X-Powered-By: Next.js
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // Rutas de API: no cachear nunca, solo JSON
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)
