-- ============================================================================
-- Stockio — Fase C3: crear_venta_segura() valida permisos
--
-- EL HALLAZGO ORIGINAL (hallazgo 10 del diagnóstico de RLS)
--
-- Todas las ventas se crean por esta RPC. Al ser SECURITY DEFINER corre con los
-- privilegios de su dueño y saltea RLS por diseño, y lo único que verificaba
-- era que el usuario tuviera organización. La política `ventas_insert` de
-- db/rls_fase_c2_politicas.sql era letra muerta para la app: el permiso
-- `crear_ventas` se cumplía SOLO en la interfaz, así que un POST a mano a
-- /rest/v1/rpc/crear_venta_segura registraba ventas igual.
--
-- TRES COSAS MÁS, ENCONTRADAS AL COMPARAR CON LA BASE (db/c3_diagnostico.sql)
--
-- 1. EL FIX DE LPAD NO ESTABA APLICADO. La definición viva tenía
--    `LPAD(v_nro::text, 4, '0')`, el que TRUNCA. El arreglo estaba en el repo
--    (commit cb0298e) pero nunca se corrió contra la base: lo que se corrió fue
--    fix_contador_facturas.sql, que bajó el contador y tapó el síntoma. Con
--    números de 4 dígitos o menos LPAD no recorta, así que parecía arreglado.
--    Se rompía otra vez, garantizado, en la factura 10000: LPAD('10000',4)
--    devuelve '1000' y esa factura choca con la 1000.
--
-- 2. LA IDEMPOTENCIA LEÍA SIN FILTRAR POR ORG. `SELECT nro_factura FROM ventas
--    WHERE id = p_venta_id` dentro de una función SECURITY DEFINER saltea RLS:
--    pasando el UUID de una venta ajena devolvía su número de factura. Hay que
--    adivinar un UUID, así que es menor, pero es el mismo patrón que C3 cierra.
--
-- 3. Guarda contra sobrecargas: CREATE OR REPLACE solo reemplaza la firma
--    exacta. Si quedara una versión vieja de la función (sin p_venta_id, por
--    ejemplo) seguiría siendo llamable desde PostgREST y SIN el chequeo de
--    permisos. El bloque de abajo aborta si detecta más de una.
--
-- DÓNDE VA EL CHEQUEO, Y POR QUÉ AHÍ
--
-- Después del corte por idempotencia, no antes. Si la venta ya existe, la
-- función no escribe nada y devuelve `ya_existia`. Chequear antes haría fallar
-- el re-sync de una venta YA subida por alguien a quien le sacaron el permiso
-- entre medio — un error inútil sobre una operación que no hace nada.
--
-- POR QUÉ NO SE USA ERRCODE 42501
--
-- Sería el código semánticamente correcto (insufficient_privilege), pero
-- syncManager.ts lo trata como error de AUTENTICACIÓN y mostraría "tu sesión se
-- cerró en otro dispositivo", que es un mensaje equivocado. Se deja el P0001
-- por defecto con el prefijo SIN_PERMISO:, que el cliente distingue por texto.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

-- 0. Guarda: una sola versión de la función ----------------------------------
DO $$
DECLARE
  v_cuantas integer;
