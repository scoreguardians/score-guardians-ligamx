// ══════════════════════════════════════════════════════════════
//  SCORE GUARDIANS — Auth & Predicciones con Supabase
//  Proyecto: ScoreGuardians | hkzulxvsnmczbomjklln
// ══════════════════════════════════════════════════════════════

const SUPA_URL = 'https://hkzulxvsnmczbomjklln.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrenVseHZzbm1jemJvbWprbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODQyNTEsImV4cCI6MjA5Njk2MDI1MX0.9skguLAPgMS6oJ4gDiYTPaLEWGPqOVljflOnzjpACfs';

let supabase = null;
let currentUser = null;
let currentProfile = null;

// ── Inicializar Supabase ─────────────────────────────────────
function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    checkSession();
  } else {
    setTimeout(initSupabase, 300);
  }
}

// ── Verificar sesión activa ──────────────────────────────────
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    showUserUI();
  } else {
    showAuthUI();
  }
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      currentUser = session.user;
      await loadProfile();
      showUserUI();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuthUI();
    }
  });
}

// ── Cargar perfil ────────────────────────────────────────────
async function loadProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  currentProfile = data;
}

// ── Registro ─────────────────────────────────────────────────
async function sgRegister() {
  const email    = document.getElementById('sgEmail').value.trim();
  const password = document.getElementById('sgPassword').value;
  const username = document.getElementById('sgUsername').value.trim();
  const err      = document.getElementById('sgAuthError');

  if (!email || !password || !username) {
    err.textContent = 'Completa todos los campos.'; err.style.display='block'; return;
  }
  if (password.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; err.style.display='block'; return;
  }

  setBtnLoading('sgSubmitBtn', true);

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { err.textContent = error.message; err.style.display='block'; setBtnLoading('sgSubmitBtn',false); return; }

  // Crear perfil
  const { error: profError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username: username
  });
  if (profError) {
    err.textContent = 'Nombre de usuario ya en uso. Elige otro.';
    err.style.display='block';
    setBtnLoading('sgSubmitBtn',false);
    return;
  }

  setBtnLoading('sgSubmitBtn',false);
  err.style.color='var(--green)';
  err.textContent = '¡Registro exitoso! Revisa tu correo para confirmar.';
  err.style.display='block';
}

// ── Login ────────────────────────────────────────────────────
async function sgLogin() {
  const email    = document.getElementById('sgEmail').value.trim();
  const password = document.getElementById('sgPassword').value;
  const err      = document.getElementById('sgAuthError');

  if (!email || !password) {
    err.textContent = 'Ingresa tu correo y contraseña.'; err.style.display='block'; return;
  }

  setBtnLoading('sgSubmitBtn', true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    err.textContent = 'Correo o contraseña incorrectos.';
    err.style.display='block';
    setBtnLoading('sgSubmitBtn',false);
  }
}

// ── Logout ───────────────────────────────────────────────────
async function sgLogout() {
  await supabase.auth.signOut();
}

// ── Guardar predicción ───────────────────────────────────────
async function guardarPrediccion(home, away, prediccion, fechaPartido) {
  if (!currentUser) { alert('Inicia sesión para guardar predicciones.'); return; }

  const partido = `${home} vs ${away}`;
  // Verificar si ya existe
  const { data: existing } = await supabase
    .from('predicciones')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('partido', partido)
    .single();

  if (existing) {
    alert('Ya guardaste una predicción para este partido.');
    return;
  }

  const label = prediccion === 'L' ? home : prediccion === 'V' ? away : 'Empate';
  const { error } = await supabase.from('predicciones').insert({
    user_id:       currentUser.id,
    username:      currentProfile?.username || 'Usuario',
    partido,
    home,
    away,
    prediccion,
    fecha_partido: fechaPartido || null
  });

  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    showToast(`Predicción guardada: ${label}`);
    renderMisPredBox();
  }
}

