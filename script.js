// ─────────────────────────────────────────────
//  SLIDE MANAGER — teclado único, sem botões
// ─────────────────────────────────────────────
const slides    = Array.from(document.querySelectorAll('#stage .slide'));
const total     = slides.length;
let   current   = 0;
const counterEl = document.getElementById('slide-counter');

function updateCounter() {
  counterEl.innerText = `${current + 1} / ${total}`;
}

function goToSlide(idx) {
  if (idx < 0 || idx >= total) return;

  // saída: aplica classe exit no atual (vai para esquerda)
  const leaving = slides[current];
  leaving.classList.add('exit');
  leaving.classList.remove('active');
  // remove exit depois da transição (0.08 s + folga)
  setTimeout(() => leaving.classList.remove('exit'), 120);

  current = idx;
  const entering = slides[current];
  entering.classList.add('active');

  updateCounter();
  if (window.MathJax) MathJax.typesetPromise([entering]);
  initInteractiveOnActive();
}

function initInteractiveOnActive() {
  const s = slides[current];
  if (s.querySelector('.dsm-demo-container')) {
    if (!window._dsmInitialized) {
      setTimeout(() => setupDSMInteractive(s), 50);
      window._dsmInitialized = true;
    }
  } else {
    window._dsmInitialized = false;
  }
  if (window.dsmRedraw) window.dsmRedraw();
}

// navegação exclusiva por teclado
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown':
      e.preventDefault(); goToSlide(current + 1); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
      e.preventDefault(); goToSlide(current - 1); break;
    case 'Home': goToSlide(0);           break;
    case 'End':  goToSlide(total - 1);   break;
    case 'f': case 'F': toggleFullscreen(); break;
  }
});

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

function rescale() {
  const stage = document.getElementById('stage');
  const maxW  = Math.min(1280, window.innerWidth  * 0.96);
  const maxH  = window.innerHeight * 0.90;
  stage.style.width  = `${maxW}px`;
  stage.style.height = `${maxH}px`;
}
window.addEventListener('resize', () => setTimeout(rescale, 40));
document.addEventListener('fullscreenchange', rescale);

