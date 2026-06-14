-- FIX: Eliminar la policy FOR ALL que puede bloquear SELECT para no-admins
-- Ejecutar si la pestaña Equipo aparece vacía para usuarios no-admin

DROP POLICY IF EXISTS "equipo_write" ON talent_equipo;

-- Reemplazar con policies específicas por operación
CREATE POLICY "equipo_insert" ON talent_equipo FOR INSERT
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

CREATE POLICY "equipo_update" ON talent_equipo FOR UPDATE
  USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

CREATE POLICY "equipo_delete" ON talent_equipo FOR DELETE
  USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

-- Verificar que la policy de SELECT existe
-- Si no existe, crearla:
-- CREATE POLICY "equipo_select" ON talent_equipo FOR SELECT
--   USING (auth.role() = 'authenticated');
