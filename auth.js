// ══════════════════════════════════════════════════════════════
//  SCORE GUARDIANS — Auth & Predicciones v5
// ══════════════════════════════════════════════════════════════
const SUPA_URL = 'https://hkzulxvsnmczbomjklln.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrenVseHZzbm1jemJvbWprbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODQyNTEsImV4cCI6MjA5Njk2MDI1MX0.9skguLAPgMS6oJ4gDiYTPaLEWGPqOVljflOnzjpACfs';

let sgClient  = null;
let sgUser    = null;
let sgProfile = null;
let sgMyPred  = null; // 'L' | 'E' | 'V'

// ── Init ─────────────────────────────────────────────────────
function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    if (!sgClient) sgClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    sgClient.auth.onAuthStateChange(async (_e, session) => {
      if (session) {
        sgUser = session.user;
        await loadProfile();
        onLoggedIn();
      } else {
        sgUser = null; sgProfile = null;
        onLoggedOut();
      }
    });
    sgClient.auth.getSession().then(({ data: { session } }) => {
      if (session) { sgUser = session.user; loadProfile().then(onLoggedIn); }
      else onLoggedOut();
    });
  } else {
    setTimeout(initSupabase, 300);
  }
}

async function loadProfile() {
  if (!sgUser) return;
  try {
    const { data } = await sgClient.from('profiles').select('*').eq('id', sgUser.id).single();
    if (data) {
      sgProfile = data;
      // Sync localStorage with DB name
      localStorage.setItem('sg_username_' + sgUser.id, data.username);
      localStorage.removeItem('sg_pending_username');
    } else {
      // Profile not in DB — use saved username or email
      const savedName = localStorage.getItem('sg_username_' + sgUser.id)
                     || localStorage.getItem('sg_pending_username')
                     || sgUser.email.split('@')[0];
      const cleanName = savedName.slice(0, 20);

      // Try to create profile
      const { error: ie } = await sgClient.from('profiles').insert({
        id: sgUser.id,
        username: cleanName
      });

      if (!ie) {
        localStorage.removeItem('sg_pending_username');
        const { data: d2 } = await sgClient.from('profiles').select('*').eq('id', sgUser.id).single();
        sgProfile = d2 || { id: sgUser.id, username: cleanName };
      } else {
        // Use in-memory profile — will retry next login
        sgProfile = { id: sgUser.id, username: cleanName };
      }
    }
  } catch(e) {
    console.warn('loadProfile error:', e);
    const fallback = localStorage.getItem('sg_username_' + sgUser.id)
                  || localStorage.getItem('sg_pending_username')
                  || sgUser.email.split('@')[0];
    sgProfile = { id: sgUser.id, username: fallback };
  }
}

// ── Auth actions ──────────────────────────────────────────────
async function sgLogin() {
  const email = document.getElementById('sgEmail').value.trim();
  const pass  = document.getElementById('sgPassword').value;
  const err   = document.getElementById('sgAuthError');
  if (!email || !pass) { showSgErr('Ingresa tu correo y contraseña.'); return; }
  setBtn(true);
  const { error } = await sgClient.auth.signInWithPassword({ email, password: pass });
  if (error) { showSgErr('Correo o contraseña incorrectos.'); setBtn(false); }
  else { closeSgModal('sgAuthModal'); }
}

