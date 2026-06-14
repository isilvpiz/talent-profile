-- ═══════════════════════════════════════════════════════════════
-- Talent Profile — Row Level Security Policies
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL → New Query)
-- ═══════════════════════════════════════════════════════════════

-- 1. Habilitar RLS en las tablas
ALTER TABLE talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_config ENABLE ROW LEVEL SECURITY;

-- 2. talent_profiles: SELECT — visibilidad según rol del usuario
-- Admin ve todo; Director ve staff/lider/manager; Manager ve staff/lider; Lider ve staff
CREATE POLICY "profiles_select" ON talent_profiles FOR SELECT USING (
  CASE (auth.jwt() -> 'user_metadata' ->> 'role')
    WHEN 'admin' THEN true
    WHEN 'director' THEN
      (data -> 'general' ->> 'nivel') IN ('Staff', 'staff', 'Líder', 'líder', 'lider', 'Manager', 'manager', '')
      OR (data -> 'general' ->> 'nivel') IS NULL
    WHEN 'manager' THEN
      (data -> 'general' ->> 'nivel') IN ('Staff', 'staff', 'Líder', 'líder', 'lider', '')
      OR (data -> 'general' ->> 'nivel') IS NULL
    WHEN 'lider' THEN
      (data -> 'general' ->> 'nivel') IN ('Staff', 'staff', '')
      OR (data -> 'general' ->> 'nivel') IS NULL
    ELSE
      -- Fallback: usuarios sin rol solo ven staff
      (data -> 'general' ->> 'nivel') IN ('Staff', 'staff', '')
      OR (data -> 'general' ->> 'nivel') IS NULL
  END
  -- Siempre puede ver sus propios perfiles (creador)
  OR updated_by = auth.jwt() ->> 'email'
);

-- 3. talent_profiles: INSERT — cualquier usuario autenticado puede crear
CREATE POLICY "profiles_insert" ON talent_profiles FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 4. talent_profiles: UPDATE — solo el creador puede actualizar
CREATE POLICY "profiles_update" ON talent_profiles FOR UPDATE USING (
  updated_by = auth.jwt() ->> 'email'
  OR (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

-- 5. talent_profiles: DELETE — solo el creador o admin puede eliminar
CREATE POLICY "profiles_delete" ON talent_profiles FOR DELETE USING (
  updated_by = auth.jwt() ->> 'email'
  OR (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

-- 6. talent_config: lectura para todos los autenticados, escritura solo admin
CREATE POLICY "config_select" ON talent_config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "config_write" ON talent_config FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true
);

-- ═══════════════════════════════════════════════════════════════
-- 7. Tabla talent_equipo — directorio de integrantes sincronizado
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS talent_equipo (
  id SERIAL PRIMARY KEY,
  nro_empleado TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  ingreso DATE,
  antiguedad TEXT,
  job_rol TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para talent_equipo
ALTER TABLE talent_equipo ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
CREATE POLICY "equipo_select" ON talent_equipo FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: solo admin
CREATE POLICY "equipo_insert" ON talent_equipo FOR INSERT
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

-- UPDATE: solo admin
CREATE POLICY "equipo_update" ON talent_equipo FOR UPDATE
  USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);

-- DELETE: solo admin
CREATE POLICY "equipo_delete" ON talent_equipo FOR DELETE
  USING ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true);
