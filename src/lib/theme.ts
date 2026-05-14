/**
 * Paleta StockFlow — base teal con acentos azul/verde.
 *
 * Uso:
 *   import { COLORS, getTheme } from '@/lib/theme'
 *   const t = getTheme(isDark)
 *   <div style={{ background: t.bg, color: t.text }}>
 *
 * Los valores "neutros" (primario/secundario/peligro) no dependen del modo
 * y viven en COLORS. Los que cambian con dark/light estan en getTheme().
 */

export const COLORS = {
  // Acciones
  primary:   '#0D9488', // botones, estado activo
  secondary: '#2563EB', // info, links
  success:   '#16A34A', // OK, cobrado
  danger:    '#DC2626', // error, eliminar
  warning:   '#D97706', // stock bajo, pendiente

  // Badges
  badge: {
    ok:        { bg: '#DCFCE7', text: '#166534' },
    bajo:      { bg: '#FEF3C7', text: '#92400E' },
    pendiente: { bg: '#FEF3C7', text: '#92400E' },
    cobrada:   { bg: '#DCFCE7', text: '#166534' },
    error:     { bg: '#FFF1F2', text: '#9F1239' },
  },

  // Metric cards (dashboard)
  metric: {
    ventas:    { bg: '#CCFBF1', border: '#5EEAD4', label: '#115E59', value: '#042F2E' },
    saldo:     { bg: '#DBEAFE', border: '#93C5FD', label: '#1E40AF', value: '#1E3A8A' },
    pendiente: { bg: '#FFF1F2', border: '#FECDD3', label: '#9F1239', value: '#881337' },
    stock:     { bg: '#FEF3C7', border: '#FCD34D', label: '#92400E', value: '#78350F' },
  },

  // Tabla
  table: {
    headerBg:   '#99F6E4',
    headerText: '#115E59',
    rowEven:    '#FFFFFF',
    rowOdd:     '#F0FDFA',
  },
} as const

export type Theme = {
  // Fondos
  bg: string          // Fondo general
  bgAlt: string       // Fondo secundario (filas alternas)
  sidebar: string     // Sidebar
  card: string        // Cards y superficies
  hover: string       // Hover

  // Texto
  text: string        // Texto principal
  textMuted: string   // Texto secundario
  textOnSidebar: string       // Texto en sidebar (gris)
  textOnSidebarActive: string // Texto activo en sidebar (blanco)

  // Bordes
  border: string      // Borde suave por defecto
  borderMid: string   // Borde medio
  borderCard: string  // Borde de cards

  // Acentos (no cambian con modo, pero accesibles via el tema por conveniencia)
  accent: string      // = primary
}

const LIGHT: Theme = {
  bg:        '#F0FDFA',
  bgAlt:     '#F0FDFA',
  sidebar:   '#042F2E',
  card:      '#FFFFFF',
  hover:     '#CCFBF1',

  text:               '#1C4542',
  textMuted:          '#6B7280',
  textOnSidebar:      '#5EEAD4',
  textOnSidebarActive:'#FFFFFF',

  border:     '#99F6E4',
  borderMid:  '#5EEAD4',
  borderCard: '#CCFBF1',

  accent: COLORS.primary,
}

const DARK: Theme = {
  bg:        '#042F2E',
  bgAlt:     '#0D3330',
  sidebar:   '#021A1A',
  card:      '#0D3330',
  hover:     '#134E4A',

  text:               '#F0FDFA',
  textMuted:          '#5EEAD4',
  textOnSidebar:      '#5EEAD4',
  textOnSidebarActive:'#FFFFFF',

  border:     '#134E4A',
  borderMid:  '#5EEAD4',
  borderCard: '#134E4A',

  accent: COLORS.primary,
}

export function getTheme(isDark: boolean): Theme {
  return isDark ? DARK : LIGHT
}