async function sgRegister() {
  const email    = document.getElementById('sgEmail').value.trim();
  const pass     = document.getElementById('sgPassword').value;
  const username = document.getElementById('sgUsername').value.trim();

  // Validaciones
  if (!email || !pass || !username) { showSgErr('Completa todos los campos.'); return; }
  if (pass.length < 6) { showSgErr('Contraseña mínimo 6 caracteres.'); return; }
  if (username.length < 3) { showSgErr('El nombre debe tener al menos 3 caracteres.'); return; }

  setBtn(true);
  document.getElementById('sgAuthError').style.display = 'none';

  try {
    // 1. Crear usuario en Supabase Auth
    const { data, error } = await sgClient.auth.signUp({ email, password: pass });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        showSgErr('Este correo ya está registrado. Usa "Iniciar sesión".');
      } else {
        showSgErr('Error: ' + error.message);
      }
      setBtn(false); return;
    }

    if (!data?.user) { showSgErr('Error inesperado. Intenta de nuevo.'); setBtn(false); return; }

    // 2. Guardar nombre en localStorage inmediatamente (respaldo)
    localStorage.setItem('sg_username_' + data.user.id, username);
    localStorage.setItem('sg_pending_username', username);

    // 3. Crear perfil en la base de datos
    const { error: pe } = await sgClient.from('profiles').insert({
      id: data.user.id,
      username: username
    });

    if (pe) {
      console.warn('Profile insert warning:', pe.code, pe.message);
      // Aunque falle, el nombre está en localStorage y se crea en el próximo login
    }

    setBtn(false);
    closeSgModal('sgAuthModal');
    showToast('¡Bienvenido, ' + username + '!');

  } catch(e) {
    console.error('Register error:', e);
    showSgErr('Sin conexión. Verifica tu internet.');
    setBtn(false);
  }
}

async function sgLogout() {
  await sgClient.auth.signOut();
  closeSgModal('sgUserModal');
}

// ── Modal control ─────────────────────────────────────────────
function openUserModal() {
  if (!sgUser) {
    document.getElementById('sgAuthModal').classList.add('open');
  } else {
    document.getElementById('sgUserModal').classList.add('open');
    renderMisPreds();
  }
}
function closeSgModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on overlay click
document.addEventListener('click', (e) => {
  ['sgAuthModal','sgUserModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && e.target === el) el.classList.remove('open');
  });
});

// ── State callbacks ───────────────────────────────────────────
function onLoggedIn() {
  const displayName = sgProfile?.username || localStorage.getItem('sg_pending_username') || sgUser.email.split('@')[0];
  const letter = displayName[0].toUpperCase();
  // Avatar in header
  const av = document.getElementById('sgAvatarLetter');
  if (av) av.textContent = letter;
  const avBtn = document.getElementById('sgAvatarBtn');
  if (avBtn) { avBtn.style.background = 'rgba(0,229,255,.25)'; avBtn.style.borderColor = 'var(--accent)'; }
  // Avatar in modal
  const avBig = document.getElementById('sgAvatarBig');
  if (avBig) avBig.textContent = letter;
  // Welcome
  const wel = document.getElementById('sgWelcome');
  if (wel) wel.textContent = displayName;
  const emailEl = document.getElementById('sgUserEmail');
  if (emailEl) emailEl.textContent = sgUser.email;
}

function onLoggedOut() {
  const av = document.getElementById('sgAvatarLetter');
  if (av) av.textContent = '?';
  const avBtn = document.getElementById('sgAvatarBtn');
  if (avBtn) { avBtn.style.background = 'rgba(0,229,255,.1)'; }
}

// ── Panel tabs ────────────────────────────────────────────────
function switchPanelTab(tab) {
  ['preds','new','lead'].forEach(t => {
    const panel = document.getElementById('sgPanel' + t.charAt(0).toUpperCase() + t.slice(1));
    const tabEl = document.getElementById('sgPanelTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (tabEl) tabEl.classList.toggle('sg-tab-active', t === tab);
  });
  if (tab === 'lead') renderLeaderboard();
  if (tab === 'preds') renderMisPreds();
}

// ── Auth mode switch ──────────────────────────────────────────
function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  const regFields = document.getElementById('sgRegFields');
  const submitBtn = document.getElementById('sgSubmitBtn');
  const modeTitle = document.getElementById('sgModeTitle');
  const authErr   = document.getElementById('sgAuthError');
  const tabLogin  = document.getElementById('sgTabLogin');
  const tabReg    = document.getElementById('sgTabReg');
  if (!submitBtn) return;
  if (regFields)  regFields.style.display  = isLogin ? 'none' : 'block';
  if (modeTitle)  modeTitle.textContent    = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  submitBtn.textContent   = isLogin ? 'Entrar' : 'Registrarse';
  submitBtn.dataset.label = submitBtn.textContent;
  submitBtn.disabled      = false;
  submitBtn.onclick       = isLogin ? sgLogin : sgRegister;
  if (authErr)  { authErr.style.display = 'none'; authErr.style.color = 'var(--red)'; }
  if (tabLogin) tabLogin.classList.toggle('sg-tab-active', isLogin);
  if (tabReg)   tabReg.classList.toggle('sg-tab-active', !isLogin);
}