// ── Cargar mis predicciones ──────────────────────────────────
async function getMisPredicciones() {
  if (!currentUser) return [];
  const { data } = await supabase
    .from('predicciones')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  return data || [];
}

// ── Leaderboard ──────────────────────────────────────────────
async function getLeaderboard() {
  const { data } = await supabase
    .from('predicciones')
    .select('username, acertó')
    .not('acertó', 'is', null);

  if (!data || !data.length) return [];

  const stats = {};
  data.forEach(row => {
    if (!stats[row.username]) stats[row.username] = { total: 0, aciertos: 0 };
    stats[row.username].total++;
    if (row['acertó']) stats[row.username].aciertos++;
  });

  return Object.entries(stats)
    .map(([username, s]) => ({
      username,
      total: s.total,
      aciertos: s.aciertos,
      pct: s.total > 0 ? Math.round((s.aciertos / s.total) * 100) : 0
    }))
    .sort((a, b) => b.pct - a.pct || b.aciertos - a.aciertos)
    .slice(0, 10);
}

// ── UI helpers ────────────────────────────────────────────────
function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Cargando...' : btn.dataset.label;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:#000;padding:10px 20px;border-radius:8px;font-family:Barlow Condensed,sans-serif;font-size:14px;font-weight:700;z-index:9999;letter-spacing:1px;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function showAuthUI() {
  const el = document.getElementById('sgAuthSection');
  if (el) el.style.display = 'block';
  const ud = document.getElementById('sgUserSection');
  if (ud) ud.style.display = 'none';
}

function showUserUI() {
  const el = document.getElementById('sgAuthSection');
  if (el) el.style.display = 'none';
  const ud = document.getElementById('sgUserSection');
  if (ud) {
    ud.style.display = 'block';
  }
  const bar = document.getElementById('sgUserBar');
  if (bar) bar.classList.add('visible');
  const welcome = document.getElementById('sgWelcome');
  if (welcome) welcome.textContent = '👋 Hola, ' + (currentProfile?.username || 'Usuario');
  renderMisPredBox();
  renderLeaderboard();
  injectPredButtons();
}

function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('sgRegFields').style.display = isLogin ? 'none' : 'block';
  document.getElementById('sgSubmitBtn').textContent  = isLogin ? 'Entrar' : 'Registrarse';
  document.getElementById('sgSubmitBtn').dataset.label = isLogin ? 'Entrar' : 'Registrarse';
  document.getElementById('sgSubmitBtn').onclick = isLogin ? sgLogin : sgRegister;
  document.getElementById('sgModeTitle').textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  document.getElementById('sgAuthError').style.display = 'none';
  document.getElementById('sgTabLogin').classList.toggle('sg-tab-active', isLogin);
  document.getElementById('sgTabReg').classList.toggle('sg-tab-active', !isLogin);
}

// ── Render mis predicciones ──────────────────────────────────
async function renderMisPredBox() {
  const box = document.getElementById('sgMisPreds');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Cargando...</div>';

  const preds = await getMisPredicciones();
  if (!preds.length) {
    box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Aún no tienes predicciones guardadas.</div>';
    return;
  }

  const total    = preds.length;
  const resueltos = preds.filter(p => p['acertó'] !== null && p['acertó'] !== undefined);
  const aciertos = resueltos.filter(p => p['acertó']).length;
  const pct      = resueltos.length ? Math.round((aciertos / resueltos.length) * 100) : null;

  let html = `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
    <div class="stat-card" style="flex:1;min-width:80px;">
      <div class="stat-num">${total}</div><div class="stat-lbl">Predicciones</div>
    </div>
    <div class="stat-card" style="flex:1;min-width:80px;">
      <div class="stat-num">${aciertos}</div><div class="stat-lbl">Aciertos</div>
    </div>
    <div class="stat-card" style="flex:1;min-width:80px;">
      <div class="stat-num" style="color:var(--accent)">${pct !== null ? pct+'%' : '—'}</div>
      <div class="stat-lbl">Precisión</div>
    </div>
  </div>`;

  html += `<div style="max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">`;
  preds.forEach(p => {
    const label = p.prediccion === 'L' ? p.home : p.prediccion === 'V' ? p.away : 'Empate';
    const acerto = p['acertó'];
    const badge = acerto === true
      ? '<span style="color:var(--green);font-size:11px;font-weight:700;">✓ ACERTÓ</span>'
      : acerto === false
        ? '<span style="color:var(--red);font-size:11px;font-weight:700;">✗ FALLÓ</span>'
        : '<span style="color:var(--text3);font-size:11px;">Pendiente</span>';
    html += `<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;color:var(--text);">${p.partido}</div>
        <div style="font-size:12px;color:var(--accent);margin-top:2px;">Mi predicción: ${label}</div>
      </div>
      ${badge}
    </div>`;
  });
  html += '</div>';
  box.innerHTML = html;
}

