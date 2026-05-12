@AGENTS.md
# StockFlow — Contexto del proyecto

## Qué es
SaaS de gestión para PyMEs argentinas. Sistema multi-tenant donde cada negocio es una `organization`. Desarrollado para ser vendido como producto con suscripción mensual.

## Stack
- **Frontend:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- **Estilos:** CSS-in-JS con objetos de estilo inline (NO Tailwind en componentes)
- **Base de datos:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Deploy:** Vercel (región gru1 - São Paulo)
- **Email:** Resend (onboarding@resend.dev en desarrollo)
- **Pagos:** Mercado Pago (suscripciones recurrentes + QR)
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** xlsx
- **Validación:** Zod (schemas en `src/lib/schemas`)
- **Offline:** IndexedDB (idb) + Service Worker manual + SyncManager
- **Scanner:** @undecaf/zbar-wasm + BarcodeDetector nativo

## Arquitectura multi-tenant
- Cada PyME = 1 `organization` con su `org_id`
- RLS activado en todas las tablas — los usuarios solo ven sus datos
- `get_org_id()` es una función SQL SECURITY DEFINER que retorna el org_id del usuario autenticado
- El `org_id` se cachea en `localStorage` como `sf_org_id`
- El nombre del negocio se cachea como `sf_org_nombre` (legacy: `sf_org_name` también aparece en register/page.tsx — pendiente unificar)

## Navegación
- La app usa navegación SPA client-side (NO router de Next.js para las páginas internas)
- El layout `src/app/(app)/layout.tsx` maneja un estado `page` y renderiza el componente activo via lazy load
- Los botones del sidebar llaman a `setPage('nombre-pagina')`
- Las páginas se cargan con `next/dynamic` — solo se monta la página activa

## Performance
- Hooks usan debounce de 500ms para realtime (evita fetchs redundantes)
- SyncManager usa delta sync (updated_at) + full pull cada 24h
- Páginas se cargan con lazy load (next/dynamic)
- Cliente Supabase es singleton + getOrgId() cacheado
- Hook genérico `useTableSync<T>()` unifica el patrón fetch+offline+realtime para los hooks de datos

## Módulos implementados
- **Dashboard** — métricas, gráficos, alertas stock bajo
- **Stock/Inventario** — ABM productos con SKU, talle, color, costo, precio, proveedor
- **Ventas** — registro, facturación, escáner código de barras, PDF, email
- **Finanzas** — ingresos/egresos, flujo de caja
- **Archivos** — upload a Supabase Storage
- **Cuotas** — planes de pago manual y digital con MP
- **Configuración** — datos del negocio, conexión MP OAuth
- **Empleados** — solo plan Premium, invitación por email, roles y permisos
- **Búsqueda global** — Ctrl+K, busca en productos/ventas/movimientos (integrada en layout)
- **Notificaciones** — campana en header (integrada en layout)

## Planes y suscripción
- **StockFlow Normal** — $9.990 ARS/mes, 1 usuario
- **StockFlow Premium** — $19.990 ARS/mes, usuarios ilimitados con roles
- Trial de 30 días gratis con tarjeta obligatoria al registrarse
- Cobro automático vía MP preapproval al día 31
- Paywall `PaywallTrial` se muestra cuando trial vence o suscripción inactiva

## Tablas principales en Supabase
```
organizations     — datos del negocio (nombre, cuit, mp_access_token, etc.)
profiles          — usuarios vinculados a una org (role, permisos JSONB)
productos         — inventario (org_id, sku, talle, color, cantidad, stock_minimo)
ventas            — cabecera de venta
venta_items       — líneas de cada venta
movimientos       — flujo de caja (ingreso/egreso)
archivos          — metadata de archivos en Storage
cuotas_ventas     — planes de cuotas a clientes
cuota_pagos       — cuotas individuales de cada plan
suscripciones     — estado del plan de cada org (trial/activa/vencida)
invitaciones      — tokens para invitar empleados
historial         — log de cambios por usuario
```

## Offline
- `src/lib/db/indexeddb.ts` — base de datos local con idb
- `src/lib/sync/syncManager.ts` — sube cambios locales al reconectarse + delta pull
- Los hooks usan `useTableSync<T>()` que verifica `navigator.onLine` internamente
- Si offline: lee de IndexedDB y encola en `sync_queue`
- Si online: escribe en Supabase Y guarda copia en IndexedDB
- El SW en `public/sw.js` cachea assets estáticos

## Seguridad
- `src/proxy.ts` — auth + CORS + redirect guard + security headers (renombrado desde `middleware.ts` en Next 16)
- `vercel.json` — headers de seguridad incluyendo CSP
- `Permissions-Policy` NO incluye `camera=()` para permitir el escáner
- RLS en todas las tablas con políticas separadas por operación

## Factura PDF (estándar argentino)
- `src/lib/ticket.ts` — genera PDF con jsPDF
- Incluye: tipo comprobante (A/B/C/X), CUIT, IIBB, condición IVA, CAE
- Los datos del negocio se leen desde `organizations` en Supabase

## Variables de entorno necesarias
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
MP_ACCESS_TOKEN
MP_PUBLIC_KEY
NEXT_PUBLIC_MP_PUBLIC_KEY
MP_APP_ID
MP_WEBHOOK_SECRET
ARCA_CUIT (opcional, para facturación electrónica)
ARCA_CERT_PEM (opcional)
ARCA_PRIVATE_KEY_PEM (opcional)
ARCA_PUNTO_VENTA (opcional)
ARCA_AMBIENTE (testing/produccion)
```

## Instrucciones del dueño del proyecto
- El proyecto es para vender a PyMEs de Resistencia, Chaco, Argentina
- Preferir soluciones simples y directas
- No usar Tailwind en los componentes — usar estilos inline con objetos React.CSSProperties
- Los colores principales: accent #7C6FE0, success #22C97A, danger #E05555, amber #E0A030
- Siempre verificar `navigator.onLine` antes de llamar a Supabase
- El org_id se obtiene desde localStorage('sf_org_id') o desde profiles en Supabase
- Mercado Pago es el único procesador de pagos (Argentina)
- ARCA/AFIP para facturación electrónica (aún no activado en producción)
- El negocio del dueño se llama "Matineta"

## URL de producción
https://stockflow-indol.vercel.app

## Repositorio
https://github.com/Matias5855/stockflow

## Pendiente por implementar
- [ ] Paywall integrado en layout cuando trial vence
- [ ] Emails de aviso días 23 y 28 del trial
- [ ] Página de aceptar invitación `/invite/[token]`
- [ ] Historial de cambios visible en UI
- [ ] Dashboard de admin para el dueño de StockFlow
- [ ] Exportar Excel/PDF (código en `src/lib/exportar.ts`, falta integrar botones)
- [ ] Unificar `sf_org_name` y `sf_org_nombre` en localStorage
- [ ] Seguridad: verificar firma de webhook MP, sanitizar emails, rate limiting, chequeo de rol en API routes
