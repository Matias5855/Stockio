'use client'
import { useState, useEffect, useMemo, useCallback, createContext, useContext, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { syncManager } from '@/lib/sync/syncManager'
import { getTheme, COLORS } from '@/lib/theme'
import BusquedaGlobal from '@/components/BusquedaGlobal'
import Notificaciones from '@/components/Notificaciones'
import Paywall, { TrialBanner, EstadoSuscripcion } from '@/components/Paywall'

// Lazy load de paginas
const DashboardPage    = dynamic(() => import('./dashboard/page'),    { loading: () => <PageLoader /> })
const StockPage        = dynamic(() => import('./stock/page'),        { loading: () => <PageLoader /> })
const VentasPage       = dynamic(() => import('./ventas/page'),       { loading: () => <PageLoader /> })
const FinanzasPage     = dynamic(() => import('./finanzas/page'),     { loading: () => <PageLoader /> })
const ArchivosPage     = dynamic(() => import('./archivos/page'),     { loading: () => <PageLoader /> })
const CuotasPage       = dynamic(() => import('./cuotas/page'),       { loading: () => <PageLoader /> })
const HistorialPage    = dynamic(() => import('./historial/page'),    { loading: () => <PageLoader /> })
const ConfiguracionPage = dynamic(() => import('./configuracion/page'), { loading: () => <PageLoader /> })

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6B7280', fontSize: 13 }}>
      Cargando…
    </div>
  )
}

export const NavContext = createContext<{
  page: string
  setPage: (p: string) => void
}>({ page: 'dashboard', setPage: () => {} })

export const useNav = () => useContext(NavContext)

const NAV = [
  { id: 'dashboard',     label: 'Dashboard',     icon: '◈' },
  { id: 'stock',         label: 'Inventario',    icon: '▦' },
  { id: 'ventas',        label: 'Ventas',        icon: '↗' },
  { id: 'finanzas',      label: 'Finanzas',      icon: '$' },
  { id: 'archivos',      label: 'Archivos',      icon: '⊞' },
  { id: 'cuotas',        label: 'Cuotas',        icon: '⊟' },
  { id: 'historial',     label: 'Historial',     icon: '⟲' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙' },
] as const

const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  stock: StockPage,
  ventas: VentasPage,
  finanzas: FinanzasPage,
  archivos: ArchivosPage,
  cuotas: CuotasPage,
  historial: HistorialPage,
  configuracion: ConfiguracionPage,
}

type SuscripcionInfo = {
  estado: EstadoSuscripcion
  plan_id: 'normal' | 'premium' | string
  trial_fin?: string | null
  email?: string
}

