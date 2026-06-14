# Talent Profile — Tech Steering

## Stack
- **Frontend:** un único archivo HTML (`talent_profile_app.html`). Sin build, sin framework. CSS y JS inline.
- **Backend:** Supabase (PostgreSQL + Auth + REST API)
- **Hosting:** GitHub Pages (deploy = push del HTML)
- Supabase JS via CDN: `@supabase/supabase-js@2`
- Fuentes: DM Sans + DM Mono (Google Fonts)

## Supabase
- URL: `https://pkuxwosgnhdlifmrumuu.supabase.co`
- Tablas:
  - `talent_profiles` (id TEXT PK, data JSONB) — un perfil completo por fila en JSONB
  - `talent_config` (benchmarks, dimensiones)
- Roles asignados en `user_metadata`: admin / director / manager / lider

## Estructuras clave en código
- `EQUIPO_SEED` — directorio JSON embebido de 100 miembros
- `ROLE_COMPETENCIES` — constante de competencias por rol
- `ROLE_MATURITY_EXPECTED` — map de 12 roles → nivel de madurez esperado (1–5)
- `PERF_DIMS` / `POT_DIMS` / `MAT_DIMS` — dimensiones dinámicas reconstruidas por `onSeniorityChange()`
- `TAB_LABELS` — map estático para iconos de pestaña (evita contaminación del DOM)
- `autoFillGeneralFromEquipo()` — autocompleta datos generales al seleccionar de Equipo
- 12 roles de seniority en optgroups (Track Técnico, Analítico, Gestión, Transversal)

## Reglas de implementación (aprendizajes)
- **Validar JS con `node --check` después de cada cambio.** No entregar sin esto.
- **Ownership = triple match:** email crudo + email humanizado + nombre completo (evita bugs de `_createdByName` cuando `getCurrentUserName()` humaniza direcciones).
- **Usar maps estáticos, no lecturas del DOM** para iconos de pestaña (`tab.textContent` se contamina tras innerHTML).
- Migración de benchmarks: detecta claves de formato viejo y resetea a defaults por rol.
- Modo read-only para perfiles creados por otros evaluadores.

## Visibilidad por rol
- Director → staff / lider / manager
- Manager → staff / lider
- Lider → solo staff

## Issues pendientes
1. Editor de benchmarks puede renderizar muy ancho con 12 roles — revisar layout
2. Migración de seniority legacy (ej. "Junior/Lead") puede no mapear dimensiones — considerar UI de migración
3. Filtro por track/rol en vista consolidada
4. Verificar conexión IDP ↔ gaps técnicos bajo el modelo de dimensiones dinámicas

## Estilo de trabajo
- Bugs llegan como descripciones de comportamiento, no ubicaciones de código.
- Fix esperado de inmediato: causa raíz breve + resumen de cambio. Sin explicación extendida.
