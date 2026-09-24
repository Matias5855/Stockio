-- ============================================================================
-- Stockio — Bajar el contador de facturas al número real
--
-- Correr DESPUÉS de re-correr db/ventas_stock_seguro.sql (que trae el arreglo
-- del LPAD). Sin ese arreglo, esto solo no alcanza.
--
-- LOS DOS BUGS QUE SE JUNTARON
--
-- 1. LPAD TRUNCA. `LPAD(v_nro::text, 4, '0')` no solo rellena: si el texto es
--    más largo que 4, lo recorta. Con el contador en 30048421 el número salía
--    'FC-3004' — los primeros cuatro caracteres. Todo el rango 3004xxxx
--    colapsaba al MISMO número de factura. Eso explica las dos ventas con
--    FC-3004 creadas con 98 ms de diferencia: sacaron 30048419 y 30048420 del
--    contador, y las dos truncaron igual. El contador atómico nunca falló.
--    (Arreglado en ventas_stock_seguro.sql con GREATEST.)
--
-- 2. EL CONTADOR ESTABA EN 30 MILLONES. El sembrado hacía
--    MAX(regexp_replace(nro_factura,'\D','','g')) sobre TODAS las facturas,
--    incluidas las CTA-<uuid> del módulo de Cuotas. Se sembró con los dígitos
--    de un UUID en vez del máximo real de las FC-.
--
-- POR QUÉ ESTE SCRIPT BAJA EL CONTADOR
--
-- El intento anterior usaba GREATEST(ultimo_nro, max_fc) para "nunca bajarlo".
-- Acá eso era exactamente lo contrario de lo que hace falta: el valor actual
-- no es un número de factura, es basura heredada de un UUID. Hay que bajarlo
-- al máximo REAL de las FC- emitidas.
--
-- ¿Es seguro bajarlo? Sí, mientras ninguna factura emitida supere ese máximo —
-- que es justamente cómo se calcula. No se reusa ningún número ni se deja un
-- hueco: se retoma la serie donde realmente quedó.
--
-- NO TOCA NINGUNA VENTA. Solo el contador.
-- ============================================================================

-- ANTES
SELECT 'ANTES' AS momento, org_id, ultimo_nro,
       'FC-' || LPAD((ultimo_nro+1)::text, GREATEST(4, length((ultimo_nro+1)::text)), '0') AS proxima
  FROM venta_secuencia;

-- El arreglo: el contador pasa a ser el máximo REAL de las facturas FC-.
-- Las CTA- quedan afuera a propósito: son otra serie, no facturas de venta.
UPDATE venta_secuencia vs
   SET ultimo_nro = sub.max_fc
  FROM (
    SELECT org_id,
           COALESCE(MAX(NULLIF(regexp_replace(nro_factura, '\D', '', 'g'), ''))::bigint, 0) AS max_fc
      FROM ventas
     WHERE nro_factura LIKE 'FC-%'
     GROUP BY org_id
  ) sub
 WHERE vs.org_id = sub.org_id;

-- Organizaciones sin fila en el contador (por si alguna quedó sin sembrar).
INSERT INTO venta_secuencia (org_id, ultimo_nro)
SELECT org_id,
       COALESCE(MAX(NULLIF(regexp_replace(nro_factura, '\D', '', 'g'), ''))::bigint, 0)
  FROM ventas
 WHERE nro_factura LIKE 'FC-%' AND org_id IS NOT NULL
 GROUP BY org_id
ON CONFLICT (org_id) DO NOTHING;

-- ============================================================================
-- VERIFICACIÓN — esperado: 'OK'.
-- ============================================================================
SELECT CASE WHEN EXISTS (
         SELECT 1
           FROM venta_secuencia vs
           JOIN ventas v ON v.org_id = vs.org_id
          WHERE v.nro_factura = 'FC-' || LPAD((vs.ultimo_nro+1)::text,
                                              GREATEST(4, length((vs.ultimo_nro+1)::text)), '0'))
       THEN 'FALLA: el próximo número sigue chocando con una factura existente'
       ELSE 'OK: el próximo número está libre, ya se puede vender' END AS resultado;

-- DESPUÉS
SELECT 'DESPUES' AS momento, org_id, ultimo_nro,
       'FC-' || LPAD((ultimo_nro+1)::text, GREATEST(4, length((ultimo_nro+1)::text)), '0') AS proxima
  FROM venta_secuencia;
