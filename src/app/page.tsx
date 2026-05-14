// Landing publica de StockFlow.
// Si el user ya tiene sesion, lo redirigimos al dashboard.
// Si no, mostramos la landing.

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Nav from '@/components/landing/Nav'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import Beneficios from '@/components/landing/Beneficios'
import FAQ from '@/components/landing/FAQ'
import CtaFinal from '@/components/landing/CtaFinal'
import Footer from '@/components/landing/Footer'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Si ya hay sesion, mandamos directo al dashboard
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect('/dashboard')
  } catch {
    // Si supabase falla por env vars en build, mostramos landing igual
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#FFFFFF',
      color: '#1C4542',
      minHeight: '100vh',
    }}>
      <Nav />
      <Hero />
      <Features />
      <Beneficios />
      <FAQ />
      <CtaFinal />
      <Footer />
    </div>
  )
}
