-- ============================================================================
-- Stockio — Arreglo: no se podía eliminar ni anular una venta
--
-- EL BUG
--
--   UPDATE productos p
--   SET cantidad = cantidad + vi.cantidad
--   FROM venta_items vi
--   WHERE ...
--
-- El `cantidad` de la derecha es ambiguo: con `venta_items` en el FROM, hay
-- dos columnas `cantidad` a la vista y Postgres no elige. Tira
-- "column reference cantidad is ambiguous" y aborta.
--
-- CONSECUENCIA — las dos funciones de stock estaban rotas:
--
--   restaurar_stock_de_venta()  -> la llama el trigger de DELETE y la rama
--                                  "cancelar" del trigger de UPDATE.
--   descontar_stock_de_venta()  -> la llama la rama "reactivar una venta
--                                  cancelada".
--
-- O sea: NINGUNA venta con ítems se podía borrar, y anular tampoco iba a
-- funcionar. No es un tema de permisos ni de RLS: falla para cualquiera,
-- incluido el dueño, y falló siempre.
--
-- Nadie lo notó porque la interfaz solo alterna entre 'cobrada' y 'pendiente',
-- nunca pone 'cancelada', así que esa rama jamás se ejecutó. Y el botón de
-- eliminar se tragaba el error sin mostrarlo.
--
-- EL ARREGLO — calificar la columna con el alias de la tabla: `p.cantidad`.
-- En un UPDATE, la columna destino del SET va sin prefijo, pero del lado
-- derecho sí se puede (y se debe) calificar.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION restaurar_stock_de_venta(p_venta_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE productos p
  SET cantidad = p.cantidad + vi.cantidad   -- p. explícito: era el bug
  FROM venta_items vi
  WHERE vi.venta_id = p_venta_id AND vi.producto_id = p.id;
END;
$$;

CREATE OR REPLACE FUNCTION descontar_stock_de_venta(p_venta_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE productos p
  SET cantidad = p.cantidad - vi.cantidad   -- p. explícito: era el bug
  FROM venta_items vi
  WHERE vi.venta_id = p_venta_id AND vi.producto_id = p.id;
END;
$$;

-- ============================================================================
-- VERIFICACIÓN — prueba real, sin tocar datos.
--
-- Simula el borrado dentro de una transacción que se revierte: si el trigger
-- vuelve a fallar, se ve acá; si anda, el ROLLBACK deja todo como estaba.
-- Reemplazá el id por el de una venta tuya que tenga ítems.
-- ============================================================================

-- BEGIN;
--   DELETE FROM ventas WHERE id = 'PONE-ACA-UN-ID';
-- ROLLBACK;

-- Esperado: una fila 'OK'.
SELECT CASE WHEN (
         SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('restaurar_stock_de_venta', 'descontar_stock_de_venta')
            AND pg_get_functiondef(p.oid) LIKE '%p.cantidad%') = 2
       THEN 'OK: las dos funciones de stock quedaron corregidas'
       ELSE 'FALLA: alguna funcion sigue con la referencia ambigua' END AS resultado;
