-- ============================================================================
-- Stockio — Diagnóstico previo a C3 (permisos dentro de crear_venta_segura)
--
-- NO MODIFICA NADA. Son cinco consultas de lectura.
--
-- POR QUÉ ESTE PASO
--
-- C3 implica un CREATE OR REPLACE sobre crear_venta_segura(), que es por donde
-- se crea CADA venta del sistema. Si la definición que está viva en la base no
-- coincide con db/ventas_stock_seguro.sql, correr el reemplazo pisaría en
-- silencio lo que esté en vivo. Antes de eso hay que saber qué hay.
--
-- Y hay un segundo motivo, que no estaba en el plan: CREATE OR REPLACE solo
-- reemplaza la firma EXACTA. Si quedó dando vueltas una sobrecarga vieja (una
-- versión con menos parámetros, de antes de p_venta_id o p_permitir_sin_stock),
-- esa versión sigue existiendo, sigue siendo llamable desde PostgREST, y NO
-- tendría el chequeo de permisos que vamos a agregar. Sería una puerta al lado
-- de la que estamos cerrando.
--
-- Correr en Supabase → SQL Editor y pegarme las cinco salidas.
-- ============================================================================

-- (1) ¿Cuántas versiones de la función existen, y con qué firma? -------------
-- Esperado: UNA sola fila, con los 4 argumentos
-- (jsonb, jsonb, boolean, uuid). Si aparecen dos o más, hay sobrecargas
-- viejas y hay que dropearlas por firma antes de seguir.
SELECT p.oid,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS firma,
       p.prosecdef  AS es_security_definer,
       p.proconfig  AS search_path_fijado
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'crear_venta_segura'
 ORDER BY p.oid;

-- (2) Marcadores: ¿la definición viva tiene los arreglos de esta sesión? -----
-- Esperado: permisos=false (C3 es justamente lo que falta) y TODO lo demás
-- en true. Un false donde debería haber true significa que ese arreglo se
-- perdió o nunca se aplicó a la base, y hay que verlo ANTES de reemplazar.
SELECT
  position('tiene_permiso'    in def) > 0 AS ya_chequea_permisos,
  position('GREATEST(4'       in def) > 0 AS tiene_fix_lpad,
  position('metodo_pago'      in def) > 0 AS tiene_metodo_pago,
  position('p_venta_id'       in def) > 0 AS tiene_idempotencia,
  position('FOR UPDATE'       in def) > 0 AS tiene_lock_de_stock,
  position('venta_secuencia'  in def) > 0 AS usa_contador_atomico,
  length(def)                          AS largo_definicion
FROM (
  SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'crear_venta_segura'
   ORDER BY p.oid LIMIT 1
) s;

-- (3) Las funciones de stock: mismo chequeo -----------------------------------
-- Esperado: las dos con arreglo_ambiguedad = true. Ese es el fix del commit
-- 9f48e3f (la columna `cantidad` era ambigua y anular/eliminar nunca funcionó).
SELECT p.proname,
       position('vi.cantidad' in pg_get_functiondef(p.oid)) > 0 AS arreglo_ambiguedad,
       p.prosecdef AS es_security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('restaurar_stock_de_venta', 'descontar_stock_de_venta')
 ORDER BY p.proname;

-- (4) Quién puede ejecutar la RPC --------------------------------------------
-- Esperado: authenticated. Si aparece `anon`, cualquiera sin sesión podría
-- llamarla — el chequeo de permisos de C3 no alcanzaría, porque get_org_id()
-- devolvería NULL y saldría por SIN_ORG, pero igual conviene saberlo.
SELECT r.rolname AS puede_ejecutar
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN pg_roles r
 WHERE n.nspname = 'public'
   AND p.proname = 'crear_venta_segura'
   AND r.rolname IN ('anon', 'authenticated', 'service_role', 'public')
   AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
 ORDER BY r.rolname;

-- (5) La definición completa, para diferenciarla contra el repo --------------
-- Si (2) dio algo inesperado, esto es lo que hay que mirar en detalle.
SELECT pg_get_functiondef(p.oid) AS definicion_viva
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'crear_venta_segura'
 ORDER BY p.oid;
