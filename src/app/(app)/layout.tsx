'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { syncManager } from '@/lib/sync/syncManager'

// Importar todas las páginas directamente
import DashboardPage from './dashboard/page'
import StockPage from './stock/page'
import VentasPage from './ventas/page'
import FinanzasPage from './finanzas/page'
import ArchivosPage from './archivos/page'
import CuotasPage from './cuotas/page'

// Context de navegación
export const NavContext = createContext<{
  page: string
  setPage: (p: string) => void
}>({ page: 'dashboard', setPage: () => {} })

export const useNav = () => useContext(NavContext)

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'stock',     label: 'Inventario', icon: '▦' },
  { id: 'ventas',    label: 'Ventas',     icon: '↗' },
  { id: 'finanzas',  label: 'Finanzas',   icon: '$' },
  { id: 'archivos',  label: 'Archivos',   icon: '⊞' },
  { id: 'cuotas',    label: 'Cuotas',     icon: '⊟' },
]

const PAGES: Record<string, React.ReactNode> = {
  dashboard: <DashboardPage />,
  stock:     <StockPage />,
  ventas:    <VentasPage />,
  finanzas:  <FinanzasPage />,
  archivos:  <ArchivosPage />,
  cuotas:    <CuotasPage />,
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [page, setPage] = useState('dashboard')
  const [isDark, setIsDark] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    syncManager.init()
    setIsOffline(!navigator.onLine)

    const onOnline = () => { setIsOffline(false); syncManager.sync() }
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const t = isDark ? {
    bg: '#0F0F12', sidebar: '#13131A', border: 'rgba(255,255,255,0.08)',
    text: '#F0EFF8', textMuted: '#7A7A95', accent: '#7C6FE0',
    accentLight: 'rgba(124,111,224,0.15)',
  } : {
    bg: '#F5F5F7', sidebar: '#FFFFFF', border: 'rgba(0,0,0,0.08)',
    text: '#18181C', textMuted: '#6B6B80', accent: '#5B4FD0',
    accentLight: 'rgba(91,79,208,0.1)',
  }

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: collapsed ? '11px 0' : '11px 20px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    background: active ? t.accentLight : 'transparent',
    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
    borderLeft: active ? `3px solid ${t.accent}` : '3px solid transparent',
    cursor: 'pointer',
    color: active ? t.accent : t.textMuted,
    fontWeight: active ? 600 : 400,
    fontSize: 13,
  })

  return (
    <NavContext.Provider value={{ page, setPage }}>
      <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden', flexDirection: 'column' }}>

        {/* Banner offline */}
        {isOffline && (
          <div style={{ background: '#E0A030', color: '#000', padding: '8px 20px', fontSize: 13, fontWeight: 600, textAlign: 'center', flexShrink: 0, zIndex: 100 }}>
            ⚠ Sin conexión — los cambios se guardan localmente y se sincronizan al reconectarte
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* SIDEBAR */}
          <aside style={{ width: collapsed ? 60 : 220, background: t.sidebar, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', flexShrink: 0, overflow: 'hidden' }}>

            <div style={{ padding: collapsed ? '20px 10px' : '20px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 72 }}>
              {!collapsed && (
                <div>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: t.accent }}>StockFlow</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>Gestión PyME</p>
                </div>
              )}
              <button onClick={() => setCollapsed(v => !v)} style={{ background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', cursor: 'pointer', color: t.textMuted, padding: 4, marginLeft: collapsed ? 'auto' : 0, marginRight: collapsed ? 'auto' : 0, fontSize: 18 }}>☰</button>
            </div>

            <nav style={{ flex: 1, padding: '10px 0' }}>
              {NAV.map(item => (
                <button key={item.id} onClick={() => setPage(item.id)} style={navBtnStyle(page === item.id)}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              ))}
            </nav>

            <div style={{ padding: collapsed ? '16px 10px' : '16px 20px', borderTop: `1px solid ${t.border}`, borderRight: 'none', borderBottom: 'none', borderLeft: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setIsDark(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start', background: 'none', borderTop: `1px solid ${t.border}`, borderRight: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, borderLeft: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: t.textMuted, fontSize: 12 }}>
                <span>{isDark ? '☀' : '☾'}</span>
                {!collapsed && <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>}
              </button>
              <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 12, padding: '8px 12px' }}>
                <span>⎋</span>
                {!collapsed && <span>Cerrar sesión</span>}
              </button>
            </div>
          </aside>

          {/* CONTENIDO — renderiza la página activa directamente */}
          <main style={{ flex: 1, overflow: 'auto', padding: 28, background: t.bg, color: t.text }}>
            {PAGES[page]}
          </main>
        </div>
      </div>
    </NavContext.Provider>
  )
}