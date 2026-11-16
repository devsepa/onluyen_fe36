// Ambient Background combining Concept 1 (Aurora Waves Flow) and Concept 2 (Floating Stardust Particles)
export function setupAmbientBackground() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function ensureElements() {
    let bg = document.getElementById('appAmbientBg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'appAmbientBg';
      bg.className = 'app-ambient-bg';
      bg.setAttribute('aria-hidden', 'true');
      bg.innerHTML = `
        <div class="aurora-stream aurora-1"></div>
        <div class="aurora-stream aurora-2"></div>
        <div class="aurora-stream aurora-3"></div>
        <canvas class="stardust-canvas" id="stardustCanvas"></canvas>
      `;
      if (document.body) {
        document.body.prepend(bg);
      }
    }
    let canvas = document.getElementById('stardustCanvas');
    if (!canvas && bg) {
      canvas = document.createElement('canvas');
      canvas.id = 'stardustCanvas';
      canvas.className = 'stardust-canvas';
      bg.appendChild(canvas);
    }
    return { bg, canvas };
  }

  const { bg, canvas } = ensureElements();
  if (!canvas) return;
  if (canvas.ambientControls) return canvas.ambientControls;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let animId = null;
  let width = 0;
  let height = 0;
  let particles = [];

  function isDarkTheme() { return true; }

  function resize() {
    const w = window.innerWidth || document.documentElement.clientWidth || 1280;
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    if (width === w && height === h && particles.length > 0) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    initParticles();
  }

  function initParticles() {
    const count = Math.max(30, Math.min(52, Math.round(width / 30)));
    const colors = isDarkTheme()
      ? ['#818cf8', '#38bdf8', '#fbbf24', '#c084fc', '#34d399', '#f472b6']
      : ['#6366f1', '#0284c7', '#d97706', '#9333ea', '#059669', '#db2777'];

    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 0.65,
      vy: -0.5 - Math.random() * 0.65,
      baseAlpha: Math.random() * 0.3 + 0.22,
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.018 + Math.random() * 0.03
    }));
  }

  function renderFrame() {
    ctx.clearRect(0, 0, width, height);
    const dark = isDarkTheme();

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.phase += p.pulseSpeed;

      const alphaPulse = p.baseAlpha + Math.sin(p.phase) * 0.22;
      const alpha = Math.max(0.12, Math.min(0.95, alphaPulse));

      // Boundary wraps
      if (p.y < -12) {
        p.y = height + 12;
        p.x = Math.random() * width;
      }
      if (p.x < -12) p.x = width + 12;
      if (p.x > width + 12) p.x = -12;

      ctx.save();
      ctx.globalAlpha = dark ? alpha : alpha * 0.8;
      ctx.fillStyle = p.color;

      if (dark && p.r > 1.2) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function loop() {
    if (document.hidden) { animId = null; return; }
    renderFrame();
    animId = window.requestAnimationFrame(loop);
  }

  function start() {
    if (animId || document.hidden) return;
    animId = window.requestAnimationFrame(loop);
  }

  function stop() {
    if (animId) {
      window.cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function syncMotion() {
    document.documentElement.setAttribute?.('data-background-motion', 'on');
    stop();
    start();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  window.addEventListener('resize', () => {
    resize();
    renderFrame();
  }, { passive: true });

  const observer = new MutationObserver(records => {
    if(records.some(record => record.attributeName === 'data-theme')) { initParticles(); renderFrame(); }
    syncMotion();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });


  // Initial render
  resize();
  syncMotion();

  canvas.ambientControls = { stop, start, resize };
  return canvas.ambientControls;
}

// Auto-run if loaded via script tag or when DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setupAmbientBackground());
  } else {
    setTimeout(setupAmbientBackground, 0);
  }
}