BEGIN
  SELECT count(*) INTO v_cuantas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'crear_venta_segura';

  IF v_cuantas > 1 THEN
    RAISE EXCEPTION
      'ABORTADO: hay % versiones de crear_venta_segura. CREATE OR REPLACE solo '
      'reemplaza una firma, asi que las otras quedarian sin el chequeo de '
      'permisos y serian una puerta abierta. Hay que dropearlas por firma '
      'primero (ver consulta 1 de db/c3_diagnostico.sql).', v_cuantas;
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION crear_venta_segura(
  p_venta              jsonb,
  p_items              jsonb,
  p_permitir_sin_stock boolean DEFAULT false,
  p_venta_id           uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id   uuid := get_org_id();
  v_nro      integer;
  v_nrof     text;
  v_id       uuid;
  v_rec      record;
  v_stock    integer;
  v_sinstock jsonb := '[]'::jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'SIN_ORG: usuario sin organización';
  END IF;

  -- Idempotencia: si la venta ya existe (re-sync offline), no repetir nada.
  -- El filtro por org_id importa: esta funcion es SECURITY DEFINER, asi que sin
  -- el se podia leer el nro_factura de una venta de otro negocio pasando su id.
  IF p_venta_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM ventas WHERE id = p_venta_id AND org_id = v_org_id
     ) THEN
    RETURN jsonb_build_object(
      'id', p_venta_id,
      'nro_factura', (SELECT nro_factura FROM ventas
                       WHERE id = p_venta_id AND org_id = v_org_id),
      'sin_stock', '[]'::jsonb,
      'ya_existia', true
    );
  END IF;

  -- C3: el permiso, que hasta ahora solo se cumplia en la interfaz.
  -- Va DESPUES del corte por idempotencia: si la venta ya existe no se escribe
  -- nada, y fallar ahi seria un error inutil sobre una operacion vacia.
  IF NOT tiene_permiso('crear_ventas') THEN
    RAISE EXCEPTION 'SIN_PERMISO: no tenés permiso para registrar ventas';
  END IF;

  -- Validar stock por PRODUCTO (agregando cantidades de líneas repetidas),
  -- tomando lock de fila para serializar ventas simultáneas del mismo ítem.
  FOR v_rec IN
    SELECT (it->>'producto_id')::uuid AS pid,
           SUM((it->>'cantidad')::int) AS qty,
           MAX(it->>'producto_nombre') AS nombre
    FROM jsonb_array_elements(p_items) it
    WHERE COALESCE(it->>'producto_id', '') <> ''
    GROUP BY (it->>'producto_id')::uuid
  LOOP
    SELECT cantidad INTO v_stock
    FROM productos
    WHERE id = v_rec.pid AND org_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_INVALIDO: % no pertenece a tu negocio', v_rec.pid;
    END IF;

    IF v_stock < v_rec.qty THEN
      IF p_permitir_sin_stock THEN
        -- Offline: dejamos pasar y registramos el faltante para alertar.
        v_sinstock := v_sinstock || jsonb_build_object(
          'producto_id', v_rec.pid, 'producto_nombre', v_rec.nombre,
          'disponible', v_stock, 'pedido', v_rec.qty
        );
      ELSE
        -- Online: bloqueamos. El RAISE revierte TODA la transacción.
        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', COALESCE(v_rec.nombre, v_rec.pid::text);
      END IF;
    END IF;
  END LOOP;

  -- Nº de factura atómico por org.
  INSERT INTO venta_secuencia (org_id, ultimo_nro) VALUES (v_org_id, 1)
  ON CONFLICT (org_id) DO UPDATE SET ultimo_nro = venta_secuencia.ultimo_nro + 1
  RETURNING ultimo_nro INTO v_nro;
  -- OJO: LPAD no solo rellena, TRUNCA si el texto es mas largo que el ancho.
  -- Con LPAD(v_nro::text, 4, '0') y el contador en 10000 el numero sale
  -- 'FC-1000' y choca con la factura 1000. GREATEST asegura que nunca recorte.
  v_nrof := 'FC-' || LPAD(v_nro::text, GREATEST(4, length(v_nro::text)), '0');

  -- Insertar venta.
  v_id := COALESCE(p_venta_id, gen_random_uuid());
  INSERT INTO ventas (id, org_id, nro_factura, cliente_nombre, fecha, estado,
                      subtotal, descuento, total, notas, metodo_pago)
  VALUES (
    v_id, v_org_id, v_nrof,
    p_venta->>'cliente_nombre',
    COALESCE((p_venta->>'fecha')::date, CURRENT_DATE),
    COALESCE(p_venta->>'estado', 'cobrada'),
    COALESCE((p_venta->>'subtotal')::numeric, 0),
    COALESCE((p_venta->>'descuento')::numeric, 0),
    COALESCE((p_venta->>'total')::numeric, 0),
    p_venta->>'notas',
    -- p_venta es jsonb, asi que sumar un campo no cambia la firma de la RPC
    -- ni rompe a quien la llame sin el (el sync offline, por ejemplo).
    NULLIF(p_venta->>'metodo_pago', '')
  );

  -- Insertar items: el trigger `descontar_stock` descuenta el stock acá.
  INSERT INTO venta_items (venta_id, producto_id, producto_nombre, cantidad, precio_unitario)
  SELECT v_id,
         NULLIF(it->>'producto_id', '')::uuid,
         it->>'producto_nombre',
         (it->>'cantidad')::int,
         (it->>'precio_unitario')::numeric
  FROM jsonb_array_elements(p_items) it;

  -- Movimiento de caja (ingreso).
  INSERT INTO movimientos (descripcion, tipo, categoria_nombre, monto, fecha, venta_id, org_id)
  VALUES (
    'Venta ' || v_nrof || ' — ' || COALESCE(p_venta->>'cliente_nombre', ''),
    'ingreso', 'Ventas',
    COALESCE((p_venta->>'total')::numeric, 0),
    COALESCE((p_venta->>'fecha')::date, CURRENT_DATE),
    v_id, v_org_id
  );

  RETURN jsonb_build_object('id', v_id, 'nro_factura', v_nrof, 'sin_stock', v_sinstock);
END;
$$;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: una fila 'OK'. Cubre las tres cosas de este script.
SELECT CASE
  WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='crear_venta_segura') <> 1
    THEN 'FALLA: hay más de una versión de la función'
  WHEN position('tiene_permiso' in def) = 0
    THEN 'FALLA: sigue sin chequear permisos'
  WHEN position('GREATEST(4' in def) = 0
    THEN 'FALLA: LPAD sigue truncando'
  WHEN position('AND org_id = v_org_id' in def) = 0
    THEN 'FALLA: la idempotencia sigue sin filtrar por org'
  ELSE 'OK: valida crear_ventas, LPAD no trunca, idempotencia filtrada por org'
END AS resultado
FROM (
  SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='crear_venta_segura' LIMIT 1
) s;

-- (b) OJO: NO sirve correr acá `SELECT tiene_permiso('crear_ventas')`.
--     El SQL Editor no tiene sesión de usuario: `auth.uid()` es NULL, así que
--     get_user_role() devuelve NULL y tiene_permiso() devuelve false SIEMPRE,
--     tenga o no el permiso la persona. No prueba nada sobre la app.
--
--     Lo que sí se puede verificar desde acá es el dato de base: quién tiene la
--     clave cargada. Esperado: el owner con true (igual lo bypasea
--     tiene_permiso()), y cada empleado según su rol.
SELECT p.role,
       COALESCE(p.permisos->>'crear_ventas', '(sin la clave)') AS crear_ventas,
       p.full_name
  FROM profiles p
 ORDER BY p.role, p.full_name;

-- (b2) La prueba de verdad es DESDE LA APP, no desde acá: registrar una venta
--      como dueño. Si sale el número de factura, C3 no rompió nada.

-- (c) Números de factura ya emitidos, para ver que ninguno esté recortado.
--     Esperado: ningún duplicado. Si aparece alguno es de antes del arreglo.
SELECT nro_factura, count(*) AS veces
  FROM ventas
 WHERE org_id = get_org_id()
 GROUP BY nro_factura
HAVING count(*) > 1
 ORDER BY nro_factura;
