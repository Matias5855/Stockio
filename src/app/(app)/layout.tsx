'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: '◈' },
  { id: 'stock', label: 'Inventario', path: '/stock', icon: '▦' },
  { id: 'ventas', label: 'Ventas', path: '/ventas', icon: '↗' },
  { id: 'finanzas', label: 'Finanzas', path: '/finanzas', icon: '$' },
  { id: 'archivos', label: 'Archivos', path: '/archivos', icon: '⊞' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [isDark, setIsDark] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  const t = isDark ? {
    bg: '#0F0F12', sidebar: '#13131A', surface: '#17171C',
    border: 'rgba(255,255,255,0.08)', text: '#F0EFF8',
    textMuted: '#7A7A95', accent: '#7C6FE0',
    accentLight: 'rgba(124,111,224,0.15)',
  } : {
    bg: '#F5F5F7', sidebar: '#FFFFFF', surface: '#FFFFFF',
    border: 'rgba(0,0,0,0.08)', text: '#18181C',
    textMuted: '#6B6B80', accent: '#5B4FD0',
    accentLight: 'rgba(91,79,208,0.1)',
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: collapsed ? '11px 0' : '11px 20px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    background: active ? t.accentLight : 'transparent',
    borderTop: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    borderLeft: active ? `3px solid ${t.accent}` : '3px solid transparent',
    cursor: 'pointer',
    color: active ? t.accent : t.textMuted,
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    transition: 'all 0.15s',
  })

  const ghostBtnStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: collapsed ? 'center' : 'flex-start',
    background: 'none',
    borderTop: `1px solid ${t.border}`,
    borderRight: `1px solid ${t.border}`,
    borderBottom: `1px solid ${t.border}`,
    borderLeft: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    color: t.textMuted,
    fontSize: 12,
  }

  const logoutBtnStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: collapsed ? 'center' : 'flex-start',
    background: 'none',
    borderTop: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    cursor: 'pointer',
    color: t.textMuted,
    fontSize: 12,
    padding: '8px 12px',
  }

  const menuBtnStyle: React.CSSProperties = {
    background: 'none',
    borderTop: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    cursor: 'pointer',
    color: t.textMuted,
    padding: 4,
    marginLeft: collapsed ? 'auto' : 0,
    marginRight: collapsed ? 'auto' : 0,
    fontSize: 18,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' }}>
      <aside style={{ width: collapsed ? 60 : 220, background: t.sidebar, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', flexShrink: 0, overflow: 'hidden' }}>
        
        <div style={{ padding: collapsed ? '20px 10px' : '20px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 72 }}>
          {!collapsed && (
            <div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: t.accent }}>StockFlow</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: t.textMuted }}>Gestión PyME</p>
            </div>
          )}
          <button onClick={() => setCollapsed(v => !v)} style={menuBtnStyle}>☰</button>
        </div>

        <nav style={{ flex: 1, padding: '10px 0' }}>
          {NAV.map(item => {
            const active = pathname === item.path
            return (
              <button key={item.id} onClick={() => router.push(item.path)} style={navBtnStyle(active)}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: collapsed ? '16px 10px' : '16px 20px', borderTop: `1px solid ${t.border}`, borderRight: 'none', borderBottom: 'none', borderLeft: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setIsDark(v => !v)} style={ghostBtnStyle}>
            <span>{isDark ? '☀' : '☾'}</span>
            {!collapsed && <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>}
          </button>
          <button onClick={handleLogout} style={logoutBtnStyle}>
            <span>⎋</span>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: 28, background: t.bg, color: t.text }}>
        {children}
      </main>
    </div>
  )
}