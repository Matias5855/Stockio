-- ============================================================================
-- Stockio — Venta segura
--
-- Resuelve los agujeros de concurrencia/stock del loop de ventas:
--   1. BLOQUEAR venta si no hay stock (online), de forma ATÓMICA y transaccional
--      (sin venta huérfana ni ingreso de caja fantasma).
--   2. Nº de factura ATÓMICO por organización (mata el `count+1` del cliente que
--      generaba números duplicados en ventas simultáneas / sync offline).
--   3. RESTAURAR stock al cancelar o borrar una venta (hoy el stock no vuelve).
--   4. Permitir ventas OFFLINE que al sincronizar no tengan stock: se registran
--      igual (quedan en negativo) y el front las detecta para alertar.
--
-- El trigger existente `descontar_stock` (AFTER INSERT ON venta_items) se
-- REUTILIZA tal cual — descuenta el stock cuando se insertan los items. La RPC
-- valida ANTES de insertar (con lock de fila), así el negativo solo ocurre en
-- el caso offline permitido.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente (se puede re-correr).
-- Requiere la función existente get_org_id() (ya está en el proyecto).
-- ============================================================================

-- 1. Contador de nro de factura por organización (atómico, sin race) ----------
CREATE TABLE IF NOT EXISTS venta_secuencia (
  org_id     uuid PRIMARY KEY,
  ultimo_nro integer NOT NULL DEFAULT 0
);

-- Sembrar el contador con el máximo nro ya usado por cada org (idempotente:
-- DO NOTHING evita pisar contadores ya existentes en re-corridas).
INSERT INTO venta_secuencia (org_id, ultimo_nro)
SELECT org_id,
       COALESCE(MAX(NULLIF(regexp_replace(nro_factura, '\D', '', 'g'), ''))::int, 0)
FROM ventas
WHERE org_id IS NOT NULL
GROUP BY org_id
ON CONFLICT (org_id) DO NOTHING;

-- 2. RPC: crear venta con bloqueo de stock ------------------------------------
-- SECURITY DEFINER + org derivada de get_org_id() => el cliente NO puede crear
-- ventas para otra org ni descontar stock ajeno.
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
  IF p_venta_id IS NOT NULL AND EXISTS (SELECT 1 FROM ventas WHERE id = p_venta_id) THEN
    RETURN jsonb_build_object(
      'id', p_venta_id,
      'nro_factura', (SELECT nro_factura FROM ventas WHERE id = p_venta_id),
      'sin_stock', '[]'::jsonb,
      'ya_existia', true
    );
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
  v_nrof := 'FC-' || LPAD(v_nro::text, 4, '0');

  -- Insertar venta.
  v_id := COALESCE(p_venta_id, gen_random_uuid());
  INSERT INTO ventas (id, org_id, nro_factura, cliente_nombre, fecha, estado,
                      subtotal, descuento, total, notas)
  VALUES (
    v_id, v_org_id, v_nrof,
    p_venta->>'cliente_nombre',
    COALESCE((p_venta->>'fecha')::date, CURRENT_DATE),
    COALESCE(p_venta->>'estado', 'cobrada'),
    COALESCE((p_venta->>'subtotal')::numeric, 0),
    COALESCE((p_venta->>'descuento')::numeric, 0),
    COALESCE((p_venta->>'total')::numeric, 0),
    p_venta->>'notas'
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

-- 3. Restaurar / re-descontar stock al cancelar, reactivar o borrar -----------
CREATE OR REPLACE FUNCTION restaurar_stock_de_venta(p_venta_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE productos p
  SET cantidad = cantidad + vi.cantidad
  FROM venta_items vi
  WHERE vi.venta_id = p_venta_id AND vi.producto_id = p.id;
END;
$$;

CREATE OR REPLACE FUNCTION descontar_stock_de_venta(p_venta_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE productos p
  SET cantidad = cantidad - vi.cantidad
  FROM venta_items vi
  WHERE vi.venta_id = p_venta_id AND vi.producto_id = p.id;
END;
$$;

-- Trigger en UPDATE de ventas: cancelar devuelve stock; reactivar lo vuelve a descontar.
CREATE OR REPLACE FUNCTION trg_stock_cambio_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'cancelada' AND OLD.estado IS DISTINCT FROM 'cancelada' THEN
    PERFORM restaurar_stock_de_venta(NEW.id);
  ELSIF OLD.estado = 'cancelada' AND NEW.estado IS DISTINCT FROM 'cancelada' THEN
    PERFORM descontar_stock_de_venta(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_al_cambiar_estado ON ventas;
CREATE TRIGGER stock_al_cambiar_estado
AFTER UPDATE ON ventas
FOR EACH ROW EXECUTE FUNCTION trg_stock_cambio_estado();

-- Trigger en DELETE de ventas: devolver stock SOLO si no estaba ya cancelada
-- (si estaba cancelada, el stock ya se restauró). Corre antes del cascade, así
-- los venta_items todavía existen.
CREATE OR REPLACE FUNCTION trg_stock_al_borrar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM 'cancelada' THEN
    PERFORM restaurar_stock_de_venta(OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS stock_al_borrar ON ventas;
CREATE TRIGGER stock_al_borrar
BEFORE DELETE ON ventas
FOR EACH ROW EXECUTE FUNCTION trg_stock_al_borrar();

-- ============================================================================
-- Listo. La app llama a crear_venta_segura() en vez de insertar a mano.
-- ============================================================================