// ── Render leaderboard ───────────────────────────────────────
async function renderLeaderboard() {
  const box = document.getElementById('sgLeaderboard');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Cargando...</div>';

  const rows = await getLeaderboard();
  if (!rows.length) {
    box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Aún no hay datos de aciertos registrados.</div>';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  let html = `<div style="display:flex;flex-direction:column;gap:6px;">`;
  rows.forEach((r, i) => {
    const isMe = currentProfile && r.username === currentProfile.username;
    html += `<div style="background:${isMe?'rgba(0,229,255,.08)':'rgba(255,255,255,.04)'};border:1px solid ${isMe?'rgba(0,229,255,.3)':'var(--border)'};border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;">
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;min-width:28px;">${medals[i]||('#'+(i+1))}</span>
      <div style="flex:1;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:var(--text);">${r.username}${isMe?' <span style="color:var(--accent);font-size:11px;">(tú)</span>':''}</div>
        <div style="font-size:11px;color:var(--text3);">${r.aciertos} aciertos de ${r.total} partidos</div>
      </div>
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--accent);">${r.pct}%</span>
    </div>`;
  });
  html += '</div>';
  box.innerHTML = html;
}

// ── Inyectar botones de predicción en las cards de partidos ──
function injectPredButtons() {
  if (!currentUser) return;
  // Re-render upcoming cards to include prediction buttons
  if (typeof renderUpcomingCards === 'function') {
    renderUpcomingCards();
  }
}

// ── Iniciar cuando carga la página ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initSupabase, 500);
});

// ── Guardar desde el formulario rápido ───────────────────────
function savePredFromForm() {
  const home = document.getElementById('sgPredHome').value;
  const away = document.getElementById('sgPredAway').value;
  const pred = document.getElementById('sgPredResult').value;
  if (!home || !away || home === away) {
    showToast('Selecciona dos equipos diferentes'); return;
  }
  guardarPrediccion(home, away, pred, null);
}

// ── Botón "Guardar mi predicción" en el predictor principal ─
function addSaveButtonToPredictor(home, away, pred) {
  if (!currentUser) return;
  const box = document.getElementById('predInterpret');
  if (!box) return;
  const existing = document.getElementById('sgSaveBtn');
  if (existing) existing.remove();
  const btn = document.createElement('button');
  btn.id = 'sgSaveBtn';
  btn.className = 'sg-pred-btn';
  btn.style.cssText = 'margin-top:12px;display:block;width:100%;padding:10px;font-size:13px;';
  btn.textContent = `Guardar mi predicción: ${pred === 'L' ? home : pred === 'V' ? away : 'Empate'}`;
  btn.onclick = () => {
    guardarPrediccion(home, away, pred, null);
    btn.textContent = '✓ Predicción guardada';
    btn.disabled = true;
  };
  box.parentNode.insertBefore(btn, box.nextSibling);
}

// Sobreescribir showUserUI para mostrar el user bar
const _origShowUserUI = window.showUserUI;