// ─────────────────────────────────────────────
//  DSM INTERACTIVE ENGINE
// ─────────────────────────────────────────────
function setupDSMInteractive(containerSlide) {
  const wrapper = containerSlide.querySelector('.dsm-demo-container');
  if (!wrapper || wrapper.hasAttribute('data-dsm-initialized')) return;
  wrapper.setAttribute('data-dsm-initialized', 'true');

  wrapper.innerHTML = `
    <div class="row g-2 align-items-start">
      <div class="col-md-6 text-center">
        <canvas id="dsmCanvas" class="dsm-canvas" width="420" height="420"></canvas>
      </div>
      <div class="col-md-6">
        <div class="d-flex gap-2 mb-2 flex-wrap">
          <button class="mode-pill" data-mode="score">📐 Score field</button>
          <button class="mode-pill" data-mode="dsm">🌀 Conditional DSM</button>
          <button class="mode-pill" data-mode="langevin">⚡ Langevin</button>
        </div>
        <div class="mb-2">
          <label class="small text-muted">Noise level σ</label>
          <input type="range" id="sigmaSliderDSM" min="0.08" max="3.8" step="0.02" value="0.5"
                 class="sigma-slider w-100">
          <div class="d-flex justify-content-between" style="font-size:0.72rem; color:#8aa0b5;">
            <span>low</span>
            <span id="sigmaValueLabel" style="color: var(--accent); font-weight:600;">0.50</span>
            <span>high</span>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <div class="metric-card">
              <span id="metricSigmaVal" class="fw-bold fs-6" style="color: var(--accent);">0.5</span><br>
              <span class="small">σ</span>
            </div>
          </div>
          <div class="col-6">
            <div class="metric-card">
              <span id="metricInfo" class="fw-bold fs-6">-</span><br>
              <span id="metricDesc" class="small">1/σ²</span>
            </div>
          </div>
        </div>
        <div id="langevinButtons" class="d-flex gap-2 mb-2" style="display:none!important">
          <button id="langevinPlayBtn"  class="btn-demo btn-demo-primary">▶ Play</button>
          <button id="langevinResetBtn" class="btn-demo">↺ Reset</button>
        </div>
        <div class="small" style="color:#8aa0b5; line-height:1.4;">
          <span class="legend-dot" style="background:#e67e22;"></span>Conditional −(x̃−x)/σ²
          &nbsp;·&nbsp;
          <span class="legend-dot" style="background:#2ecc71;"></span>True score ∇log q<sub>σ</sub>
        </div>
        <div class="mt-2-sm small" style="color:#8aa0b5;">
          ✏️ Click canvas (DSM mode) → place clean point x
        </div>
      </div>
    </div>`;

  const canvas = wrapper.querySelector('#dsmCanvas');
  const ctx    = canvas.getContext('2d');
  const W = 420, H = 420;
  canvas.width = W; canvas.height = H;

  const DOMAIN = [-12, 12], RANGE = 24;
  const MU      = [[-5, -5], [5, 5]];
  const WEIGHTS = [0.2, 0.8];

  function worldToCanvas(x, y) {
    return [(x - DOMAIN[0]) / RANGE * W,
            H - (y - DOMAIN[0]) / RANGE * H];
  }
  function canvasToWorld(px, py) {
    return [px / W * RANGE + DOMAIN[0],
            (H - py) / H * RANGE + DOMAIN[0]];
  }
  function rnorm() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function densitySmoothed(x, y, sigma) {
    const vt = 1 + sigma * sigma, denom = 2 * vt;
    let sum = 0;
    for (let k = 0; k < 2; k++) {
      const dx = x - MU[k][0], dy = y - MU[k][1];
      sum += WEIGHTS[k] * Math.exp(-(dx*dx + dy*dy) / denom) / (Math.PI * denom);
    }
    return sum;
  }
  function scoreField(x, y, sigma) {
    const vt = 1 + sigma * sigma;
    const g0 = WEIGHTS[0] * Math.exp(-((x-MU[0][0])**2+(y-MU[0][1])**2)/(2*vt));
    const g1 = WEIGHTS[1] * Math.exp(-((x-MU[1][0])**2+(y-MU[1][1])**2)/(2*vt));
    const d = g0 + g1;
    if (d < 1e-12) return [0, 0];
    const f = 1 / vt;
    return [(g0*(MU[0][0]-x) + g1*(MU[1][0]-x))/d*f,
            (g0*(MU[0][1]-y) + g1*(MU[1][1]-y))/d*f];
  }

  function drawHeatmap(sigma) {
    const imgData = ctx.createImageData(W, H);
    let maxD = 0;
    const dens = new Float32Array(W * H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const [x, y] = canvasToWorld(px, py);
      const d = densitySmoothed(x, y, sigma);
      dens[py*W+px] = d;
      if (d > maxD) maxD = d;
    }
    for (let i = 0; i < W*H; i++) {
      let t = maxD > 1e-8 ? dens[i]/maxD : 0;
      t = Math.pow(t, 0.55);
      imgData.data[i*4]   = Math.round(248 - 55*t);
      imgData.data[i*4+1] = Math.round(250 - 80*t);
      imgData.data[i*4+2] = Math.round(255 - 60*t);
      imgData.data[i*4+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function drawScoreVectors(sigma) {
    const step = RANGE / 14;
    ctx.save();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#8faabf';
    ctx.fillStyle   = '#8faabf';
    for (let i = 0; i <= 14; i++) for (let j = 0; j <= 14; j++) {
      const x = DOMAIN[0] + i*step, y = DOMAIN[0] + j*step;
      const [sx, sy] = scoreField(x, y, sigma);
      const norm = Math.hypot(sx, sy);
      if (norm < 0.02) continue;
      const [px, py] = worldToCanvas(x, y);
      const len = Math.min(22, 5 + norm*2);
      const dirX = sx/norm, dirY = -sy/norm;
      const ex = px + dirX*len, ey = py + dirY*len;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
      const ang = Math.atan2(ey-py, ex-px);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 4.5*Math.cos(ang-0.5), ey - 4.5*Math.sin(ang-0.5));
      ctx.lineTo(ex - 4.5*Math.cos(ang+0.5), ey - 4.5*Math.sin(ang+0.5));
      ctx.fill();
    }
    ctx.restore();
  }

  function drawModes() {
    MU.forEach(([x, y], idx) => {
      const [cx, cy] = worldToCanvas(x, y);
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 2*Math.PI);
      ctx.fillStyle = idx === 0 ? '#f0b27a' : '#e28413'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter';
      ctx.fillText(idx === 0 ? 'μ₁' : 'μ₂', cx - 12, cy - 6);
    });
  }

  function generateNoisyPoint(xc, yc, sigma) {
    return [xc + sigma*rnorm(), yc + sigma*rnorm()];
  }

  const state = {
    mode: 'score', sigma: 0.5, dsmActivePoint: null,
    particles: [], langStep: 0, langPlaying: false, langSched: []
  };

  function buildLangevinSchedule() {
    const s = [];
    for (let i = 0; i < 320; i++) {
      const t = i / 319;
      s.push(3.8 * Math.pow(0.08/3.8, t));
    }
    return s;
  }
  function initLangevin() {
    state.particles = [];
    for (let i = 0; i < 48; i++)
      state.particles.push({ x: (Math.random()*2-1)*10, y: (Math.random()*2-1)*10 });
    state.langStep = 0;
  }
  function stepLangevin() {
    if (!state.langPlaying || !state.langSched.length) return;
    if (state.langStep >= state.langSched.length) {
      state.langPlaying = false;
      const btn = wrapper.querySelector('#langevinPlayBtn');
      if (btn) btn.textContent = '▶ Play';
      return;
    }
    const sig  = state.langSched[state.langStep];
    const alph = 0.8 * Math.pow(sig/3.8, 2);
    const ns   = Math.sqrt(2*alph);
    for (const p of state.particles) {
      const [sx, sy] = scoreField(p.x, p.y, sig);
      p.x = Math.min(11.5, Math.max(-11.5, p.x + (alph/2)*sx + ns*rnorm()));
      p.y = Math.min(11.5, Math.max(-11.5, p.y + (alph/2)*sy + ns*rnorm()));
    }
    state.langStep++;
  }

  function render() {
    if (state.mode === 'langevin' && state.langPlaying) stepLangevin();

    const displaySigma = (state.mode === 'langevin' && state.langSched.length)
      ? state.langSched[Math.min(state.langStep, state.langSched.length-1)]
      : state.sigma;

    drawHeatmap(displaySigma);
    drawScoreVectors(displaySigma);
    drawModes();

    // DSM mode: ponto limpo + ruidoso + setas
    if (state.mode === 'dsm' && state.dsmActivePoint) {
      const { x_clean, y_clean, x_noisy, y_noisy } = state.dsmActivePoint;
      const [pxc, pyc] = worldToCanvas(x_clean, y_clean);
      const [pxn, pyn] = worldToCanvas(x_noisy, y_noisy);

      // ponto limpo
      ctx.beginPath(); ctx.arc(pxc, pyc, 7, 0, 2*Math.PI);
      ctx.fillStyle = '#e2b86b'; ctx.fill();
      // ponto ruidoso
      ctx.beginPath(); ctx.arc(pxn, pyn, 6, 0, 2*Math.PI);
      ctx.fillStyle = '#f28b56'; ctx.fill();

      // seta condicional laranja
      const csx = -(x_noisy-x_clean)/(state.sigma**2);
      const csy = -(y_noisy-y_clean)/(state.sigma**2);
      const nc  = Math.hypot(csx, csy);
      if (nc > 0.02) {
        const len = Math.min(50, 10+nc*2);
        const ex  = pxn + (csx/nc)*len, ey = pyn + -(csy/nc)*len;
        ctx.beginPath(); ctx.moveTo(pxn, pyn); ctx.lineTo(ex, ey);
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2.2; ctx.stroke();
        const ang = Math.atan2(ey-pyn, ex-pxn);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 6*Math.cos(ang-0.5), ey - 6*Math.sin(ang-0.5));
        ctx.lineTo(ex - 6*Math.cos(ang+0.5), ey - 6*Math.sin(ang+0.5));
        ctx.fillStyle = '#e67e22'; ctx.fill();
      }

      // seta verdadeira verde
      const [tsx, tsy] = scoreField(x_noisy, y_noisy, state.sigma);
      const nt = Math.hypot(tsx, tsy);
      if (nt > 0.02) {
        const len = Math.min(40, 8+nt*2.5);
        const ex  = pxn + (tsx/nt)*len, ey = pyn + -(tsy/nt)*len;
        ctx.beginPath(); ctx.moveTo(pxn, pyn); ctx.lineTo(ex, ey);
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // Langevin: partículas
    if (state.mode === 'langevin') {
      for (const p of state.particles) {
        const [cx, cy] = worldToCanvas(p.x, p.y);
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2*Math.PI);
        ctx.fillStyle = '#4a9eda'; ctx.fill();
      }
    }

    // métricas HUD
    const sigShow = (state.mode === 'langevin' && state.langSched.length && state.langStep < state.langSched.length)
      ? state.langSched[state.langStep].toFixed(2)
      : state.sigma.toFixed(2);
    const mSig  = wrapper.querySelector('#metricSigmaVal');
    const mInfo = wrapper.querySelector('#metricInfo');
    if (mSig)  mSig.innerText  = sigShow;
    if (mInfo) mInfo.innerText = state.mode === 'dsm' ? (1/(state.sigma**2)).toFixed(2) : '—';

    requestAnimationFrame(render);
  }

  // controles
  const sigSlider = wrapper.querySelector('#sigmaSliderDSM');
  const sigLabel  = wrapper.querySelector('#sigmaValueLabel');
  sigSlider.addEventListener('input', e => {
    state.sigma = parseFloat(e.target.value);
    if (sigLabel) sigLabel.innerText = state.sigma.toFixed(2);
    if (state.mode === 'dsm' && state.dsmActivePoint) {
      const { x_clean, y_clean } = state.dsmActivePoint;
      const [nx, ny] = generateNoisyPoint(x_clean, y_clean, state.sigma);
      state.dsmActivePoint.x_noisy = nx;
      state.dsmActivePoint.y_noisy = ny;
    }
  });

  wrapper.querySelectorAll('.mode-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-mode');
      wrapper.querySelectorAll('.mode-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const langDiv = wrapper.querySelector('#langevinButtons');
      if (state.mode === 'langevin') {
        langDiv.style.setProperty('display', 'flex', 'important');
        if (!state.langSched.length) { state.langSched = buildLangevinSchedule(); initLangevin(); }
      } else {
        langDiv.style.setProperty('display', 'none', 'important');
      }
    });
  });

  canvas.addEventListener('click', e => {
    if (state.mode !== 'dsm') return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    let mx = (e.clientX - rect.left)*sx, my = (e.clientY - rect.top)*sy;
    mx = Math.min(W-1, Math.max(1, mx));
    my = Math.min(H-1, Math.max(1, my));
    const [xc, yc] = canvasToWorld(mx, my);
    const [xn, yn] = generateNoisyPoint(xc, yc, state.sigma);
    state.dsmActivePoint = { x_clean: xc, y_clean: yc, x_noisy: xn, y_noisy: yn };
  });

  const playBtn  = wrapper.querySelector('#langevinPlayBtn');
  const resetBtn = wrapper.querySelector('#langevinResetBtn');
  if (playBtn) playBtn.onclick = () => {
    state.langPlaying = !state.langPlaying;
    playBtn.textContent = state.langPlaying ? '⏸ Pause' : '▶ Play';
    if (state.langPlaying && state.langStep >= state.langSched.length) {
      state.langSched = buildLangevinSchedule(); initLangevin();
    }
  };
  if (resetBtn) resetBtn.onclick = () => {
    state.langPlaying = false;
    if (playBtn) playBtn.textContent = '▶ Play';
    initLangevin();
  };

  state.langSched = buildLangevinSchedule();
  initLangevin();
  render();
  window.dsmRedraw = () => {};
}

// ── arranque ──
rescale();
updateCounter();
setTimeout(() => initInteractiveOnActive(), 60);