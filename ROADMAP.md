# Stockio — Roadmap de profesionalización

Lista de cosas pendientes para que el producto esté completamente listo
para vender de forma profesional. Ordenado por urgencia real.

> **Estado actual del MVP**: funcional y deployado en `https://stockio.com.ar`.
> Todas las features core (stock, ventas, cuotas, facturas, MP, ARCA,
> empleados, historial) están implementadas y probadas. Lo que sigue
> son refinamientos y cosas legales/comerciales para vender al mercado.

---

## 🔴 IMPRESCINDIBLE antes de vender al primer cliente

### 1. Términos y Condiciones + Política de Privacidad
- Sin esto Defensa al Consumidor (Ley 24.240) puede multar
- AFIP/ARCA lo pide para facturar como SaaS
- Clientes B2B serios lo exigen
- **Recomendación**: ver sección "Servicios T&C" más abajo

### 2. Cancelar suscripción ❌ NO IMPLEMENTADO
- El user no puede cancelar su plan desde dentro de Stockio
- Por Ley 24.240 art. 10 ter es **obligatorio** ofrecer cancelación tan
  fácil como la suscripción
- **Ubicación esperada**: Configuración → Suscripción → botón "Cancelar plan"
- **Endpoint a crear**: `POST /api/suscripcion/cancelar`
  - Llamar a MP: `PUT /preapproval/{mp_suscripcion_id}` con `{ status: 'cancelled' }`
  - Actualizar `suscripciones.estado = 'cancelada'` localmente
  - El paywall ya muestra el flow correcto cuando estado=cancelada
- **Backend**: existe `webhook/mp/route.ts` que maneja el estado
  cancelada cuando MP avisa, pero NO hay endpoint propio para iniciar
  la cancelación
- **UI**: agregar sección en `configuracion/page.tsx` con datos del plan
  actual + botón rojo "Cancelar suscripción" + modal de confirmación

### 3. Verificar dominio en Resend
- Hoy los emails van de `onboarding@resend.dev` (poco profesional, riesgo spam)
- Cambiar a `notificaciones@stockio.com.ar` o `hola@stockio.com.ar`
- Resend → Domains → Add `stockio.com.ar` → agregar 3 registros DNS en Cloudflare

### 4. Probar `/recuperar` end-to-end
- La ruta existe pero no fue probada en producción

### 5. Verificar backups Supabase
- Bajar 1 backup manual y confirmar que se puede restaurar
- Documentar el procedimiento de restore

---

## 🟠 PROFESIONALIZACIÓN

