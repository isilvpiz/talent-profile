// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENT + AUTH
// ═══════════════════════════════════════════════════════════════
const SB_URL = 'https://pkuxwosgnhdlifmrumuu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdXh3b3NnbmhkbGlmbXJ1bXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDQ2NzcsImV4cCI6MjA5NjAyMDY3N30.nOKiOOTj1w0FiDVZ7ahELL0FLeBnYsbiMrbMrtGxkOw';

let supabaseClient = null;
let currentUser = null;
let autoSaveTimer = null;
let uiUpdateTimer = null;

// ─── UTILITIES ───
/** Escape HTML to prevent XSS when injecting user data into innerHTML */
function esc(str) {
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Debounced UI update — avoids excessive DOM rebuilds on each keystroke */
function scheduleUIUpdate() {
  if(uiUpdateTimer) return;
  uiUpdateTimer = setTimeout(() => {
    uiUpdateTimer = null;
    renderSidebar();
    updateSectionAlerts();
    updateTabProgress();
  }, 300);
}

/** Focus trap for modals — traps Tab/Shift+Tab within modal */
function trapFocus(modalEl) {
  const focusable = modalEl.querySelectorAll('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if(!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first.focus();
  modalEl._focusTrapHandler = (e) => {
    if(e.key !== 'Tab') return;
    if(e.shiftKey) {
      if(document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if(document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  modalEl.addEventListener('keydown', modalEl._focusTrapHandler);
}

function releaseFocus(modalEl) {
  if(modalEl._focusTrapHandler) {
    modalEl.removeEventListener('keydown', modalEl._focusTrapHandler);
    delete modalEl._focusTrapHandler;
  }
}

/** Open a modal overlay with accessibility support */
function openModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if(!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const modal = overlay.querySelector('.modal,.save-modal,.history-modal');
  if(modal) trapFocus(modal);
}

/** Close a modal overlay */
function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if(!overlay) return;
  overlay.classList.remove('open');
  const modal = overlay.querySelector('.modal,.save-modal,.history-modal');
  if(modal) releaseFocus(modal);
}

/** Hide all views — DRY helper for show*() functions */
function hideAllViews() {
  ['emptyState','profileView','overviewView','methodologyView','roleCompView','homeView','manualView','equipoView'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
}

/** Deactivate all nav items */
function deactivateAllNav() {
  ['nav-overview-mine','nav-overview-all','nav-methodology','nav-role-comp','nav-home','nav-manual','nav-equipo'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
}

function initSupabase() {
  supabaseClient = supabase.createClient(SB_URL, SB_KEY);
}
function setSyncStatus(state, text) {
  const dot = document.getElementById('syncDot');
  const lbl = document.getElementById('syncLabel');
  dot.className = 'sync-dot ' + state;
  lbl.textContent = text;
}

// ─── AUTH ───
async function loginClick() {
  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Entrando...'; btn.disabled = true;
  await doLogin();
  btn.textContent = 'Entrar'; btn.disabled = false;
}

async function doFirstLoginChange() {
  const pass  = document.getElementById('firstlogin-pass').value;
  const pass2 = document.getElementById('firstlogin-pass2').value;
  const errEl = document.getElementById('firstlogin-error');
  errEl.textContent = '';
  if(!pass || pass.length < 8) { errEl.textContent = 'Mínimo 8 caracteres.'; return; }
  if(!/[A-Z]/.test(pass)) { errEl.textContent = 'Incluye al menos una mayúscula.'; return; }
  if(!/[0-9]/.test(pass)) { errEl.textContent = 'Incluye al menos un número.'; return; }
  if(pass !== pass2) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
  const btn = document.getElementById('firstloginBtn');
  btn.textContent = 'Guardando...'; btn.disabled = true;
  const { data, error } = await supabaseClient.auth.updateUser({
    password: pass,
    data: { must_change_password: false }
  });
  btn.textContent = 'Establecer contraseña y entrar'; btn.disabled = false;
  if(error) { errEl.textContent = error.message; return; }
  document.getElementById('auth-firstlogin-form').style.display = 'none';
  onAuthSuccess(data.user);
}

async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('login-error');
  const okEl  = document.getElementById('login-success');
  errEl.textContent = ''; okEl.textContent = '';
  if(!email) { errEl.textContent = 'Ingresa tu email primero.'; return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href
  });
  if(error) { errEl.textContent = error.message; return; }
  okEl.textContent = '✓ Email enviado. Revisa tu bandeja de entrada.';
}

async function doResetPassword() {
  const pass  = document.getElementById('reset-pass').value;
  const pass2 = document.getElementById('reset-pass2').value;
  const errEl = document.getElementById('reset-error');
  const okEl  = document.getElementById('reset-success');
  errEl.textContent = ''; okEl.textContent = '';
  if(!pass || pass.length < 8) { errEl.textContent = 'Mínimo 8 caracteres.'; return; }
  if(!/[A-Z]/.test(pass)) { errEl.textContent = 'Incluye al menos una mayúscula.'; return; }
  if(!/[0-9]/.test(pass)) { errEl.textContent = 'Incluye al menos un número.'; return; }
  if(pass !== pass2) { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
  const btn = document.getElementById('resetBtn');
  btn.textContent = 'Guardando...'; btn.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ password: pass });
  btn.textContent = 'Guardar nueva contraseña'; btn.disabled = false;
  if(error) { errEl.textContent = error.message; return; }
  okEl.textContent = '✓ Contraseña actualizada. Entrando...';
  setTimeout(() => {
    document.getElementById('auth-reset-form').style.display = 'none';
    document.getElementById('auth-login-form').style.display = 'block';
  }, 1500);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if(!email || !pass) { errEl.textContent = 'Completa email y contraseña.'; return; }
  if(!supabaseClient) {
    try { initSupabase(); } catch(e) { errEl.textContent = 'Error al iniciar conexión: ' + e.message; return; }
  }
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if(error) { errEl.textContent = error.message; return; }
    const mustChange = data.user.user_metadata?.must_change_password !== false;
    if(mustChange) {
      currentUser = data.user;
      document.getElementById('auth-login-form').style.display = 'none';
      document.getElementById('auth-firstlogin-form').style.display = 'block';
    } else {
      onAuthSuccess(data.user);
    }
  } catch(e) {
    errEl.textContent = 'Error de conexión: ' + e.message;
  }
}

async function doLogout() {
  if(!supabaseClient) return;
  if(!confirm('¿Cerrar sesión?')) return;
  stopSyncInterval();
  await supabaseClient.auth.signOut();
  currentUser = null;
  document.getElementById('userChip').style.display = 'none';
  document.getElementById('authScreen').classList.remove('hidden');
}

function onAuthSuccess(user) {
  currentUser = user;
  document.getElementById('authScreen').classList.add('hidden');
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
  const initials = name.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userChip').style.display = 'flex';
  const role = getUserRole();
  const roleColors = { admin:'var(--blue)', director:'var(--purple)', manager:'var(--teal)', lider:'var(--green)' };
  document.getElementById('userAvatar').style.background = roleColors[role] || 'var(--gray-400)';
  document.getElementById('userChip').title = `${name} · ${role} — Clic para cerrar sesión`;
  const roleLabel = document.getElementById('userRoleLabel');
  if(roleLabel) roleLabel.textContent = role;
  if(isAdmin()) {
    document.body.classList.add('is-admin');
    document.getElementById('benchmarkBtn').style.display = '';
  }
  loadBenchmarks().then(() => loadDimensions()).then(() => pullFromSupabase().then(() => {
    // After data loads, show home if no view is active
    if(activeView === 'empty' || activeView === 'home') showHome();
  }));
}

function isAdmin() {
  return currentUser?.user_metadata?.is_admin === true;
}

function getUserRole() {
  if(isAdmin()) return 'admin';
  return currentUser?.user_metadata?.role || 'lider';
}

function getCurrentUserName() {
  const fullName = currentUser?.user_metadata?.full_name || '';
  if(fullName) return fullName;
  const email = currentUser?.email || '';
  return email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || email;
}

function isProfileOwner(id) {
  const p = profiles[id];
  if(!p) return false;
  if(!p._createdByName) return true;
  const uname = getCurrentUserName();
  if(p._createdByName === uname) return true;
  // Legacy: profile saved with raw email, current name is humanized — check email too
  const email = currentUser?.email || '';
  if(p._createdByName === email) return true;
  // Also check reverse: stored name vs email first-part variations
  const emailName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if(p._createdByName === emailName) return true;
  return false;
}


function canSeeProfile(p) {
  const role = getUserRole();
  const nivel = (p.general?.nivel || '').toLowerCase().trim();
  if(role === 'admin')    return true;
  if(role === 'director') return nivel === 'staff' || nivel === 'líder' || nivel === 'lider' || nivel === 'manager' || nivel === '';
  if(role === 'manager')  return nivel === 'staff' || nivel === 'líder' || nivel === 'lider' || nivel === '';
  if(role === 'lider')    return nivel === 'staff' || nivel === '';
  return false;
}

// ─── SUPABASE DATA ───
async function pushToSupabase(id, data, retryCount = 0) {
  if(!supabaseClient || !currentUser) return;
  setSyncStatus('syncing', 'Guardando...');
  const payload = {
    id,
    data: retryCount === 0 ? data : (profiles[id] || data), // Always use latest state on retry
    updated_at: new Date().toISOString(),
    updated_by: currentUser.email,
    updated_by_name: currentUser.user_metadata?.full_name || currentUser.email,
  };
  const { error } = await supabaseClient
    .from('talent_profiles')
    .upsert(payload, { onConflict: 'id' });
  if(error) {
    console.error('Push error:', error);
    if(retryCount < 2) {
      setTimeout(() => pushToSupabase(id, data, retryCount + 1), 3000 * (retryCount + 1));
      setSyncStatus('syncing', `Reintentando (${retryCount + 1}/2)...`);
    } else {
      setSyncStatus('err', 'Error al guardar — reintenta manualmente');
    }
  }
  else setSyncStatus('ok', 'Sincronizado');
}

async function deleteFromSupabase(id) {
  if(!supabaseClient) return;
  await supabaseClient.from('talent_profiles').delete().eq('id', id);
}

async function pullFromSupabase() {
  if(!supabaseClient) return;
  setSyncStatus('syncing', 'Cargando...');
  const { data, error } = await supabaseClient
    .from('talent_profiles')
    .select('id, data, updated_at, updated_by_name, created_by_name')
    .order('updated_at', { ascending: false });
  if(error) { setSyncStatus('err', 'Error al cargar'); console.error(error); return; }
  data.forEach(row => {
    const local = profiles[row.id];
    const remoteTs = new Date(row.updated_at).getTime();
    const localTs  = local?._updatedAt ? new Date(local._updatedAt).getTime() : 0;
    if(!local || remoteTs >= localTs) {
      profiles[row.id] = row.data;
      // Store evaluator metadata inside profile
      if(profiles[row.id]) {
        profiles[row.id]._updatedByName = row.updated_by_name || '';
        // Solo sobreescribir _createdByName si el servidor trae un valor válido
        const serverCreator = row.created_by_name || '';
        const localCreator  = local?._createdByName || '';
        profiles[row.id]._createdByName = serverCreator || localCreator;
      }
    }
  });
  saveLocalState();
  const ownCount = getFilteredIds().length;
  setSyncStatus('ok', `${ownCount} perfil${ownCount !== 1 ? 'es' : ''}`);
  renderSidebar();
  // Never change the active view during a sync — only update data in place
  if(activeView === 'profile' && currentId && profiles[currentId]) {    loadProfileToUI();
  } else if(activeView === 'overview') {
    renderOverview();
  } else if(activeView === 'empty') {
    showHome();
  }
}

// Config modal removed — credentials hardcoded

// ═══════════════════════════════════════════════════════════════
// DATA DEFINITIONS
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ROLE-BASED COMPETENCY MODEL — Derived from NTT DATA Career Ladder PDFs
// ═══════════════════════════════════════════════════════════════
const ROLE_COMPETENCIES = {
  "Junior Engineer": {
    track: "Técnico", level: "Entrada", color: "#ec4899",
    perf: [
      "Calidad del diseño técnico y código",
      "Ejecución y resolución de problemas técnicos",
      "Cumplimiento de metodología y calidad",
      "Estimación y reporte de avance propio",
      "Velocidad de aprendizaje técnico",
      "Colaboración y apoyo al equipo",
    ],
    pot: [
      "Capacidad de aprendizaje técnico",
      "Curiosidad por nuevas tecnologías",
      "Pensamiento analítico básico",
      "Adaptación al cambio",
      "Comunicación y colaboración",
      "Incorporación de feedback",
    ],
    mat: [
      "Autonomía en tareas asignadas",
      "Adherencia a metodología y calidad",
      "Capacidad de estimar y reportar",
      "Colaboración dentro del equipo",
      "Comprensión del contexto del cliente",
      "Uso de herramientas y fundamentos de IA",
    ],
  },
  "Junior Analyst": {
    track: "Analítico", level: "Entrada", color: "#0d9488",
    perf: [
      "Calidad del análisis y extracción de datos",
      "Elaboración de informes y conclusiones sencillas",
      "Configuración de módulos y consultas de datos",
      "Cumplimiento de metodología y calidad",
      "Velocidad de aprendizaje funcional/analítico",
      "Apoyo en sesiones y soporte a usuarios",
    ],
    pot: [
      "Capacidad de aprendizaje analítico",
      "Curiosidad por nuevas tecnologías y datos",
      "Pensamiento analítico básico",
      "Adaptación al cambio",
      "Comunicación y colaboración",
      "Incorporación de feedback",
    ],
    mat: [
      "Autonomía en tareas analíticas asignadas",
      "Adherencia a metodología y calidad",
      "Capacidad de estimar y reportar",
      "Colaboración dentro del equipo",
      "Comprensión del contexto del cliente",
      "Uso de herramientas y fundamentos de IA",
    ],
  },
  "Engineer": {
    track: "Técnico", level: "Medio", color: "#ec4899",
    perf: [
      "Calidad técnica de la solución (diseño + código)",
      "Diseño y ejecución de pruebas",
      "Resolución de problemas técnicos",
      "Autonomía y definición de estándares",
      "Comunicación de resultados al equipo/cliente",
      "Orientación al valor del cliente",
    ],
    pot: [
      "Capacidad de aprendizaje y aplicación en nuevos contextos",
      "Pensamiento sistémico",
      "Influencia y comunicación con distintos interlocutores",
      "Adaptación a entornos diversos",
      "Proactividad en identificar mejoras",
      "Autodesarrollo y apertura al feedback",
    ],
    mat: [
      "Autonomía para definir soluciones y autoorganizarse",
      "Aplicación activa de metodología y estándares",
      "Estimación de esfuerzos y seguimiento del trabajo",
      "Comunicación efectiva de resultados",
      "Orientación al valor del cliente",
      "Evaluación del uso de IA en actividades propias",
    ],
  },
  "Analyst": {
    track: "Analítico", level: "Medio", color: "#0d9488",
    perf: [
      "Calidad del análisis y selección de métodos",
      "Validación y gestión de calidad de datos",
      "Diseño de soluciones analíticas equilibradas",
      "Elaboración de modelos, informes y reporting",
      "Comunicación y presentación de resultados",
      "Orientación al valor del cliente",
    ],
    pot: [
      "Capacidad de aprendizaje y aplicación en nuevos contextos",
      "Pensamiento sistémico",
      "Influencia y comunicación con distintos interlocutores",
      "Adaptación a entornos diversos",
      "Proactividad en identificar mejoras",
      "Autodesarrollo y apertura al feedback",
    ],
    mat: [
      "Autonomía para definir soluciones analíticas",
      "Aplicación activa de metodología y estándares",
      "Estimación de esfuerzos y seguimiento del trabajo",
      "Comunicación efectiva de resultados",
      "Orientación al valor del cliente",
      "Evaluación del uso de IA en actividades propias",
    ],
  },
  "Lead Engineer": {
    track: "Técnico", level: "Liderazgo", color: "#ec4899",
    perf: [
      "Liderazgo técnico de la solución",
      "Resolución de problemas de alta complejidad",
      "Desarrollo y supervisión del equipo técnico",
      "Alineación con tendencias de mercado",
      "Interlocución con cliente y stakeholders",
      "Seguimiento, planificación y propuestas comerciales",
    ],
    pot: [
      "Visión estratégica más allá del proyecto",
      "Liderazgo e influencia sobre otros",
      "Gestión de complejidad creciente",
      "Pensamiento sistémico cross-área",
      "Proactividad en identificar oportunidades",
      "Adaptabilidad e incorporación de feedback",
    ],
    mat: [
      "Supervisión y desarrollo del equipo",
      "Promoción activa de metodología y calidad",
      "Planificación y seguimiento del área",
      "Representación experta ante el cliente",
      "Identificación de necesidades comerciales",
      "Evaluación de impacto de IA en soluciones",
    ],
  },
  "Lead Analyst": {
    track: "Analítico", level: "Liderazgo", color: "#0d9488",
    perf: [
      "Liderazgo del marco analítico y selección de métodos",
      "Resolución de problemas complejos con datos",
      "Desarrollo y supervisión del equipo analítico",
      "Alineación con tendencias de mercado",
      "Interlocución con cliente y stakeholders",
      "Seguimiento, planificación y propuestas comerciales",
    ],
    pot: [
      "Visión estratégica más allá del proyecto",
      "Liderazgo e influencia sobre otros",
      "Gestión de complejidad creciente",
      "Pensamiento sistémico cross-área",
      "Proactividad en identificar oportunidades",
      "Adaptabilidad e incorporación de feedback",
    ],
    mat: [
      "Supervisión y desarrollo del equipo",
      "Promoción activa de metodología y calidad",
      "Planificación y seguimiento del área",
      "Representación experta ante el cliente",
      "Identificación de necesidades comerciales",
      "Evaluación de impacto de IA en soluciones",
    ],
  },
  "Expert Engineer": {
    track: "Técnico", level: "Referente", color: "#ec4899",
    perf: [
      "Referencia técnica y resolución de alta complejidad",
      "Alineación estratégica de la solución con el mercado",
      "Generación de conocimiento y notoriedad externa",
      "Contribución comercial y propuestas de negocio",
      "Innovación y adopción de nuevas tecnologías",
      "Supervisión de calidad y metodología del equipo",
    ],
    pot: [
      "Visión estratégica organizacional",
      "Influencia en entornos nuevos y desconocidos",
      "Gestión de alta complejidad e incertidumbre",
      "Liderazgo transformacional del equipo",
      "Anticipación de tendencias tecnológicas",
      "Evolución continua e integración de feedback",
    ],
    mat: [
      "Referencia técnica para equipo y organización",
      "Supervisión de calidad y metodología como modelo",
      "Planificación con visión de productividad global",
      "Representación experta ante cliente y stakeholders",
      "Contribución a propuestas comerciales",
      "Evaluación de IA en soluciones complejas",
    ],
  },
  "Expert Analyst": {
    track: "Analítico", level: "Referente", color: "#0d9488",
    perf: [
      "Referencia analítica y resolución de alta complejidad",
      "Alineación estratégica de la solución con el mercado",
      "Generación de conocimiento y notoriedad externa",
      "Contribución comercial y propuestas de negocio",
      "Innovación y adopción de nuevas tecnologías",
      "Supervisión de calidad y metodología del equipo",
    ],
    pot: [
      "Visión estratégica organizacional",
      "Influencia en entornos nuevos y desconocidos",
      "Gestión de alta complejidad e incertidumbre",
      "Liderazgo transformacional del equipo",
      "Anticipación de tendencias tecnológicas",
      "Evolución continua e integración de feedback",
    ],
    mat: [
      "Referencia analítica para equipo y organización",
      "Supervisión de calidad y metodología como modelo",
      "Planificación con visión de productividad global",
      "Representación experta ante cliente y stakeholders",
      "Contribución a propuestas comerciales",
      "Evaluación de IA en soluciones complejas",
    ],
  },
  "Project Leader": {
    track: "Gestión", level: "Liderazgo de proyecto", color: "#6366f1",
    perf: [
      "Gestión end-to-end del proyecto (alcance, tiempo, costo)",
      "Liderazgo y desarrollo del equipo",
      "Gestión de expectativas y relación con cliente",
      "Supervisión de calidad y metodología",
      "Contribución comercial y preventa",
      "Adaptación continua de la solución a necesidades",
    ],
    pot: [
      "Visión estratégica de negocio",
      "Liderazgo de personas y equipos",
      "Gestión de complejidad multi-proyecto",
      "Influencia en entornos diversos",
      "Anticipación de cambios del mercado",
      "Adaptabilidad estratégica",
    ],
    mat: [
      "Gestión integral del proyecto (alcance, ETC, planificación)",
      "Entorno motivador y desarrollo del equipo",
      "Supervisión de calidad, metodología y centros",
      "Gestión de relación con cliente",
      "Colaboración comercial y preventa",
      "Decisiones sobre IA en proyectos",
    ],
  },
  "Sr. Technical PL": {
    track: "Gestión + Técnico", level: "Liderazgo senior", color: "#4f46e5",
    perf: [
      "Gestión de entregas de alta complejidad tecnológica",
      "Estrategia de soluciones innovadoras y diferenciales",
      "Liderazgo y desarrollo del equipo multidisciplinario",
      "Gestión económica completa (ingresos, costes, márgenes, WIP)",
      "Impacto comercial y definición de propuesta de valor",
      "Generación de conocimiento y referencia técnica",
    ],
    pot: [
      "Visión estratégica integral",
      "Liderazgo transformacional",
      "Gestión de alta complejidad multi-proyecto simultánea",
      "Influencia a nivel directivo",
      "Anticipación tecnológica y de mercado",
      "Capacidad de definir propuesta de valor diferencial",
    ],
    mat: [
      "Gestión estratégica multi-proyecto de alta complejidad",
      "Gestión económica integral del proyecto/servicio",
      "Supervisión de excelencia, innovación y mejora continua",
      "Gestión ejecutiva de expectativas y relación con cliente",
      "Definición de propuesta de valor e iniciativas nuevas",
      "Decisiones de IA y generación de ventaja competitiva",
    ],
  },
  "Chief Architect": {
    track: "Técnico", level: "Estratégico", color: "#7c3aed",
    perf: [
      "Diseño de arquitecturas integradas end-to-end",
      "Hoja de ruta tecnológica y alineación estratégica",
      "Gestión de riesgos y seguridad de soluciones",
      "Liderazgo del equipo de arquitectura",
      "Impacto en decisiones de cliente y negocio",
      "Innovación y propuesta de nuevos modelos tecnológicos",
    ],
    pot: [
      "Visión estratégica global",
      "Capacidad de transformación organizacional",
      "Influencia a nivel directivo",
      "Anticipación tecnológica",
      "Liderazgo de cambio adaptativo",
      "Adaptación estratégica ante entornos cambiantes",
    ],
    mat: [
      "Visión integral de arquitectura y estrategia tecnológica",
      "Gestión de alcance y seguimiento global",
      "Supervisión de calidad, metodología y centros",
      "Gestión de expectativas ejecutivas y cliente",
      "Desarrollo de propuestas de alto valor",
      "Decisiones sobre IA y ventaja competitiva",
    ],
  },
  "Evangelist": {
    track: "Transversal", level: "Estratégico", color: "#92400e",
    perf: [
      "Creación de contenido de alto impacto",
      "Generación de notoriedad y networking interno/externo",
      "Influencia sobre adopción de tecnología/producto",
      "Gestión de relación y expectativas con cliente",
      "Contribución comercial y generación de recurrencia",
      "Innovación y propuesta de nuevos modelos",
    ],
    pot: [
      "Visión estratégica global",
      "Capacidad de transformación organizacional",
      "Influencia a nivel directivo",
      "Anticipación tecnológica y de mercado",
      "Liderazgo de cambio adaptativo",
      "Adaptación estratégica ante entornos cambiantes",
    ],
    mat: [
      "Referencia global en su especialidad técnica",
      "Gestión de expectativas y relación con cliente",
      "Supervisión de calidad y metodología como modelo",
      "Contribución comercial y generación de recurrencia",
      "Formación interna global y externa",
      "Decisiones sobre IA y ventaja competitiva",
    ],
  },
};

const SENIORITY_LEVELS = Object.keys(ROLE_COMPETENCIES);

// Dynamic PERF_DIMS — updated when seniority changes
let PERF_DIMS = ROLE_COMPETENCIES["Junior Engineer"].perf.slice();
let POT_DIMS = [
  "Capacidad de aprendizaje (Learning Agility)",
  "Pensamiento sistémico / visión de negocio",
  "Liderazgo / influencia sin autoridad",
  "Gestión de ambigüedad y complejidad",
  "Iniciativa y proactividad estratégica",
  "Velocidad de incorporación de feedback",
];

function getDimsForRole(seniority, pillar) {
  const rc = ROLE_COMPETENCIES[seniority];
  if(!rc) return null;
  if(pillar === 'perf') return rc.perf;
  if(pillar === 'pot')  return rc.pot;
  if(pillar === 'mat')  return rc.mat;
  return null;
}

function getRoleColor(seniority) {
  return ROLE_COMPETENCIES[seniority]?.color || 'var(--navy)';
}

// Default benchmarks — per role, expected score on 1-5 scale
const DEFAULT_BENCHMARKS = {
  perf: {
    'Junior Engineer':   [2.0, 2.0, 2.5, 2.5, 3.0, 2.0],
    'Junior Analyst':    [2.0, 2.0, 2.0, 2.5, 3.0, 2.0],
    'Engineer':          [3.0, 3.0, 3.0, 3.0, 3.0, 3.0],
    'Analyst':           [3.0, 3.0, 3.0, 3.0, 3.0, 3.0],
    'Lead Engineer':     [3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
    'Lead Analyst':      [3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
    'Expert Engineer':   [4.0, 4.0, 4.0, 4.0, 4.0, 4.0],
    'Expert Analyst':    [4.0, 4.0, 4.0, 4.0, 4.0, 4.0],
    'Project Leader':    [3.5, 3.5, 3.5, 3.5, 3.0, 3.5],
    'Sr. Technical PL':  [4.0, 4.0, 4.0, 4.0, 4.0, 4.0],
    'Chief Architect':   [4.5, 4.0, 4.0, 4.0, 4.0, 4.0],
    'Evangelist':        [4.0, 4.0, 4.0, 4.0, 4.0, 4.0],
  },
  pot: {
    'Junior Engineer':   [3.0, 1.5, 1.0, 1.5, 1.5, 3.0],
    'Junior Analyst':    [3.0, 1.5, 1.0, 1.5, 1.5, 3.0],
    'Engineer':          [3.0, 2.5, 2.0, 2.5, 2.5, 3.0],
    'Analyst':           [3.0, 2.5, 2.0, 2.5, 2.5, 3.0],
    'Lead Engineer':     [3.5, 3.5, 3.5, 3.5, 3.5, 3.0],
    'Lead Analyst':      [3.5, 3.5, 3.5, 3.5, 3.5, 3.0],
    'Expert Engineer':   [4.0, 4.0, 4.0, 4.0, 4.0, 3.5],
    'Expert Analyst':    [4.0, 4.0, 4.0, 4.0, 4.0, 3.5],
    'Project Leader':    [3.5, 4.0, 3.5, 3.5, 3.5, 3.0],
    'Sr. Technical PL':  [4.0, 4.0, 4.0, 4.0, 4.0, 3.5],
    'Chief Architect':   [4.5, 4.5, 4.5, 4.5, 4.5, 4.0],
    'Evangelist':        [4.5, 4.5, 4.5, 4.5, 4.5, 4.0],
  }
};

// Migrate old benchmark format in localStorage
(function migrateBenchmarks() {
  try {
    const stored = JSON.parse(localStorage.getItem('talent_benchmarks') || 'null');
    if(!stored) return;
    const oldKeys = ['Junior', 'Engineer / Analyst', 'Lead', 'Expert'];
    if(stored.perf && Object.keys(stored.perf).some(k => oldKeys.includes(k))) {
      localStorage.removeItem('talent_benchmarks');
    }
  } catch(e) {}
})();

let benchmarks = JSON.parse(localStorage.getItem('talent_benchmarks') || 'null') || DEFAULT_BENCHMARKS;

function saveBenchmarks() {
  localStorage.setItem('talent_benchmarks', JSON.stringify(benchmarks));
  if(supabaseClient && currentUser) {
    supabaseClient.from('talent_config')
      .upsert({ id: 'benchmarks', data: benchmarks, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .then(({ error }) => { if(error) console.error('Benchmark save error:', error); });
  }
}

async function loadBenchmarks() {
  if(!supabaseClient) return;
  const { data, error } = await supabaseClient.from('talent_config').select('data').eq('id', 'benchmarks').single();
  if(!error && data?.data) {
    const loaded = data.data;
    // Migrate: if loaded benchmarks use old keys (Junior, Engineer / Analyst...) discard and use defaults
    const oldKeys = ['Junior', 'Engineer / Analyst', 'Lead', 'Expert'];
    const isOldFormat = loaded.perf && Object.keys(loaded.perf).some(k => oldKeys.includes(k));
    if(isOldFormat) {
      console.log('Old benchmark format detected — resetting to new role-based benchmarks');
      saveBenchmarks(); // push new defaults to Supabase
      return;
    }
    // Merge loaded with defaults (ensure all 12 roles present)
    benchmarks = { perf: { ...DEFAULT_BENCHMARKS.perf, ...loaded.perf }, pot: { ...DEFAULT_BENCHMARKS.pot, ...loaded.pot } };
    localStorage.setItem('talent_benchmarks', JSON.stringify(benchmarks));
  }
}

async function loadDimensions() {
  // Try local first
  try {
    const local = JSON.parse(localStorage.getItem('talent_dimensions') || 'null');
    if(local) applyDimensions(local);
  } catch(e) {}
  // Then remote
  if(!supabaseClient) return;
  const { data, error } = await supabaseClient.from('talent_config').select('data').eq('id', 'dimensions').single();
  if(!error && data?.data) {
    applyDimensions(data.data);
    localStorage.setItem('talent_dimensions', JSON.stringify(data.data));
  }
}

function applyDimensions(d) {
  if(d.PERF_DIMS)   PERF_DIMS   = d.PERF_DIMS;
  if(d.POT_DIMS)    POT_DIMS    = d.POT_DIMS;
  if(d.MAT_DIMS)    MAT_DIMS    = d.MAT_DIMS;
  if(d.SKILL_GROUPS) SKILL_GROUPS = d.SKILL_GROUPS;
}

async function saveDimensions() {
  const d = { PERF_DIMS, POT_DIMS, MAT_DIMS, SKILL_GROUPS };
  localStorage.setItem('talent_dimensions', JSON.stringify(d));
  if(supabaseClient && currentUser) {
    await supabaseClient.from('talent_config')
      .upsert({ id: 'dimensions', data: d, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  }
}

function getBenchmark(prefix, seniority, dimIdx) {
  return benchmarks[prefix]?.[seniority]?.[dimIdx] ?? null;
}

function getGapColor(gap) {
  if(gap === null || gap === 0) return 'var(--gray-400)';
  if(gap >= 1.0) return 'var(--red)';
  if(gap >= 0.5) return 'var(--amber)';
  if(gap < 0)    return 'var(--green)';
  return 'var(--gray-400)';
}


let SKILL_GROUPS = {
  "DATA & ANALYTICS": ["SQL / Data Engineering","Python (ML / DS)","BI / Data Viz (PowerBI / Tableau)","Estadística aplicada","Data Architecture"],
  "AI / MACHINE LEARNING": ["ML Algorithms & Modeling","LLMs / Generative AI","MLOps / AI Deployment","Prompt Engineering","AI Ethics & Governance"],
  "SOFT / LEADERSHIP": ["Comunicación ejecutiva","Gestión de stakeholders","Pensamiento crítico / Problem solving","Gestión de proyectos / Agile","Mentoría / Transferencia de conocimiento"],
};
let MAT_DIMS = ROLE_COMPETENCIES["Junior Engineer"].mat.slice();

// Called when seniority dropdown changes — rebuilds Performance & Madurez dims for the role
function onSeniorityChange() {
  const seniority = document.getElementById('g-seniority')?.value;
  if(seniority && ROLE_COMPETENCIES[seniority]) {
    PERF_DIMS = ROLE_COMPETENCIES[seniority].perf.slice();
    MAT_DIMS  = ROLE_COMPETENCIES[seniority].mat.slice();
    POT_DIMS  = ROLE_COMPETENCIES[seniority].pot.slice();
    // Rebuild score tables if a profile is open
    if(currentId && profiles[currentId]) {
      buildScoreTable('perf', PERF_DIMS, 'perf-table');
      buildScoreTable('pot',  POT_DIMS,  'pot-table');
      buildMatTable();
    }
    // Update role badge visible in the profile
    updateRoleBadge(seniority);
  }
  autoSave();
}

function updateRoleBadge(seniority) {
  const rc = ROLE_COMPETENCIES[seniority];
  if(!rc) return;
  let badge = document.getElementById('role-badge');
  if(badge) {
    badge.textContent = `${rc.track} · ${rc.level}`;
    badge.style.background = rc.color + '18';
    badge.style.color = rc.color;
    badge.style.display = 'inline-block';
  }
}
const RISK_ITEMS = [
  "Nivel de motivación percibida",
  "Indicadores de desenganche (motivación, participación, iniciativa)",
  "Satisfacción con su rol actual",
  "Relación con el equipo",
  "Alineación con la estrategia del área",
  "Equidad percibida (salario / reconocimiento)",
];
const NINEBOX_LABELS = [
  {label:"💡 Alto potencial", desc:"Performance media, potencial alto", perf:[2,3], pot:[4,5], bg:"#ede9fe", bc:"#c4b5fd", tc:"#5b21b6"},
  {label:"⭐ Top talent",      desc:"Performance y potencial altos",       perf:[4,5], pot:[4,5], bg:"#fef9c3", bc:"#fde047", tc:"#854d0e"},
  {label:"🚀 High performer", desc:"Performance alta, potencial medio",  perf:[4,5], pot:[2,3], bg:"#dcfce7", bc:"#86efac", tc:"#166534"},
  {label:"📈 En desarrollo",  desc:"Performance y potencial medios-bajos",perf:[1,2], pot:[3,5], bg:"#dbeafe", bc:"#93c5fd", tc:"#1e40af"},
  {label:"✅ Core contributor",desc:"Performance y potencial medios",     perf:[3,3], pot:[3,3], bg:"#e0f2fe", bc:"#7dd3fc", tc:"#0c4a6e"},
  {label:"🏅 Performer sólido",desc:"Performance media-alta, potencial medio", perf:[3,5], pot:[2,3], bg:"#d1fae5", bc:"#6ee7b7", tc:"#064e3b"},
  {label:"⚠️ Under review",   desc:"Performance y potencial bajos",      perf:[1,2], pot:[1,2], bg:"#fee2e2", bc:"#fca5a5", tc:"#991b1b"},
  {label:"🔄 En transición",  desc:"Performance baja, potencial medio",  perf:[1,2], pot:[2,3], bg:"#ffedd5", bc:"#fdba74", tc:"#9a3412"},
  {label:"📋 Performer estable",desc:"Performance media, potencial bajo",perf:[3,4], pot:[1,2], bg:"#f1f5f9", bc:"#cbd5e1", tc:"#475569"},
];

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let profiles = {};
let currentId = null;
let selectedColor = "#2563eb";
let saveTimer = null;
let activeView = 'empty'; // 'empty' | 'profile' | 'overview' | 'methodology'
let profileFilter = 'mine'; // 'mine' | 'all'

function loadState() {
  try {
    const raw = localStorage.getItem('talentProfiles');
    if(raw) profiles = JSON.parse(raw);
  } catch(e) { profiles = {}; }
}
function saveLocalState() {
  localStorage.setItem('talentProfiles', JSON.stringify(profiles));
}
// Keep backward compat alias
function saveState() { saveLocalState(); }

// ═══════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function newProfileData(id, nombre, rol, color) {
  const perfScores = {}, perfEvidence = {};
  PERF_DIMS.forEach((_, i) => { perfScores[i] = 0; perfEvidence[i] = ""; });
  const potScores = {}, potEvidence = {};
  POT_DIMS.forEach((_, i) => { potScores[i] = 0; potEvidence[i] = ""; });
  const skillData = {};
  Object.values(SKILL_GROUPS).flat().forEach(s => { skillData[s] = {actual:0, target:0, plan:"", prioridad:"", planActivo:"", na:false}; });
  const matData = {};
  MAT_DIMS.forEach((_, i) => { matData[i] = {nivel:"", justif:""}; });
  const riskData = {};
  RISK_ITEMS.forEach((_, i) => { riskData[i] = {estado:"", obs:"", accion:""}; });
  return {
    id, nombre, rol, color, created: new Date().toISOString(),
    general: { nombre, rol, nivel:"", ingreso:"", seniority:"", nroEmpleado:"", antiguedad:"", lasteval:"", proyectos:"", entrevistador:"", notas:"" },
    perf: { scores: perfScores, evidence: perfEvidence, feedbackScore: "", feedbackObs: "" },
    pot: { scores: potScores, evidence: potEvidence },
    skills: skillData,
    madurez: { dims: matData, final:"", gap:"", justif:"" },
    ninebox: { comment:"", validated:"", aspiraciones:"", justifValid:"" },
    risk: { items: riskData, global:"", nextrev:"", accion:"" },
    idp: [],
    resumen: { fortalezas:"", mejoras:"", decision:"", justif:"", hito:"", notas:"" },
  };
}

function getAvg(scores) {
  const vals = Object.values(scores).filter(v => v > 0);
  if(!vals.length) return 0;
  return vals.reduce((a,b) => a+b, 0) / vals.length;
}

// ═══════════════════════════════════════════════════════════════
// COMPLETENESS
// ═══════════════════════════════════════════════════════════════
function calcCompleteness(p) {
  let total = 0, done = 0;
  function chk(v) { total++; if(v) done++; }

  // Datos generales — todos obligatorios excepto notas
  chk(!!p.general?.nombre);
  chk(!!p.general?.rol);
  chk(!!p.general?.nivel);
  chk(!!p.general?.ingreso);
  chk(!!p.general?.seniority);
  chk(!!p.general?.nroEmpleado);
  chk(!!p.general?.antiguedad);
  chk(!!p.general?.lasteval);
  chk(!!p.general?.proyectos);
  chk(!!p.general?.entrevistador);

  // Performance — todos los scores y evidencias obligatorios
  const perfScores = Object.values(p.perf?.scores || {});
  perfScores.forEach(s => chk(s > 0));
  Object.values(p.perf?.evidence || {}).forEach(e => chk(!!e?.trim()));

  // Potencial — todos los scores y evidencias obligatorios
  const potScores = Object.values(p.pot?.scores || {});
  potScores.forEach(s => chk(s > 0));
  Object.values(p.pot?.evidence || {}).forEach(e => chk(!!e?.trim()));

  // Madurez técnica — planActivo=Sí → plan obligatorio (skip NA skills)
  Object.values(p.skills || {}).forEach(d => {
    if(d.na) return;
    if(d.planActivo === 'Sí') chk(!!d.plan?.trim());
  });

  // Madurez profesional — nivel y justif por dimensión + nivel final + justif global
  Object.values(p.madurez?.dims || {}).forEach(d => {
    chk(!!d.nivel);
    chk(!!d.justif?.trim());
  });
  chk(!!p.madurez?.final);

  // Flight risk — estado por cada ítem obligatorio; obs+acción si Alto o Medio
  Object.values(p.risk?.items || {}).forEach(d => {
    chk(!!d.estado);
    if(d.estado === 'Alto' || d.estado === 'Medio') {
      chk(!!d.obs?.trim());
      chk(!!d.accion?.trim());
    }
  });
  chk(!!p.risk?.global);

  // Resumen — decisión obligatoria para consolidado
  chk(!!p.resumen?.decision);
  chk(!!p.resumen?.fortalezas?.trim());
  chk(!!p.resumen?.mejoras?.trim());
  chk(!!p.resumen?.justif?.trim());
  chk(!!p.resumen?.hito?.trim());

  // 9-Box — cuadrante validado y aspiraciones obligatorios solo para manager/admin
  if(getUserRole() === 'manager' || getUserRole() === 'admin') {
    chk(!!p.ninebox?.validated);
    chk(!!p.ninebox?.aspiraciones);
  }

  // Risk global — acción y próxima revisión obligatorios
  chk(!!p.risk?.accion?.trim());
  chk(!!p.risk?.nextrev);

  // Madurez profesional — justificación obligatoria
  chk(!!p.madurez?.justif?.trim());

  // Performance — feedback score obligatorio
  chk(!!p.perf?.feedbackScore);

  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function completenessColor(pct) {
  if(pct >= 100) return 'var(--green)';
  if(pct >= 60)  return 'var(--teal)';
  if(pct >= 30)  return 'var(--amber)';
  return 'var(--red)';
}


function setProfileFilter(f) {
  profileFilter = f;
  document.getElementById('filter-mine').style.background = f==='mine' ? 'var(--navy)' : 'transparent';
  document.getElementById('filter-mine').style.color = f==='mine' ? 'white' : 'var(--gray-600)';
  document.getElementById('filter-all').style.background = f==='all' ? 'var(--navy)' : 'transparent';
  document.getElementById('filter-all').style.color = f==='all' ? 'white' : 'var(--gray-600)';
  renderSidebar();
}

function getFilteredIds() {
  const uname = currentUser?.user_metadata?.full_name || currentUser?.email;
  return Object.keys(profiles).filter(id => {
    const p = profiles[id];
    return p._createdByName === uname || p._updatedByName === uname;
  });
}

function renderSidebar() {
  const list = document.getElementById('personList');
  list.innerHTML = '';
  const ids = getFilteredIds();
  if(!ids.length) {
    list.innerHTML = '<div style="padding:8px 1rem;font-size:12px;color:var(--gray-400)">' + (profileFilter==='mine' ? 'Sin perfiles propios' : 'Sin perfiles') + '</div>';
    return;
  }
  ids.forEach(id => {
    const p = profiles[id];
    const initials = (p.nombre || '??').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    const pct = calcCompleteness(p);
    const col = completenessColor(pct);
    const chip = document.createElement('div');
    chip.className = 'person-chip' + (currentId === id ? ' active' : '');
    chip.innerHTML = `
      <div class="person-avatar" style="background:${esc(p.color)}22;color:${esc(p.color)}">${esc(initials)}</div>
      <div style="min-width:0;flex:1">
        <div class="person-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.nombre) || '(sin nombre)'}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
          ${p._closed
            ? '<span style="font-size:9px;padding:1px 6px;background:var(--green-light);color:var(--green);border-radius:4px;font-weight:700;letter-spacing:0.02em">✓ Cerrado</span>'
            : `<div style="flex:1;height:3px;background:var(--gray-200);border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${col};border-radius:2px;transition:width 0.3s"></div>
               </div>
               <span style="font-size:10px;font-family:'DM Mono',monospace;color:${col};font-weight:600;flex-shrink:0">${pct}%</span>
               <span style="font-size:10px;color:var(--amber)">⚠</span>`
          }
        </div>
      </div>`;
    chip.onclick = () => openProfile(id);
    list.appendChild(chip);
  });
}

// ═══════════════════════════════════════════════════════════════
// OPEN PROFILE
// ═══════════════════════════════════════════════════════════════
function openProfile(id) {
  // Flush pending save for previous profile before switching
  if(autoSaveTimer && currentId && currentId !== id) {
    clearTimeout(autoSaveTimer);
    pushToSupabase(currentId, profiles[currentId]);
    autoSaveTimer = null;
  }
  currentId = id;
  activeView = 'profile';
  hideAllViews();
  document.getElementById('profileView').style.display = 'block';
  deactivateAllNav();
  renderSidebar();
  loadProfileToUI();
  switchTab('general', document.querySelector('.section-tab'));
}

function loadProfileToUI() {
  const p = profiles[currentId];
  document.getElementById('profileName').textContent = p.nombre || '(sin nombre)';
  document.getElementById('profileMeta').textContent =
    (p.rol || '') +
    (p.general.seniority ? ' · ' + p.general.seniority : '') +
    (p.general.nroEmpleado ? ' · #' + p.general.nroEmpleado : '') +
    (p._cycle && p._cycle > 1 ? ` · Ciclo ${p._cycle}` : '');

  // Closed state — banner and button visibility
  const isClosed = !!p._closed;
  const banner = document.getElementById('closedBanner');
  if(isClosed) {
    banner.classList.add('show');
    const closedBy = p._closedBy || '';
    const closedAt = p._closedAt ? new Date(p._closedAt).toLocaleDateString('es-CL') : '—';
    const cycle = p._cycle || 1;
    document.getElementById('closedBannerMeta').textContent =
      `Cerrado el ${closedAt}${closedBy ? ' por ' + closedBy : ''} · Ciclo ${cycle}${p._reopenJustif ? ' · Reabierto: ' + p._reopenJustif : ''}`;
  } else {
    banner.classList.remove('show');
  }
  // Show/hide action buttons based on closed state
  document.getElementById('profileActionButtons').style.display = isClosed ? 'none' : 'flex';
  // Show history button in action area if there are past cycles
  const hasHistory = (p._cycle||1) > 1 || (p._history||[]).some(h => h.event === 'cycle_archived');
  const histBtn = document.getElementById('profileHistoryBtn');
  if(histBtn) histBtn.style.display = hasHistory && !isClosed ? '' : 'none';

  // Rebuild dims for this profile's seniority
  const sen = p.general?.seniority;
  if(sen && ROLE_COMPETENCIES[sen]) {
    PERF_DIMS = ROLE_COMPETENCIES[sen].perf.slice();
    POT_DIMS  = ROLE_COMPETENCIES[sen].pot.slice();
    MAT_DIMS  = ROLE_COMPETENCIES[sen].mat.slice();
    updateRoleBadge(sen);
  }

  // Completeness
  const pct = calcCompleteness(p);
  const col = completenessColor(pct);
  const complDiv = document.getElementById('profileCompleteness');
  complDiv.style.display = 'flex';
  document.getElementById('complBar').style.width = pct + '%';
  document.getElementById('complBar').style.background = col;
  document.getElementById('complPct').textContent = pct + '%';
  document.getElementById('complPct').style.color = col;
  // General
  ['nombre','rol','nivel','ingreso','seniority','nroEmpleado','antiguedad','lasteval','proyectos','entrevistador','notas'].forEach(f => {
    const el = document.getElementById('g-'+f);
    if(el) el.value = p.general[f] || '';
  });
  // Lock Job Rol once set — changing it would reset all dimensions silently
  const seniorityEl = document.getElementById('g-seniority');
  if(seniorityEl && p.general?.seniority) {
    seniorityEl.disabled = true;
    seniorityEl.style.background = 'var(--gray-100)';
    seniorityEl.style.color = 'var(--gray-600)';
    seniorityEl.style.cursor = 'not-allowed';
    seniorityEl.title = 'El Job Rol se asigna al crear el perfil desde el equipo. Contacta al admin para cambiar.';
  } else if(seniorityEl) {
    seniorityEl.disabled = false;
    seniorityEl.style.background = '';
    seniorityEl.style.color = '';
    seniorityEl.style.cursor = '';
  }

  // Performance
  buildScoreTable('perf-tbody', PERF_DIMS, p.perf.scores, p.perf.evidence, 'perf', 'avg-perf');
  const pfbScore = document.getElementById('perf-feedback-score');
  const pfbObs   = document.getElementById('perf-feedback-obs');
  if(pfbScore) pfbScore.value = p.perf.feedbackScore || '';
  if(pfbObs)   pfbObs.value   = p.perf.feedbackObs   || '';
  // Potencial
  buildScoreTable('pot-tbody', POT_DIMS, p.pot.scores, p.pot.evidence, 'pot', 'avg-pot');
  // Skills
  buildSkillTable();
  // Madurez
  buildMatTable();
  document.getElementById('mat-final').value = p.madurez.final || '';
  document.getElementById('mat-gap').value   = p.madurez.gap || '';
  document.getElementById('mat-justif').value = p.madurez.justif || '';
  updateMatGap();
  // Risk
  buildRiskTable();
  document.getElementById('risk-global').value  = p.risk.global || '';
  document.getElementById('risk-nextrev') && (document.getElementById('risk-nextrev').value = p.risk.nextrev || '');
  document.getElementById('risk-accion').value  = p.risk.accion || '';
  onRiskGlobalChange();
  // IDP
  renderIDPTable();
  // Resumen
  ['fortalezas','mejoras','decision','justif','hito','notas'].forEach(f => {
    const el = document.getElementById('res-'+f);
    if(el) el.value = p.resumen[f] || '';
  });
  // Ninebox
  document.getElementById('ninebox-comment').value      = p.ninebox.comment      || '';
  document.getElementById('ninebox-validated').value    = p.ninebox.validated    || '';
  document.getElementById('ninebox-aspiraciones').value = p.ninebox.aspiraciones || '';
  document.getElementById('ninebox-justif-valid').value = p.ninebox.justifValid  || '';
  updateResumenGapSummary();
  updateResumenValidation();
  updateNinebox();
  updateSummaryMetrics();
  updateSectionAlerts();
  updateTabProgress();

  // ── Modo lectura: solo el creador puede editar ──
  const isOwner = isProfileOwner(currentId);
  if(!isOwner) {
    // Banner informativo
    let roBar = document.getElementById('readOnlyBanner');
    if(!roBar) {
      roBar = document.createElement('div');
      roBar.id = 'readOnlyBanner';
      roBar.style.cssText = 'background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#92400e;display:flex;align-items:center;gap:8px';
      roBar.innerHTML = '🔒 <strong>Solo lectura</strong> — Este perfil fue creado por otro evaluador. No puedes modificarlo.';
      const profileViewInner = document.querySelector('#profileView > .content-area, #profileView');
      const firstCard = document.querySelector('#sec-general');
      if(firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(roBar, firstCard);
    }
    roBar.style.display = 'flex';
    // Deshabilitar todos los controles editables del perfil
    document.querySelectorAll('#profileView input:not([readonly]), #profileView select, #profileView textarea, #profileView button.add-row-btn').forEach(el => {
      el.disabled = true;
      if(el.tagName !== 'BUTTON') {
        el.style.background = 'var(--gray-100)';
        el.style.color = 'var(--gray-400)';
        el.style.cursor = 'not-allowed';
      }
    });
    // Ocultar botones de acción (guardar, cerrar, eliminar, etc.)
    const actionBtns = document.getElementById('profileActionButtons');
    if(actionBtns) actionBtns.style.display = 'none';
    // Ocultar botones ✨ Desde datos y ⚡ Sugerir
    document.querySelectorAll('#profileView .btn').forEach(btn => {
      if(!btn.closest('#profileActionButtons')) btn.style.visibility = 'hidden';
    });
  } else {
    // Restaurar si se cambia de perfil propio
    const roBar = document.getElementById('readOnlyBanner');
    if(roBar) roBar.style.display = 'none';
    document.querySelectorAll('#profileView input, #profileView select, #profileView textarea').forEach(el => {
      // Solo restaurar si no son los campos bloqueados por diseño
      const lockedIds = ['g-nombre','g-nroEmpleado','g-ingreso','g-antiguedad'];
      if(!lockedIds.includes(el.id)) {
        el.disabled = false;
        el.style.background = '';
        el.style.color = '';
        el.style.cursor = '';
      }
    });
    document.querySelectorAll('#profileView .btn').forEach(btn => {
      btn.style.visibility = '';
    });
    const actionBtns = document.getElementById('profileActionButtons');
    const isClosed = !!profiles[currentId]?._closed;
    if(actionBtns) actionBtns.style.display = isClosed ? 'none' : 'flex';
  }

  // ── Restricción: Validación del manager solo para rol manager ──
  const userRole = getUserRole();
  const isManager = (userRole === 'manager' || userRole === 'admin');
  const managerFields = ['ninebox-validated','ninebox-aspiraciones','ninebox-justif-valid'];
  managerFields.forEach(fid => {
    const el = document.getElementById(fid);
    if(!el) return;
    if(!isManager) {
      el.disabled = true;
      el.style.background = 'var(--gray-100)';
      el.style.color = 'var(--gray-400)';
      el.style.cursor = 'not-allowed';
      el.title = 'Solo disponible para rol Manager';
    } else {
      el.disabled = false;
      el.style.background = '';
      el.style.color = '';
      el.style.cursor = '';
      el.title = '';
    }
  });

  // ── Actualizar alertas e íconos de tabs al cargar ──
  updateSectionAlerts();
  updateTabProgress();
}

function getEvidencePlaceholder(prefix, i) {
  const perf = [
    'Ej: Entregó migración de pipeline sin supervisión y en plazo.',
    'Ej: Resolvió incidente crítico en prod en <2h con documentación.',
    'Ej: Mantuvo velocity estable en 3 sprints consecutivos.',
    'Ej: Comunicó bloqueantes al cliente sin intervención del manager.',
    'Ej: Propuso mejora que redujo latencia un 40% en producción.',
    'Ej: Aprendió stack nuevo en 1 semana y formó al equipo.',
  ];
  const pot = [
    'Ej: Aplicó feedback de PR al día siguiente sin repetir el error.',
    'Ej: Buscó mentoring proactivamente y lo aplicó en el siguiente sprint.',
    'Ej: Propuso solución alternativa fuera del alcance del ticket.',
    'Ej: Aprendió stack de cliente en 3 semanas sin soporte externo.',
    'Ej: Coordinó handoff con otro squad sin que el manager lo solicitara.',
  ];
  if(prefix === 'perf') return perf[i] || 'Ej: Comportamiento observado con resultado concreto…';
  if(prefix === 'pot')  return pot[i]  || 'Ej: Evidencia de capacidad o potencial observado…';
  return 'Evidencia…';
}

// ═══════════════════════════════════════════════════════════════
// SCORE TABLE BUILDER
// ═══════════════════════════════════════════════════════════════
function buildScoreTable(tbodyId, dims, scores, evidence, prefix, avgId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  const seniority = currentId ? profiles[currentId]?.general?.seniority : null;
  dims.forEach((dim, i) => {
    const bench = seniority ? getBenchmark(prefix, seniority, i) : null;
    const score = scores[i] || 0;
    const gap   = (bench !== null && score > 0) ? score - bench : null;
    const gapLabel = gap === null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(1);
    const gapColor = gap === null ? 'var(--gray-300)' : getGapColor(-gap); // negative gap = below benchmark
    const benchLabel = bench !== null ? bench.toFixed(1) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="dim-label">${esc(dim)}</span></td>
      <td>
        <div class="score-stars" role="group" aria-label="${esc(dim)} — score">
          ${[1,2,3,4,5].map(n => `<div class="star ${scores[i]>=n?'active-'+n:''}" role="button" tabindex="0" aria-label="Score ${n}" onclick="setScore('${prefix}',${i},${n},'${avgId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();setScore('${prefix}',${i},${n},'${avgId}')}">${n}</div>`).join('')}
        </div>
      </td>
      <td style="text-align:center;font-family:'DM Mono',monospace;font-size:12px;color:var(--gray-500)">${benchLabel}</td>
      <td style="text-align:center;font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:${gapColor}">${gapLabel}</td>
      <td><textarea class="evidence-input" rows="1" aria-label="Evidencia: ${esc(dim)}" placeholder="${getEvidencePlaceholder(prefix,i)}" style="${!evidence[i]?.trim() ? 'border-color:var(--amber);background:#fffbeb' : ''}" onchange="setEvidence('${prefix}',${i},this.value)">${esc(evidence[i]||'')}</textarea></td>`;
    tbody.appendChild(tr);
  });
  updateAvgDisplay(prefix, avgId);
}

function setScore(prefix, idx, val, avgId) {
  if(!currentId) return;
  const p = profiles[currentId];
  const section = p[prefix];
  section.scores[idx] = section.scores[idx] === val ? 0 : val;
  // Rebuild the full table so gap column updates immediately
  if(prefix === 'perf') buildScoreTable('perf-tbody', PERF_DIMS, p.perf.scores, p.perf.evidence, 'perf', 'avg-perf');
  else                   buildScoreTable('pot-tbody',  POT_DIMS,  p.pot.scores,  p.pot.evidence,  'pot',  'avg-pot');
  updateNinebox();
  updateSummaryMetrics();
  autoSave();
}

function setEvidence(prefix, idx, val) {
  if(!currentId) return;
  const p = profiles[currentId];
  p[prefix].evidence[idx] = val;
  // Rebuild so the amber border clears when value is entered
  if(prefix === 'perf') buildScoreTable('perf-tbody', PERF_DIMS, p.perf.scores, p.perf.evidence, 'perf', 'avg-perf');
  else                   buildScoreTable('pot-tbody',  POT_DIMS,  p.pot.scores,  p.pot.evidence,  'pot',  'avg-pot');
  autoSave();
}

function updateAvgDisplay(prefix, avgId) {
  if(!currentId) return;
  const avg = getAvg(profiles[currentId][prefix].scores);
  const el = document.getElementById(avgId);
  if(!el) return;
  el.textContent = avg > 0 ? avg.toFixed(1) : '—';
  el.className = 'score-avg ' + (avg >= 4 ? 'good' : avg >= 3 ? 'mid' : avg > 0 ? 'low' : '');
}

// ═══════════════════════════════════════════════════════════════
// SKILL TABLE
// ═══════════════════════════════════════════════════════════════
function buildSkillTable() {
  const tbody = document.getElementById('skill-tbody');
  tbody.innerHTML = '';
  const p = profiles[currentId];
  Object.entries(SKILL_GROUPS).forEach(([group, skills]) => {
    const groupRow = document.createElement('tr');
    groupRow.innerHTML = `<td colspan="7" class="skill-group-header">▸ ${esc(group)}</td>`;
    tbody.appendChild(groupRow);
    skills.forEach(skill => {
      const d = p.skills[skill] || {actual:0,target:0,plan:'',prioridad:'',planActivo:'',na:false};
      if(!p.skills[skill]) p.skills[skill] = d;
      const isNA = !!d.na;
      const gap = !isNA && d.target && d.actual ? d.target - d.actual : '';
      const gapClass = gap > 0 ? 'gap-pos' : gap < 0 ? 'gap-neg' : gap === 0 ? 'gap-zero' : '';
      const planReq = !isNA && d.planActivo === 'Sí';
      const rowOpacity = isNA ? 'opacity:0.35;' : '';
      const escSkill = esc(skill);
      const safeSkill = skill.replace(/'/g, "\\'");
      const tr = document.createElement('tr');
      tr.style.cssText = rowOpacity;
      tr.innerHTML = `
        <td style="font-size:12px">${escSkill}</td>
        <td style="text-align:center">
          <label style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font-size:9px;color:${isNA?'var(--gray-600)':'var(--gray-400)'};font-weight:500">
            <input type="checkbox" ${isNA?'checked':''} title="Esta habilidad no aplica para el rol de esta persona"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--gray-500)"
              onchange="setSkillNA('${safeSkill}',this.checked)">
            ${isNA?'N/A':''}
          </label>
        </td>
        <td><div class="score-stars" style="${isNA?'pointer-events:none;opacity:0.4':''}">
          ${[1,2,3,4,5].map(n=>`<div class="star ${!isNA&&d.actual>=n?'active-'+n:''}" onclick="${isNA?'':'setSkillScore(\''+safeSkill+'\',\'actual\','+n+')'}">${n}</div>`).join('')}
        </div></td>
        <td><div class="score-stars" style="${isNA?'pointer-events:none;opacity:0.4':''}">
          ${[1,2,3,4,5].map(n=>`<div class="star ${!isNA&&d.target>=n?'active-'+n:''}" onclick="${isNA?'':'setSkillScore(\''+safeSkill+'\',\'target\','+n+')'}">${n}</div>`).join('')}
        </div></td>
        <td>${gap !== '' ? `<span class="gap-badge ${gapClass}">${gap > 0 ? '+'+gap : gap}</span>` : '<span style="color:var(--gray-400);font-size:12px">—</span>'}</td>
        <td>
          <select class="risk-select" style="font-size:11px;padding:3px 5px" ${isNA?'disabled':''} onchange="setSkillPrio('${safeSkill}',this.value)">
            <option value="">—</option>
            <option ${d.prioridad==='Alta'?'selected':''}>Alta</option>
            <option ${d.prioridad==='Media'?'selected':''}>Media</option>
            <option ${d.prioridad==='Baja'?'selected':''}>Baja</option>
          </select>
        </td>
        <td>
          <select class="risk-select" style="font-size:11px;padding:3px 5px" ${isNA?'disabled':''} onchange="setSkillPlanActivo('${safeSkill}',this.value)">
            <option value="">—</option>
            <option ${d.planActivo==='Sí'?'selected':''}>Sí</option>
            <option ${d.planActivo==='No'?'selected':''}>No</option>
          </select>
        </td>
        <td><textarea class="evidence-input" rows="1" ${isNA?'disabled':''} placeholder="${planReq && !d.plan?.trim() ? '⚠ Obligatorio…' : 'Plan…'}" style="${planReq && !d.plan?.trim() ? 'border-color:var(--orange);background:#fff7ed' : ''}" onchange="setSkillPlan('${safeSkill}',this.value)">${esc(d.plan||'')}</textarea></td>`;
      tbody.appendChild(tr);
    });
  });
}

function setSkillNA(skill, val) {
  if(!currentId) return;
  if(!profiles[currentId].skills[skill]) profiles[currentId].skills[skill] = {actual:0,target:0,plan:'',prioridad:'',planActivo:'',na:false};
  profiles[currentId].skills[skill].na = val;
  buildSkillTable();
  autoSave();
}
function setSkillScore(skill, type, val) {
  if(!currentId) return;
  const d = profiles[currentId].skills[skill];
  d[type] = d[type] === val ? 0 : val;
  buildSkillTable();
  autoSave();
}
function setSkillPrio(skill, val) {
  if(!currentId) return;
  profiles[currentId].skills[skill].prioridad = val;
  autoSave();
}
function setSkillPlanActivo(skill, val) {
  if(!currentId) return;
  profiles[currentId].skills[skill].planActivo = val;
  buildSkillTable();
  autoSave();
}
function setSkillPlan(skill, val) {
  if(!currentId) return;
  profiles[currentId].skills[skill].plan = val;
  buildSkillTable();
  autoSave();
}

// ═══════════════════════════════════════════════════════════════
// MADUREZ TABLE
// ═══════════════════════════════════════════════════════════════
function buildMatTable() {
  const tbody = document.getElementById('mat-tbody');
  tbody.innerHTML = '';
  const p = profiles[currentId];
  MAT_DIMS.forEach((dim, i) => {
    // Ensure the slot always exists in the profile data
    if(!p.madurez.dims[i]) p.madurez.dims[i] = {nivel:'', justif:''};
    const d = p.madurez.dims[i];
    const missingNivel = !d.nivel;
    const missingJustif = !d.justif?.trim();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px">${esc(dim)}</td>
      <td>
        <select class="risk-select" style="font-size:12px;width:100%;${missingNivel ? 'border-color:var(--amber);background:#fffbeb' : ''}" onchange="setMatNivel(${i},this.value)">
          <option value="">— Seleccionar —</option>
          <option ${d.nivel==='1'?'selected':''} value="1">1 — Ejecutor guiado (Junior)</option>
          <option ${d.nivel==='2'?'selected':''} value="2">2 — Ejecutor independiente (Engineer/Analyst)</option>
          <option ${d.nivel==='3'?'selected':''} value="3">3 — Contribuidor de equipo (Lead)</option>
          <option ${d.nivel==='4'?'selected':''} value="4">4 — Referente de área (Expert)</option>
          <option ${d.nivel==='5'?'selected':''} value="5">5 — Líder estratégico (Chief/Evangelist)</option>
        </select>
      </td>
      <td><textarea class="evidence-input" rows="1" placeholder="${missingJustif ? '⚠ Obligatorio…' : 'Justificación…'}" style="${missingJustif ? 'border-color:var(--amber);background:#fffbeb' : ''}" oninput="setMatJustifSilent(${i},this.value)" onblur="setMatJustif(${i},this.value)">${esc(d.justif||'')}</textarea></td>`;
    tbody.appendChild(tr);
  });
}
function setMatNivel(i, val) { if(!currentId) return; if(!profiles[currentId].madurez.dims[i]) profiles[currentId].madurez.dims[i]={nivel:'',justif:''}; profiles[currentId].madurez.dims[i].nivel = val; buildMatTable(); autoSave(); }
function setMatJustifSilent(i, val) { if(!currentId) return; if(!profiles[currentId].madurez.dims[i]) profiles[currentId].madurez.dims[i]={nivel:'',justif:''}; profiles[currentId].madurez.dims[i].justif = val; autoSave(); }
function setMatJustif(i, val) { if(!currentId) return; if(!profiles[currentId].madurez.dims[i]) profiles[currentId].madurez.dims[i]={nivel:'',justif:''}; profiles[currentId].madurez.dims[i].justif = val; buildMatTable(); autoSave(); }

// Expected maturity level per role (1-5 scale)
const ROLE_MATURITY_EXPECTED = {
  'Junior Engineer': 1, 'Junior Analyst': 1,
  'Engineer': 2, 'Analyst': 2,
  'Lead Engineer': 3, 'Lead Analyst': 3,
  'Expert Engineer': 4, 'Expert Analyst': 4,
  'Project Leader': 3, 'Sr. Technical PL': 4,
  'Chief Architect': 5, 'Evangelist': 5,
};

function updateMatGap() {
  if(!currentId) return;
  const finalSel = document.getElementById('mat-final');
  const gapEl    = document.getElementById('mat-gap');
  if(!finalSel || !gapEl) return;
  const finalVal  = parseInt(finalSel.value) || 0;
  const seniority = profiles[currentId]?.general?.seniority;
  const expected  = seniority ? (ROLE_MATURITY_EXPECTED[seniority] || 0) : 0;
  if(finalVal && expected) {
    const diff = finalVal - expected;
    gapEl.value = diff === 0 ? '0 (En línea con el rol)' :
                  diff > 0   ? `+${diff} (Por encima del rol)` :
                               `${diff} (Por debajo del rol)`;
    gapEl.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    gapEl.value = '';
    gapEl.style.color = 'var(--gray-600)';
  }
  if(currentId) { profiles[currentId].madurez.gap = gapEl.value; }
}

// ═══════════════════════════════════════════════════════════════
// RISK TABLE
// ═══════════════════════════════════════════════════════════════
function buildRiskTable() {
  const tbody = document.getElementById('risk-tbody');
  tbody.innerHTML = '';
  const p = profiles[currentId];
  RISK_ITEMS.forEach((item, i) => {
    const d = p.risk.items[i] || {estado:'',obs:'',accion:''};
    const isAlto = d.estado === 'Alto';
    const isMedio = d.estado === 'Medio';
    const needsObs = isAlto || isMedio;
    const color = isAlto ? 'var(--red)' : 'var(--amber)';
    const bgObs    = needsObs && !d.obs?.trim()    ? `border-color:${color};background:${isAlto?'#fff5f5':'#fffbeb'}` : '';
    const bgAccion = needsObs && !d.accion?.trim() ? `border-color:${color};background:${isAlto?'#fff5f5':'#fffbeb'}` : '';
    const phObs    = needsObs && !d.obs?.trim()    ? '⚠ Obligatorio…' : 'Obs…';
    const phAccion = needsObs && !d.accion?.trim() ? '⚠ Obligatorio…' : 'Acción…';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px">${esc(item)}</td>
      <td>
        <select class="risk-select" onchange="setRiskEstado(${i},this.value)">
          <option value="">—</option>
          <option ${d.estado==='Alto'?'selected':''} style="color:#dc2626">Alto</option>
          <option ${d.estado==='Medio'?'selected':''} style="color:#d97706">Medio</option>
          <option ${d.estado==='Bajo'?'selected':''} style="color:#16a34a">Bajo</option>
        </select>
      </td>
      <td><textarea class="evidence-input" rows="1" placeholder="${phObs}" style="${bgObs}" onchange="setRiskObs(${i},this.value)">${esc(d.obs||'')}</textarea></td>
      <td><textarea class="evidence-input" rows="1" placeholder="${phAccion}" style="${bgAccion}" onchange="setRiskAccion(${i},this.value)">${esc(d.accion||'')}</textarea></td>`;
    tbody.appendChild(tr);
  });
}
function onRiskGlobalChange() {
  const val = document.getElementById('risk-global')?.value || '';
  const isAlto = val.includes('Alto');
  const isMedio = val.includes('Medio');
  const label = document.getElementById('risk-nextrev-label');
  const input = document.getElementById('risk-nextrev');
  if(label && input) {
    if(isAlto) {
      label.innerHTML = 'Próxima revisión de riesgo <span style="color:var(--red)">*</span>';
      input.style.borderColor = input.value ? '' : 'var(--red)';
      input.style.background  = input.value ? '' : '#fff5f5';
    } else if(isMedio) {
      label.innerHTML = 'Próxima revisión de riesgo <span style="color:var(--amber)">*</span>';
      input.style.borderColor = '';
      input.style.background  = '';
    } else {
      label.innerHTML = 'Próxima revisión de riesgo';
      input.style.borderColor = '';
      input.style.background  = '';
    }
  }
}


function setRiskObs(i,v){if(!currentId)return;profiles[currentId].risk.items[i].obs=v;buildRiskTable();autoSave();}
function setRiskAccion(i,v){if(!currentId)return;profiles[currentId].risk.items[i].accion=v;buildRiskTable();autoSave();}
function setRiskEstado(i,v){if(!currentId)return;profiles[currentId].risk.items[i].estado=v;autoSave();buildRiskTable();updateSectionAlerts();updateTabProgress();}

// ═══════════════════════════════════════════════════════════════
// IDP
// ═══════════════════════════════════════════════════════════════
function renderIDPTable() {
  const tbody = document.getElementById('idp-tbody');
  tbody.innerHTML = '';
  const rows = profiles[currentId].idp;
  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = 'idp-row';
    tr.innerHTML = `
      <td><textarea class="evidence-input" rows="2" onchange="updateIDP(${i},'objetivo',this.value)">${esc(row.objetivo||'')}</textarea></td>
      <td>
        <select class="risk-select" style="font-size:11px" onchange="updateIDP(${i},'tipo',this.value)">
          <option value="">—</option>
          ${['Técnico','Liderazgo','Negocio','Soft Skill','Certificación'].map(t=>`<option ${row.tipo===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </td>
      <td><textarea class="evidence-input" rows="2" onchange="updateIDP(${i},'accion',this.value)">${esc(row.accion||'')}</textarea></td>
      <td><textarea class="evidence-input" rows="2" onchange="updateIDP(${i},'recurso',this.value)">${esc(row.recurso||'')}</textarea></td>
      <td><input type="text" class="evidence-input" value="${esc(row.plazo||'')}" placeholder="ej: Q3" onchange="updateIDP(${i},'plazo',this.value)" style="width:72px"></td>
      <td>
        <select class="risk-select" style="font-size:11px" onchange="updateIDP(${i},'estado',this.value)">
          <option value="">—</option>
          ${['Pendiente','En curso','Completado','Bloqueado'].map(t=>`<option ${row.estado===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" class="pct-input" min="0" max="100" value="${row.pct||''}" placeholder="%" onchange="updateIDP(${i},'pct',this.value)">
          <span onclick="deleteIDP(${i})" style="cursor:pointer;color:var(--gray-400);font-size:16px;line-height:1" title="Eliminar">×</span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}
function addIDPRow() {
  if(!currentId) return;
  profiles[currentId].idp.push({objetivo:'',tipo:'',accion:'',recurso:'',plazo:'',estado:'',pct:''});
  renderIDPTable();
  autoSave();
}
function updateIDP(i,field,val){if(!currentId)return;profiles[currentId].idp[i][field]=val;autoSave();}
function deleteIDP(i){if(!currentId)return;profiles[currentId].idp.splice(i,1);renderIDPTable();autoSave();}

// ═══════════════════════════════════════════════════════════════
// 9-BOX LOGIC
// ═══════════════════════════════════════════════════════════════
function updateNinebox() {
  if(!currentId) return;
  const p = profiles[currentId];
  const perf = getAvg(p.perf.scores);
  const pot  = getAvg(p.pot.scores);
  const el = document.getElementById('ninebox-result');
  if(!el) return;

  // Highlight cells
  const cells = document.querySelectorAll('.nb-cell');
  cells.forEach((c,i) => {
    const nb = NINEBOX_LABELS[i];
    c.style.border = '1.5px solid var(--gray-200)';
    c.style.background = 'var(--gray-100)';
    c.style.color = 'var(--gray-600)';
    c.style.fontWeight = '500';
  });

  if(perf === 0 && pot === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">Completa performance y potencial para ver la clasificación automática.</div>';
    return;
  }

  let matched = null, matchIdx = -1;
  // Simple mapping logic
  if(perf >= 4 && pot >= 4)      { matched = NINEBOX_LABELS[1]; matchIdx = 1; }
  else if(perf >= 4 && pot >= 2) { matched = NINEBOX_LABELS[2]; matchIdx = 2; }
  else if(perf >= 2 && pot >= 4) { matched = NINEBOX_LABELS[0]; matchIdx = 0; }
  else if(perf >= 3 && pot >= 3) { matched = NINEBOX_LABELS[4]; matchIdx = 4; }
  else if(perf >= 3 && pot >= 2) { matched = NINEBOX_LABELS[5]; matchIdx = 5; }
  else if(perf >= 3 && pot < 2)  { matched = NINEBOX_LABELS[8]; matchIdx = 8; }
  else if(perf < 3 && pot >= 3)  { matched = NINEBOX_LABELS[3]; matchIdx = 3; }
  else if(perf < 3 && pot >= 2)  { matched = NINEBOX_LABELS[7]; matchIdx = 7; }
  else                            { matched = NINEBOX_LABELS[6]; matchIdx = 6; }

  if(matched && matchIdx >= 0) {
    const cell = document.getElementById('nb-'+matchIdx);
    if(cell) {
      cell.style.background = matched.bg;
      cell.style.border = '1.5px solid '+matched.bc;
      cell.style.color = matched.tc;
      cell.style.fontWeight = '600';
    }
  }

  el.innerHTML = `
    <div class="ninebox-display" style="background:${matched?matched.bg:'var(--gray-100)'};border:1px solid ${matched?matched.bc:'var(--gray-200)'};border-radius:10px">
      <div>
        <div class="ninebox-tag" style="background:${matched?matched.bg:'var(--gray-100)'};color:${matched?matched.tc:'var(--gray-600)'};border:1px solid ${matched?matched.bc:'var(--gray-200)'}">${matched?matched.label:'—'}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px">${matched?matched.desc:''}</div>
      </div>
      <div class="ninebox-scores">
        <div class="ninebox-score-item">
          <div class="val" style="color:var(--blue)">${perf>0?perf.toFixed(1):'—'}</div>
          <div class="lbl">Performance</div>
        </div>
        <div class="ninebox-score-item">
          <div class="val" style="color:var(--teal)">${pot>0?pot.toFixed(1):'—'}</div>
          <div class="lbl">Potencial</div>
        </div>
      </div>
    </div>
    ${(() => {
      const matFinal = parseInt(p.madurez?.final) || 0;
      if(pot > 0 && matFinal > 0) {
        const potBucket = pot >= 4 ? 3 : pot >= 3 ? 2 : 1;
        if(potBucket >= 3 && matFinal <= 2) {
          return `<div style="margin-top:8px;padding:10px 14px;border-radius:8px;background:#f0f9ff;border:1px solid #7dd3fc;display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:16px;flex-shrink:0">💡</span>
            <div>
              <div style="font-size:12px;font-weight:600;color:#0369a1">Alto potencial, madurez en desarrollo (Nivel ${matFinal})</div>
              <div style="font-size:11px;color:var(--gray-500);margin-top:2px">Es coherente: el potencial refleja capacidades y proyección; la madurez profesional refleja el seniority demostrado en contexto. Este perfil requiere exposición progresiva y acompañamiento para acelerar la madurez.</div>
            </div>
          </div>`;
        }
      }
      return '';
    })()}`;
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY METRICS
// ═══════════════════════════════════════════════════════════════
function updateSummaryMetrics() {
  if(!currentId) return;
  const p = profiles[currentId];
  const perf = getAvg(p.perf.scores);
  const pot  = getAvg(p.pot.scores);
  const idpCount = p.idp.length;
  const el = document.getElementById('summary-metrics');
  if(!el) return;
  function metricCard(label, val, color) {
    return `<div class="summary-card">
      <div class="s-label">${label}</div>
      <div class="s-val" style="color:${color||'var(--gray-800)'}">${val}</div>
    </div>`;
  }
  el.innerHTML =
    metricCard('Perf. promedio', perf>0?perf.toFixed(1):'—', perf>=4?'var(--green)':perf>=3?'var(--amber)':perf>0?'var(--red)':'') +
    metricCard('Potencial prom.', pot>0?pot.toFixed(1):'—', pot>=4?'var(--purple)':pot>=3?'var(--blue)':pot>0?'var(--amber)':'') +
    metricCard('Obj. IDP', idpCount, 'var(--navy)');
}

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════
function toggleProfileMenu() {
  const m = document.getElementById('profileMenu');
  if(!m) return;
  const isOpen = m.style.display !== 'none';
  m.style.display = isOpen ? 'none' : 'block';
  if(!isOpen) {
    setTimeout(() => document.addEventListener('click', closeProfileMenuOnOutside), 0);
  }
}
function closeProfileMenu() {
  const m = document.getElementById('profileMenu');
  if(m) m.style.display = 'none';
  document.removeEventListener('click', closeProfileMenuOnOutside);
}
function closeProfileMenuOnOutside(e) {
  if(!document.getElementById('profileMenuWrapper')?.contains(e.target)) {
    closeProfileMenu();
  }
}

function switchTab(name, el) {
  document.querySelectorAll('.section-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
  if(el) { el.classList.add('active'); el.setAttribute('aria-selected','true'); }
  else {
    const tab = document.querySelector(`.section-tab[data-section="${name}"]`);
    if(tab) { tab.classList.add('active'); tab.setAttribute('aria-selected','true'); }
  }
  document.getElementById('sec-'+name)?.classList.add('active');
  if(name === 'ninebox') updateNinebox();
  if(name === 'resumen') updateSummaryMetrics();
  // Scroll to pending alert if present — otherwise stay put
  requestAnimationFrame(() => {
    const alertEl = document.getElementById('alert-'+name);
    if(alertEl?.classList.contains('show')) {
      alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// AUTOSAVE
// ═══════════════════════════════════════════════════════════════
function autoSave() {
  if(!currentId) return;
  if(!isProfileOwner(currentId)) return; // solo el creador puede guardar
  const p = profiles[currentId];
  // Read all general fields
  ['nombre','rol','nivel','ingreso','seniority','nroEmpleado','antiguedad','lasteval','proyectos','entrevistador','notas'].forEach(f => {
    const el = document.getElementById('g-'+f);
    if(el) p.general[f] = el.value;
  });
  p.nombre = p.general.nombre || p.nombre;
  p.rol    = p.general.rol    || p.rol;
  // Madurez
  p.madurez.final  = document.getElementById('mat-final')?.value || '';
  // Perf feedback
  p.perf.feedbackScore = document.getElementById('perf-feedback-score')?.value || '';
  p.perf.feedbackObs   = document.getElementById('perf-feedback-obs')?.value   || '';
  p.madurez.gap    = document.getElementById('mat-gap')?.value || '';
  p.madurez.justif = document.getElementById('mat-justif')?.value || '';
  // Risk
  p.risk.global  = document.getElementById('risk-global')?.value || '';
  p.risk.nextrev = document.getElementById('risk-nextrev')?.value || '';
  p.risk.accion  = document.getElementById('risk-accion')?.value || '';
  // Ninebox
  p.ninebox.comment      = document.getElementById('ninebox-comment')?.value || '';
  p.ninebox.validated    = document.getElementById('ninebox-validated')?.value || '';
  p.ninebox.aspiraciones = document.getElementById('ninebox-aspiraciones')?.value || '';
  p.ninebox.justifValid  = document.getElementById('ninebox-justif-valid')?.value || '';
  // Resumen
  ['fortalezas','mejoras','decision','justif','hito','notas'].forEach(f => {
    const el = document.getElementById('res-'+f);
    if(el) p.resumen[f] = el.value;
  });
  updateResumenValidation();
  p._updatedAt = new Date().toISOString();
  saveLocalState();
  showSaveIndicator();
  // Debounced UI updates (sidebar, alerts, tabs) — avoid thrashing on each keystroke
  scheduleUIUpdate();
  // Update completeness bar (lightweight)
  const pct2 = calcCompleteness(p);
  const col2 = completenessColor(pct2);
  const complDiv2 = document.getElementById('profileCompleteness');
  if(complDiv2) {
    complDiv2.style.display = 'flex';
    document.getElementById('complBar').style.width = pct2 + '%';
    document.getElementById('complBar').style.background = col2;
    document.getElementById('complPct').textContent = pct2 + '%';
    document.getElementById('complPct').style.color = col2;
  }
  document.getElementById('profileName').textContent = p.nombre || '(sin nombre)';
  document.getElementById('profileMeta').textContent = (p.rol||'') + (p.general.seniority ? ' · '+p.general.seniority : '') + (p.general.nroEmpleado ? ' · #'+p.general.nroEmpleado : '');
  // Debounce Supabase push — 2s after last change
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if(currentId) pushToSupabase(currentId, profiles[currentId]);
  }, 2000);
}

function saveAll() {
  autoSave();
  clearTimeout(autoSaveTimer);
  if(currentId) pushToSupabase(currentId, profiles[currentId]);
  showSaveIndicator(true);
}

function showSaveIndicator(force) {
  clearTimeout(saveTimer);
  const el = document.getElementById('saveIndicator');
  el.classList.add('show');
  saveTimer = setTimeout(() => el.classList.remove('show'), force ? 2000 : 1200);
}

// ═══════════════════════════════════════════════════════════════
// TEAM OVERVIEW
// ═══════════════════════════════════════════════════════════════
function skillMatuLabel(p) {
  const vals = Object.values(p.skills || {}).map(s => s.actual).filter(v => v > 0);
  if(!vals.length) return '—';
  const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
  if(avg >= 4) return '🟢 Avanzado';
  if(avg >= 3) return '🟡 Intermedio';
  if(avg >= 2) return '🟠 Básico';
  return '🔴 Inicial';
}

// ═══════════════════════════════════════════════════════════════
// IDP GAP SUGGESTION
// ═══════════════════════════════════════════════════════════════
function updateResumenValidation() {
  if(!currentId) return;
  const p = profiles[currentId];
  // Fields: [elementId, getValue fn]
  const checks = [
    { id: 'res-fortalezas', empty: () => !p.resumen?.fortalezas?.trim() },
    { id: 'res-mejoras',    empty: () => !p.resumen?.mejoras?.trim() },
    { id: 'res-decision',   empty: () => !p.resumen?.decision },
    { id: 'res-justif',     empty: () => !p.resumen?.justif?.trim() },
    { id: 'res-hito',       empty: () => !p.resumen?.hito?.trim() },
  ];
  checks.forEach(({ id, empty }) => {
    const el = document.getElementById(id);
    if(!el) return;
    if(empty()) {
      el.style.borderColor = 'var(--amber)';
      el.style.background  = '#fffbeb';
    } else {
      el.style.borderColor = '';
      el.style.background  = '';
    }
  });
}

function updateResumenGapSummary() {
  if(!currentId) return;
  const p = profiles[currentId];
  const el = document.getElementById('idp-gaps-summary');
  if(!el) return;
  const gaps = [];
  Object.entries(SKILL_GROUPS).forEach(([group, skills]) => {
    skills.forEach(skill => {
      const key = group + '|' + skill;
      const s = p.skills[key];
      if(s && s.target > 0 && s.actual >= 0) {
        const gap = s.target - s.actual;
        if(gap >= 1) gaps.push({ skill, gap, group });
      }
    });
  });
  gaps.sort((a,b) => b.gap - a.gap);
  if(!gaps.length) {
    el.textContent = 'Sin gaps detectados — completa Madurez Técnica con niveles objetivo.';
    const nudge = document.getElementById('idp-empty-nudge');
    const badge = document.getElementById('idp-filled-badge');
    const idpItems = (profiles[currentId]?.idp || []).filter(r => r.objetivo?.trim());
    if(nudge && badge) {
      nudge.style.display = idpItems.length === 0 ? 'inline-flex' : 'none';
      badge.style.display = idpItems.length > 0 ? 'inline-flex' : 'none';
      const count = document.getElementById('idp-filled-count');
      if(count) count.textContent = idpItems.length;
    }
    return;
  }
  el.innerHTML = gaps.slice(0,5).map(g =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:10px;padding:2px 6px;background:${g.gap>=2?'var(--red-light)':'var(--amber-light)'};color:${g.gap>=2?'var(--red)':'var(--amber)'};border-radius:4px;font-weight:600">gap ${g.gap>0?'+':''}${g.gap}</span>
      <span style="font-size:12px">${esc(g.skill)}</span>
      <span style="font-size:10px;color:var(--gray-400)">${esc(g.group)}</span>
    </div>`
  ).join('');

  // IDP nudge: show link if IDP is empty, badge if filled
  const idpItems = (profiles[currentId]?.idp || []).filter(r => r.objetivo?.trim());
  const nudge  = document.getElementById('idp-empty-nudge');
  const badge  = document.getElementById('idp-filled-badge');
  const count  = document.getElementById('idp-filled-count');
  if(nudge && badge) {
    if(idpItems.length === 0) {
      nudge.style.display = 'inline-flex';
      badge.style.display = 'none';
    } else {
      nudge.style.display = 'none';
      badge.style.display = 'inline-flex';
      if(count) count.textContent = idpItems.length;
    }
  }
}

function suggestIDPFromGaps() {
  if(!currentId) return;
  const p = profiles[currentId];
  const gaps = [];
  Object.entries(SKILL_GROUPS).forEach(([group, skills]) => {
    skills.forEach(skill => {
      const key = group + '|' + skill;
      const s = p.skills[key];
      if(s && s.target > 0 && s.actual >= 0) {
        const gap = s.target - s.actual;
        if(gap >= 1) gaps.push({ skill, gap, group });
      }
    });
  });
  gaps.sort((a,b) => b.gap - a.gap);
  if(!gaps.length) { alert('No hay gaps detectados. Completa Madurez Técnica con niveles objetivo.'); return; }
  const topGaps = gaps.slice(0,3);
  topGaps.forEach(g => {
    const tipo = g.group.includes('AI') ? 'Curso / Certificación' : g.group.includes('SOFT') ? 'Mentoring / Práctica' : 'Proyecto / Autoestudio';
    p.idp.push({
      area: g.skill,
      accion: `Desarrollar competencia en ${g.skill} — gap actual: ${g.gap} niveles`,
      tipo,
      plazo: '',
      avance: 0,
      resp: '',
      nivel: ''
    });
  });
  saveLocalState();
  pushToSupabase(currentId, p);
  // Switch to IDP tab
  const idpTab = document.querySelector('.section-tab:nth-child(8)');
  switchTab('idp', idpTab || document.querySelector('.section-tab'));
  buildIDPTable();
  showSaveIndicator();
  alert(`✓ Se agregaron ${topGaps.length} acciones al IDP basadas en los mayores gaps técnicos.`);
}


function openBenchmarkModal() {
  renderBenchmarkEditor();
  openModal('benchmarkModal');
}

function renderBenchmarkEditor() {
  const el = document.getElementById('benchmarkEditorContent');
  let html = '';
  ['perf', 'pot'].forEach(prefix => {
    const dims = prefix === 'perf' ? PERF_DIMS : POT_DIMS;
    const title = prefix === 'perf' ? 'Performance' : 'Potencial';
    html += `<div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--navy)">${title}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--gray-50)">
          <th style="text-align:left;padding:6px 8px;border:1px solid var(--gray-200)">Dimensión</th>
          ${SENIORITY_LEVELS.map(l => `<th style="text-align:center;padding:6px 8px;border:1px solid var(--gray-200);white-space:nowrap">${l}</th>`).join('')}
        </tr></thead>
        <tbody>`;
    dims.forEach((dim, i) => {
      html += `<tr>
        <td style="padding:6px 8px;border:1px solid var(--gray-200);color:var(--gray-700)">${dim}</td>
        ${SENIORITY_LEVELS.map(lvl => `
          <td style="text-align:center;padding:4px;border:1px solid var(--gray-200)">
            <input type="number" min="0.5" max="5" step="0.5"
              data-prefix="${prefix}" data-level="${lvl}" data-idx="${i}"
              value="${benchmarks[prefix][lvl][i]}"
              style="width:52px;text-align:center;border:1px solid var(--gray-200);border-radius:4px;padding:3px 4px;font-family:'DM Mono',monospace;font-size:12px">
          </td>`).join('')}
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });
  el.innerHTML = html;
}

function applyBenchmarks() {
  const inputs = document.querySelectorAll('#benchmarkEditorContent input[type=number]');
  inputs.forEach(inp => {
    const prefix = inp.dataset.prefix;
    const level  = inp.dataset.level;
    const idx    = parseInt(inp.dataset.idx);
    const val    = parseFloat(inp.value) || 0;
    benchmarks[prefix][level][idx] = Math.min(5, Math.max(0, val));
  });
  saveBenchmarks();
  closeModal('benchmarkModal');
  // Refresh current profile table if open
  if(currentId && activeView === 'profile') {
    const p = profiles[currentId];
    buildScoreTable('perf-tbody', PERF_DIMS, p.perf.scores, p.perf.evidence, 'perf', 'avg-perf');
    buildScoreTable('pot-tbody', POT_DIMS, p.pot.scores, p.pot.evidence, 'pot', 'avg-pot');
  }
  showSaveIndicator();
}

function resetBenchmarks() {
  if(!confirm('¿Restaurar los benchmarks a los valores por defecto?')) return;
  benchmarks = JSON.parse(JSON.stringify(DEFAULT_BENCHMARKS));
  saveBenchmarks();
  renderBenchmarkEditor();
}

// ═══════════════════════════════════════════════════════════════
// DIMENSION EDITOR (admin only)
// ═══════════════════════════════════════════════════════════════
let dimEditTarget = null; // 'perf' | 'pot' | 'mat' | 'skills'

const DIM_CONFIG = {
  perf:   { title: 'Performance — Dimensiones', desc: 'Dimensiones evaluadas en desempeño actual (1–5)', getArr: () => PERF_DIMS, setArr: v => { PERF_DIMS = v; } },
  pot:    { title: 'Potencial — Dimensiones',   desc: 'Dimensiones evaluadas en proyección de crecimiento (1–5)', getArr: () => POT_DIMS, setArr: v => { POT_DIMS = v; } },
  mat:    { title: 'Madurez Profesional — Dimensiones', desc: 'Dimensiones del modelo de madurez profesional', getArr: () => MAT_DIMS, setArr: v => { MAT_DIMS = v; } },
  skills: { title: 'Madurez Técnica — Skills',  desc: 'Grupos y skills del skill map técnico', getArr: () => null, setArr: null },
};

function openDimEditor(target) {
  if(!isAdmin()) return;
  dimEditTarget = target;
  const cfg = DIM_CONFIG[target];
  document.getElementById('dimModalTitle').textContent = '✏ ' + cfg.title;
  document.getElementById('dimModalDesc').textContent = cfg.desc;
  renderDimEditorList();
  openModal('dimModal');
}

function renderDimEditorList() {
  const list = document.getElementById('dimEditorList');
  list.innerHTML = '';
  if(dimEditTarget === 'skills') {
    renderSkillGroupEditor(list);
    return;
  }
  const arr = DIM_CONFIG[dimEditTarget].getArr();
  arr.forEach((dim, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
    row.innerHTML = `
      <span style="font-size:11px;color:var(--gray-400);font-family:DM Mono,monospace;width:20px;flex-shrink:0">${i+1}</span>
      <input type="text" value="${esc(dim)}" data-idx="${i}"
        style="flex:1;border:1px solid var(--gray-200);border-radius:6px;padding:7px 10px;font-size:13px"
        oninput="updateDimTemp(${i}, this.value)">
      <button onclick="removeDimRow(${i})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;padding:0 4px" title="Eliminar">×</button>`;
    list.appendChild(row);
  });
}

function renderSkillGroupEditor(list) {
  Object.entries(SKILL_GROUPS).forEach(([group, skills], gi) => {
    const groupDiv = document.createElement('div');
    groupDiv.style.cssText = 'margin-bottom:16px;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden';
    groupDiv.innerHTML = `
      <div style="background:var(--gray-50);padding:8px 12px;display:flex;align-items:center;gap:8px">
        <input type="text" value="${esc(group)}" data-group="${gi}"
          style="flex:1;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px;font-weight:600"
          oninput="updateGroupName(${gi}, this.value)">
        <button onclick="removeGroup(${gi})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px" title="Eliminar grupo">×</button>
      </div>
      <div style="padding:8px 12px" id="skill-group-${gi}">
        ${skills.map((s, si) => `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <input type="text" value="${esc(s)}" data-group="${gi}" data-skill="${si}"
              style="flex:1;border:1px solid var(--gray-200);border-radius:4px;padding:4px 8px;font-size:12px"
              oninput="updateSkillName(${gi}, ${si}, this.value)">
            <button onclick="removeSkill(${gi},${si})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px">×</button>
          </div>`).join('')}
        <button onclick="addSkill(${gi})" style="font-size:11px;color:var(--blue);background:none;border:1px dashed var(--blue-light);border-radius:4px;padding:3px 10px;cursor:pointer;width:100%">+ Skill</button>
      </div>`;
    list.appendChild(groupDiv);
  });
  const addGrpBtn = document.createElement('button');
  addGrpBtn.className = 'btn btn-ghost btn-sm';
  addGrpBtn.style.cssText = 'width:100%;border:1px dashed var(--gray-300);color:var(--gray-500);margin-top:4px';
  addGrpBtn.textContent = '+ Grupo';
  addGrpBtn.onclick = addSkillGroup;
  list.appendChild(addGrpBtn);
}

// Temp state for editing
let dimTempArr = [];
function updateDimTemp(i, val) {
  dimTempArr[i] = val;
}

function addDimRow() {
  if(dimEditTarget === 'skills') { addSkillGroup(); return; }
  const arr = DIM_CONFIG[dimEditTarget].getArr();
  arr.push('Nueva dimensión');
  renderDimEditorList();
}

function removeDimRow(i) {
  const arr = DIM_CONFIG[dimEditTarget].getArr();
  if(arr.length <= 1) { alert('Debe haber al menos una dimensión.'); return; }
  arr.splice(i, 1);
  renderDimEditorList();
}

function updateGroupName(gi, val) {
  const keys = Object.keys(SKILL_GROUPS);
  const skills = Object.values(SKILL_GROUPS);
  const newGroups = {};
  keys.forEach((k, i) => { newGroups[i === gi ? val : k] = skills[i]; });
  SKILL_GROUPS = newGroups;
}
function updateSkillName(gi, si, val) {
  const skills = Object.values(SKILL_GROUPS);
  skills[gi][si] = val;
}
function removeSkill(gi, si) {
  const skills = Object.values(SKILL_GROUPS);
  if(skills[gi].length <= 1) { alert('Debe haber al menos un skill.'); return; }
  skills[gi].splice(si, 1);
  renderDimEditorList();
}
function addSkill(gi) {
  const skills = Object.values(SKILL_GROUPS);
  skills[gi].push('Nuevo skill');
  renderDimEditorList();
}
function removeGroup(gi) {
  const keys = Object.keys(SKILL_GROUPS);
  if(keys.length <= 1) { alert('Debe haber al menos un grupo.'); return; }
  keys.splice(gi, 1);
  const vals = Object.values(SKILL_GROUPS);
  vals.splice(gi, 1);
  const newGroups = {};
  keys.forEach((k, i) => { newGroups[k] = vals[i]; });
  SKILL_GROUPS = newGroups;
  renderDimEditorList();
}
function addSkillGroup() {
  SKILL_GROUPS['Nuevo grupo'] = ['Nuevo skill'];
  renderDimEditorList();
}

async function applyDimEdits() {
  if(dimEditTarget !== 'skills') {
    // Read current input values
    const inputs = document.querySelectorAll('#dimEditorList input[type=text]');
    const arr = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
    if(!arr.length) { alert('Debe haber al menos una dimensión.'); return; }
    DIM_CONFIG[dimEditTarget].setArr(arr);
    // Rebuild benchmark arrays if size changed
    rebuildBenchmarksForDim(dimEditTarget, arr.length);
  }
  await saveDimensions();
  closeModal('dimModal');
  // Refresh current profile view
  if(currentId && activeView === 'profile') {
    const p = profiles[currentId];
    if(dimEditTarget === 'perf') buildScoreTable('perf-tbody', PERF_DIMS, p.perf.scores, p.perf.evidence, 'perf', 'avg-perf');
    if(dimEditTarget === 'pot')  buildScoreTable('pot-tbody',  POT_DIMS,  p.pot.scores,  p.pot.evidence,  'pot',  'avg-pot');
    if(dimEditTarget === 'mat')  buildMatTable();
    if(dimEditTarget === 'skills') buildSkillTable();
  }
  showSaveIndicator();
}

function rebuildBenchmarksForDim(prefix, newLen) {
  if(prefix !== 'perf' && prefix !== 'pot') return;
  SENIORITY_LEVELS.forEach(lvl => {
    const cur = benchmarks[prefix][lvl] || [];
    if(cur.length < newLen) {
      while(cur.length < newLen) cur.push(3.0);
    } else if(cur.length > newLen) {
      benchmarks[prefix][lvl] = cur.slice(0, newLen);
    }
  });
  saveBenchmarks();
}

function showMethodology() {
  currentId = null;
  activeView = 'methodology';
  hideAllViews();
  document.getElementById('methodologyView').style.display = 'block';
  deactivateAllNav();
  document.getElementById('nav-methodology').classList.add('active');
  renderSidebar();
  renderMethodologyBenchmarkTable();
}

// ─── ROLE COMPETENCIES VIEW ───
let rcCurrentRole = Object.keys(ROLE_COMPETENCIES)[0];
let rcCurrentPillar = 'perf';
const RC_PILLAR_CONFIG = {
  perf: { label: 'Performance', icon: '📊', color: 'var(--green)',  desc: '¿Qué está entregando hoy en su rol?' },
  pot:  { label: 'Potencial',   icon: '🚀', color: 'var(--purple)', desc: '¿Qué capacidad de crecimiento tiene?' },
  mat:  { label: 'Madurez Profesional', icon: '🎯', color: 'var(--orange)', desc: '¿Opera al nivel de complejidad de su rol?' },
};

function showRoleCompetencies() {
  currentId = null;
  activeView = 'rolecomp';
  hideAllViews();
  document.getElementById('roleCompView').style.display = 'block';
  deactivateAllNav();
  document.getElementById('nav-role-comp').classList.add('active');
  renderSidebar();
  renderRCView();
}

function renderRCView() {
  // Build role buttons
  const btns = document.getElementById('rc-role-buttons');
  if(btns) {
    btns.innerHTML = Object.keys(ROLE_COMPETENCIES).map(r => {
      const rc = ROLE_COMPETENCIES[r];
      const isActive = r === rcCurrentRole;
      return `<button onclick="rcSelectRole('${r}')" style="
        padding:5px 11px;border-radius:8px;font-size:12px;cursor:pointer;
        font-weight:${isActive?700:500};
        border:${isActive?`2px solid ${rc.color}`:'1px solid #e2e8f0'};
        background:${isActive?rc.color+'15':'white'};
        color:${isActive?rc.color:'#475569'}">${r}</button>`;
    }).join('');
  }
  // Role header
  const rc = ROLE_COMPETENCIES[rcCurrentRole];
  const hdr = document.getElementById('rc-role-header');
  if(hdr) {
    hdr.innerHTML = `<div class="card-body" style="padding:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:16px;font-weight:700;color:${rc.color}">${rcCurrentRole}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${rc.color}18;color:${rc.color};font-weight:600">${rc.track} · ${rc.level}</span>
      </div>
    </div>`;
  }
  // Pillar tabs
  Object.entries(RC_PILLAR_CONFIG).forEach(([key, p]) => {
    const btn = document.getElementById(`rc-tab-${key}`);
    if(!btn) return;
    const isActive = key === rcCurrentPillar;
    btn.style.border    = isActive ? `2px solid ${p.color}` : '1px solid #e2e8f0';
    btn.style.background = isActive ? p.color.replace('var(','').replace(')','') + '-light' : 'white';
    btn.style.color     = isActive ? p.color : 'var(--gray-500)';
    btn.style.fontWeight = isActive ? '700' : '500';
    // Fix colors for active state using inline approach
    if(isActive) {
      btn.style.borderColor = p.color;
      btn.style.color = p.color;
      btn.style.background = p.color.includes('green') ? '#f0fdf4' :
                             p.color.includes('purple') ? '#f5f3ff' :
                             p.color.includes('orange') ? '#fff7ed' : '#f0f9ff';
    } else {
      btn.style.borderColor = '#e2e8f0';
      btn.style.color = 'var(--gray-500)';
      btn.style.background = 'white';
    }
  });
  // Pillar desc
  const descEl = document.getElementById('rc-pillar-desc');
  if(descEl) descEl.textContent = RC_PILLAR_CONFIG[rcCurrentPillar].icon + ' ' + RC_PILLAR_CONFIG[rcCurrentPillar].desc;
  // Dims
  const dims = rc[rcCurrentPillar];
  const pillarColor = RC_PILLAR_CONFIG[rcCurrentPillar].color;
  const list = document.getElementById('rc-dims-list');
  if(list) {
    list.innerHTML = dims.map((dim, i) => `
      <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-left:3px solid ${pillarColor}">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;font-weight:700;color:white;background:${pillarColor};width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:#0f172a">${dim}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">Escala 1–5 · Benchmark esperado: <strong style="color:${pillarColor}">${pillarColor === 'var(--green)' ? (benchmarks.perf?.[rcCurrentRole]?.[i]?.toFixed(1) ?? '—') : (benchmarks.pot?.[rcCurrentRole]?.[i]?.toFixed(1) ?? '—')}</strong></div>
          </div>
        </div>
      </div>`).join('');
  }
}

function rcSelectRole(role) { rcCurrentRole = role; renderRCView(); }
function rcSelectPillar(p)   { rcCurrentPillar = p;  renderRCView(); }

function renderMethodologyBenchmarkTable() {
  const el = document.getElementById('methodologyBenchmarkTable');
  if(!el) return;
  let html = '';
  ['perf', 'pot'].forEach(prefix => {
    const dims = prefix === 'perf' ? PERF_DIMS : POT_DIMS;
    const title = prefix === 'perf' ? '📊 Performance' : '🚀 Potencial';
    html += `<div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">${title}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--gray-50)">
          <th style="text-align:left;padding:7px 10px;border:1px solid var(--gray-200)">Dimensión</th>
          ${SENIORITY_LEVELS.map(l => `<th style="text-align:center;padding:7px 10px;border:1px solid var(--gray-200);white-space:nowrap;font-family:'DM Mono',monospace">${l}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${dims.map((dim, i) => `<tr>
            <td style="padding:7px 10px;border:1px solid var(--gray-200);color:var(--gray-700)">${dim}</td>
            ${SENIORITY_LEVELS.map(lvl => {
              const val = benchmarks[prefix][lvl][i];
              const color = val >= 4 ? 'var(--green)' : val >= 3 ? 'var(--blue)' : val >= 2 ? 'var(--amber)' : 'var(--gray-500)';
              return `<td style="text-align:center;padding:7px 10px;border:1px solid var(--gray-200);font-family:'DM Mono',monospace;font-weight:600;color:${color}">${val.toFixed(1)}</td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  });
  el.innerHTML = html;
}

let overviewFilter = 'all';

function clearOverviewFilters() {
  ['filter-nombre','filter-rol','filter-nivel','filter-seniority','filter-perf','filter-pot','filter-ninebox','filter-mad-tec','filter-mad-prof','filter-risk','filter-decision'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  renderOverview();
}

function getOverviewFilters() {
  return {
    nombre:   (document.getElementById('filter-nombre')?.value   || '').toLowerCase().trim(),
    rol:      (document.getElementById('filter-rol')?.value      || '').toLowerCase().trim(),
    nivel:     document.getElementById('filter-nivel')?.value    || '',
    seniority: document.getElementById('filter-seniority')?.value|| '',
    perf:      document.getElementById('filter-perf')?.value     || '',
    pot:       document.getElementById('filter-pot')?.value      || '',
    ninebox:   document.getElementById('filter-ninebox')?.value  || '',
    madTec:    document.getElementById('filter-mad-tec')?.value  || '',
    madProf:   document.getElementById('filter-mad-prof')?.value || '',
    risk:      document.getElementById('filter-risk')?.value     || '',
    decision:  document.getElementById('filter-decision')?.value || '',
  };
}

function applyOverviewFilters(ids) {
  const f = getOverviewFilters();
  return ids.filter(id => {
    const p = profiles[id];
    if(!p) return false;
    if(f.nombre    && !(p.nombre||'').toLowerCase().includes(f.nombre)) return false;
    if(f.rol       && !(p.rol||'').toLowerCase().includes(f.rol)) return false;
    if(f.nivel     && p.general?.nivel !== f.nivel) return false;
    if(f.seniority && p.general?.seniority !== f.seniority) return false;
    if(f.perf) {
      const perf = getAvg(p.perf?.scores||{});
      if(f.perf==='4' && perf<4) return false;
      if(f.perf==='3' && perf<3) return false;
      if(f.perf==='2' && perf>2) return false;
    }
    if(f.pot) {
      const pot = getAvg(p.pot?.scores||{});
      if(f.pot==='4' && pot<4) return false;
      if(f.pot==='3' && pot<3) return false;
      if(f.pot==='2' && pot>2) return false;
    }
    if(f.ninebox) {
      const perf=getAvg(p.perf?.scores||{}), pot=getAvg(p.pot?.scores||{});
      let nb='';
      if(perf>=4&&pot>=4) nb='⭐ Top talent';
      else if(perf>=4&&pot>=2) nb='🚀 High performer';
      else if(perf>=2&&pot>=4) nb='💡 Alto potencial';
      else if(perf>=3&&pot>=3) nb='✅ Core contributor';
      else if(perf<3&&pot<3&&perf>0) nb='⚠️ Under review';
      else if(perf>0||pot>0) nb='📈 En desarrollo';
      if(nb !== f.ninebox) return false;
    }
    if(f.madTec) {
      // skillMatuLabel returns a text with the avg — filter by numeric avg
      const skillAvg = (() => {
        const vals = Object.values(p.skills||{}).map(d=>d.actual).filter(v=>v>0);
        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
      })();
      if(f.madTec==='4' && skillAvg<4) return false;
      if(f.madTec==='3' && skillAvg<3) return false;
      if(f.madTec==='2' && skillAvg>2) return false;
    }
    if(f.madProf) {
      const matFinal = p.madurez?.final || '';
      if(!matFinal.startsWith(f.madProf.charAt(0))) return false;
    }
    if(f.risk     && !(p.risk?.global||'').includes(f.risk)) return false;
    if(f.decision && p.resumen?.decision !== f.decision) return false;
    return true;
  });
}

function showOverview(filter) {
  overviewFilter = filter || 'all';
  currentId = null;
  activeView = 'overview';
  hideAllViews();
  document.getElementById('overviewView').style.display = 'block';
  deactivateAllNav();
  // Update nav active state
  document.getElementById('nav-overview-mine').classList.toggle('active', overviewFilter==='mine');
  document.getElementById('nav-overview-all').classList.toggle('active', overviewFilter==='all');
  // Update header buttons
  document.getElementById('ov-btn-mine').style.background = overviewFilter==='mine' ? 'var(--navy)' : '';
  document.getElementById('ov-btn-mine').style.color = overviewFilter==='mine' ? 'white' : '';
  document.getElementById('ov-btn-all').style.background = overviewFilter==='all' ? 'var(--navy)' : '';
  document.getElementById('ov-btn-all').style.color = overviewFilter==='all' ? 'white' : '';
  // Update title
  document.getElementById('overviewTitle').textContent = overviewFilter==='mine' ? `👤 Mis perfiles` : '📊 Vista Consolidada';
  document.getElementById('overviewSubtitle').textContent = overviewFilter==='mine'
    ? 'Todos tus perfiles — incompletos, guardados y cerrados'
    : 'Solo perfiles cerrados — visibles al equipo con permisos';
  renderSidebar();
  renderOverview();
}

function renderOverview() {
  const tbody = document.getElementById('overviewBody');
  tbody.innerHTML = '';
  let ids = Object.keys(profiles);
  const uname = currentUser?.user_metadata?.full_name || currentUser?.email;

  if(overviewFilter === 'mine') {
    // All profiles created/updated by me, regardless of closed state
    ids = ids.filter(id => {
      const p = profiles[id];
      return p._createdByName === uname || p._updatedByName === uname;
    });
  } else {
    // 'all' — solo perfiles cerrados, visibles según jerarquía estricta
    ids = ids.filter(id => profiles[id]._closed && canSeeProfile(profiles[id]));
  }

  // Apply filters
  ids = applyOverviewFilters(ids);
  const countEl = document.getElementById('filter-count');
  if(countEl) countEl.textContent = ids.length ? `${ids.length} perfil${ids.length>1?'es':''}` : '';

  if(!ids.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:2rem;color:var(--gray-400)">${
      overviewFilter === 'mine'
        ? 'No tienes perfiles asignados. Crea un nuevo perfil para comenzar.'
        : 'No hay perfiles cerrados aún. Los perfiles aparecen en Vista Consolidada cuando el manager los cierra al 100%.'
    }</td></tr>`;
    return;
  }
  ids.forEach(id => {
    const p = profiles[id];
    const perf = getAvg(p.perf.scores);
    const pot  = getAvg(p.pot.scores);
    let nb = '—';
    if(perf >= 4 && pot >= 4) nb = '⭐ Top talent';
    else if(perf >= 4 && pot >= 2) nb = '🚀 High performer';
    else if(perf >= 2 && pot >= 4) nb = '💡 Alto potencial';
    else if(perf >= 3 && pot >= 3) nb = '✅ Core contributor';
    else if(perf < 3 && pot < 3 && perf > 0) nb = '⚠️ Under review';
    else if(perf > 0 || pot > 0) nb = '📈 En desarrollo';

    const riskColor = p.risk.global.includes('Alto') ? 'var(--red)' : p.risk.global.includes('Medio') ? 'var(--amber)' : p.risk.global.includes('Bajo') ? 'var(--green)' : 'var(--gray-400)';
    const initials = (p.nombre||'??').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();

    // Trend deltas vs previous cycle
    const prevSnap = getPrevCycleSnapshot(p);
    const perfDelta = prevSnap && perf > 0 && prevSnap.perf > 0 ? perf - prevSnap.perf : null;
    const potDelta  = prevSnap && pot  > 0 && prevSnap.pot  > 0 ? pot  - prevSnap.pot  : null;
    const hasCycles = (p._cycle || 1) > 1 || (p._history||[]).some(h => h.event === 'cycle_archived');

    function trendBadge(delta) {
      if(delta === null) return '';
      if(Math.abs(delta) < 0.1) return '<span class="trend-flat">→</span>';
      const sign = delta > 0 ? '▲' : '▼';
      const cls  = delta > 0 ? 'trend-up' : 'trend-down';
      return `<span class="${cls}">${sign}${Math.abs(delta).toFixed(1)}</span>`;
    }

    // Last eval date
    const lastEvalDate = p._closedAt
      ? new Date(p._closedAt).toLocaleDateString('es-CL', {day:'2-digit',month:'short',year:'2-digit'})
      : p.general?.lasteval || '—';
    const cycleLabel = (p._cycle||1) > 1 ? `<span style="font-size:10px;color:var(--teal);font-weight:600"> C${p._cycle}</span>` : '';

    const tr = document.createElement('tr');
    const isOwned = isProfileOwner(id);
    if(overviewFilter === 'mine' && isOwned) {
      tr.style.cursor = 'pointer';
      tr.onclick = () => openProfile(id);
    } else if(overviewFilter === 'all') {
      tr.style.cursor = 'default';
      tr.title = 'Vista consolidada — solo lectura. Solo el evaluador que creó el perfil puede abrirlo.';
    }
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:26px;height:26px;border-radius:50%;background:${esc(p.color)}22;color:${esc(p.color)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${esc(initials)}</div>
          <div>
            <span style="font-weight:500">${esc(p.nombre)||'—'}</span>${cycleLabel}
            ${(() => {
              if(p._closed) return '<span style="font-size:10px;padding:1px 5px;background:var(--green-light);color:var(--green);border-radius:4px;font-weight:600;margin-left:4px">✓ Cerrado</span>';
              const pct = calcCompleteness(p);
              if(pct >= 100) return '<span style="font-size:10px;padding:1px 5px;background:#dbeafe;color:var(--blue);border-radius:4px;font-weight:600;margin-left:4px">Listo para cerrar</span>';
              return `<span style="font-size:10px;padding:1px 5px;background:var(--amber-light);color:var(--amber);border-radius:4px;font-weight:600;margin-left:4px">Incompleto ${pct}%</span>`;
            })()}
          </div>
        </div>
      </td>
      <td style="color:var(--gray-600)">${esc(p.rol)||'—'}</td>
      <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;font-weight:500;background:${p.general.nivel==='Manager'?'#ede9fe':p.general.nivel==='Líder'?'#dbeafe':'#f1f5f9'};color:${p.general.nivel==='Manager'?'#5b21b6':p.general.nivel==='Líder'?'#1e40af':'#475569'}">${esc(p.general.nivel)||'—'}</span></td>
      <td>${esc(p.general.seniority)||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-weight:600;font-family:'DM Mono',monospace;color:${perf>=4?'var(--green)':perf>=3?'var(--amber)':perf>0?'var(--red)':'var(--gray-400)'}">${perf>0?perf.toFixed(1):'—'}</span>
          ${trendBadge(perfDelta)}
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-weight:600;font-family:'DM Mono',monospace;color:${pot>=4?'var(--purple)':pot>=3?'var(--blue)':pot>0?'var(--amber)':'var(--gray-400)'}">${pot>0?pot.toFixed(1):'—'}</span>
          ${trendBadge(potDelta)}
        </div>
      </td>
      <td style="font-size:12px">${nb}</td>
      <td style="font-size:12px">${skillMatuLabel(p)}</td>
      <td style="font-size:12px">${esc(p.madurez.final)||'—'}</td>
      <td><span style="color:${riskColor};font-size:12px">${esc(p.risk.global)||'—'}</span></td>
      <td style="font-size:12px">${esc(p.resumen.decision)||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--gray-600)">${lastEvalDate}</span>
          ${hasCycles ? `<button onclick="event.stopPropagation();openHistoryModal('${id}')"
            style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--gray-100);border:1px solid var(--gray-300);cursor:pointer;color:var(--navy);font-weight:600;white-space:nowrap">📋 Ver</button>` : ''}
        </div>
      </td>
      <td style="font-size:11px;color:var(--gray-500)">${esc(p._updatedByName||p._createdByName||'—')}</td>`;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════════════
// ADD / DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('modal-nombre').value = '';
  document.getElementById('modal-seniority').value = '';
  selectedColor = '#2563eb';
  document.querySelectorAll('.color-opt').forEach(c => {
    c.style.border = '2px solid transparent';
    c.style.transform = 'scale(1)';
  });
  const first = document.querySelector('.color-opt');
  if(first) { first.style.border = '2px solid var(--gray-800)'; first.style.transform = 'scale(1.2)'; }
  // Reset equipo selector
  selectedEquipoMember = null;
  const eSearch = document.getElementById('modal-equipo-search');
  if(eSearch) eSearch.value = '';
  const eList = document.getElementById('modal-equipo-list');
  if(eList) eList.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--gray-400)">Escribe para buscar…</div>';
  const eBadge = document.getElementById('modal-equipo-selected');
  if(eBadge) eBadge.style.display = 'none';
  openModal('addModal');
  document.getElementById('modal-nombre').focus();
}
function closeAddModal() { closeModal('addModal'); }
function selectColor(el) {
  selectedColor = el.dataset.color;
  document.querySelectorAll('.color-opt').forEach(c => {
    c.style.border = '2px solid transparent'; c.style.transform = 'scale(1)';
  });
  el.style.border = '2px solid var(--gray-800)'; el.style.transform = 'scale(1.2)';
}
function createProfile() {
  const nombre   = document.getElementById('modal-nombre').value.trim();
  const seniority = document.getElementById('modal-seniority').value;
  const msgEl = document.getElementById('modal-equipo-required-msg');
  if(!nombre || !selectedEquipoMember) {
    if(msgEl) msgEl.style.display = 'block';
    return;
  }
  if(msgEl) msgEl.style.display = 'none';
  const id = 'p_' + Date.now();
  profiles[id] = newProfileData(id, nombre, '', selectedColor);
  const now = new Date().toISOString();
  profiles[id]._updatedAt = now;
  profiles[id]._createdAt = now;
  const rawName = currentUser?.user_metadata?.full_name || '';
  const emailName = (currentUser?.email || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const uname = rawName || emailName || currentUser?.email || '';
  if(currentUser) {
    profiles[id]._createdByName = uname;
    profiles[id]._updatedByName = uname;
  }
  // Pre-fill seniority and interviewer
  if(seniority) profiles[id].general.seniority = seniority;
  profiles[id].general.entrevistador = uname;
  // Auto-fill from equipo selection if present
  autoFillGeneralFromEquipo(id);
  // Init dims for role
  if(seniority && ROLE_COMPETENCIES[seniority]) {
    PERF_DIMS = ROLE_COMPETENCIES[seniority].perf.slice();
    POT_DIMS  = ROLE_COMPETENCIES[seniority].pot.slice();
    MAT_DIMS  = ROLE_COMPETENCIES[seniority].mat.slice();
  }
  saveLocalState();
  pushToSupabase(id, profiles[id]);
  closeAddModal();
  renderSidebar();
  openProfile(id);
}
function deleteCurrent() {
  if(!currentId) return;
  if(!isProfileOwner(currentId)) {
    alert('Solo el evaluador que creó este perfil puede eliminarlo.');
    return;
  }
  const p = profiles[currentId];
  if(!confirm(`¿Eliminar el perfil de "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
  const deletedId = currentId;
  delete profiles[currentId];
  currentId = null;
  saveLocalState();
  deleteFromSupabase(deletedId);
  renderSidebar();
  const ids = Object.keys(profiles);
  if(ids.length) openProfile(ids[0]);
  else {
    hideAllViews();
    document.getElementById('emptyState').style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
function exportJSON() {
  const blob = new Blob([JSON.stringify(profiles, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'talent_profiles_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ═══════════════════════════════════════════════════════════════
// HOME VIEW
// ═══════════════════════════════════════════════════════════════
function showHome() {
  currentId = null;
  activeView = 'home';
  hideAllViews();
  document.getElementById('homeView').style.display = 'block';
  deactivateAllNav();
  document.getElementById('nav-home')?.classList.add('active');
  renderSidebar();
  renderHomeView();
}

function renderHomeView() {
  const name = currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'usuario';
  const homeUser = document.getElementById('home-username');
  if(homeUser) homeUser.textContent = name;

  const ids = Object.keys(profiles);
  const myIds = getFilteredIds ? getFilteredIds() : ids;

  const total      = myIds.length;
  const ready      = myIds.filter(id => calcCompleteness(profiles[id]) >= 100 && !profiles[id]._closed).length;
  const risk       = myIds.filter(id => (profiles[id].risk?.global || '').includes('Alto')).length;
  const inProgress = myIds.filter(id => { const pct = calcCompleteness(profiles[id]); return pct > 0 && pct < 100; }).length;

  document.getElementById('hs-total').textContent     = total;
  document.getElementById('hs-ready').textContent     = ready;
  document.getElementById('hs-risk').textContent      = risk;
  document.getElementById('hs-inprogress').textContent = inProgress;

  // Recent profiles (last 5)
  const recentIds = myIds
    .sort((a,b) => new Date(profiles[b]._updatedAt||0) - new Date(profiles[a]._updatedAt||0))
    .slice(0, 6);

  const list = document.getElementById('home-recent-list');
  if(!recentIds.length) {
    list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--gray-400);font-size:13px">No hay perfiles todavía</div>';
    return;
  }
  list.innerHTML = recentIds.map(id => {
    const p = profiles[id];
    const pct = calcCompleteness(p);
    const col = completenessColor(pct);
    const initials = (p.nombre||'??').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    const closed = p._closed ? '<span style="font-size:10px;padding:1px 6px;background:var(--green-light);color:var(--green);border-radius:4px;font-weight:600">Cerrado</span>' : '';
    return `<div onclick="openProfile('${id}')" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:50%;background:${esc(p.color)}22;color:${esc(p.color)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${esc(initials)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px">${esc(p.nombre)||'—'} ${closed}</div>
        <div style="font-size:11px;color:var(--gray-400)">${esc(p.rol)||'—'} · ${esc(p.general?.seniority)||'—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12px;font-weight:600;font-family:'DM Mono',monospace;color:${col}">${pct}%</div>
        <div style="width:60px;height:4px;background:var(--gray-200);border-radius:2px;margin-top:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// REOPEN PROFILE
// ═══════════════════════════════════════════════════════════════
function reopenProfile() {
  if(!currentId || !isProfileOwner(currentId)) {
    alert('Solo el evaluador que creó este perfil puede reabrirlo.');
    return;
  }
  document.getElementById('reopen-justif').value = '';
  openModal('reopenModal');
}

function confirmReopenProfile() {
  const justif = document.getElementById('reopen-justif').value.trim();
  if(!justif) {
    document.getElementById('reopen-justif').style.borderColor = 'var(--red)';
    document.getElementById('reopen-justif').placeholder = '⚠ Motivo obligatorio para reabrir';
    return;
  }
  document.getElementById('reopen-justif').style.borderColor = '';
  if(!currentId) return;
  const p = profiles[currentId];
  const uname = currentUser?.user_metadata?.full_name || currentUser?.email;
  // Archive reopen event in history
  if(!p._history) p._history = [];
  p._history.push({
    event: 'reopen',
    date: new Date().toISOString(),
    by: uname,
    justif,
    closedAt: p._closedAt,
  });
  p._closed = false;
  p._reopenJustif = justif;
  p._reopenBy = uname;
  p._reopenAt = new Date().toISOString();
  closeModal('reopenModal');
  autoSave();
  pushToSupabase(currentId, p);
  loadProfileToUI();
  // Toast
  const ind = document.getElementById('saveIndicator');
  ind.textContent = '↩ Perfil reabierto para edición';
  ind.classList.add('show');
  setTimeout(() => { ind.classList.remove('show'); ind.textContent = 'Guardado ✓'; }, 2500);
}

// ═══════════════════════════════════════════════════════════════
// NEW EVALUATION CYCLE
// ═══════════════════════════════════════════════════════════════
function newCycleProfile() {
  document.getElementById('newcycle-justif').value = '';
  openModal('newCycleModal');
}

function confirmNewCycle() {
  const justif = document.getElementById('newcycle-justif').value.trim();
  if(!justif) {
    document.getElementById('newcycle-justif').style.borderColor = 'var(--red)';
    document.getElementById('newcycle-justif').placeholder = '⚠ Contexto obligatorio';
    return;
  }
  document.getElementById('newcycle-justif').style.borderColor = '';
  if(!currentId) return;
  const oldP = profiles[currentId];
  const uname = currentUser?.user_metadata?.full_name || currentUser?.email;
  const cycleNum = (oldP._cycle || 1) + 1;

  // Snapshot current cycle into history
  if(!oldP._history) oldP._history = [];
  oldP._history.push({
    event: 'cycle_archived',
    cycle: oldP._cycle || 1,
    date: new Date().toISOString(),
    by: uname,
    justif,
    snapshot: {
      perf: JSON.parse(JSON.stringify(oldP.perf)),
      pot: JSON.parse(JSON.stringify(oldP.pot)),
      madurez: JSON.parse(JSON.stringify(oldP.madurez)),
      ninebox: JSON.parse(JSON.stringify(oldP.ninebox)),
      risk: JSON.parse(JSON.stringify(oldP.risk)),
      resumen: JSON.parse(JSON.stringify(oldP.resumen)),
      closedAt: oldP._closedAt,
    }
  });

  // Reset evaluation fields, preserve identity + skills as new baseline
  const newPerfScores = {}, newPerfEvidence = {};
  Object.keys(oldP.perf.scores).forEach(i => { newPerfScores[i] = 0; newPerfEvidence[i] = ""; });
  const newPotScores = {}, newPotEvidence = {};
  Object.keys(oldP.pot.scores).forEach(i => { newPotScores[i] = 0; newPotEvidence[i] = ""; });

  // Skills: move target → actual (last cycle's target becomes this cycle's baseline)
  const newSkills = {};
  Object.entries(oldP.skills).forEach(([skill, d]) => {
    newSkills[skill] = { actual: d.target || d.actual, target: 0, plan: "", prioridad: "", planActivo: "" };
  });

  const newMatData = {};
  Object.keys(oldP.madurez.dims).forEach(i => { newMatData[i] = { nivel: "", justif: "" }; });
  const newRiskData = {};
  Object.keys(oldP.risk.items).forEach(i => { newRiskData[i] = { estado: "", obs: "", accion: "" }; });

  // Apply reset
  oldP.perf = { scores: newPerfScores, evidence: newPerfEvidence, feedbackScore: "", feedbackObs: "" };
  oldP.pot  = { scores: newPotScores,  evidence: newPotEvidence };
  oldP.skills = newSkills;
  oldP.madurez = { dims: newMatData, final: "", gap: "", justif: "" };
  oldP.ninebox = { comment: "", validated: "", aspiraciones: "", justifValid: "" };
  oldP.risk = { items: newRiskData, global: "", nextrev: "", accion: "" };
  oldP.idp  = [];
  oldP.resumen = { fortalezas: "", mejoras: "", decision: "", justif: "", hito: "", notas: "" };
  oldP._closed = false;
  oldP._closedAt = null;
  oldP._cycle = cycleNum;
  oldP._cycleStartedAt = new Date().toISOString();
  oldP._cycleJustif = justif;
  oldP._updatedAt = new Date().toISOString();

  closeModal('newCycleModal');
  autoSave();
  pushToSupabase(currentId, oldP);
  loadProfileToUI();
  switchTab('general', document.querySelector('.section-tab'));
  const ind = document.getElementById('saveIndicator');
  ind.textContent = `🔄 Ciclo ${cycleNum} iniciado`;
  ind.classList.add('show');
  setTimeout(() => { ind.classList.remove('show'); ind.textContent = 'Guardado ✓'; }, 2500);
}


// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// MANUAL DE USUARIO VIEW
// ═══════════════════════════════════════════════════════════════
function showManual() {
  currentId = null;
  activeView = 'manual';
  hideAllViews();
  document.getElementById('manualView').style.display = 'block';
  deactivateAllNav();
  document.getElementById('nav-manual')?.classList.add('active');
  renderSidebar();

  const role = getUserRole();
  const isAdm = role === 'admin';

  // Subtitle
  const labels = { admin:'Administrador', director:'Director', manager:'Manager', lider:'Líder técnico' };
  document.getElementById('manualSubtitle').textContent = isAdm
    ? 'Vista completa — todos los roles (solo Admin)'
    : `Manual para: ${labels[role] || role}`;

  // Show/hide tab row (only admin sees all tabs)
  const tabRow = document.getElementById('manualTabBtns');
  tabRow.style.display = isAdm ? 'flex' : 'none';

  if(isAdm) {
    // Admin: show first tab (admin) by default
    switchManualTab('admin', document.querySelector('.manual-tab-btn'));
  } else {
    // Other roles: inject their manual directly, no tabs
    document.getElementById('manualBody').innerHTML = getManualHtml(role);
  }
}

function switchManualTab(role, btn) {
  document.querySelectorAll('.manual-tab-btn').forEach(b => {
    b.style.background = 'white'; b.style.color = 'var(--gray-700)'; b.style.borderColor = 'var(--gray-300)';
  });
  if(btn) { btn.style.background = 'var(--navy)'; btn.style.color = 'white'; btn.style.borderColor = 'var(--navy)'; }
  document.getElementById('manualBody').innerHTML = getManualHtml(role);
}

function getManualHtml(role) {
  const manuals = {
    admin: `<div class="card" style="border-left:4px solid var(--blue)">
      <div class="card-header"><div class="card-header-dot" style="background:var(--blue)"></div><span class="card-title">Manual — Administrador</span><span style="margin-left:auto;font-size:11px;padding:2px 8px;background:#dbeafe;color:var(--blue);border-radius:4px;font-weight:600">Acceso total</span></div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px">Acceso completo: todos los perfiles, configuración del modelo, benchmarks y dimensiones. Responsable de People del área o gerente con visibilidad total.</p>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--blue)">🔑 Capacidades exclusivas</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:3px">✏️ Editar dimensiones</div><div style="font-size:11px;color:var(--gray-700)">Botón "✏" en Performance y Potencial. Agrega, elimina o renombra dimensiones. Impacta perfiles nuevos.</div></div>
          <div style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:3px">📊 Editar benchmarks</div><div style="font-size:11px;color:var(--gray-700)">Botón "📊 Benchmarks" en topbar. Define scores esperados por Job Rol. Base del cálculo de gap vs rol.</div></div>
          <div style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:3px">👁 Ver todos los perfiles</div><div style="font-size:11px;color:var(--gray-700)">Vista Consolidada: acceso completo a todos los perfiles cerrados, sin filtros de jerarquía.</div></div>
          <div style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:3px">🔄 Configurar roles</div><div style="font-size:11px;color:var(--gray-700)">Desde Supabase: asignar role en user_metadata (admin/director/manager/lider).</div></div>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--blue)">📋 Flujo recomendado</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--blue);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div><div><div style="font-size:12px;font-weight:600">Configuración inicial</div><div style="font-size:11px;color:var(--gray-600)">Ajustar benchmarks (Topbar → 📊). Validar que las dimensiones sean relevantes para el contexto actual.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--blue);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div><div><div style="font-size:12px;font-weight:600">Durante el ciclo</div><div style="font-size:11px;color:var(--gray-600)">Monitorear completitud en Mis perfiles. Hacer seguimiento a managers con perfiles incompletos.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--blue);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div><div><div style="font-size:12px;font-weight:600">Al cierre</div><div style="font-size:11px;color:var(--gray-600)">Vista Consolidada: identificar Top Talent con riesgo Alto, concentración en Under Review, tendencias ▲▼.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--blue);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">4</div><div><div style="font-size:12px;font-weight:600">Nuevo ciclo</div><div style="font-size:11px;color:var(--gray-600)">Coordinar fecha con managers. El nuevo ciclo se activa por perfil individual — no es un reset global.</div></div></div>
        </div>
        <div style="padding:10px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;font-size:12px;color:#854d0e">⚠ Editar dimensiones o benchmarks no retroafecta perfiles cerrados. Solo impacta perfiles nuevos o en edición.</div>
      </div>
    </div>`,

    director: `<div class="card" style="border-left:4px solid var(--purple)">
      <div class="card-header"><div class="card-header-dot" style="background:var(--purple)"></div><span class="card-title">Manual — Director</span><span style="margin-left:auto;font-size:11px;padding:2px 8px;background:#ede9fe;color:var(--purple);border-radius:4px;font-weight:600">Lectura total · Sin configuración</span></div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px">Visibilidad completa de todos los perfiles cerrados. Función principal: lectura estratégica del talento del área para decisiones de negocio (estructura, promociones, retención clave, gaps organizacionales).</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:3px">Vista Consolidada</div><div style="font-size:11px;color:var(--gray-700)">Todos los perfiles cerrados. Ordenables por cualquier columna. Ideal para barrido pre-comité.</div></div>
          <div style="padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:3px">Modal Historial 📋</div><div style="font-size:11px;color:var(--gray-700)">Evolución entre ciclos. Los indicadores ▲▼ muestran si el equipo crece o se estanca.</div></div>
          <div style="padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:3px">Apertura de perfiles</div><div style="font-size:11px;color:var(--gray-700)">Lectura en detalle. No puede editar ni cerrar perfiles de otros managers.</div></div>
          <div style="padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:3px">Mis perfiles</div><div style="font-size:11px;color:var(--gray-700)">Solo si también actúa como manager y tiene perfiles propios asignados.</div></div>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--purple)">🎯 Uso estratégico recomendado</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--purple);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div><div><div style="font-size:12px;font-weight:600">Pre-comité de talento</div><div style="font-size:11px;color:var(--gray-600)">Filtrar Vista Todos por Risk = Alto. Identificar Top Talent en riesgo. Preparar agenda de retención.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--purple);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div><div><div style="font-size:12px;font-weight:600">Análisis de distribución</div><div style="font-size:11px;color:var(--gray-600)">Regla orientativa: ≤15% Top Talent, ≤10% Under Review. ¿Es saludable para el tamaño del equipo?</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--purple);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div><div><div style="font-size:12px;font-weight:600">Revisión de decisiones</div><div style="font-size:11px;color:var(--gray-600)">¿PIPs sin seguimiento? ¿Decisiones contradictorias entre managers para el mismo nivel?</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--purple);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">4</div><div><div style="font-size:12px;font-weight:600">Evolución del equipo</div><div style="font-size:11px;color:var(--gray-600)">Modal Historial en perfiles con ciclos. ¿Los ▲ superan a los ▼ en aggregate?</div></div></div>
        </div>
      </div>
    </div>`,

    manager: `<div class="card" style="border-left:4px solid var(--teal)">
      <div class="card-header"><div class="card-header-dot" style="background:var(--teal)"></div><span class="card-title">Manual — Manager</span><span style="margin-left:auto;font-size:11px;padding:2px 8px;background:#f0fdfa;color:var(--teal);border-radius:4px;font-weight:600">Creación y edición · Perfiles propios</span></div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px">Evaluador principal. Crea, completa y cierra los perfiles de su equipo directo. Visibilidad: sus perfiles en cualquier estado + perfiles cerrados de Staff en Vista Consolidada.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="padding:10px;background:#f0fdfa;border:1px solid #86efac;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--teal);margin-bottom:3px">✅ Puedes hacer</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Crear, editar y cerrar perfiles de tu equipo</li><li>Ver todos tus perfiles en Mis perfiles</li><li>Vista Consolidada: perfiles Staff cerrados</li><li>Reabrir perfiles con justificación</li><li>Iniciar nuevo ciclo de evaluación</li><li>Ver historial 📋 de ciclos previos</li></ul></div>
          <div style="padding:10px;background:var(--red-light);border:1px solid #fca5a5;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:3px">✗ No puedes hacer</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Editar benchmarks ni dimensiones del modelo</li><li>Ver perfiles de otros managers</li><li>Reabrir perfiles de otros usuarios</li><li>Ver perfiles de nivel Manager o Director</li><li>Configurar roles de usuario</li></ul></div>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--teal)">📋 Completar un perfil — paso a paso</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          ${[['Crear perfil','"+ Nuevo perfil" desde home o sidebar. Solo Nombre + Job Rol. El resto se completa dentro del perfil.'],['Datos generales','Todos los campos * son obligatorios. Completarlos primero sube el % rápidamente.'],['Performance y Potencial','Score 1–5 por dimensión. Gap vs benchmark calculado automáticamente. Evidencia opcional pero recomendada.'],['Madurez técnica','Nivel actual + objetivo por skill. Si activas ¿Plan?=Sí, la descripción del plan se vuelve obligatoria.'],['Madurez profesional','6 dimensiones. El nivel final es la señal más importante para decisiones de promoción.'],['9-Box','Calculado automáticamente. Ajusta en "Cuadrante validado" si el contexto lo requiere.'],['Flight Risk','Si marcas Alto en algún indicador, observación y acción se vuelven obligatorios.'],['IDP','Acciones derivadas de los gaps técnicos. "⚡ Sugerir desde gaps" genera un punto de partida.'],['Resumen','"✨ Desde datos" propone fortalezas y mejoras desde los scores. La Decisión es obligatoria para cerrar.'],['Cerrar perfil','Solo disponible al 100%. Aparece en Vista Consolidada. Registra quién cerró y cuándo.']].map(([t,d],i)=>`
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--teal);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div><div style="font-size:12px;font-weight:600">${t}</div><div style="font-size:11px;color:var(--gray-600)">${d}</div></div></div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--orange);margin-bottom:4px">↩ Reabrir — cuándo usarlo</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Error en un score o dato general</li><li>Cambio relevante de rol o proyecto</li><li>Requiere motivo documentado</li></ul></div>
          <div style="padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:4px">🔄 Nuevo ciclo — cuándo usarlo</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Revisión trimestral o semestral</li><li>Tras promoción o cambio de rol</li><li>Conserva historial completo</li></ul></div>
        </div>
        <div style="padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:12px;color:#166534">💡 <strong>Buenas prácticas:</strong> Completa perfiles en los primeros 5 días del período. Usa "Guardar" frecuentemente. Revisa el historial antes de iniciar un nuevo ciclo.</div>
      </div>
    </div>`,

    lider: `<div class="card" style="border-left:4px solid var(--green)">
      <div class="card-header"><div class="card-header-dot" style="background:var(--green)"></div><span class="card-title">Manual — Líder técnico</span><span style="margin-left:auto;font-size:11px;padding:2px 8px;background:#f0fdf4;color:var(--green);border-radius:4px;font-weight:600">Evaluación Staff · Vista limitada</span></div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--gray-600);margin-bottom:14px">Evalúa colaboradores de nivel Staff de tu squad. Mismas capacidades de creación que el manager, pero visibilidad acotada: solo perfiles de nivel Staff en Vista Consolidada.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="padding:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:3px">✅ Puedes hacer</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Crear y cerrar perfiles de Staff</li><li>Ver tus propios perfiles (Mis perfiles)</li><li>Vista Consolidada: solo Staff cerrados</li><li>Modal Historial 📋 en ciclos previos</li><li>Competencias por Rol como referencia</li></ul></div>
          <div style="padding:10px;background:var(--red-light);border:1px solid #fca5a5;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:3px">✗ No puedes hacer</div><ul style="font-size:11px;color:var(--gray-700);margin:0;padding-left:14px;line-height:1.8"><li>Ver perfiles de nivel Líder o Manager</li><li>Editar benchmarks o dimensiones</li><li>Ver perfiles de otros líderes</li><li>Reabrir perfiles de otros managers</li></ul></div>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--green)">📋 Completar un perfil — paso a paso</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div><div><div style="font-size:12px;font-weight:600">Crear perfil</div><div style="font-size:11px;color:var(--gray-600)">"+ Nuevo perfil" desde home o sidebar. Solo Nombre + Job Rol. El resto se completa dentro del perfil.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div><div><div style="font-size:12px;font-weight:600">Datos generales</div><div style="font-size:11px;color:var(--gray-600)">Todos los campos * son obligatorios. Completarlos primero sube el % rápidamente.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div><div><div style="font-size:12px;font-weight:600">Madurez técnica primero</div><div style="font-size:11px;color:var(--gray-600)">Como líder técnico tienes la mejor perspectiva del gap técnico real. Nivel actual + objetivo por skill.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">4</div><div><div style="font-size:12px;font-weight:600">Performance y Potencial</div><div style="font-size:11px;color:var(--gray-600)">Score 1–5 por dimensión. Agrega evidencia cuando el score sea ≤2 o ≥4 — es tu respaldo en conversaciones difíciles.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">5</div><div><div style="font-size:12px;font-weight:600">Madurez profesional y 9-Box</div><div style="font-size:11px;color:var(--gray-600)">6 dimensiones + nivel final. El 9-Box se calcula automáticamente; ajusta si el contexto lo requiere.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">6</div><div><div style="font-size:12px;font-weight:600">Flight Risk</div><div style="font-size:11px;color:var(--gray-600)">Evalúa cada indicador. Si marcas Alto, observación y acción son obligatorios.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">7</div><div><div style="font-size:12px;font-weight:600">IDP y Resumen</div><div style="font-size:11px;color:var(--gray-600)">IDP desde gaps técnicos. "✨ Desde datos" genera fortalezas y mejoras. La Decisión es obligatoria para cerrar.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--teal);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">✓</div><div><div style="font-size:12px;font-weight:600">Cerrar perfil</div><div style="font-size:11px;color:var(--gray-600)">Solo al 100%. Aparece en Vista Consolidada del manager. Alinea con él antes de cerrar decisiones de promoción o PIP.</div></div></div>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--green)">💡 Tips clave</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">→</div><div><div style="font-size:12px;font-weight:600">Documenta evidencia</div><div style="font-size:11px;color:var(--gray-600)">No obligatoria pero clave. En conversaciones difíciles (PIP, desvinculación), la evidencia documentada es tu respaldo.</div></div></div>
          <div style="display:flex;gap:10px"><div style="min-width:20px;height:20px;border-radius:50%;background:var(--green);color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">→</div><div><div style="font-size:12px;font-weight:600">Usa 🎯 Competencias por Rol</div><div style="font-size:11px;color:var(--gray-600)">Muestra qué espera el Career Ladder para cada nivel. Úsala para calibrar tus scores antes de completar el perfil.</div></div></div>
        </div>
      </div>
    </div>`
  };
  return manuals[role] || `<div style="text-align:center;padding:2rem;color:var(--gray-400)">Manual no disponible para el rol: ${role}</div>`;
}


// ═══════════════════════════════════════════════════════════════
// EQUIPO — Directorio de integrantes
// ═══════════════════════════════════════════════════════════════

// Seed data from Excel upload — editable at runtime via CRUD
const EQUIPO_SEED = [{"nroEmpleado": "291594", "nombre": "Nicolas Cerna Araya", "ingreso": "2025-11-12", "antiguedad": "0 años y 6 meses", "jobRol": "Senior Technical Project Leader"}, {"nroEmpleado": "218978", "nombre": "Antonio Varas Curin", "ingreso": "2022-03-07", "antiguedad": "4 años y 2 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "102831", "nombre": "Cristian Alejandro Chandia Poblete", "ingreso": "2010-06-29", "antiguedad": "15 años y 11 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "279634", "nombre": "Giuseppe Lavarello Osorio", "ingreso": "2025-05-12", "antiguedad": "1 años y 0 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "133785", "nombre": "Cristian Zuñiga Meza", "ingreso": "2018-06-01", "antiguedad": "8 años y 0 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "131129", "nombre": "Cristian Ahumada Bustos", "ingreso": "2020-02-01", "antiguedad": "6 años y 4 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "182973", "nombre": "Luis Zamora Letelier", "ingreso": "2019-11-20", "antiguedad": "6 años y 6 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "124904", "nombre": "Borja Sala Baucells", "ingreso": "2014-11-17", "antiguedad": "11 años y 6 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "279632", "nombre": "Lukas Pavez Bahamondes", "ingreso": "2025-05-12", "antiguedad": "1 años y 0 meses", "jobRol": "Analyst"}, {"nroEmpleado": "181749", "nombre": "Julio Corvalan Kiefer", "ingreso": "2019-10-14", "antiguedad": "6 años y 7 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "260086", "nombre": "Alexander Cols Mijares", "ingreso": "2024-05-02", "antiguedad": "2 años y 1 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "294716", "nombre": "Jorge Andres Acuña Roldan", "ingreso": "2026-01-01", "antiguedad": "0 años y 5 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "278655", "nombre": "Danilo Avila Carcamo", "ingreso": "2025-04-23", "antiguedad": "1 años y 1 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "257721", "nombre": "Ivan Sepulveda Masferrer", "ingreso": "2024-03-04", "antiguedad": "2 años y 3 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "284863", "nombre": "Vicente Villegas Quezada", "ingreso": "2025-08-13", "antiguedad": "0 años y 9 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "221172", "nombre": "Matias Bustamante Farias", "ingreso": "2022-04-04", "antiguedad": "4 años y 2 meses", "jobRol": "Analyst"}, {"nroEmpleado": "257932", "nombre": "Nicolas Sandoval Hernandez", "ingreso": "2024-03-08", "antiguedad": "2 años y 2 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "214803", "nombre": "Alfonso Vargas Guerra", "ingreso": "2022-01-03", "antiguedad": "4 años y 5 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "259916", "nombre": "Alejandro Rojas Fuentes", "ingreso": "2024-04-24", "antiguedad": "2 años y 1 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "260258", "nombre": "Carlos González Moreno", "ingreso": "2024-05-02", "antiguedad": "2 años y 1 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "289342", "nombre": "Katherine Escudero Flores", "ingreso": "2025-10-20", "antiguedad": "0 años y 7 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "283549", "nombre": "Marcelo Rojas Hernandez", "ingreso": "2025-07-21", "antiguedad": "0 años y 10 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "285068", "nombre": "Bryan Gutierrez Mundaca", "ingreso": "2025-08-18", "antiguedad": "0 años y 9 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "221185", "nombre": "Daniela De Quevedo", "ingreso": "2022-04-04", "antiguedad": "4 años y 2 meses", "jobRol": "Analyst"}, {"nroEmpleado": "221175", "nombre": "Kevin Valencia Martinez", "ingreso": "2022-04-04", "antiguedad": "4 años y 2 meses", "jobRol": "Engineer"}, {"nroEmpleado": "221180", "nombre": "Fernando Vergara Ramirez", "ingreso": "2022-04-04", "antiguedad": "4 años y 2 meses", "jobRol": "Engineer"}, {"nroEmpleado": "264748", "nombre": "Gabriel Diaz Herrera", "ingreso": "2025-01-02", "antiguedad": "1 años y 5 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "268532", "nombre": "Katterina Palma Vallejos", "ingreso": "2024-10-21", "antiguedad": "1 años y 7 meses", "jobRol": "Analyst"}, {"nroEmpleado": "259918", "nombre": "Jean Pierre Cid Bustos", "ingreso": "2024-04-24", "antiguedad": "2 años y 1 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "276999", "nombre": "Ramon Eduardo Alvarez Ponce", "ingreso": "2025-04-01", "antiguedad": "1 años y 2 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "293476", "nombre": "Guillermo Cardenas Cardenas", "ingreso": "2026-02-18", "antiguedad": "0 años y 3 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "293417", "nombre": "Joey Jerez Sepulveda", "ingreso": "2026-02-13", "antiguedad": "0 años y 3 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "293477", "nombre": "Tania Castro Prado", "ingreso": "2026-02-18", "antiguedad": "0 años y 3 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "292191", "nombre": "Moises Quiroz Diaz", "ingreso": "2025-11-24", "antiguedad": "0 años y 6 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "282666", "nombre": "Nicolas Irribarra Zúñiga", "ingreso": "2025-07-07", "antiguedad": "0 años y 10 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "264217", "nombre": "Diego Carreño Montenegro", "ingreso": "2024-08-05", "antiguedad": "1 años y 10 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "267366", "nombre": "Cassidy Allendes Venegas", "ingreso": "2025-03-17", "antiguedad": "1 años y 2 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "271410", "nombre": "Ivan Guajardo Arias", "ingreso": "2025-04-09", "antiguedad": "1 años y 1 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "298817", "nombre": "Fabiola Pizarro Fuentes", "ingreso": "2026-03-02", "antiguedad": "0 años y 3 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "296692", "nombre": "Ignacio Barrera Gutierrez", "ingreso": "2026-02-09", "antiguedad": "0 años y 3 meses", "jobRol": "Analyst"}, {"nroEmpleado": "289687", "nombre": "Joseph Flores Antezana", "ingreso": "2025-10-20", "antiguedad": "0 años y 7 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "296687", "nombre": "Martin Campos Donoso", "ingreso": "2026-02-09", "antiguedad": "0 años y 3 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "296992", "nombre": "Vanessa Gonzalez Arriagada", "ingreso": "2026-02-09", "antiguedad": "0 años y 3 meses", "jobRol": "Analyst"}, {"nroEmpleado": "304033", "nombre": "Alondra Araya Araya", "ingreso": "2026-04-06", "antiguedad": "0 años y 1 meses", "jobRol": "Analyst"}, {"nroEmpleado": "296685", "nombre": "Angelo Olivares Canto", "ingreso": "2026-02-09", "antiguedad": "0 años y 3 meses", "jobRol": "Analyst"}, {"nroEmpleado": "296990", "nombre": "Jonas Oviedo Morales", "ingreso": "2026-02-09", "antiguedad": "0 años y 3 meses", "jobRol": "Analyst"}, {"nroEmpleado": "289348", "nombre": "Cristian Oyarzo Moraga", "ingreso": "2025-10-20", "antiguedad": "0 años y 7 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "296966", "nombre": "Fernanda Saavedra Donoso", "ingreso": "2026-02-02", "antiguedad": "0 años y 4 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "295139", "nombre": "Joaquin Torres Cornejo", "ingreso": "2026-01-05", "antiguedad": "0 años y 5 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "294887", "nombre": "Aylin Rodriguez Berrios", "ingreso": "2026-01-05", "antiguedad": "0 años y 5 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "126462", "nombre": "Raul Andres Marambio Merida", "ingreso": "2017-02-01", "antiguedad": "9 años y 4 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "260493", "nombre": "Deyssi Vargas Briceño", "ingreso": "2024-05-08", "antiguedad": "2 años y 0 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "214806", "nombre": "Fernanda Medina Guerra", "ingreso": "2022-01-03", "antiguedad": "4 años y 5 meses", "jobRol": "Engineer"}, {"nroEmpleado": "125809", "nombre": "Carlos Alberto Contreras Huaracan", "ingreso": "2010-11-29", "antiguedad": "15 años y 6 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "195370", "nombre": "Eduardo Jimenez Mourgues", "ingreso": "2021-01-11", "antiguedad": "5 años y 4 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "156914", "nombre": "Katherine Andrea Torres Aguirre", "ingreso": "2017-12-11", "antiguedad": "8 años y 5 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "198985", "nombre": "Ligia Barrios Bracho", "ingreso": "2021-04-05", "antiguedad": "5 años y 2 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "129387", "nombre": "Daniel Henriquez Calabriano", "ingreso": "2015-06-15", "antiguedad": "10 años y 11 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "218923", "nombre": "Pedro Carrasco Aravena", "ingreso": "2022-03-07", "antiguedad": "4 años y 2 meses", "jobRol": "Chief Architect"}, {"nroEmpleado": "183035", "nombre": "Felipe Castro Aros", "ingreso": "2019-11-25", "antiguedad": "6 años y 6 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "105233", "nombre": "Carlos Hernan Salinas Adasme", "ingreso": "2010-11-29", "antiguedad": "15 años y 6 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "218977", "nombre": "Daniel Navarrete Navarrete", "ingreso": "2022-03-07", "antiguedad": "4 años y 2 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "212283", "nombre": "Gonzalo Lizama Valencia", "ingreso": "2022-02-01", "antiguedad": "4 años y 4 meses", "jobRol": "Engineer"}, {"nroEmpleado": "259244", "nombre": "Kevin Nuñez Herrera", "ingreso": "2024-04-01", "antiguedad": "2 años y 2 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "213774", "nombre": "Ruben Painenao Nahuelpi", "ingreso": "2021-12-13", "antiguedad": "4 años y 5 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "259102", "nombre": "Pedro Valderrama Mendez", "ingreso": "2024-04-01", "antiguedad": "2 años y 2 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "283306", "nombre": "Susana Muñoz Hidalgo", "ingreso": "2025-07-14", "antiguedad": "0 años y 10 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "284746", "nombre": "Felipe Avila Carcamo", "ingreso": "2025-08-18", "antiguedad": "0 años y 9 meses", "jobRol": "Evangelist"}, {"nroEmpleado": "282495", "nombre": "Andres Medina Sanhueza", "ingreso": "2025-07-01", "antiguedad": "0 años y 11 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "204814", "nombre": "Claudio Collao", "ingreso": "2021-07-07", "antiguedad": "4 años y 10 meses", "jobRol": "Evangelist"}, {"nroEmpleado": "290394", "nombre": "Jose Corti Badia", "ingreso": "2025-11-03", "antiguedad": "0 años y 7 meses", "jobRol": "Evangelist"}, {"nroEmpleado": "298824", "nombre": "Camilo Menares Menares", "ingreso": "2026-03-11", "antiguedad": "0 años y 2 meses", "jobRol": "Senior Technical Project Leader"}, {"nroEmpleado": "212284", "nombre": "Agustin Sepulveda Berrios", "ingreso": "2022-02-01", "antiguedad": "4 años y 4 meses", "jobRol": "Engineer"}, {"nroEmpleado": "257826", "nombre": "Ian Laurel Pastene", "ingreso": "2024-03-05", "antiguedad": "2 años y 3 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "289345", "nombre": "Catherine Benavides Mena", "ingreso": "2025-10-20", "antiguedad": "0 años y 7 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "284533", "nombre": "Leonardo Villarreal Tobon", "ingreso": "2025-08-06", "antiguedad": "0 años y 9 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "221188", "nombre": "Cesar Ramirez Herrera", "ingreso": "2022-04-04", "antiguedad": "4 años y 2 meses", "jobRol": "Engineer"}, {"nroEmpleado": "218761", "nombre": "Fabian Mesias Gomez", "ingreso": "2022-06-01", "antiguedad": "4 años y 0 meses", "jobRol": "Engineer"}, {"nroEmpleado": "179689", "nombre": "Antonio Sanhueza Rosas", "ingreso": "2019-08-16", "antiguedad": "6 años y 9 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "265927", "nombre": "Pablo Rivas Fuenzalida", "ingreso": "2024-09-02", "antiguedad": "1 años y 9 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "270382", "nombre": "Ariel Paz Gonzalez", "ingreso": "2024-11-25", "antiguedad": "1 años y 6 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "295250", "nombre": "Alvaro Gallardo Alvarado", "ingreso": "2026-01-12", "antiguedad": "0 años y 4 meses", "jobRol": "Junior Analyst"}, {"nroEmpleado": "232459", "nombre": "Ana Lincolao Ojeda", "ingreso": "2022-11-14", "antiguedad": "3 años y 6 meses", "jobRol": "Analyst"}, {"nroEmpleado": "218763", "nombre": "Nicolas Segovia Urtubia", "ingreso": "2022-06-01", "antiguedad": "4 años y 0 meses", "jobRol": "Engineer"}, {"nroEmpleado": "285686", "nombre": "Roger Williams Gutierrez Romero", "ingreso": "2025-08-25", "antiguedad": "0 años y 9 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "232864", "nombre": "Cecilia Rojas Vega", "ingreso": "2022-11-14", "antiguedad": "3 años y 6 meses", "jobRol": "Engineer"}, {"nroEmpleado": "209690", "nombre": "Krisler Abello Peñaloza", "ingreso": "2021-10-12", "antiguedad": "4 años y 7 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "158485", "nombre": "Oriel Hernandez Vera", "ingreso": "2018-02-01", "antiguedad": "8 años y 4 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "148971", "nombre": "Claudio Faundez Perez", "ingreso": "2022-10-01", "antiguedad": "3 años y 8 meses", "jobRol": "Lead Engineer"}, {"nroEmpleado": "266007", "nombre": "Fernando Bravo Riquelme", "ingreso": "2024-09-02", "antiguedad": "1 años y 9 meses", "jobRol": "Expert Engineer"}, {"nroEmpleado": "259920", "nombre": "Cristian Huenuqueo Arias", "ingreso": "2024-04-24", "antiguedad": "2 años y 1 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "15313", "nombre": "Carlos Patricio Alexis Gomez Flores", "ingreso": "2006-08-01", "antiguedad": "19 años y 10 meses", "jobRol": "Chief Architect"}, {"nroEmpleado": "202675", "nombre": "Katherine Ferreira Puigmarti", "ingreso": "2021-06-07", "antiguedad": "4 años y 11 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "271839", "nombre": "Antonia Marambio Miranda", "ingreso": "2025-12-15", "antiguedad": "0 años y 5 meses", "jobRol": "Junior Engineer"}, {"nroEmpleado": "144326", "nombre": "Francois Siegfried Bertrand", "ingreso": "2016-11-11", "antiguedad": "9 años y 6 meses", "jobRol": "Chief Designer"}, {"nroEmpleado": "262465", "nombre": "Ivania Silva Moscoso", "ingreso": "2024-06-24", "antiguedad": "1 años y 11 meses", "jobRol": "Project Leader"}, {"nroEmpleado": "259728", "nombre": "Enrique Guerra Aguilar", "ingreso": "2024-04-15", "antiguedad": "2 años y 1 meses", "jobRol": "Expert Analyst"}, {"nroEmpleado": "257090", "nombre": "Andres Fuentes Lagos", "ingreso": "2024-02-19", "antiguedad": "2 años y 3 meses", "jobRol": "Lead Analyst"}, {"nroEmpleado": "232457", "nombre": "Alejandra Silva Silva", "ingreso": "2022-11-14", "antiguedad": "3 años y 6 meses", "jobRol": "Engineer"}, {"nroEmpleado": "126652", "nombre": "Luis Silva Nuñez", "ingreso": "2022-02-02", "antiguedad": "4 años y 4 meses", "jobRol": "Lead Engineer"}];

// Runtime equipo list — initialized from seed, persisted in localStorage
function loadEquipoData() {
  try {
    const stored = localStorage.getItem('equipoData_v1');
    if(stored) return JSON.parse(stored);
  } catch(e) {}
  return JSON.parse(JSON.stringify(EQUIPO_SEED));
}
function saveEquipoData() {
  try { localStorage.setItem('equipoData_v1', JSON.stringify(equipoData)); } catch(e) {}
}
let equipoData = loadEquipoData();
let equipoEditIdx = null; // null = add, number = edit index

function showEquipo() {
  currentId = null;
  activeView = 'equipo';
  hideAllViews();
  document.getElementById('equipoView').style.display = 'block';
  deactivateAllNav();
  document.getElementById('nav-equipo')?.classList.add('active');
  renderSidebar();
  renderEquipoTable();
}

function renderEquipoTable() {
  const q = (document.getElementById('equipo-search')?.value || '').toLowerCase();
  const filtered = equipoData.filter(m =>
    m.nombre.toLowerCase().includes(q) ||
    m.nroEmpleado.includes(q) ||
    (m.jobRol||'').toLowerCase().includes(q)
  ).sort((a,b) => a.nombre.localeCompare(b.nombre));

  // Build lookup: nroEmpleado → profileId (any cycle, any state)
  const profileByNro = {};
  const profileByNombre = {};
  Object.entries(profiles).forEach(([pid, p]) => {
    const nro = p.general?.nroEmpleado;
    const nom = (p.general?.nombre || p.nombre || '').trim().toLowerCase();
    if(nro) profileByNro[nro] = pid;
    if(nom) profileByNombre[nom] = pid;
  });

  // Count how many equipo members have a profile
  const totalWithProfile = equipoData.filter(m => {
    const hasNro = m.nroEmpleado && profileByNro[m.nroEmpleado];
    const hasNom = profileByNombre[(m.nombre||'').trim().toLowerCase()];
    return !!(hasNro || hasNom);
  }).length;

  // Counter widget
  const counter = document.getElementById('equipo-profile-counter');
  if(counter) {
    const pct = equipoData.length ? Math.round(totalWithProfile / equipoData.length * 100) : 0;
    const remaining = equipoData.length - totalWithProfile;
    counter.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;padding:10px 16px;background:white;border:1px solid var(--gray-200);border-radius:8px;flex:1;min-width:200px">
        <div style="font-size:28px;font-weight:700;color:var(--navy);line-height:1">${totalWithProfile}<span style="font-size:16px;color:var(--gray-400);font-weight:400">/${equipoData.length}</span></div>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--gray-800)">Perfiles creados</div>
          <div style="font-size:11px;color:var(--gray-400)">${pct}% del equipo evaluado</div>
        </div>
        <div style="margin-left:auto;width:80px">
          <div style="height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=80?'var(--green)':pct>=40?'var(--amber)':'var(--red)'};border-radius:3px;transition:width 0.4s"></div>
          </div>
          <div style="font-size:10px;color:var(--gray-400);margin-top:3px;text-align:right">${remaining} sin perfil</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:white;border:1px solid var(--gray-200);border-radius:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0"></div>
        <div style="font-size:12px;color:var(--gray-700)">Con perfil: <strong>${totalWithProfile}</strong></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:white;border:1px solid var(--gray-200);border-radius:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--gray-300);flex-shrink:0"></div>
        <div style="font-size:12px;color:var(--gray-700)">Sin perfil: <strong>${remaining}</strong></div>
      </div>`;
  }

  const sub = document.getElementById('equipo-subtitle');
  if(sub) sub.textContent = `${filtered.length} de ${equipoData.length} integrantes · Data & AI NTT DATA`;

  const tbody = document.getElementById('equipo-tbody');
  if(!tbody) return;
  if(!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray-400)">Sin resultados para la búsqueda</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map((m) => {
    const idx = equipoData.indexOf(m);
    const pid = (m.nroEmpleado && profileByNro[m.nroEmpleado]) || profileByNombre[(m.nombre||'').trim().toLowerCase()];
    const hasProfile = !!pid;
    const profileBadge = hasProfile
      ? (isProfileOwner(pid)
          ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--green-light);color:var(--green);cursor:pointer" onclick="openProfile('${pid}')" title="Abrir perfil">✓ Sí</span>`
          : `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--green-light);color:var(--green)" title="Perfil creado por otro evaluador">✓ Sí</span>`)
      : `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--gray-100);color:var(--gray-400)">— No</span>`;
    return `<tr>
      <td style="font-family:var(--mono,monospace);font-size:11px">${esc(m.nroEmpleado)}</td>
      <td style="font-weight:500">${esc(m.nombre)}</td>
      <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--gray-100);color:var(--gray-700)">${esc(m.jobRol)||'—'}</span></td>
      <td style="font-size:12px;color:var(--gray-600)">${esc(m.ingreso)||'—'}</td>
      <td style="font-size:12px;color:var(--gray-600)">${esc(m.antiguedad)||'—'}</td>
      <td style="text-align:center">${profileBadge}</td>
      <td style="text-align:center">
        <button onclick="editEquipoMember(${idx})" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 5px;color:var(--blue)" title="Editar">✏️</button>
        <button onclick="deleteEquipoMember(${idx})" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 5px;color:var(--red)" title="Eliminar">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function openEquipoAddModal() {
  equipoEditIdx = null;
  document.getElementById('equipoModalTitle').textContent = 'Agregar integrante';
  ['nroEmpleado','nombre','ingreso','antiguedad'].forEach(f => {
    const el = document.getElementById('eq-'+f);
    if(el) el.value = '';
  });
  document.getElementById('eq-jobRol').value = '';
  openModal('equipoModal');
}

function editEquipoMember(idx) {
  equipoEditIdx = idx;
  const m = equipoData[idx];
  document.getElementById('equipoModalTitle').textContent = 'Editar integrante';
  document.getElementById('eq-nroEmpleado').value = m.nroEmpleado || '';
  document.getElementById('eq-nombre').value = m.nombre || '';
  document.getElementById('eq-ingreso').value = m.ingreso || '';
  document.getElementById('eq-antiguedad').value = m.antiguedad || '';
  document.getElementById('eq-jobRol').value = m.jobRol || '';
  openModal('equipoModal');
}

function deleteEquipoMember(idx) {
  if(!confirm(`¿Eliminar a ${equipoData[idx].nombre} del directorio?`)) return;
  equipoData.splice(idx, 1);
  saveEquipoData();
  renderEquipoTable();
}

function closeEquipoModal() {
  closeModal('equipoModal');
  equipoEditIdx = null;
}

function saveEquipoMember() {
  const nro = document.getElementById('eq-nroEmpleado').value.trim();
  const nom = document.getElementById('eq-nombre').value.trim();
  const job = document.getElementById('eq-jobRol').value;
  if(!nro || !nom || !job) {
    alert('N° Empleado, Nombre y Job Rol son obligatorios.');
    return;
  }
  const member = {
    nroEmpleado: nro,
    nombre: nom,
    ingreso: document.getElementById('eq-ingreso').value || '',
    antiguedad: document.getElementById('eq-antiguedad').value.trim() || '',
    jobRol: job
  };
  if(equipoEditIdx !== null) {
    equipoData[equipoEditIdx] = member;
  } else {
    equipoData.push(member);
  }
  saveEquipoData();
  closeEquipoModal();
  renderEquipoTable();
}

// ─── Modal equipo selector (for new profile) ───
let selectedEquipoMember = null;

function renderModalEquipoList() {
  const q = (document.getElementById('modal-equipo-search')?.value || '').toLowerCase();
  const container = document.getElementById('modal-equipo-list');
  if(!container) return;
  if(!q) { container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--gray-400)">Escribe para buscar…</div>'; return; }
  const hits = equipoData.filter(m =>
    m.nombre.toLowerCase().includes(q) || m.nroEmpleado.includes(q)
  ).slice(0, 10);
  if(!hits.length) { container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--gray-400)">Sin resultados</div>'; return; }
  container.innerHTML = hits.map((m,i) => `
    <div onclick="selectModalEquipoMember(${equipoData.indexOf(m)})" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:12px" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='white'">
      <span style="font-weight:500">${esc(m.nombre)}</span>
      <span style="color:var(--gray-400);margin-left:8px">${esc(m.nroEmpleado)}</span>
      <span style="float:right;font-size:11px;color:var(--teal)">${esc(m.jobRol)||''}</span>
    </div>`).join('');
}

function selectModalEquipoMember(idx) {
  selectedEquipoMember = equipoData[idx];
  const m = selectedEquipoMember;
  // Hide required msg if shown
  const msgEl = document.getElementById('modal-equipo-required-msg');
  if(msgEl) msgEl.style.display = 'none';
  // Fill manual fields
  document.getElementById('modal-nombre').value = m.nombre;
  // Try to set seniority to matching job rol
  const sel = document.getElementById('modal-seniority');
  let matched = false;
  for(let opt of sel.options) { if(opt.value === m.jobRol) { sel.value = m.jobRol; matched = true; break; } }
  if(!matched) sel.value = '';
  // Show selected badge
  const badge = document.getElementById('modal-equipo-selected');
  badge.style.display = 'flex';
  document.getElementById('modal-equipo-selected-name').textContent = `✓ ${m.nombre} · ${m.jobRol}`;
  // Clear search list
  document.getElementById('modal-equipo-list').innerHTML = '';
  document.getElementById('modal-equipo-search').value = '';
}

function clearModalEquipoSelection() {
  selectedEquipoMember = null;
  document.getElementById('modal-equipo-selected').style.display = 'none';
  document.getElementById('modal-nombre').value = '';
  document.getElementById('modal-seniority').value = '';
}

// ─── Auto-fill General after profile creation from equipo ───
function autoFillGeneralFromEquipo(profileId) {
  if(!selectedEquipoMember) return;
  const m = selectedEquipoMember;
  const p = profiles[profileId];
  if(!p) return;
  p.general.nombre = m.nombre;
  p.general.nroEmpleado = m.nroEmpleado;
  p.general.ingreso = m.ingreso || '';
  p.general.antiguedad = m.antiguedad || '';
  if(m.jobRol) {
    p.general.seniority = m.jobRol;
    // Pre-fill Rol/Cargo with jobRol if empty — user can refine
    if(!p.general.rol) p.general.rol = m.jobRol;
  }
  p.nombre = m.nombre;
  selectedEquipoMember = null;
}

// ═══════════════════════════════════════════════════════════════
// GUIDE TABS
// ═══════════════════════════════════════════════════════════════
function switchGuideTab(tab, btn) {
  document.querySelectorAll('.guide-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.guide-tab-btn').forEach(b => {
    b.style.background = 'white'; b.style.color = 'var(--gray-700)'; b.style.borderColor = 'var(--gray-300)';
  });
  const el = document.getElementById('guide-tab-' + tab);
  if(el) el.style.display = '';
  if(btn) { btn.style.background = 'var(--navy)'; btn.style.color = 'white'; btn.style.borderColor = 'var(--navy)'; }
}

// ═══════════════════════════════════════════════════════════════
// HISTORY & CYCLE COMPARISON
// ═══════════════════════════════════════════════════════════════
function getPrevCycleSnapshot(p) {
  const archived = (p._history||[]).filter(h => h.event === 'cycle_archived');
  if(!archived.length) return null;
  const last = archived[archived.length - 1];
  return {
    perf: getAvg(last.snapshot?.perf?.scores || {}),
    pot:  getAvg(last.snapshot?.pot?.scores  || {}),
    decision: last.snapshot?.resumen?.decision || '—',
    risk: last.snapshot?.risk?.global || '—',
    madurez: last.snapshot?.madurez?.final || '—',
    closedAt: last.snapshot?.closedAt,
    justif: last.justif,
    cycle: last.cycle,
  };
}

function openHistoryModal(profileId) {
  const p = profiles[profileId];
  if(!p) return;
  document.getElementById('historyModalTitle').textContent = `Historial — ${p.nombre||'—'}`;
  document.getElementById('historyModalSub').textContent =
    `${(p._cycle||1)} ciclo(s) de evaluación · ${p.general?.seniority||'—'} · ${p.rol||'—'}`;

  const archived = (p._history||[]).filter(h => h.event === 'cycle_archived');
  const body = document.getElementById('historyModalBody');

  const cycles = archived.map(h => ({
    cycle:    h.cycle,
    justif:   h.justif,
    closedAt: h.snapshot?.closedAt,
    perf:     getAvg(h.snapshot?.perf?.scores || {}),
    pot:      getAvg(h.snapshot?.pot?.scores  || {}),
    madurez:  h.snapshot?.madurez?.final || '—',
    risk:     h.snapshot?.risk?.global || '—',
    decision: h.snapshot?.resumen?.decision || '—',
    fortalezas: h.snapshot?.resumen?.fortalezas || '',
    mejoras:    h.snapshot?.resumen?.mejoras || '',
    isCurrent: false,
  }));
  cycles.push({
    cycle: p._cycle || 1, justif: p._cycleJustif || '(ciclo inicial)',
    closedAt: p._closedAt,
    perf: getAvg(p.perf?.scores||{}), pot: getAvg(p.pot?.scores||{}),
    madurez: p.madurez?.final||'—', risk: p.risk?.global||'—',
    decision: p.resumen?.decision||'—',
    fortalezas: p.resumen?.fortalezas||'', mejoras: p.resumen?.mejoras||'',
    isCurrent: true,
  });
  cycles.sort((a,b) => a.cycle - b.cycle);

  function deltaHtml(curr, prev) {
    if(!prev||!curr||curr===0||prev===0) return '';
    const d = curr - prev;
    if(Math.abs(d) < 0.1) return '<span style="font-size:11px;color:var(--gray-400)"> →</span>';
    const col = d > 0 ? 'var(--green)' : 'var(--red)';
    return `<span style="font-size:11px;font-weight:700;color:${col}"> ${d>0?'▲':'▼'}${Math.abs(d).toFixed(1)}</span>`;
  }

  function miniBar(val, color) {
    if(!val) return '<span style="color:var(--gray-400);font-size:12px">—</span>';
    const pct = (val/5)*100;
    return `<div style="display:flex;align-items:center;gap:6px">
      <div style="width:50px;height:5px;background:var(--gray-200);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <span style="font-size:12px;font-weight:600;font-family:'DM Mono',monospace">${val.toFixed(1)}</span>
    </div>`;
  }

  let html = '';

  // Comparison grid (multi-cycle)
  if(cycles.length > 1) {
    html += `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--gray-600);margin-bottom:12px">📈 Evolución entre ciclos</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(cycles.length,4)},1fr);gap:8px">
        ${cycles.map((c,i) => {
          const prev = i > 0 ? cycles[i-1] : null;
          return `<div style="text-align:center;padding:10px;background:white;border-radius:8px;border:1px solid ${c.isCurrent?'var(--teal)':'var(--gray-200)'}">
            <div style="font-size:10px;font-weight:600;color:${c.isCurrent?'var(--teal)':'var(--gray-400)'};margin-bottom:8px">Ciclo ${c.cycle}${c.isCurrent?' · actual':''}</div>
            <div style="font-size:10px;color:var(--gray-400);margin-bottom:2px">Perf.</div>
            <div style="font-size:20px;font-weight:700;color:${c.perf>=4?'var(--green)':c.perf>=3?'var(--amber)':'var(--red)'}">
              ${c.perf>0?c.perf.toFixed(1):'—'}${prev?deltaHtml(c.perf,prev.perf):''}
            </div>
            <div style="font-size:10px;color:var(--gray-400);margin-top:8px;margin-bottom:2px">Potencial</div>
            <div style="font-size:20px;font-weight:700;color:${c.pot>=4?'var(--purple)':c.pot>=3?'var(--blue)':'var(--amber)'}">
              ${c.pot>0?c.pot.toFixed(1):'—'}${prev?deltaHtml(c.pot,prev.pot):''}
            </div>
            <div style="font-size:10px;color:var(--gray-400);margin-top:8px;border-top:1px solid var(--gray-100);padding-top:6px;line-height:1.4">${c.decision||'—'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // Cycle detail cards, newest first
  [...cycles].reverse().forEach(c => {
    const dateStr = c.closedAt
      ? new Date(c.closedAt).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})
      : c.isCurrent ? (p._closed?'—':'En curso') : '—';
    const riskCol = (c.risk||'').includes('Alto')?'var(--red)':(c.risk||'').includes('Medio')?'var(--amber)':'var(--green)';
    html += `<div class="cycle-card ${c.isCurrent?'current':''}">
      <div class="cc-header">
        <div>
          <span class="cc-title">Ciclo ${c.cycle}${c.isCurrent?` <span style='font-size:10px;padding:1px 6px;background:var(--teal);color:white;border-radius:4px;font-weight:600'>actual</span>`:''}</span>
          ${c.justif?`<div style="font-size:11px;color:var(--gray-500);margin-top:2px">📝 ${esc(c.justif)}</div>`:''}
        </div>
        <span class="cc-date">${dateStr}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">
        <div><div style="font-size:10px;color:var(--gray-400);margin-bottom:3px">Performance</div>${miniBar(c.perf,'var(--blue)')}</div>
        <div><div style="font-size:10px;color:var(--gray-400);margin-bottom:3px">Potencial</div>${miniBar(c.pot,'var(--purple)')}</div>
        <div><div style="font-size:10px;color:var(--gray-400);margin-bottom:3px">Madurez</div><span style="font-size:12px;font-weight:600">${esc(c.madurez)}</span></div>
        <div><div style="font-size:10px;color:var(--gray-400);margin-bottom:3px">Risk</div><span style="font-size:11px;font-weight:600;color:${riskCol}">${esc(c.risk)||'—'}</span></div>
      </div>
      ${c.decision?`<div style="font-size:11px;background:var(--gray-50);border-radius:6px;padding:6px 10px;margin-bottom:6px"><strong>Decisión:</strong> ${esc(c.decision)}</div>`:''}
      ${c.fortalezas?`<div style="font-size:11px;color:var(--gray-700);margin-bottom:4px"><strong style="color:var(--green)">✓ Fortalezas:</strong> ${esc(c.fortalezas).replace(/\n/g,' · ')}</div>`:''}
      ${c.mejoras?`<div style="font-size:11px;color:var(--gray-700)"><strong style="color:var(--amber)">⚡ Mejoras:</strong> ${esc(c.mejoras).replace(/\n/g,' · ')}</div>`:''}
    </div>`;
  });

  body.innerHTML = html || '<div style="text-align:center;padding:2rem;color:var(--gray-400)">Sin historial de ciclos previos</div>';
  openModal('historyModal');
}

// ═══════════════════════════════════════════════════════════════
function saveAndContinue() {
  autoSave();
  clearTimeout(autoSaveTimer);
  if(currentId) pushToSupabase(currentId, profiles[currentId]);
  const pct = calcCompleteness(profiles[currentId]);
  const col = completenessColor(pct);
  const canClose = pct >= 100;
  const pctEl = document.getElementById('saveModalPct');
  if(pctEl) pctEl.innerHTML = `Completado: <strong style="color:${col}">${pct}%</strong> de los campos obligatorios${pct < 100 ? ` · Faltan ${100-pct}% para poder cerrar el perfil` : ' — ¡Perfil listo para cerrar!'}`;
  // Show/hide "Cerrar ahora" button
  const closeNowBtn = document.getElementById('saveModalCloseBtn');
  if(closeNowBtn) closeNowBtn.style.display = canClose ? '' : 'none';
  openModal('saveModal');
}

function closeSaveModalAndClose() {
  closeModal('saveModal');
  closeProfile();
}

function closeProfile() {
  if(!currentId) return;
  if(!isProfileOwner(currentId)) {
    alert('Solo el evaluador que creó este perfil puede cerrarlo.');
    return;
  }
  autoSave();
  const p = profiles[currentId];
  const pct = calcCompleteness(p);
  const missing = getMissingFields(p);
  const canClose = pct >= 100;

  let summaryHtml = '';
  if(!canClose) {
    summaryHtml = `<div style="background:var(--red-light);border:1px solid #fca5a5;border-radius:8px;padding:12px 14px">
      <div style="font-weight:600;color:var(--red);margin-bottom:6px">🚫 No se puede cerrar — perfil incompleto (${pct}%)</div>
      <div style="font-size:12px;color:var(--gray-700);line-height:1.7">Campos pendientes:<br><strong>${missing.join(', ')}</strong></div>
      <div style="font-size:11px;color:var(--gray-500);margin-top:8px">Completa todos los campos obligatorios para poder cerrar el perfil y enviarlo a la vista consolidada.</div>
    </div>`;
  } else {
    summaryHtml = `<div style="background:var(--green-light);border:1px solid #86efac;border-radius:8px;padding:10px 12px;color:var(--green);font-weight:600">✅ Perfil completo al 100% — listo para cerrar</div>`;
  }

  document.getElementById('closeProfileSummary').innerHTML = summaryHtml;
  // Show/hide confirm button based on completeness
  const confirmBtn = document.getElementById('closeProfileConfirmBtn');
  if(confirmBtn) {
    confirmBtn.style.display = canClose ? '' : 'none';
  }
  openModal('closeProfileModal');
}

function confirmCloseProfile() {
  if(!currentId) return;
  const uname = currentUser?.user_metadata?.full_name || currentUser?.email;
  profiles[currentId]._closed = true;
  profiles[currentId]._closedAt = new Date().toISOString();
  profiles[currentId]._closedBy = uname;
  if(!profiles[currentId]._cycle) profiles[currentId]._cycle = 1;
  autoSave();
  clearTimeout(autoSaveTimer);
  pushToSupabase(currentId, profiles[currentId]);
  closeModal('closeProfileModal');
  const name = profiles[currentId].nombre || 'el perfil';
  currentId = null;
  showOverview('mine');
  // Brief toast
  const ind = document.getElementById('saveIndicator');
  ind.textContent = `✓ ${name} cerrado`;
  ind.classList.add('show');
  setTimeout(() => { ind.classList.remove('show'); ind.textContent = 'Guardado ✓'; }, 2500);
}

function getMissingFields(p) {
  const missing = [];
  const g = p.general || {};
  if(!g.nombre) missing.push('Nombre');
  if(!g.rol) missing.push('Rol');
  if(!g.nivel) missing.push('Nivel jerárquico');
  if(!g.ingreso) missing.push('Ingreso');
  if(!g.seniority) missing.push('Job Rol');
  if(!g.nroEmpleado) missing.push('N° Empleado');
  if(!g.antiguedad) missing.push('Antigüedad en NTT');
  if(!g.lasteval) missing.push('Última evaluación');
  if(!g.proyectos) missing.push('Proyectos');
  if(!g.entrevistador) missing.push('Entrevistador');
  const perfScores = Object.values(p.perf?.scores || {});
  if(perfScores.some(s => !s)) missing.push('Performance — scores incompletos');
  const perfEvMissing = Object.values(p.perf?.evidence || {}).filter(e => !e?.trim()).length;
  if(perfEvMissing) missing.push(`Performance — ${perfEvMissing} evidencia(s) vacía`);
  const potScores = Object.values(p.pot?.scores || {});
  if(potScores.some(s => !s)) missing.push('Potencial — scores incompletos');
  const potEvMissing = Object.values(p.pot?.evidence || {}).filter(e => !e?.trim()).length;
  if(potEvMissing) missing.push(`Potencial — ${potEvMissing} evidencia(s) vacía`);
  if(!p.madurez?.final) missing.push('Madurez — nivel final');
  const matDimsMissing = Object.values(p.madurez?.dims || {}).filter(d => !d.nivel || !d.justif?.trim()).length;
  if(matDimsMissing) missing.push(`Mad. Profesional — ${matDimsMissing} dim(s) incompleta`);
  if(!p.risk?.global) missing.push('Risk global');
  if(!p.resumen?.decision) missing.push('Decisión');
  if(!p.resumen?.fortalezas?.trim()) missing.push('Fortalezas clave');
  if(!p.resumen?.mejoras?.trim()) missing.push('Áreas de mejora');
  if(!p.resumen?.justif?.trim()) missing.push('Justificación decisión');
  if(!p.resumen?.hito?.trim()) missing.push('Próximo hito');
  if(!p.ninebox?.validated) missing.push('Cuadrante validado');
  if(!p.ninebox?.aspiraciones) missing.push('Aspiraciones');
  if(!p.risk?.accion?.trim()) missing.push('Acción prioritaria retención');
  if(!p.risk?.nextrev) missing.push('Próxima revisión de riesgo');
  if(!p.madurez?.justif?.trim()) missing.push('Justificación madurez');
  if(!p.perf?.feedbackScore) missing.push('Score feedback calibración');
  const sp = Object.entries(p.skills||{}).filter(([,d])=>d.planActivo==='Sí'&&!d.plan?.trim()).length;
  if(sp) missing.push(`${sp} plan(es) skill vacío`);
  const rp = Object.values(p.risk?.items||{}).filter(d=>(d.estado==='Alto'||d.estado==='Medio')&&(!d.obs?.trim()||!d.accion?.trim())).length;
  if(rp) missing.push(`${rp} indicador Alto sin obs/acción`);
  return missing;
}

// ═══════════════════════════════════════════════════════════════
// SECTION TAB PROGRESS BARS
// ═══════════════════════════════════════════════════════════════
function calcSectionProgress() {
  if(!currentId) return {};
  const p = profiles[currentId];
  const g = p.general || {};
  const results = {};

  // General
  const genFields = ['nombre','rol','nivel','ingreso','seniority','nroEmpleado','antiguedad','lasteval','proyectos','entrevistador'];
  const genFilled = genFields.filter(f => g[f] && String(g[f]).trim()).length;
  results.general = Math.round((genFilled / genFields.length) * 100);

  // Performance — scores + evidence
  const perfScores = Object.values(p.perf?.scores || {});
  const perfEvidence = Object.values(p.perf?.evidence || {});
  const perfFilled = perfScores.filter(s => s > 0).length + perfEvidence.filter(e => e?.trim()).length;
  const perfTotal = perfScores.length * 2;
  results.performance = perfTotal ? Math.round((perfFilled / perfTotal) * 100) : 0;

  // Potencial — scores + evidence
  const potScores = Object.values(p.pot?.scores || {});
  const potEvidence = Object.values(p.pot?.evidence || {});
  const potFilled = potScores.filter(s => s > 0).length + potEvidence.filter(e => e?.trim()).length;
  const potTotal = potScores.length * 2;
  results.potencial = potTotal ? Math.round((potFilled / potTotal) * 100) : 0;

  // perfAvg/potAvg used later for 9-Box section progress
  const perfAvg = perfScores.length ? perfScores.reduce((a,b)=>a+b,0)/perfScores.length : 0;
  const potAvg  = potScores.length  ? potScores.reduce((a,b)=>a+b,0)/potScores.length   : 0;

  // Skills — planActivo=Sí requires plan; skip NA
  const skillEntries = Object.values(p.skills || {}).filter(d => !d.na);
  let skillTotal = 0, skillFilled = 0;
  skillEntries.forEach(d => {
    skillTotal += 2;
    if(d.actual > 0) skillFilled++;
    if(d.target > 0) skillFilled++;
    if(d.planActivo === 'Sí') { skillTotal++; if(d.plan?.trim()) skillFilled++; }
  });
  results.skills = skillTotal ? Math.round((skillFilled / skillTotal) * 100) : 0;

  // Madurez profesional — nivel + justif por dimensión + final + justif global
  const matDims = Object.values(p.madurez?.dims || {});
  const matFilledNivel  = matDims.filter(d => d.nivel).length;
  const matFilledJustif = matDims.filter(d => d.justif?.trim()).length;
  const matHasFinal  = p.madurez?.final ? 1 : 0;
  const matHasJustif = p.madurez?.justif?.trim() ? 1 : 0;
  const matTotal = matDims.length * 2 + 2;
  results.madurez = matTotal ? Math.round(((matFilledNivel + matFilledJustif + matHasFinal + matHasJustif) / matTotal) * 100) : 0;

  // Flight Risk
  const riskItems = Object.values(p.risk?.items || {});
  let rTotal = 0, rFilled = 0;
  riskItems.forEach(d => {
    rTotal++;
    if(d.estado) rFilled++;
    if(d.estado === 'Alto' || d.estado === 'Medio') {
      rTotal += 2;
      if(d.obs?.trim()) rFilled++;
      if(d.accion?.trim()) rFilled++;
    }
  });
  rTotal++; if(p.risk?.global) rFilled++; // global
  rTotal++; if(p.risk?.accion?.trim()) rFilled++; // acción retención
  rTotal++; if(p.risk?.nextrev) rFilled++; // próxima revisión
  results.risk = rTotal ? Math.round((rFilled / rTotal) * 100) : 0;

  // IDP — optional but show how many items have data
  const idpItems = p.idp || [];
  results.idp = idpItems.length > 0 ? Math.min(100, idpItems.length * 25) : 0;

  // 9-Box — include validated and aspiraciones
  const _isManagerRole = (getUserRole() === 'manager' || getUserRole() === 'admin');
  let nbTotal = _isManagerRole ? 4 : 2, nbFilled = 0;
  if(perfAvg > 0) nbFilled++;
  if(potAvg > 0) nbFilled++;
  if(_isManagerRole && p.ninebox?.validated) nbFilled++;
  if(_isManagerRole && p.ninebox?.aspiraciones) nbFilled++;
  results.ninebox = nbTotal ? Math.round((nbFilled / nbTotal) * 100) : 0;

  // Resumen
  const resFields = ['decision','fortalezas','mejoras','justif','hito'];
  const resFilled = resFields.filter(f => p.resumen?.[f]?.toString().trim()).length;
  results.resumen = Math.round((resFilled / resFields.length) * 100);

  return results;
}

const TAB_LABELS = {
  general: 'General', performance: 'Performance', potencial: 'Potencial',
  ninebox: '9-Box', skills: 'Mad. Técnica', madurez: 'Mad. Profesional',
  risk: 'Flight risk', idp: 'IDP', resumen: 'Resumen'
};

function updateTabProgress() {
  const sectionPcts = calcSectionProgress();
  document.querySelectorAll('.section-tab[data-section]').forEach(tab => {
    const sec = tab.dataset.section;
    const pct = sectionPcts[sec] ?? 0;
    const label = TAB_LABELS[sec] || sec;

    if(pct >= 100) {
      tab.innerHTML = `${label} <span class="tab-status-icon" style="font-size:10px;margin-left:3px;color:var(--green);font-weight:700">✓</span>`;
    } else {
      tab.innerHTML = `${label} <span class="tab-status-icon" style="font-size:10px;margin-left:3px;color:var(--amber);font-weight:700">⚠</span>`;
    }
  });
}


// ═══════════════════════════════════════════════════════════════
function generateFortalezas() {
  if(!currentId) return;
  const p = profiles[currentId];
  const seniority = p.general?.seniority || '';
  const fortalezas = [];

  // Top 3 performance dims con score más alto
  const perfEntries = Object.entries(p.perf?.scores || {})
    .filter(([,v]) => v >= 4)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 3);
  perfEntries.forEach(([i]) => {
    const dim = PERF_DIMS[i];
    if(dim) fortalezas.push(`${dim} (score ${p.perf.scores[i]}/5)`);
  });

  // Top 2 potencial dims
  const potEntries = Object.entries(p.pot?.scores || {})
    .filter(([,v]) => v >= 4)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 2);
  potEntries.forEach(([i]) => {
    const dim = POT_DIMS[i];
    if(dim && fortalezas.length < 4) fortalezas.push(`${dim} (potencial alto)`);
  });

  // Top skills técnicos
  const topSkills = Object.entries(p.skills || {})
    .filter(([,d]) => d.actual >= 4)
    .sort(([,a],[,b]) => b.actual - a.actual)
    .slice(0, 2);
  topSkills.forEach(([skill, d]) => {
    if(fortalezas.length < 5) fortalezas.push(`${skill} (nivel ${d.actual}/5)`);
  });

  // 9-Box label como fortaleza
  const perf = getAvg(p.perf.scores);
  const pot  = getAvg(p.pot.scores);
  if(perf >= 4 && pot >= 4) fortalezas.unshift('Perfil Top talent: alta performance y alto potencial');
  else if(pot >= 4)         fortalezas.unshift('Alto potencial demostrado en múltiples dimensiones');
  else if(perf >= 4)        fortalezas.unshift('Alta performance consistente en el rol actual');

  const top3 = [...new Set(fortalezas)].slice(0, 3);
  if(!top3.length) {
    alert('No hay suficientes scores ≥ 4 para generar fortalezas. Completa Performance, Potencial y Skills primero.');
    return;
  }
  const el = document.getElementById('res-fortalezas');
  if(el.value.trim()) {
    if(!confirm('Reemplazar el texto actual con las fortalezas generadas?')) return;
  }
  el.value = top3.join('\n');
  profiles[currentId].resumen.fortalezas = el.value;
  autoSave();
}

function generateMejoras() {
  if(!currentId) return;
  const p = profiles[currentId];
  const mejoras = [];

  // Performance dims con score < 3
  const perfGaps = Object.entries(p.perf?.scores || {})
    .filter(([,v]) => v > 0 && v <= 2)
    .sort(([,a],[,b]) => a - b)
    .slice(0, 3);
  perfGaps.forEach(([i]) => {
    const dim = PERF_DIMS[i];
    if(dim) mejoras.push(`Mejorar: ${dim} (score actual ${p.perf.scores[i]}/5)`);
  });

  // Potencial dims con score bajo
  const potGaps = Object.entries(p.pot?.scores || {})
    .filter(([,v]) => v > 0 && v <= 2)
    .sort(([,a],[,b]) => a - b)
    .slice(0, 2);
  potGaps.forEach(([i]) => {
    const dim = POT_DIMS[i];
    if(dim && mejoras.length < 4) mejoras.push(`Desarrollar: ${dim}`);
  });

  // Skill gaps (positivos = por debajo del target)
  const skillGaps = Object.entries(p.skills || {})
    .filter(([,d]) => d.actual > 0 && d.target > 0 && (d.target - d.actual) >= 2)
    .sort(([,a],[,b]) => (b.target - b.actual) - (a.target - a.actual))
    .slice(0, 2);
  skillGaps.forEach(([skill, d]) => {
    if(mejoras.length < 5) mejoras.push(`Upskilling en ${skill} (gap: ${d.target - d.actual} niveles)`);
  });

  // Gap de madurez profesional
  const matFinal = parseInt(p.madurez?.final) || 0;
  const seniority = p.general?.seniority;
  if(matFinal && seniority && ROLE_MATURITY_EXPECTED[seniority]) {
    const expected = ROLE_MATURITY_EXPECTED[seniority];
    if(expected - matFinal > 0 && mejoras.length < 5) {
      mejoras.push(`Acelerar madurez profesional al nivel esperado del rol (${expected - matFinal} nivel(es) de gap)`);
    }
  }

  const top3 = [...new Set(mejoras)].slice(0, 3);
  if(!top3.length) {
    alert('No se detectaron gaps claros. Asegúrate de tener scores en Performance, Potencial y Skills.');
    return;
  }
  const el = document.getElementById('res-mejoras');
  if(el.value.trim()) {
    if(!confirm('Reemplazar el texto actual con las áreas de mejora generadas?')) return;
  }
  el.value = top3.join('\n');
  profiles[currentId].resumen.mejoras = el.value;
  autoSave();
}


// ═══════════════════════════════════════════════════════════════
function updateSectionAlerts() {
  if(!currentId) return;
  const p = profiles[currentId];
  const g = p.general || {};

  // ── General ──
  const genMissing = [];
  if(!g.nombre)       genMissing.push('Nombre completo');
  if(!g.rol)          genMissing.push('Rol / Cargo');
  if(!g.nivel)        genMissing.push('Nivel jerárquico');
  if(!g.ingreso)      genMissing.push('Fecha de ingreso');
  if(!g.seniority)    genMissing.push('Job Rol');
  if(!g.nroEmpleado)  genMissing.push('N° Empleado');
  if(!g.antiguedad)   genMissing.push('Antigüedad en NTT');
  if(!g.lasteval)     genMissing.push('Fecha última evaluación');
  if(!g.proyectos)    genMissing.push('Squads / Proyectos');
  if(!g.entrevistador) genMissing.push('Entrevistador');
  showSectionAlert('alert-general', genMissing);

  // ── Performance ──
  const perfMissing = [];
  PERF_DIMS.forEach((dim, i) => {
    if(!p.perf?.scores[i]) perfMissing.push(`Score: ${dim}`);
    if(!p.perf?.evidence[i]?.trim()) perfMissing.push(`Evidencia: ${dim}`);
  });
  if(!p.perf?.feedbackScore) perfMissing.push('Valoración feedback de cliente / stakeholder');
  showSectionAlert('alert-performance', perfMissing);

  // ── Potencial ──
  const potMissing = [];
  POT_DIMS.forEach((dim, i) => {
    if(!p.pot?.scores[i]) potMissing.push(`Score: ${dim}`);
    if(!p.pot?.evidence[i]?.trim()) potMissing.push(`Evidencia: ${dim}`);
  });
  showSectionAlert('alert-potencial', potMissing);

  // ── Mad. Técnica ──
  const skillsMissing = Object.entries(p.skills||{})
    .filter(([,d]) => !d.na && d.planActivo==='Sí' && !d.plan?.trim())
    .map(([skill]) => `Plan obligatorio: ${skill}`);
  showSectionAlert('alert-skills', skillsMissing);

  // ── Mad. Profesional ──
  const matMissing = [];
  MAT_DIMS.forEach((dim, i) => {
    const d = p.madurez?.dims?.[i];
    if(!d?.nivel)        matMissing.push(`Nivel: ${dim}`);
    if(!d?.justif?.trim()) matMissing.push(`Justificación: ${dim}`);
  });
  if(!p.madurez?.final)        matMissing.push('Nivel final de madurez');
  if(!p.madurez?.justif?.trim()) matMissing.push('Justificación global del manager');
  showSectionAlert('alert-madurez', matMissing);

  // ── 9-Box ──
  const nbMissing = [];
  const isManagerOrAdmin = (getUserRole() === 'manager' || getUserRole() === 'admin');
  if(isManagerOrAdmin) {
    if(!p.ninebox?.validated)    nbMissing.push('Cuadrante validado');
    if(!p.ninebox?.aspiraciones) nbMissing.push('Aspiraciones declaradas');
  }
  showSectionAlert('alert-ninebox', nbMissing);

  // ── Flight Risk ──
  const riskMissing = [];
  Object.entries(p.risk?.items||{}).forEach(([i, d]) => {
    const name = RISK_ITEMS[i] || `Indicador ${+i+1}`;
    if(!d.estado) riskMissing.push(`Estado: ${name}`);
    else if(d.estado==='Alto' || d.estado==='Medio') {
      if(!d.obs?.trim())    riskMissing.push(`Observación (${d.estado}): ${name}`);
      if(!d.accion?.trim()) riskMissing.push(`Acción (${d.estado}): ${name}`);
    }
  });
  if(!p.risk?.global)         riskMissing.push('Nivel de riesgo global');
  if(!p.risk?.accion?.trim()) riskMissing.push('Acción prioritaria de retención');
  if(!p.risk?.nextrev)        riskMissing.push('Fecha próxima revisión de riesgo');
  showSectionAlert('alert-risk', riskMissing);

  // ── Resumen ──
  const resMissing = [];
  if(!p.resumen?.fortalezas?.trim()) resMissing.push('Fortalezas clave (top 3)');
  if(!p.resumen?.mejoras?.trim())    resMissing.push('Áreas de mejora prioritarias (top 3)');
  if(!p.resumen?.decision)           resMissing.push('Decisión recomendada');
  if(!p.resumen?.justif?.trim())     resMissing.push('Justificación de la decisión');
  if(!p.resumen?.hito?.trim())       resMissing.push('Próximo hito / Checkpoint');
  showSectionAlert('alert-resumen', resMissing);
}

function toggleGlobalAlertPanel() {
  const detail = document.getElementById('global-alert-detail');
  const chevron = document.getElementById('global-alert-chevron');
  if(!detail) return;
  const open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : 'block';
  if(chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function updateGlobalAlertPanel() {
  if(!currentId) return;
  const p = profiles[currentId];
  const g = p.general || {};

  const sections = [];

  // General
  const genM = [];
  if(!g.nombre) genM.push('Nombre');
  if(!g.rol) genM.push('Rol');
  if(!g.nivel) genM.push('Nivel');
  if(!g.ingreso) genM.push('Ingreso');
  if(!g.seniority) genM.push('Job Rol');
  if(!g.nroEmpleado) genM.push('N° Empleado');
  if(!g.antiguedad) genM.push('Antigüedad');
  if(!g.lasteval) genM.push('Última eval.');
  if(!g.proyectos) genM.push('Proyectos');
  if(!g.entrevistador) genM.push('Entrevistador');
  if(genM.length) sections.push({label:'General', items: genM, tab:'general'});

  // Performance
  const perfM = [];
  PERF_DIMS.forEach((dim, i) => { if(!p.perf?.scores[i]) perfM.push(dim); });
  Object.values(p.perf?.evidence || {}).forEach((e, i) => { if(!e?.trim()) perfM.push(`Evidencia dim.${i+1}`); });
  if(!p.perf?.feedbackScore) perfM.push('Score feedback');
  if(perfM.length) sections.push({label:'Performance', items: perfM, tab:'performance'});

  // Potencial
  const potM = [];
  POT_DIMS.forEach((dim, i) => { if(!p.pot?.scores[i]) potM.push(dim); });
  Object.values(p.pot?.evidence || {}).forEach((e, i) => { if(!e?.trim()) potM.push(`Evidencia dim.${i+1}`); });
  if(potM.length) sections.push({label:'Potencial', items: potM, tab:'potencial'});

  // Skills
  const skillM = Object.entries(p.skills||{})
    .filter(([,d]) => !d.na && d.planActivo==='Sí' && !d.plan?.trim())
    .map(([s]) => `Plan: ${s}`);
  if(skillM.length) sections.push({label:'Mad. Técnica', items: skillM, tab:'skills'});

  // Madurez profesional
  const matM = [];
  Object.values(p.madurez?.dims || {}).forEach((d, i) => {
    if(!d.nivel) matM.push(`Nivel dim.${i+1}`);
    if(!d.justif?.trim()) matM.push(`Justif. dim.${i+1}`);
  });
  if(!p.madurez?.final) matM.push('Nivel final');
  if(!p.madurez?.justif?.trim()) matM.push('Justif. global');
  if(matM.length) sections.push({label:'Mad. Profesional', items: matM, tab:'madurez'});

  // 9-Box
  const nbM = [];
  if(getUserRole() === 'manager' || getUserRole() === 'admin') {
    if(!p.ninebox?.validated) nbM.push('Cuadrante validado');
    if(!p.ninebox?.aspiraciones) nbM.push('Aspiraciones');
  }
  if(nbM.length) sections.push({label:'9-Box', items: nbM, tab:'ninebox'});

  // Flight Risk
  const riskM = [];
  Object.entries(p.risk?.items||{}).forEach(([i, d]) => {
    if(!d.estado) riskM.push(`${RISK_ITEMS[i]}: estado`);
    if((d.estado==='Alto'||d.estado==='Medio') && !d.obs?.trim()) riskM.push(`${RISK_ITEMS[i]}: obs`);
    if((d.estado==='Alto'||d.estado==='Medio') && !d.accion?.trim()) riskM.push(`${RISK_ITEMS[i]}: acción`);
  });
  if(!p.risk?.global) riskM.push('Riesgo global');
  if(!p.risk?.accion?.trim()) riskM.push('Acción retención');
  if(!p.risk?.nextrev) riskM.push('Próxima revisión');
  if(riskM.length) sections.push({label:'Flight Risk', items: riskM, tab:'risk'});

  // Resumen
  const resM = [];
  if(!p.resumen?.fortalezas?.trim()) resM.push('Fortalezas');
  if(!p.resumen?.mejoras?.trim()) resM.push('Áreas de mejora');
  if(!p.resumen?.decision) resM.push('Decisión');
  if(!p.resumen?.justif?.trim()) resM.push('Justificación');
  if(!p.resumen?.hito?.trim()) resM.push('Próximo hito');
  if(resM.length) sections.push({label:'Resumen', items: resM, tab:'resumen'});

  const panel = document.getElementById('global-alert-panel');
  const summary = document.getElementById('global-alert-summary');
  const list = document.getElementById('global-alert-list');
  if(!panel) return;

  if(!sections.length) {
    panel.style.display = 'none';
    return;
  }

  const totalItems = sections.reduce((a, s) => a + s.items.length, 0);
  panel.style.display = 'block';
  summary.textContent = `${sections.length} sección${sections.length>1?'es':''} incompleta${sections.length>1?'s':''} · ${totalItems} campo${totalItems>1?'s':''} pendiente${totalItems>1?'s':''}`;

  list.innerHTML = sections.map(s => `
    <div style="background:white;border:1px solid #fde68a;border-radius:6px;padding:7px 10px;cursor:pointer"
         data-goto-tab="${s.tab}"
         title="Ir a ${s.label}">
      <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:3px">
        ${s.label} <span style="font-weight:400;color:#b45309">(${s.items.length})</span>
      </div>
      <div style="font-size:10px;color:#b45309;line-height:1.5">${s.items.slice(0,4).join(' · ')}${s.items.length>4?' · +'+(s.items.length-4)+' más':''}</div>
    </div>`).join('');

  // Delegated click handler — avoids quote-escaping issues
  list.querySelectorAll('[data-goto-tab]').forEach(card => {
    card.addEventListener('click', () => {
      const tabName = card.dataset.gotoTab;
      const tabEl = document.querySelector(`.section-tab[data-section="${tabName}"]`);
      switchTab(tabName, tabEl);
    });
  });
}

function showSectionAlert(alertId, missingArr) {
  const el = document.getElementById(alertId);
  if(!el) return;
  if(!missingArr.length) {
    el.classList.remove('show');
    el.innerHTML = '';
    return;
  }
  const uid = alertId + '-detail';
  // Preserve open/closed state across re-renders
  const wasOpen = !!document.getElementById(uid) &&
                  document.getElementById(uid).style.display !== 'none';
  const items = missingArr.map(m =>
    `<span style="display:inline-block;background:rgba(220,38,38,0.08);border-radius:4px;padding:1px 7px;margin:2px 3px 2px 0;white-space:nowrap">⚠ ${esc(m)}</span>`
  ).join('');
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none"
         onclick="var d=document.getElementById('${uid}');var open=d.style.display!=='none';d.style.display=open?'none':'block';this.querySelector('.alert-chevron').style.transform=open?'':'rotate(180deg)'">
      <span style="font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Campos pendientes (${missingArr.length})</span>
      <span class="alert-chevron" style="font-size:10px;transition:transform 0.2s${wasOpen?';transform:rotate(180deg)':''}">▼</span>
    </div>
    <div id="${uid}" style="display:${wasOpen?'block':'none'};margin-top:6px;line-height:2">${items}</div>`;
  el.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if((e.ctrlKey||e.metaKey) && e.key === 's') { e.preventDefault(); saveAll(); }
  // Escape closes any open modal
  if(e.key === 'Escape') {
    const modals = ['historyModal','newCycleModal','reopenModal','closeProfileModal','saveModal','benchmarkModal','dimModal','addModal','equipoModal'];
    for(const id of modals) {
      const el = document.getElementById(id);
      if(el && el.classList.contains('open')) { closeModal(id); break; }
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
loadState();
renderSidebar();

(async () => {
  initSupabase();
  {
    // Check existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session) {
      onAuthSuccess(session.user);
    } else {
      // Show auth screen — BD is configured but not logged in
      document.getElementById('authScreen').classList.remove('hidden');
      setSyncStatus('', 'Inicia sesión');
    }
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if(event === 'PASSWORD_RECOVERY') {
        // Show reset password form instead of logging in
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('auth-login-form').style.display = 'none';
        document.getElementById('auth-reset-form').style.display = 'block';
        document.getElementById('reset-pass').focus();
      }
      if(event === 'SIGNED_IN' && session) {
        // Only auto-login if must_change_password is already false (returning user)
        // First-time users are handled directly in doLogin
        if(session.user.user_metadata?.must_change_password === false) {
          onAuthSuccess(session.user);
        }
      }
      if(event === 'SIGNED_OUT') {
        currentUser = null;
        document.getElementById('userChip').style.display = 'none';
      }
    });
  }
  // Show local profiles while loading
  const ids = Object.keys(profiles);
  if(ids.length && !currentUser) {
    document.getElementById('emptyState').style.display = 'none';
  }
})();

// Periodic pull every 60s — only when tab is visible and user is authenticated
let syncIntervalId = null;
function startSyncInterval() {
  if(syncIntervalId) return;
  syncIntervalId = setInterval(async () => {
    if(supabaseClient && currentUser && !document.hidden) {
      await pullFromSupabase();
    }
  }, 60000);
}
function stopSyncInterval() {
  if(syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden) stopSyncInterval();
  else if(currentUser) startSyncInterval();
});
startSyncInterval();
