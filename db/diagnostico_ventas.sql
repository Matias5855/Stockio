-- ============================================================================
-- Stockio — Diagnóstico: por qué no se puede eliminar una venta
--
-- SOLO LECTURA. No modifica nada.
--
-- Dos preguntas a responder:
--   1. ¿Qué bloquea el DELETE de una venta? Casi siempre es una clave foránea
--      de otra tabla que apunta a `ventas` sin ON DELETE CASCADE: si quedan
--      filas hijas, Postgres rechaza el borrado.
--   2. ¿De dónde salió el FC-3004 duplicado, si el contador está en 30048420?
--
-- Correr en Supabase → SQL Editor y pegar el resultado completo.
-- ============================================================================

SELECT linea FROM (

  -- 1. Quién apunta a `ventas`, y qué pasa al borrar ------------------------
  -- 'NO ACTION' o 'RESTRICT' = el borrado FALLA si hay filas hijas.
  -- 'CASCADE'   = las hijas se borran solas (lo que hace falta acá).
  SELECT 1 AS sec, 0 AS ord, '===== 1. CLAVES FORANEAS HACIA ventas =====' AS linea
  UNION ALL
  SELECT 1, 1, format('%s.%s -> ventas.%s   ON DELETE: %s',
                      tc.table_name, kcu.column_name, ccu.column_name, rc.delete_rule)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND ccu.table_name = 'ventas'
     AND tc.table_schema = 'public'

  -- 2. Triggers que corren al borrar una venta ------------------------------
  UNION ALL SELECT 2, 0, ''
  UNION ALL SELECT 2, 1, '===== 2. TRIGGERS DE DELETE EN ventas ====='
  UNION ALL
  SELECT 2, 2, format('%s  (%s)', tgname, pg_get_triggerdef(t.oid))
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.ventas'::regclass
     AND NOT t.tgisinternal

  -- 3. Las ventas con número repetido, completas ----------------------------
  UNION ALL SELECT 3, 0, ''
  UNION ALL SELECT 3, 1, '===== 3. LAS DOS VENTAS DUPLICADAS ====='
  UNION ALL
  SELECT 3, 2, format('id=%s | nro=%s | cliente=%s | total=%s | estado=%s | creada=%s | items=%s',
                      v.id, v.nro_factura, v.cliente_nombre, v.total, v.estado, v.created_at,
                      (SELECT count(*) FROM venta_items vi WHERE vi.venta_id = v.id))
    FROM ventas v
   WHERE (v.org_id, v.nro_factura) IN (
           SELECT org_id, nro_factura FROM ventas
            GROUP BY org_id, nro_factura HAVING count(*) > 1)

  -- 4. Cómo vienen numeradas las ventas -------------------------------------
  -- Si conviven FC- de 4 dígitos con FC- de 8, el contador se reseteó o
  -- las filas viejas se crearon antes de que existiera venta_secuencia.
  UNION ALL SELECT 4, 0, ''
  UNION ALL SELECT 4, 1, '===== 4. NUMERACION EXISTENTE ====='
  UNION ALL
  SELECT 4, 2, format('%s  (%s ventas, la mas reciente %s)',
                      split_part(nro_factura, '-', 1) || '- ' || length(split_part(nro_factura, '-', 2))::text || ' digitos',
                      count(*), max(created_at))
    FROM ventas
   GROUP BY split_part(nro_factura, '-', 1), length(split_part(nro_factura, '-', 2))

  -- 5. Estado del contador ---------------------------------------------------
  UNION ALL SELECT 5, 0, ''
  UNION ALL SELECT 5, 1, '===== 5. CONTADOR ====='
  UNION ALL
  SELECT 5, 2, format('org=%s  ultimo_nro=%s', org_id, ultimo_nro) FROM venta_secuencia

) t ORDER BY sec, ord, linea;
