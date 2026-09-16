-- ============================================================================
-- Stockio — Diagnóstico de RLS (SOLO LECTURA, no modifica nada)
--
-- Las políticas RLS y get_org_id() se crearon desde el dashboard y no están
-- versionadas en el repo. Sin verlas no se pueden escribir políticas nuevas
-- con criterio: en Postgres las políticas PERMISSIVE se combinan con OR, así
-- que una política laxa que ya exista anula cualquier política estricta que se
-- agregue al lado. Hay que saber qué hay antes de tocar.
--
-- Correr en Supabase → SQL Editor y pegar el resultado completo.
-- Devuelve una sola columna de texto: se copia entera.
-- ============================================================================

SELECT linea FROM (

  -- 1. ¿Qué tablas tienen RLS activo? --------------------------------------
  -- rls=false  -> la tabla está ABIERTA a cualquiera con la anon key.
  -- force=false -> el dueño de la tabla saltea las políticas (normal en Supabase).
  SELECT 1 AS sec, 0 AS ord, '===== 1. RLS POR TABLA =====' AS linea
  UNION ALL
  SELECT 1, 1, format('%-20s rls=%s  force=%s', c.relname, c.relrowsecurity, c.relforcerowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'

  -- 2. Políticas existentes -------------------------------------------------
  -- Acá es donde aparece una eventual política con USING(true).
  UNION ALL SELECT 2, 0, ''
  UNION ALL SELECT 2, 1, '===== 2. POLITICAS (public) ====='
  UNION ALL
  SELECT 2, 2, format('%s | %s | %s | %s | roles=%s | USING: %s | CHECK: %s',
                      tablename, policyname, cmd, permissive,
                      array_to_string(roles, ','),
                      COALESCE(qual, '-'), COALESCE(with_check, '-'))
    FROM pg_policies WHERE schemaname = 'public'

  -- 3. Tablas con RLS activo pero SIN ninguna política ----------------------
  -- Caso peligroso al revés: nadie puede leer nada y la app falla en silencio.
  UNION ALL SELECT 3, 0, ''
  UNION ALL SELECT 3, 1, '===== 3. RLS ACTIVO SIN POLITICAS ====='
  UNION ALL
  SELECT 3, 2, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = c.relname)

  -- 4. Funciones SECURITY DEFINER ------------------------------------------
  -- Cada una saltea RLS por diseño: son superficie de ataque si aceptan
  -- parámetros que definen de quién son los datos.
  UNION ALL SELECT 4, 0, ''
  UNION ALL SELECT 4, 1, '===== 4. FUNCIONES ====='
  UNION ALL
  SELECT 4, 2, format('%s(%s) -> %s [%s] search_path=%s',
                      p.proname,
                      pg_get_function_arguments(p.oid),
                      pg_get_function_result(p.oid),
                      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END,
                      COALESCE(array_to_string(p.proconfig, ','), 'NO FIJADO'))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'

  -- 5. Cuerpo de get_org_id() ----------------------------------------------
  -- Es la pieza de la que cuelga todo el aislamiento entre negocios.
  UNION ALL SELECT 5, 0, ''
  UNION ALL SELECT 5, 1, '===== 5. get_org_id() ====='
  UNION ALL
  SELECT 5, 2, pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_org_id'

  -- 6. Qué tablas tienen org_id --------------------------------------------
  -- Las que NO lo tienen (ej. venta_items) necesitan aislarse por join, y son
  -- justo las que se suelen olvidar.
  UNION ALL SELECT 6, 0, ''
  UNION ALL SELECT 6, 1, '===== 6. COLUMNA org_id ====='
  UNION ALL
  SELECT 6, 2, format('%-20s %s', c.relname,
                      CASE WHEN EXISTS (
                        SELECT 1 FROM information_schema.columns ic
                         WHERE ic.table_schema = 'public'
                           AND ic.table_name = c.relname
                           AND ic.column_name = 'org_id')
                      THEN 'tiene org_id' ELSE '*** SIN org_id ***' END)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'

  -- 7. Políticas de Storage -------------------------------------------------
  -- El módulo Archivos sube a Supabase Storage, que tiene su propio RLS
  -- aparte del de las tablas.
  UNION ALL SELECT 7, 0, ''
  UNION ALL SELECT 7, 1, '===== 7. STORAGE ====='
  UNION ALL
  SELECT 7, 2, format('bucket: %s  public=%s', id, public) FROM storage.buckets
  UNION ALL
  SELECT 7, 3, format('policy: %s | %s | USING: %s | CHECK: %s',
                      policyname, cmd, COALESCE(qual, '-'), COALESCE(with_check, '-'))
    FROM pg_policies WHERE schemaname = 'storage'

  -- 8. Permisos de rol en las tablas ----------------------------------------
  -- Si 'anon' tiene privilegios sobre una tabla sin RLS, cualquiera con la
  -- clave pública (que está en el bundle del navegador) puede leerla.
  UNION ALL SELECT 8, 0, ''
  UNION ALL SELECT 8, 1, '===== 8. GRANTS a anon/authenticated ====='
  UNION ALL
  SELECT 8, 2, format('%-20s %-14s %s', table_name, grantee, string_agg(privilege_type, ','))
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
   GROUP BY table_name, grantee

) t
ORDER BY sec, ord, linea;
