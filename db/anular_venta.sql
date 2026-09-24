-- ============================================================================
-- Stockio — Anular una venta
--
-- POR QUÉ ANULAR Y NO BORRAR
--
-- Una factura emitida no se borra: se anula. Borrarla deja un hueco en la
-- numeración correlativa que ARCA exige, y hace desaparecer el rastro de que
-- la operación existió. Anular conserva la fila, marca el estado y deshace
-- los efectos.
--
-- QUÉ DESHACE, TODO EN UNA TRANSACCIÓN
--   1. estado -> 'cancelada'
--   2. el stock vuelve al inventario (lo hace el trigger stock_al_cambiar_estado)
--   3. la plata sale de la caja, con un movimiento contrario
--
-- El punto 3 es el que faltaba: hasta ahora nadie revertía el ingreso, así que
-- una venta anulada seguía figurando como plata cobrada en Finanzas.
--
-- Se usa un asiento CONTRARIO (egreso) en vez de borrar el ingreso original,
-- para que en el flujo de caja quede visible que hubo una venta y que se
-- anuló. Borrarlo dejaría la historia mintiendo sobre lo que pasó.
--
-- PERMISO: eliminar_ventas. Es la misma clave que gatea borrar, porque anular
-- cumple la misma función — y por la misma razón que se decidió el 2026-09-22,
-- queda solo para el dueño: hacer desaparecer una venta es la forma directa de
-- tapar un faltante de caja.
--
-- Requiere db/fix_restaurar_stock.sql corrido (sin eso el paso 2 falla).
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION anular_venta(p_venta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_org_id();
  v_venta  record;
  v_plan   uuid;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'SIN_ORG: usuario sin organización';
  END IF;

  IF NOT tiene_permiso('eliminar_ventas') THEN
    RAISE EXCEPTION 'SIN_PERMISO: no tenés permiso para anular ventas';
  END IF;

  SELECT * INTO v_venta FROM ventas WHERE id = p_venta_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ENCONTRADA: esa venta no existe en tu negocio';
  END IF;

  -- Idempotente: anular dos veces no duplica el egreso ni devuelve el stock
  -- dos veces.
  IF v_venta.estado = 'cancelada' THEN
    RETURN jsonb_build_object('id', p_venta_id, 'nro_factura', v_venta.nro_factura, 'ya_estaba', true);
  END IF;

  -- Una venta nacida de un plan de cuotas no se anula desde acá: habría que
  -- deshacer también el plan, sus cuotas y lo ya cobrado. Se avisa en vez de
  -- dejar las dos cosas inconsistentes.
  SELECT id INTO v_plan FROM cuotas_ventas WHERE venta_id = p_venta_id LIMIT 1;
  IF v_plan IS NOT NULL THEN
    RAISE EXCEPTION 'TIENE_PLAN_CUOTAS: esta venta tiene un plan de cuotas. Anulá el plan desde Cuotas.';
  END IF;

  -- Dispara stock_al_cambiar_estado, que devuelve las unidades al inventario.
  UPDATE ventas SET estado = 'cancelada' WHERE id = p_venta_id;

  -- El ingreso se crea siempre al vender (esté cobrada o pendiente), así que
  -- el egreso también va siempre.
  INSERT INTO movimientos (descripcion, tipo, categoria_nombre, monto, fecha, venta_id, org_id)
  VALUES (
    'Anulación venta ' || v_venta.nro_factura ||
      COALESCE(' — ' || v_venta.cliente_nombre, ''),
    'egreso', 'Ventas',
    COALESCE(v_venta.total, 0),
    CURRENT_DATE,
    p_venta_id, v_org_id
  );

  RETURN jsonb_build_object(
    'id', p_venta_id,
    'nro_factura', v_venta.nro_factura,
    'monto', COALESCE(v_venta.total, 0),
    'ya_estaba', false
  );
END;
$$;

REVOKE ALL ON FUNCTION anular_venta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION anular_venta(uuid) TO authenticated;

-- Verificación. Esperado: una fila 'OK'.
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'anular_venta' AND p.prosecdef)
       THEN 'OK: anular_venta() creada'
       ELSE 'FALLA: no se creó anular_venta()' END AS resultado;