// ── Model prediction preview ───────────────────────────────────
function updateSgModelPred() {
  const home = document.getElementById('sgPredHome').value;
  const away = document.getElementById('sgPredAway').value;
  const preview = document.getElementById('sgModelPreview');
  const loading = document.getElementById('sgModelLoading');
  if (!home || !away || home === away) { if (preview) preview.style.display='none'; return; }

  if (loading) loading.style.display = 'block';
  if (preview) preview.style.display = 'none';

  // Use model if ready
  setTimeout(() => {
    if (typeof eloPredict !== 'function') { if (loading) loading.style.display='none'; return; }
    const p = eloPredict(home, away);
    if (!p) { if (loading) loading.style.display='none'; return; }

    if (loading) loading.style.display = 'none';
    if (preview) preview.style.display = 'block';

    // Team logos
    if (typeof logoSVG === 'function') {
      const lh = document.getElementById('sgLogoHome');
      const la = document.getElementById('sgLogoAway');
      if (lh) lh.innerHTML = logoSVG(home, 48);
      if (la) la.innerHTML = logoSVG(away, 48);
    }
    document.getElementById('sgNameHome').textContent = home;
    document.getElementById('sgNameAway').textContent = away;
    if (p.marcador) document.getElementById('sgMarcador').textContent = p.marcador;

    const ph = Math.round(p.winH * 100), pd = Math.round(p.draw * 100), pa = Math.round(p.winA * 100);
    document.getElementById('sgPctH').textContent = ph + '%';
    document.getElementById('sgPctD').textContent = pd + '%';
    document.getElementById('sgPctA').textContent = pa + '%';
    setTimeout(() => {
      document.getElementById('sgBarH').style.width = ph + '%';
      document.getElementById('sgBarD').style.width = pd + '%';
      document.getElementById('sgBarA').style.width = pa + '%';
    }, 60);
  }, 200);
}

function selectMyPred(val) {
  sgMyPred = val;
  ['L','E','V'].forEach(v => {
    const btn = document.getElementById('sgBtn' + v);
    if (btn) btn.classList.toggle('selected', v === val);
  });
}

// ── Save prediction ───────────────────────────────────────────
async function savePredFromForm() {
  if (!sgUser) { showToast('Inicia sesión primero.'); return; }
  const home = document.getElementById('sgPredHome').value;
  const away = document.getElementById('sgPredAway').value;
  const pred = sgMyPred;
  if (!home || !away || home === away) { showToast('Selecciona dos equipos diferentes.'); return; }
  if (!pred) { showToast('Selecciona tu predicción: local, empate o visitante.'); return; }
  await guardarPrediccion(home, away, pred);
}

async function guardarPrediccion(home, away, prediccion) {
  if (!sgUser) return;
  const partido = home + ' vs ' + away;
  const { data: ex } = await sgClient.from('predicciones').select('id').eq('user_id', sgUser.id).eq('partido', partido).single();
  if (ex) { showToast('Ya tienes una predicción para este partido.'); return; }
  const label = prediccion === 'L' ? home : prediccion === 'V' ? away : 'Empate';
  const { error } = await sgClient.from('predicciones').insert({
    user_id: sgUser.id, username: sgProfile?.username || 'Usuario',
    partido, home, away, prediccion
  });
  if (error) { showToast('Error: ' + error.message); }
  else { showToast('Predicción guardada: ' + label); renderMisPreds(); switchPanelTab('preds'); }
}

