'use client'
import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { syncManager, SYNC_AUTH_EVENT } from '@/lib/sync/syncManager'
import { getTheme, COLORS } from '@/lib/theme'
import BusquedaGlobal from '@/components/BusquedaGlobal'
import Notificaciones from '@/components/Notificaciones'
import Paywall, { TrialBanner, EstadoSuscripcion } from '@/components/Paywall'
import OnboardingWizard from '@/components/OnboardingWizard'
import SesionDesplazada from '@/components/SesionDesplazada'
import { AppProvider, useApp } from '@/lib/context/AppContext'
import { reclamarSesion, vigilarSesion } from '@/lib/auth/sesionUnica'
import { tienePermiso } from '@/lib/auth/permisos'

// Lazy load de paginas
const DashboardPage    = dynamic(() => import('./dashboard/page'),    { loading: () => <PageLoader /> })
const StockPage        = dynamic(() => import('./stock/page'),        { loading: () => <PageLoader /> })
const VentasPage       = dynamic(() => import('./ventas/page'),       { loading: () => <PageLoader /> })
const FinanzasPage     = dynamic(() => import('./finanzas/page'),     { loading: () => <PageLoader /> })
const ArchivosPage     = dynamic(() => import('./archivos/page'),     { loading: () => <PageLoader /> })
const CuotasPage       = dynamic(() => import('./cuotas/page'),       { loading: () => <PageLoader /> })
const HistorialPage    = dynamic(() => import('./historial/page'),    { loading: () => <PageLoader /> })
const EmpleadosPage    = dynamic(() => import('./empleados/page'),    { loading: () => <PageLoader /> })
const ConfiguracionPage = dynamic(() => import('./configuracion/page'), { loading: () => <PageLoader /> })

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6B7280', fontSize: 13 }}>
      Cargando…
    </div>
  )
}

/**
 * Pantalla que reemplaza al contenido cuando el usuario llego a una seccion
 * que su rol no puede ver (ej. entrando por BusquedaGlobal, que no filtra).
 * No es un error: es un limite esperado, por eso el tono es informativo y
 * apunta a quien puede resolverlo (el dueño).
 */
function SinPermiso({ t }: { t: ReturnType<typeof getTheme> }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '60vh', textAlign: 'center', padding: 20,
    }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
      <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: t.text }}>
        No tenés permiso para ver esta sección
      </p>
      <p style={{ margin: 0, fontSize: 14, color: '#6B7280', maxWidth: 340, lineHeight: 1.5 }}>
        Hablá con el dueño del negocio si necesitás acceso.
      </p>
    </div>
  )
}

export const NavContext = createContext<{
  page: string
  setPage: (p: string) => void
}>({ page: 'dashboard', setPage: () => {} })

export const useNav = () => useContext(NavContext)

// requierePremium=true  -> solo aparece para orgs con plan Premium
// requierePermiso='...' -> solo aparece si el profile tiene ese permiso en true.
//   Las claves salen del catalogo unico en @/lib/auth/permisos, el mismo que
//   usan el form de invitar y la ruta que acepta la invitacion.
type NavItem = {
  id: string
  label: string
  icon: string
  requierePremium?: boolean
  requierePermiso?: string
}

const NAV: readonly NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',     icon: '◈', requierePermiso: 'ver_dashboard' },
  { id: 'stock',         label: 'Inventario',    icon: '▦', requierePermiso: 'ver_stock' },
  { id: 'ventas',        label: 'Ventas',        icon: '↗', requierePermiso: 'ver_ventas' },
  { id: 'finanzas',      label: 'Finanzas',      icon: '$', requierePermiso: 'ver_finanzas' },
  { id: 'archivos',      label: 'Archivos',      icon: '⊞', requierePermiso: 'ver_archivos' },
  { id: 'cuotas',        label: 'Cuotas',        icon: '⊟', requierePermiso: 'ver_cuotas' },
  { id: 'empleados',     label: 'Empleados',     icon: '👥', requierePremium: true, requierePermiso: 'gestionar_usuarios' },
  { id: 'historial',     label: 'Historial',     icon: '⟲', requierePremium: true, requierePermiso: 'ver_historial' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙', requierePermiso: 'ver_configuracion' },
] as const

function esPlanPremium(planId?: string): boolean {
  if (!planId) return false
  return planId.toLowerCase() === 'premium'
}

// Un item es visible si cumple AMBOS requisitos: plan y permiso.
function puedeVer(item: NavItem, planId: string | undefined, permisos: Record<string, boolean>, role: string): boolean {
  if (item.requierePremium && !esPlanPremium(planId)) return false
  return tienePermiso(permisos, role, item.requierePermiso)
}

const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  stock: StockPage,
  ventas: VentasPage,
  finanzas: FinanzasPage,
  archivos: ArchivosPage,
  cuotas: CuotasPage,
  empleados: EmpleadosPage,
  historial: HistorialPage,
  configuracion: ConfiguracionPage,
}