### 6. Favicon e íconos PWA en teal
- `public/icon-192.png` y `icon-512.png` siguen siendo del morado viejo
- Generar nuevos con [favicon.io](https://favicon.io/) — letra "S" color `#0D9488`

### 7. Open Graph image
- Imagen 1200×630 para previews en WhatsApp / Twitter / etc
- Diseñar en Canva, guardar en `public/og-image.png`
- Referenciar en `app/layout.tsx` con `metadata.openGraph`

### 8. Logo "S" en SVG profesional
- Hoy es una letra en CSS, queda amateur
- Freelancer Workana ~$5.000-10.000 ARS
- Necesitamos versiones: solo icono, logo + texto, blanco y negro para impresión

### 9. Página de Pricing pública
- Sumar sección `/pricing` o `#planes` en la landing
- Cards de Normal y Premium con tabla comparativa
- CTA "Empezar ahora" que linkea a `/register?plan=normal|premium`

### 10. Onboarding inicial dentro de la app
- Wizard de 3 pasos para usuarios nuevos:
  1. Cargá tu primer producto
  2. Hacé tu primera venta
  3. Conectá Mercado Pago
- Reduce drásticamente "no entiendo cómo funciona"

---

## 🟡 OPERACIONAL (para vos como dueño)

### 11. Dashboard de admin (oculto, solo para Matías)
- Ruta `/admin` accesible solo desde email específico
- Métricas: total orgs, distribución por plan, MRR, churn rate
- Lista de clientes con estado de pago

### 12. Monitoreo de errores: Sentry
- Plan free: 5.000 errores/mes
- Setup en 15 min
- Te llega email cuando algo explota en producción

### 13. Analytics
- [Plausible](https://plausible.io) o [Umami](https://umami.is) (self-hosted gratis)
- Mide: visitantes únicos, fuentes de tráfico, conversión a registro

### 14. Email transaccional con plantilla mejor
- Hoy los emails son funcionales pero secos
- Usar [React Email](https://react.email) — diseñas con componentes React
- Compatible con Resend

---

## 🟢 MARKETING / VENTAS

### 15. Video demo de 2 minutos
- Grabar con [Loom](https://loom.com) (gratis)
- Embed en landing arriba del Hero

### 16. Casos de éxito / testimonios
- Al principio podés usar Matineta como caso real
- 3-5 testimonios con foto + quote

### 17. Comparativa con Excel
- Sección en landing: "Stockio vs Excel"
- Tabla con ✅/❌

### 18. Posicionamiento local Chaco
- Cámara de Comercio de Resistencia
- Visitas presenciales con demo en celular
- Grupos de Facebook de comerciantes

---

## ⚪ ESCALABILIDAD (para más adelante)

### 19. Rate limiting persistente
- Hoy en memoria, con Upstash Redis (free 10k/día) sería real

### 20. CI/CD con GitHub Actions
- Correr `npm test` antes del deploy
- Bloquear push si tests fallan

### 21. Sistema de tickets / chat
- [Crisp.chat](https://crisp.chat) free tier
- Embeber en el dashboard cuando haya 20+ clientes

### 22. Status page
- Página `status.stockio.com.ar` con uptime
- Útil cuando tengas clientes que pregunten "se cayó Stockio?"

---

## 📚 Servicios para Términos y Condiciones + Privacidad

### Mi recomendación: arrancar con generador gratis, después contratar abogado

**Opción A (recomendada para arrancar — $0):** **Termly**
- [termly.io](https://termly.io)
- Genera T&C + Política de Privacidad + Cookie Policy en español
- Adaptado a normativa LATAM
- Plan free permite hasta 1 dominio
- Embed code que actualizan ellos si cambia la ley

**Opción B (cuando tengas 10+ clientes — $5-15k ARS):** Abogado en Workana
- Buscar "abogado SaaS Argentina" en [workana.com](https://workana.com)
- Pediles un combo: T&C + Privacidad + Aviso Legal + Política de Cookies
- Importante que mencionen:
  - Ley 24.240 (Defensa del Consumidor)
  - Ley 25.326 (Protección de Datos Personales)
  - Resolución 1.317/2024 (consumidor digital)
- Cotización típica: $5.000-15.000 ARS

**Opción C (alternativa gratis):** GetTerms.io
- Más simple que Termly, plantillas en español
- Para arrancar sirve

**Lo que NO te recomiendo:**
- Copiar T&C de otra empresa (legalmente vulnerable)
- Dejarlo para "después" (te puede caer una multa de Defensa al Consumidor)

### Una vez que tengas los textos:
- Crear páginas estáticas `/terminos` y `/privacidad` en Next.js
- Linkearlos desde el footer de la landing
- Linkearlos también en `/register` antes del botón final ("Acepto los Términos y Privacidad")
- Mantenerlos versionados con fecha "Última actualización: DD/MM/AAAA"

---

## 🎯 Mi recomendación de orden de ejecución

**Fase 1 — Esta semana (legal + técnico crítico):**
1. T&C + Privacidad con Termly
2. **Cancelar suscripción** (Configuración + endpoint API)
3. Verificar dominio en Resend
4. Probar `/recuperar` end-to-end
5. Setup Sentry

**Fase 2 — Próximas 2 semanas (presentación):**
6. Favicon + íconos PWA en teal
7. Open Graph image
8. Página de Pricing pública en landing

**Fase 3 — Antes del primer cliente real:**
9. Video demo Loom
10. Dashboard de admin
11. Onboarding wizard

**Fase 4 — Cuando ya tenga 5+ clientes:**
12. Logo SVG profesional
13. Email transaccional con React Email
14. Casos de éxito reales
15. Status page

**Fase 5 — Escalando (10+ clientes):**
16. Rate limit persistente con Upstash
17. CI/CD con GitHub Actions
18. Crisp.chat / sistema de tickets
19. Abogado para revisar T&C personalizados

---

## 📌 Notas técnicas para futura referencia

### Cómo cancelar una suscripción en MP (referencia para implementar feature)
```typescript
// PUT https://api.mercadopago.com/preapproval/{id}
// Headers: Authorization: Bearer ACCESS_TOKEN
// Body: { "status": "cancelled" }
```

Después de cancelar en MP, MP dispara el webhook con `subscription_preapproval`
y el handler en `webhook/mp/route.ts` ya actualiza el estado a `cancelada`.
Solo hace falta el endpoint que inicia el cancel + la UI con el botón.

### Estado actual de seguridad
- ✅ Webhook MP firmado con HMAC SHA-256
- ✅ Rate limiting in-memory en /register y /aceptar
- ✅ RLS en todas las tablas Supabase
- ✅ Encriptación AES-256-GCM para certificados ARCA
- ✅ Roles owner/admin/vendedor/repositor con permisos
- ⚠ Rate limit no es multi-instancia (fix con Upstash en Fase 5)
- ⚠ Falta endpoint de cancelar suscripción (Fase 1)
- ⚠ Falta CI/CD que valide tests antes del deploy (Fase 5)
