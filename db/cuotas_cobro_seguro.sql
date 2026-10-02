-- ============================================================================
-- Stockio — RPC transaccional para cobrar una cuota
--
-- QUÉ ARREGLA (dos cosas que ya pasan HOY, online — no es solo para offline)
--
-- 1. LAS CUATRO ESCRITURAS NO ERAN ATÓMICAS. Cobrar una cuota toca cuatro
--    tablas: cuota_pagos (marcar pagada), cuotas_ventas (avanzar el plan),
--    movimientos (el ingreso en caja) y ventas (marcar cobrada al completar).
--    Iban sueltas desde el navegador. Desde la fase C1 cada una revisa su error
--    y avisa cuál falló, pero NO se revierte: la cuota puede quedar pagada y la
--    plata no entrar en Finanzas. El usuario tiene que corregirlo a mano.
--
-- 2. SE PERDÍAN COBROS POR UNA CARRERA. `monto_pagado` y `cuotas_pagadas` se
--    calculaban en el CLIENTE (leer, sumar uno, escribir el valor absoluto).
--    Dos cobros simultáneos del mismo plan leen `cuotas_pagadas = 2` y los dos
--    escriben 3: un cobro desaparece del plan aunque su cuota figure pagada.
--    No hace falta que sean dos empleados — el webhook de Mercado Pago hace
--    exactamente el mismo read-modify-write, así que alcanza con que un cliente
--    pague por link mientras alguien cobra otra cuota en el mostrador.
--    Acá los contadores se incrementan EN SQL (`monto_pagado + v_monto`), que
--    es atómico y no puede perder nada.
--
-- 3. Y habilita el cobro OFFLINE, que era el pedido original: al ser idempotente
--    por el id de la cuota, reintentar la sincronización no cobra dos veces.
--
-- IDEMPOTENCIA
--
-- Si la cuota ya está pagada, la función NO vuelve a sumar nada: devuelve
-- `ya_estaba = true` y corta. Eso es lo que hace seguro reintentar desde la cola
-- offline, donde un ítem se reintenta hasta que se confirma.
--
-- `p_movimiento_id` existe para el mismo motivo: si el cliente ya mostró el
-- ingreso en su base local, pasa ese id y el servidor crea el movimiento con el
-- MISMO id. Sin eso quedaría un movimiento fantasma local que no existe en el
-- servidor, y Finanzas mostraría la plata dos veces hasta el próximo full pull.
--
-- QUIÉN PUEDE LLAMARLA
--
-- `authenticated` con el permiso `gestionar_cuotas` y solo sobre cuotas de su
-- organización. `service_role` (el webhook de Mercado Pago, que corre sin
-- sesión de usuario) queda exento del chequeo de org y permiso: no tiene
-- `auth.uid()` del cual derivarlos, y solo se llega con la clave secreta del
-- servidor. El chequeo es explícito sobre auth.role(), NO "si no hay org
-- entonces es el servidor" — un usuario logueado sin profile también daría
-- org NULL y entraría por esa puerta.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION registrar_pago_cuota(
  p_cuota_pago_id uuid,
  p_metodo        text DEFAULT 'efectivo',
  p_mp_payment_id text DEFAULT NULL,
  p_fecha         date DEFAULT NULL,
  p_movimiento_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_servidor boolean := (auth.role() = 'service_role');
  v_org_usuario uuid    := get_org_id();
  v_pago        record;
  v_plan        record;
  v_fecha       date    := COALESCE(p_fecha, CURRENT_DATE);
  v_completada  boolean;
  v_mov_id      uuid;
BEGIN
  -- Lock de la fila del pago. Serializa dos cobros simultáneos de la MISMA
  -- cuota: el segundo espera, ve estado='pagada' y sale por idempotencia.
  SELECT * INTO v_pago FROM cuota_pagos WHERE id = p_cuota_pago_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUOTA_INEXISTENTE: no existe esa cuota';
  END IF;

  IF NOT v_es_servidor THEN
    IF v_org_usuario IS NULL THEN
      RAISE EXCEPTION 'SIN_ORG: usuario sin organización';
    END IF;
    IF v_pago.org_id <> v_org_usuario THEN
      -- Mismo mensaje que si no existiera: no se confirma que el id sea válido
      -- en otro negocio.
      RAISE EXCEPTION 'CUOTA_INEXISTENTE: no existe esa cuota';
    END IF;
    IF NOT tiene_permiso('gestionar_cuotas') THEN
      RAISE EXCEPTION 'SIN_PERMISO: no tenés permiso para cobrar cuotas';
    END IF;
  END IF;

  -- Idempotencia: ya cobrada, no se suma de nuevo.
  IF v_pago.estado = 'pagada' THEN
    RETURN jsonb_build_object(
      'cuota_pago_id', p_cuota_pago_id,
      'ya_estaba', true
    );
  END IF;

  UPDATE cuota_pagos
     SET estado        = 'pagada',
         fecha_pago    = v_fecha,
         metodo_pago   = COALESCE(p_metodo, 'efectivo'),
         mp_payment_id = COALESCE(p_mp_payment_id, mp_payment_id)
   WHERE id = p_cuota_pago_id;

  -- Avanzar el plan con incrementos RELATIVOS: esto es lo que mata la carrera.
  UPDATE cuotas_ventas
     SET monto_pagado   = monto_pagado + v_pago.monto,
         cuotas_pagadas = cuotas_pagadas + 1,
         estado         = CASE WHEN cuotas_pagadas + 1 >= cantidad_cuotas
                               THEN 'completada' ELSE 'activa' END
   WHERE id = v_pago.cuota_venta_id
   RETURNING * INTO v_plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_INEXISTENTE: la cuota no pertenece a ningún plan';
  END IF;

  v_completada := v_plan.cuotas_pagadas >= v_plan.cantidad_cuotas;

  -- Ingreso en caja. El id puede venir del cliente para que coincida con el que
  -- ya mostró localmente (ver nota de idempotencia arriba).
  v_mov_id := COALESCE(p_movimiento_id, gen_random_uuid());
  INSERT INTO movimientos (id, descripcion, tipo, categoria_nombre, monto, fecha, venta_id, org_id)
  VALUES (
    v_mov_id,
    'Cobro cuota ' || COALESCE(v_plan.cliente_nombre, '') ||
      ' (' || v_plan.cuotas_pagadas || '/' || v_plan.cantidad_cuotas || ')',
    'ingreso', 'Cuotas',
    v_pago.monto, v_fecha,
    v_plan.venta_id,            -- queda enlazado a la venta si el plan la tiene
    v_pago.org_id
  )
  ON CONFLICT (id) DO NOTHING;  -- re-sync con el mismo id no duplica el ingreso

  -- Plan completo => la venta vinculada pasa a cobrada.
  IF v_completada THEN
    IF v_plan.venta_id IS NOT NULL THEN
      -- Planes creados desde el alta de venta (commit 1cfdc47).
      UPDATE ventas SET estado = 'cobrada'
       WHERE id = v_plan.venta_id AND org_id = v_pago.org_id;
    ELSE
      -- Planes creados desde la pantalla de Cuotas, que arman su propia venta
      -- con numero CTA-<primeros 8 del uuid>.
      UPDATE ventas SET estado = 'cobrada'
       WHERE nro_factura = 'CTA-' || upper(left(v_plan.id::text, 8))
         AND org_id = v_pago.org_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'cuota_pago_id',  p_cuota_pago_id,
    'cuota_venta_id', v_plan.id,
    'movimiento_id',  v_mov_id,
    'cuotas_pagadas', v_plan.cuotas_pagadas,
    'monto_pagado',   v_plan.monto_pagado,
    'completada',     v_completada,
    'ya_estaba',      false
  );