type SuscripcionInfo = {
  estado: EstadoSuscripcion
  plan_id: 'normal' | 'premium' | string
  trial_fin?: string | null
  email?: string
}

/**
 * El provider va en un componente ENVOLVENTE, no adentro de AppLayoutInner.
 * El contexto de React solo fluye hacia abajo: si <AppProvider> se montara
 * dentro del return de AppLayoutInner, ese mismo componente no podria leerlo
 * con useApp() (obtendria los valores por defecto: role 'member', permisos {}),
 * y justamente lo necesita para filtrar el NAV y bloquear paginas por permiso.
 */
export default function AppLayout() {
  return (
    <AppProvider>
      <AppLayoutInner />
    </AppProvider>
  )
}

function AppLayoutInner() {
  // role y permisos del usuario logueado (los trae AppProvider desde profiles)
  const { role, permisos, loading: permisosLoading, userId } = useApp()
  const supabase = useMemo(() => createClient(), [])
  const [page, setPage] = useState('dashboard')
  const [isDark, setIsDark] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  // Sesion revocada desde otro dispositivo: los cambios locales no pueden subir
  // hasta volver a iniciar sesion. pendientesSync es cuantos estan esperando.
  const [requiereReauth, setRequiereReauth] = useState(false)
  const [pendientesSync, setPendientesSync] = useState(0)
  // Otro dispositivo se quedó con la sesión de esta misma cuenta.
  const [sesionDesplazada, setSesionDesplazada] = useState(false)
  const [orgNombre, setOrgNombre] = useState('Gestión PyME')
  const [suscripcion, setSuscripcion] = useState<SuscripcionInfo | null>(null)
  const [suscripcionLoaded, setSuscripcionLoaded] = useState(false)
  // Onboarding: solo aparece si la org tiene onboarding_completado=false.
  // showOnboarding controla la visibilidad del modal en este render
  // (separado del flag de DB para permitir "Saltar" sin esperar el round-trip).
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingOrgId, setOnboardingOrgId] = useState<string | null>(null)

  useEffect(() => {
    syncManager.init()
    setIsOffline(!navigator.onLine)

    const refrescarReauth = () => {
      setRequiereReauth(syncManager.requiereReautenticacion)
      syncManager.contarPendientes().then(setPendientesSync)
    }
    refrescarReauth()
    window.addEventListener(SYNC_AUTH_EVENT, refrescarReauth)

    // Si venimos de reautenticarnos, la bandera sigue puesta del intento
    // anterior: reintentamos ahora que hay sesion nueva para que la cola suba
    // sola, sin que el usuario tenga que hacer nada. init() no alcanza cuando
    // el modulo quedo cargado de antes (navegacion SPA desde /login).
    if (syncManager.requiereReautenticacion) syncManager.sync()
    setOrgNombre(localStorage.getItem('stk_org_nombre') ?? 'Gestión PyME')

    // Leer preferencia de tema persistida
    const savedDark = localStorage.getItem('stk_dark_mode')
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

    // Onboarding: chequear si el negocio ya lo completo.
    // Si la columna no existe todavia (SQL pendiente), el catch evita romper.
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles').select('org_id').eq('id', user.id).single()
        if (!profile?.org_id) return

        const { data: org } = await supabase
          .from('mi_organizacion')
          .select('onboarding_completado, name')
          .eq('id', profile.org_id)
          .single()

        setOnboardingOrgId(profile.org_id)
        // Solo mostrar si el flag esta explicitamente false. Si es null/undefined
        // (columna recien agregada y aun no asignada) tambien lo mostramos.
        if (org && org.onboarding_completado !== true) {
          setShowOnboarding(true)
        }
      } catch {
        // Silencioso: si falla, simplemente no mostramos el wizard.
      }
    })()

    const onOnline = () => { setIsOffline(false); syncManager.sync() }
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(SYNC_AUTH_EVENT, refrescarReauth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aterrizaje: 'dashboard' es el valor por defecto de `page`, pero ahora exige
  // el permiso ver_dashboard. Si el usuario no lo tiene, lo dejamos en la
  // primera sección que sí puede ver, para que no entre a un cartel de
  // "sin permiso" sin haber pedido nada.
  const aterrizajeResuelto = useRef(false)
  useEffect(() => {
    if (permisosLoading || aterrizajeResuelto.current) return
    aterrizajeResuelto.current = true
    // Solo se corrige el aterrizaje inicial. Si después navega a mano a algo
    // prohibido, ve el aviso de "sin permiso": mandarlo a otro lado en
    // silencio sería más confuso que decirle por qué no puede entrar.
    if (tienePermiso(permisos, role, 'ver_dashboard')) return
    const primera = NAV.find(item => puedeVer(item, suscripcion?.plan_id, permisos, role))
    if (primera) setPage(primera.id)
  }, [permisosLoading, permisos, role, suscripcion?.plan_id])

  // Sesión única por cuenta (ver db/sesion_unica.sql): al abrir la app este
  // dispositivo reclama la sesión y queda escuchando por si otro la reclama.
  useEffect(() => {
    if (!userId) return
    let limpiar: (() => void) | undefined
    let cancelado = false
    // Reclamar PRIMERO y vigilar después. Si arrancaran en paralelo, el chequeo
    // inicial podría leer el ID anterior y marcarnos como desplazados a
    // nosotros mismos apenas entramos.
    reclamarSesion().then(() => {
      if (cancelado) return
      limpiar = vigilarSesion(userId, setSesionDesplazada)
    })
    return () => { cancelado = true; limpiar?.() }
  }, [userId])

  const handleLogout = useCallback(async () => {
    // Limpia timestamps de delta sync y la bandera de reautenticacion: si en
    // este mismo dispositivo entra otra cuenta, no debe heredar ese estado.
    syncManager.clearSyncState()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [supabase])

  // Volver a entrar con la sesion caida. Se cierra la sesion muerta primero y
  // se navega con location (no router) para arrancar con el modulo limpio.
  // NO se toca la cola local: los cambios pendientes esperan al proximo login.
  const handleReautenticar = useCallback(async () => {
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/login'
  }, [supabase])

  const toggleDark = useCallback(() => {
    setIsDark(v => {
      const next = !v
      try { localStorage.setItem('stk_dark_mode', next ? '1' : '0') } catch {}
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

  // Esconder el link del sidebar no alcanza: a una seccion tambien se llega
  // desde BusquedaGlobal (que no filtra por permiso) o restaurando el estado.
  // Aca cortamos el render del contenido real.
  // Solo esperamos a los permisos si la pagina activa requiere uno — asi el
  // Dashboard (sin requisito) no se demora por una consulta que no lo afecta.
  const permisoRequerido = NAV.find(item => item.id === page)?.requierePermiso
  const esperandoPermisos = Boolean(permisoRequerido) && permisosLoading
  const accesoDenegado = !permisosLoading && !tienePermiso(permisos, role, permisoRequerido)

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

  // Va antes que el paywall: si perdiste la sesión no podés hacer nada acá, ni
  // siquiera pagar, y hay una acción concreta para tomar ahora mismo.
  if (sesionDesplazada) {
    return (
      <SesionDesplazada
        isDark={isDark}
        onRecuperar={() => setSesionDesplazada(false)}
        onCerrarSesion={handleLogout}
      />
    )
  }

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
      {/* Onboarding wizard — overlay sobre toda la app en primer login.
          Solo para el dueño: el wizard escribe datos del negocio y ahora
          organizations solo lo puede actualizar el owner (rls_fase_b3). A un
          empleado que entrara antes de completarlo le aparecía igual y le
          habría fallado al guardar. */}
      {showOnboarding && onboardingOrgId && role === 'owner' && (
        <OnboardingWizard
          orgId={onboardingOrgId}
          initialOrgName={orgNombre !== 'Gestión PyME' ? orgNombre : undefined}
          onDone={() => setShowOnboarding(false)}
        />
      )}

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

        {/* Banner sesion revocada — va arriba de todo y en rojo porque, a
            diferencia del banner offline, aca los cambios NO se estan
            guardando en el servidor y hace falta que el usuario actue. */}
        {requiereReauth && (
          <div style={{
            background: COLORS.danger, color: '#FFFFFF', padding: '10px 20px',
            fontSize: 13, fontWeight: 600, textAlign: 'center', flexShrink: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span>
              ⚠ Tu sesión se cerró en otro dispositivo.
              {pendientesSync > 0
                ? ` Tenés ${pendientesSync} cambio${pendientesSync > 1 ? 's' : ''} sin sincronizar — no se pierden, se suben cuando vuelvas a entrar.`
                : ' Iniciá sesión de nuevo para seguir trabajando.'}
            </span>
            <button onClick={handleReautenticar} style={{
              background: '#FFFFFF', color: COLORS.danger, border: 'none',
              borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              Iniciar sesión
            </button>
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
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>Stockio</p>
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
              {/* Mientras no sepamos los permisos no dibujamos los items: si
                  filtraramos con permisos vacios, el menu apareceria recortado
                  y despues completo (parpadeo feo para el dueño), o al reves
                  mostraria de mas por un instante a un empleado limitado. */}
              {permisosLoading ? null : (
                NAV
                  .filter(item => puedeVer(item, suscripcion?.plan_id, permisos, role))
                  .map(item => (
                    <button key={item.id} onClick={() => setPage(item.id)} style={navBtnStyle(page === item.id)}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  ))
              )}
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
              {esperandoPermisos ? (
                <PageLoader />
              ) : accesoDenegado ? (
                <SinPermiso t={t} />
              ) : (
                <Suspense fallback={<PageLoader />}>
                  <ActivePage />
                </Suspense>
              )}
            </main>
          </div>
        </div>
      </div>
    </NavContext.Provider>
  )
}