// ── Render mis predicciones ───────────────────────────────────
async function renderMisPreds() {
  const box = document.getElementById('sgMisPreds');
  if (!box || !sgUser) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Cargando...</div>';
  const { data: preds } = await sgClient.from('predicciones').select('*').eq('user_id', sgUser.id).order('created_at', { ascending: false });
  if (!preds || !preds.length) {
    box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Aún no tienes predicciones. ¡Ve a "Nueva predicción"!</div>';
    updateStats(0, 0, null); return;
  }
  const resueltos = preds.filter(p => p['acertó'] !== null && p['acertó'] !== undefined);
  const aciertos  = resueltos.filter(p => p['acertó']).length;
  const pct        = resueltos.length ? Math.round(aciertos / resueltos.length * 100) : null;
  updateStats(preds.length, aciertos, pct);

  let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  preds.forEach(p => {
    const label = p.prediccion === 'L' ? p.home : p.prediccion === 'V' ? p.away : 'Empate';
    const acerto = p['acertó'];
    const badgeColor = acerto === true ? 'var(--green)' : acerto === false ? 'var(--red)' : 'var(--text3)';
    const badgeTxt   = acerto === true ? '✓ Acertó' : acerto === false ? '✗ Falló' : 'Pendiente';
    const cardClass  = acerto === true ? 'acertó-true' : acerto === false ? 'acertó-false' : '';

    let logosHtml = '';
    if (typeof logoSVG === 'function') {
      logosHtml = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        ${logoSVG(p.home,32)}<span style="font-size:11px;color:var(--text3);">vs</span>${logoSVG(p.away,32)}
      </div>`;
    }

    // Model pred if available
    let modelHtml = '';
    if (typeof eloPredict === 'function') {
      try {
        const mp = eloPredict(p.home, p.away);
        if (mp) {
          const ph = Math.round(mp.winH*100), pd2 = Math.round(mp.draw*100), pa = Math.round(mp.winA*100);
          modelHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);">
            <div style="font-size:10px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">MODELO: ${mp.marcador||''}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
              <div><div style="font-size:10px;color:var(--text3);">Local ${ph}%</div><div class="sg-bar"><div class="sg-bar-fill" style="background:var(--green);width:${ph}%;"></div></div></div>
              <div><div style="font-size:10px;color:var(--text3);">Empate ${pd2}%</div><div class="sg-bar"><div class="sg-bar-fill" style="background:var(--draw);width:${pd2}%;"></div></div></div>
              <div><div style="font-size:10px;color:var(--text3);">Visitante ${pa}%</div><div class="sg-bar"><div class="sg-bar-fill" style="background:var(--red);width:${pa}%;"></div></div></div>
            </div>
          </div>`;
        }
      } catch(e) {}
    }

    html += `<div class="sg-pred-card ${cardClass}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:6px;flex:1;">
          ${typeof logoSVG==='function' ? logoSVG(p.home,36) : ''}
          <div style="text-align:center;min-width:48px;">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;color:var(--text3);">VS</div>
          </div>
          ${typeof logoSVG==='function' ? logoSVG(p.away,36) : ''}
        </div>
        <span style="font-size:11px;font-weight:700;color:${badgeColor};white-space:nowrap;padding:3px 8px;border-radius:4px;background:${acerto===true?'rgba(0,200,100,.1)':acerto===false?'rgba(220,50,50,.1)':'rgba(255,255,255,.05)'};">${badgeTxt}</span>
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">${p.home} vs ${p.away}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:11px;color:var(--text3);">Mi predicción:</span>
        <span style="font-size:13px;font-weight:700;color:var(--accent);font-family:'Barlow Condensed',sans-serif;">${label}</span>
      </div>
      ${modelHtml}
    </div>`;
  });
  html += '</div>';
  box.innerHTML = html;
}

