-- ============================================================================
-- Stockio — RPC transaccional para crear un plan de cuotas
--
-- QUÉ ARREGLA
--
-- 1. CREAR UN PLAN ERAN DOS ESCRITURAS SUELTAS desde el navegador: el plan en
--    `cuotas_ventas` y su venta `CTA-xxxxxxxx` en `ventas`. Si la segunda
--    fallaba, el plan quedaba creado sin venta: el monto no aparecía en Ventas
--    y la última cuota no encontraba qué marcar como cobrada. Acá van juntas.
--
-- 2. HABILITA CREAR PLANES SIN CONEXIÓN. Es idempotente por el id del plan, que
--    ahora genera el cliente: reintentar desde la cola offline no crea dos.
--
-- LO QUE NO CAMBIA
--
-- Las cuotas las sigue generando el trigger generar_cuotas() al insertar el
-- plan (ver db/referencia_generar_cuotas.sql). No se toca.
--
-- Por eso un plan creado sin conexión NO se puede cobrar hasta que suba: las
-- cuotas que ve el navegador mientras tanto son una simulación con ids locales,
-- y el servidor va a crear las suyas con otros ids. Un cobro encolado contra un
-- id local fallaría para siempre. La app bloquea ese cobro (decisión del dueño,
-- 2026-10-05); la alternativa era cambiar el trigger para que los ids fueran
-- predecibles.
--
-- DOS ORÍGENES DE UN PLAN (actualizado 2026-10-09)
--
--  · Desde la pantalla de Cuotas: no hay venta todavía, la función crea la
--    venta `CTA-xxxxxxxx` vinculada.
--  · Desde el alta de una venta en cuotas (pantalla de Ventas): la venta YA
--    existe, con su número FC- y el stock descontado. Viene en
--    p_plan->>'venta_id', el plan se engancha a ella y NO se crea otra venta —
--    duplicaría la operación y descuadraría el inventario.
--
-- El segundo caso antes era un INSERT directo desde el navegador, que sin
-- conexión fallaba: la venta quedaba registrada y el plan no ("La venta se
-- registró, pero no se pudo crear el plan de cuotas: Failed to fetch").
--
-- Sin conexión, la venta y el plan se encolan por separado. syncManager sube
-- las ventas ANTES que las acciones de RPC, así que cuando llega este plan su
-- venta ya existe en el servidor (la venta offline sube con su id local, ver
-- p_venta_id en crear_venta_segura). Si aun así no está, VENTA_INEXISTENTE deja
-- el plan en la cola y se reintenta en el próximo sync.
--
-- PERMISO
--
-- `gestionar_cuotas`, la misma clave con la que la pantalla muestra el botón.
-- Antes la venta CTA pasaba por RLS y exigía además `crear_ventas`: alguien con
-- la primera y sin la segunda creaba el plan y se quedaba sin venta. Los tres
-- roles de fábrica tienen las dos o ninguna, así que para ellos no cambia nada.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION crear_plan_cuotas(
  p_plan    jsonb,
  p_plan_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid := get_org_id();
  v_cantidad  integer;
  v_total     numeric;
  v_cuota     numeric;
  v_frec      text;
  v_inicio    date;
  v_nro       text;
  v_venta_id  uuid := NULLIF(p_plan->>'venta_id', '')::uuid;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'SIN_ORG: usuario sin organización';
  END IF;

  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'PLAN_INVALIDO: falta el id del plan';
  END IF;

  -- Idempotencia: re-sync de un plan que ya subió. Filtrado por org, porque
  -- esta función saltea RLS (mismo cuidado que en crear_venta_segura).
  IF EXISTS (SELECT 1 FROM cuotas_ventas WHERE id = p_plan_id AND org_id = v_org_id) THEN
    RETURN jsonb_build_object('id', p_plan_id, 'ya_existia', true);
  END IF;

  IF NOT tiene_permiso('gestionar_cuotas') THEN
    RAISE EXCEPTION 'SIN_PERMISO: no tenés permiso para crear planes de cuotas';
  END IF;

  v_cantidad := (p_plan->>'cantidad_cuotas')::integer;
  v_total    := (p_plan->>'monto_total')::numeric;
  v_cuota    := (p_plan->>'monto_cuota')::numeric;
  v_frec     := COALESCE(NULLIF(p_plan->>'frecuencia', ''), 'mensual');
  v_inicio   := COALESCE((p_plan->>'fecha_inicio')::date, CURRENT_DATE);

  IF COALESCE(NULLIF(trim(p_plan->>'cliente_nombre'), ''), '') = '' THEN
    RAISE EXCEPTION 'PLAN_INVALIDO: falta el nombre del cliente';
  END IF;
  IF v_cantidad IS NULL OR v_cantidad < 1 OR v_cantidad > 120 THEN
    RAISE EXCEPTION 'PLAN_INVALIDO: cantidad de cuotas fuera de rango';
  END IF;
  IF v_total IS NULL OR v_total <= 0 OR v_cuota IS NULL OR v_cuota <= 0 THEN
    RAISE EXCEPTION 'PLAN_INVALIDO: el monto tiene que ser mayor a cero';
  END IF;

  -- Plan de una venta existente: la venta tiene que ser de este negocio.
  IF v_venta_id IS NOT NULL THEN
    SELECT nro_factura INTO v_nro FROM ventas WHERE id = v_venta_id AND org_id = v_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VENTA_INEXISTENTE: la venta del plan no existe en tu negocio';
    END IF;
  END IF;

  -- El trigger generar_cuotas() crea las filas de cuota_pagos acá.
  INSERT INTO cuotas_ventas (
    id, org_id, venta_id, cliente_nombre, cliente_email, cliente_tel,
    monto_total, monto_cuota, cantidad_cuotas, interes_pct, frecuencia, fecha_inicio
  ) VALUES (
    p_plan_id, v_org_id, v_venta_id,
    trim(p_plan->>'cliente_nombre'),
    NULLIF(trim(p_plan->>'cliente_email'), ''),
    NULLIF(trim(p_plan->>'cliente_tel'), ''),
    v_total, v_cuota, v_cantidad,
    COALESCE((p_plan->>'interes_pct')::numeric, 0),
    v_frec, v_inicio
  );

  -- Plan creado desde Cuotas: la venta vinculada, en la MISMA transacción.
  -- Mismo número que antes ("CTA-" + primeros 8 caracteres del id del plan):
  -- registrar_pago_cuota() la busca así para marcarla cobrada al completar.
  IF v_venta_id IS NULL THEN
    v_nro := 'CTA-' || upper(left(p_plan_id::text, 8));
    INSERT INTO ventas (org_id, nro_factura, cliente_nombre, fecha, estado,
                        subtotal, descuento, total, notas)
    VALUES (
      v_org_id, v_nro, trim(p_plan->>'cliente_nombre'), v_inicio, 'pendiente',
      v_total, 0, v_total,
      NULLIF(p_plan->>'notas_venta', '')
    );
  END IF;

  RETURN jsonb_build_object('id', p_plan_id, 'nro_factura', v_nro, 'ya_existia', false);
END;
$$;

REVOKE ALL ON FUNCTION crear_plan_cuotas(jsonb, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION crear_plan_cuotas(jsonb, uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — esperado: 'OK'.
-- ============================================================================
SELECT CASE
  WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='crear_plan_cuotas') <> 1
    THEN 'FALLA: no hay exactamente una versión de la función'
  WHEN NOT EXISTS (SELECT 1 FROM pg_trigger t
                    JOIN pg_proc p ON p.oid = t.tgfoid
                   WHERE t.tgrelid = 'public.cuotas_ventas'::regclass
                     AND p.proname = 'generar_cuotas' AND NOT t.tgisinternal)
    THEN 'FALLA: el trigger generar_cuotas no está en cuotas_ventas'
  ELSE 'OK: función creada y el trigger que genera las cuotas sigue en su lugar'
END AS resultado;
