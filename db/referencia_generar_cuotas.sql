-- ============================================================================
-- Stockio — REFERENCIA: trigger generar_cuotas()
--
-- NO HACE FALTA CORRERLO. Es una copia de lo que ya está en la base.
--
-- Esta función se creó en su momento desde el dashboard de Supabase y su
-- definición no estaba en ningún archivo del repo: vivía solo en la base. Se
-- copió acá (sacada con pg_get_functiondef el 2026-10-05) para que el código que
-- depende de ella se pueda leer y diseñar sin adivinar.
--
-- Si se modifica en la base, actualizar esta copia. Y viceversa: editar este
-- archivo NO cambia la base (ver la memoria del proyecto sobre scripts SQL
-- commiteados que nunca se aplicaron).
--
-- QUÉ HACE
--
-- Se dispara al insertar en `cuotas_ventas` y crea las filas de `cuota_pagos`:
-- una por cuota, todas 'pendiente', con el mismo `monto_cuota`.
--
-- Detalles que importan para quien la use:
--  · La PRIMERA cuota vence un intervalo DESPUÉS de fecha_inicio, no en
--    fecha_inicio. Un plan mensual que arranca el 1/3 vence el 1/4, 1/5...
--  · 'semanal' = 7 días, 'quincenal' = 15 días, cualquier otro valor = 1 mes.
--  · El mes es aritmética de Postgres: 31/1 + 1 mes = 28/2 (o 29/2).
--  · Los ids de cuota_pagos los genera la base. Quien cree un plan no puede
--    saberlos de antemano — eso es lo que complica crear planes sin conexión.
--  · Es SECURITY INVOKER: los INSERT corren con los permisos de quien insertó
--    el plan (ver la nota de db/rls_fase_c1_cuotas_caja.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generar_cuotas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  i INTEGER;
  fecha DATE;
  intervalo INTERVAL;
BEGIN
  intervalo := CASE NEW.frecuencia
    WHEN 'semanal'    THEN INTERVAL '7 days'
    WHEN 'quincenal'  THEN INTERVAL '15 days'
    ELSE INTERVAL '1 month'
  END;

  FOR i IN 1..NEW.cantidad_cuotas LOOP
    fecha := NEW.fecha_inicio + (intervalo * i);
    INSERT INTO cuota_pagos (cuota_venta_id, org_id, nro_cuota, monto, fecha_venc, estado)
    VALUES (NEW.id, NEW.org_id, i, NEW.monto_cuota, fecha, 'pendiente');
  END LOOP;

  -- Establecer próximo vencimiento
  UPDATE cuotas_ventas SET proximo_venc = NEW.fecha_inicio + intervalo WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
