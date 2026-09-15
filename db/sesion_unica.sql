-- ============================================================================
-- Stockio — Sesión única por cuenta
--
-- Problema: si el dueño le pasa su usuario y contraseña al empleado, todo el
-- sistema de roles y permisos deja de servir — los dos entran como dueño.
--
-- Supabase tiene "Enforce single session per user" nativo, pero (a) es de plan
-- Pro y (b) la revocación NO es inmediata: el chequeo corre recién cuando se
-- refresca el JWT, así que el desplazado sigue trabajando hasta 1 hora.
--
-- Esto lo resuelve a nivel de aplicación y con corte en segundos: cada
-- dispositivo tiene un ID, el último que entra lo escribe en su fila de
-- profiles, y los demás se enteran por Realtime y quedan bloqueados.
--
-- Alcance honesto: esto frena el uso compartido desde la interfaz. NO es una
-- barrera contra alguien técnico que se guarde su token y le pegue a la API
-- por fuera — esa barrera es RLS, que va aparte.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente (se puede re-correr).
-- ============================================================================

-- 1. Columnas de sesión activa ------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sesion_activa_id text,
  ADD COLUMN IF NOT EXISTS sesion_activa_en timestamptz;

COMMENT ON COLUMN profiles.sesion_activa_id IS
  'ID del dispositivo que tiene la sesión activa. El último login gana.';

-- 2. RPC para reclamar la sesión ----------------------------------------------
-- IMPORTANTE: va por SECURITY DEFINER a propósito, en vez de abrir una policy
-- de UPDATE sobre profiles. Si existiera esa policy, un empleado podría editar
-- su propia columna `permisos` y auto-asignarse todo, tirando abajo el sistema
-- de roles. Esta función solo puede tocar estas dos columnas, y siempre sobre
-- la fila del usuario autenticado (auth.uid(), no un parámetro).
CREATE OR REPLACE FUNCTION reclamar_sesion(p_sesion_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_sesion_id IS NULL OR length(p_sesion_id) = 0 THEN
    RAISE EXCEPTION 'sesion_id vacío';
  END IF;

  UPDATE profiles
     SET sesion_activa_id = p_sesion_id,
         sesion_activa_en = now()
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION reclamar_sesion(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION reclamar_sesion(text) TO authenticated;

-- 3. Realtime sobre profiles --------------------------------------------------
-- Es lo que hace que el desplazado se entere en segundos en vez de esperar al
-- vencimiento del token. La RLS de profiles sigue aplicando sobre el stream:
-- cada usuario solo recibe cambios de las filas que ya puede leer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;