END;
$$;

REVOKE ALL ON FUNCTION registrar_pago_cuota(uuid, text, text, date, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION registrar_pago_cuota(uuid, text, text, date, uuid) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: 'OK'. Que exista una sola version y con los grants correctos.
SELECT CASE
  WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='registrar_pago_cuota') <> 1
    THEN 'FALLA: no hay exactamente una version de la funcion'
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                CROSS JOIN pg_roles r
                WHERE n.nspname='public' AND p.proname='registrar_pago_cuota'
                  AND r.rolname='anon' AND has_function_privilege(r.oid,p.oid,'EXECUTE'))
    THEN 'FALLA: anon puede ejecutarla'
  ELSE 'OK: una sola version, anon sin acceso'
END AS resultado;

-- (b) movimientos.id tiene que ser PRIMARY KEY para que el ON CONFLICT (id)
--     funcione. Esperado: una fila.
SELECT c.conname, c.contype
  FROM pg_constraint c
 WHERE c.conrelid = 'public.movimientos'::regclass
   AND c.contype = 'p';

-- (c) Planes descuadrados: cuotas marcadas pagadas que no coinciden con el
--     contador del plan. Si aparece alguno, es de la carrera vieja — la RPC
--     evita que vuelva a pasar, pero no corrige lo ya descuadrado.
--     Esperado idealmente: ninguna fila.
SELECT cv.id, cv.cliente_nombre,
       cv.cuotas_pagadas            AS dice_el_plan,
       count(cp.id) FILTER (WHERE cp.estado = 'pagada') AS cuotas_pagadas_reales,
       cv.monto_pagado              AS dice_el_plan_monto,
       COALESCE(sum(cp.monto) FILTER (WHERE cp.estado = 'pagada'), 0) AS monto_real
  FROM cuotas_ventas cv
  LEFT JOIN cuota_pagos cp ON cp.cuota_venta_id = cv.id
 GROUP BY cv.id, cv.cliente_nombre, cv.cuotas_pagadas, cv.monto_pagado
HAVING cv.cuotas_pagadas <> count(cp.id) FILTER (WHERE cp.estado = 'pagada')
    OR cv.monto_pagado   <> COALESCE(sum(cp.monto) FILTER (WHERE cp.estado = 'pagada'), 0)
 ORDER BY cv.cliente_nombre;