function updateStats(total, aciertos, pct) {
  const t = document.getElementById('sgStatTotal');
  const a = document.getElementById('sgStatAciertos');
  const p = document.getElementById('sgStatPct');
  if (t) t.textContent = total;
  if (a) a.textContent = aciertos;
  if (p) p.textContent = pct !== null ? pct + '%' : '—';
}

// ── Leaderboard ───────────────────────────────────────────────
async function renderLeaderboard() {
  const box = document.getElementById('sgLeaderboard');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Cargando...</div>';
  const { data } = await sgClient.from('predicciones').select('username, acertó').not('acertó', 'is', null);
  if (!data || !data.length) { box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Aún no hay aciertos registrados. ¡Sé el primero!</div>'; return; }
  const stats = {};
  data.forEach(r => {
    if (!stats[r.username]) stats[r.username] = { total:0, aciertos:0 };
    stats[r.username].total++;
    if (r['acertó']) stats[r.username].aciertos++;
  });
  const rows = Object.entries(stats)
    .map(([u,s]) => ({ username:u, total:s.total, aciertos:s.aciertos, pct: Math.round(s.aciertos/s.total*100) }))
    .sort((a,b) => b.pct-a.pct || b.aciertos-a.aciertos).slice(0,10);
  const medals = ['🥇','🥈','🥉'];
  let html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  rows.forEach((r,i) => {
    const isMe = sgProfile && r.username === sgProfile.username;
    html += `<div style="background:${isMe?'rgba(0,229,255,.08)':'rgba(255,255,255,.03)'};border:1px solid ${isMe?'rgba(0,229,255,.3)':'var(--border)'};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;min-width:26px;">${medals[i]||(i+1)+'°'}</span>
      <div style="flex:1;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:${isMe?'var(--accent)':'var(--text)'};">${r.username}</div>
        <div style="font-size:11px;color:var(--text3);">${r.aciertos} de ${r.total} partidos</div>
      </div>
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;color:var(--accent);">${r.pct}%</span>
    </div>`;
  });
  html += '</div>';
  box.innerHTML = html;
}

// ── Button in predictor principal ─────────────────────────────
function addSaveButtonToPredictor(home, away, pred) {
  if (!sgUser) return;
  const existing = document.getElementById('sgSaveBtn');
  if (existing) existing.remove();
  const interpret = document.getElementById('predInterpret');
  if (!interpret) return;
  const btn = document.createElement('button');
  btn.id = 'sgSaveBtn';
  btn.style.cssText = 'margin-top:12px;width:100%;background:rgba(0,229,255,.12);border:1px solid rgba(0,229,255,.3);color:var(--accent);border-radius:8px;padding:10px;font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:background .2s;';
  const label = pred === 'L' ? home : pred === 'V' ? away : 'Empate';
  btn.textContent = '⭐ Guardar mi predicción: ' + label;
  btn.onmouseover = () => btn.style.background = 'rgba(0,229,255,.25)';
  btn.onmouseout  = () => btn.style.background = 'rgba(0,229,255,.12)';
  btn.onclick = () => { guardarPrediccion(home, away, pred); btn.textContent = '✓ Predicción guardada'; btn.disabled = true; };
  interpret.parentNode.insertBefore(btn, interpret.nextSibling);
}

// ── Helpers ───────────────────────────────────────────────────
function showSgErr(msg) {
  const el = document.getElementById('sgAuthError');
  if (el) { el.textContent = msg; el.style.display = 'block'; el.style.color = 'var(--red)'; }
}
function setBtn(loading) {
  const btn = document.getElementById('sgSubmitBtn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Cargando...' : btn.dataset.label;
}
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:var(--accent);color:#000;padding:10px 22px;border-radius:10px;font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:700;z-index:9999;letter-spacing:1px;box-shadow:0 4px 20px rgba(0,0,0,.4);';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => setTimeout(initSupabase, 100));