export default function AppLayout() {
  const supabase = useMemo(() => createClient(), [])
  const [page, setPage] = useState('dashboard')
  const [isDark, setIsDark] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [orgNombre, setOrgNombre] = useState('Gestión PyME')
  const [suscripcion, setSuscripcion] = useState<SuscripcionInfo | null>(null)
  const [suscripcionLoaded, setSuscripcionLoaded] = useState(false)

  useEffect(() => {
    syncManager.init()
    setIsOffline(!navigator.onLine)
    setOrgNombre(localStorage.getItem('sf_org_nombre') ?? 'Gestión PyME')

    // Leer preferencia de tema persistida
    const savedDark = localStorage.getItem('sf_dark_mode')
    if (savedDark === '1') setIsDark(true)

    // Verificar estado de suscripcion al cargar
    fetch('/api/suscripcion')
      .then(r => r.ok ? r.json() : null)
      .then(async data => {
        if (data && data.estado) {
          // Tambien levanto el email del user para el paywall
          const { data: { user } } = await supabase.auth.getUser()
          setSuscripcion({
            estado: data.estado,
            plan_id: data.plan_id ?? 'normal',
            trial_fin: data.trial_fin,
            email: user?.email,
          })
        }
        setSuscripcionLoaded(true)
      })
      .catch(() => setSuscripcionLoaded(true))

    const onOnline = () => { setIsOffline(false); syncManager.sync() }
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [supabase])

  const toggleDark = useCallback(() => {
    setIsDark(v => {
      const next = !v
      try { localStorage.setItem('sf_dark_mode', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const toggleCollapsed = useCallback(() => setCollapsed(v => !v), [])

  const t = useMemo(() => getTheme(isDark), [isDark])

  const navBtnStyle = useCallback((active: boolean): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: collapsed ? '12px 0' : '12px 20px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    background: active ? COLORS.primary : 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: active ? t.textOnSidebarActive : t.textOnSidebar,
    fontWeight: active ? 600 : 500,
    fontSize: 14,
    transition: 'background 0.12s ease',
  }), [collapsed, t])

  const navValue = useMemo(() => ({ page, setPage }), [page])

  const ActivePage = PAGE_COMPONENTS[page] ?? DashboardPage

  // Estado del paywall:
  // - vencida/cancelada/pausada -> paywall fullscreen bloqueante
  // - trial con menos de 7 dias -> banner amarillo NO bloqueante
  const necesitaPaywall = suscripcionLoaded && suscripcion && (
    suscripcion.estado === 'vencida' ||
    suscripcion.estado === 'cancelada' ||
    suscripcion.estado === 'pausada'
  )

  const diasTrialRestantes = (() => {
    if (!suscripcion || suscripcion.estado !== 'trial' || !suscripcion.trial_fin) return null
    const dias = Math.ceil((new Date(suscripcion.trial_fin).getTime() - Date.now()) / (1000 * 3600 * 24))
    return dias > 0 && dias <= 7 ? dias : null
  })()

  // Si esta vencida, mostramos SOLO el paywall (bloquea todo el contenido)
  if (necesitaPaywall && suscripcion) {
    return (
      <Paywall
        estado={suscripcion.estado}
        planId={suscripcion.plan_id}
        email={suscripcion.email}
      />
    )
  }

  return (
    <NavContext.Provider value={navValue}>
      <div style={{
        display: 'flex',
        height: '100vh',
        background: t.bg,
        color: t.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
        flexDirection: 'column',
      }}>

        {/* Banner offline */}
        {isOffline && (
          <div style={{ background: COLORS.warning, color: '#FFFFFF', padding: '8px 20px', fontSize: 13, fontWeight: 600, textAlign: 'center', flexShrink: 0, zIndex: 100 }}>
            ⚠ Sin conexión — los cambios se guardan localmente y se sincronizan al reconectarte
          </div>
        )}

        {/* Banner trial proximo a vencer */}
        {diasTrialRestantes !== null && suscripcion && (
          <TrialBanner
            diasRestantes={diasTrialRestantes}
            onPagar={() => setPage('configuracion')}
          />
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* SIDEBAR */}
          <aside style={{
            width: collapsed ? 64 : 224,
            background: t.sidebar,
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.2s ease',
            flexShrink: 0,
            overflow: 'hidden',
          }}>

            <div style={{
              padding: collapsed ? '20px 10px' : '20px',
              borderBottom: `1px solid rgba(255,255,255,0.08)`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 72,
            }}>
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, background: COLORS.primary, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#FFFFFF', fontWeight: 800, fontSize: 16,
                  }}>S</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>StockFlow</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: t.textOnSidebar }}>{orgNombre}</p>
                  </div>
                </div>
              )}
              <button onClick={toggleCollapsed} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: t.textOnSidebar,
                padding: 4, marginLeft: collapsed ? 'auto' : 0, marginRight: collapsed ? 'auto' : 0,
                fontSize: 18,
              }}>☰</button>
            </div>

            <nav style={{ flex: 1, padding: '10px 0' }}>
              {NAV.map(item => (
                <button key={item.id} onClick={() => setPage(item.id)} style={navBtnStyle(page === item.id)}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              ))}
            </nav>

            <div style={{
              padding: collapsed ? '14px 10px' : '14px 20px',
              borderTop: `1px solid rgba(255,255,255,0.08)`,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <button onClick={toggleDark} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.12)`,
                borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                color: t.textOnSidebar, fontSize: 12,
              }}>
                <span>{isDark ? '☀' : '☾'}</span>
                {!collapsed && <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>}
              </button>
              <button onClick={handleLogout} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.textOnSidebar, fontSize: 12, padding: '8px 12px',
              }}>
                <span>⎋</span>
                {!collapsed && <span>Cerrar sesión</span>}
              </button>
            </div>
          </aside>

          {/* HEADER + CONTENIDO */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{
              padding: '14px 28px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
              background: t.card,
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, maxWidth: 480 }}>
                <BusquedaGlobal onNavegar={setPage} />
              </div>
              <Notificaciones />
            </header>

            <main style={{ flex: 1, overflow: 'auto', padding: 28, background: t.bg, color: t.text }}>
              <Suspense fallback={<PageLoader />}>
                <ActivePage />
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </NavContext.Provider>
  )
}
