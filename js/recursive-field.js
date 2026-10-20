import { World } from './sharks/world.js';
import { AsciiRenderer } from './sharks/renderer.js';

// A quiet, growing ASCII ecosystem behind the original homepage.
const canvas = document.getElementById('rsi-background-canvas');
const wrapper = canvas?.closest('.rsi-background');
const control = document.querySelector('[data-rsi-motion]');

function initializeOcean() {
  if (!canvas || !wrapper) return;
  let renderer;
  try { renderer = new AsciiRenderer(canvas); } catch (_) { return; }
  const world = new World([
    { kind: 'classic', size: 1 },
    { kind: 'hammerhead', size: 0.74 },
    { kind: 'mako', size: 0.61 },
    { kind: 'thresher', size: 0.86 },
    { kind: 'tiger', size: 0.56 },
    { kind: 'mako', size: 0.48 },
    { kind: 'hammerhead', size: 0.62 }
  ], window.innerWidth < 600 ? 42 : 70);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const STEP = 1 / 60;
  let frame = 0, resizeFrame = 0, last = 0, accumulator = 0, paused = false;
  let previousWidth = 0, previousHeight = 0;

  function updateControl() {
    if (!control) return;
    control.hidden = reducedMotion.matches;
    control.textContent = paused ? 'Resume' : 'Pause';
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', paused ? 'Resume background animation' : 'Pause background animation');
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; last = 0; accumulator = 0;
  }
  function schedule() {
    if (frame || paused || reducedMotion.matches || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(animate);
  }
  function animate(now) {
    frame = 0;
    if (paused || reducedMotion.matches || document.hidden) return;
    // Render at 30 fps; keep motion and biological growth on a fixed timestep.
    const elapsed = (now - last) / 1000;
    if (elapsed >= 1 / 30 - 0.001) {
      const dt = Math.min(0.1, elapsed);
      last = now; accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 6) {
        world.step(STEP); accumulator -= STEP; steps++;
      }
      if (steps === 6) accumulator = 0;
      renderer.render(world, dt);
    }
    frame = requestAnimationFrame(animate);
  }
  function resize() {
    resizeFrame = 0;
    const box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    if (box.width !== previousWidth || box.height !== previousHeight) {
      previousWidth = box.width; previousHeight = box.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (box.width * box.height)));
      renderer.resize(box.width, box.height, dpr);
      world.resize(box.width, box.height, renderer.cellWidth, renderer.cellHeight);
    } else renderer.updateReadingArea();
    renderer.render(world, 0);
    wrapper.classList.add('is-ready');
    schedule();
  }
  function requestResize() {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resize);
  }
  function clearPointer() { world.pointer.active = false; }

  control?.addEventListener('click', () => {
    paused = !paused; clearPointer();
    updateControl();
    if (paused) stop(); else schedule();
  });
  reducedMotion.addEventListener('change', () => {
    clearPointer(); updateControl(); stop();
    if (!reducedMotion.matches) schedule();
  });
  document.addEventListener('visibilitychange', () => {
    clearPointer();
    if (document.hidden) stop(); else schedule();
  });
  window.addEventListener('pointermove', event => {
    if (paused || reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
    world.pointer.x = event.clientX; world.pointer.y = event.clientY; world.pointer.active = true;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', clearPointer);
  window.addEventListener('blur', clearPointer);
  window.addEventListener('resize', requestResize, { passive: true });
  window.addEventListener('scroll', requestResize, { passive: true });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('load', requestResize, { once: true });
  updateControl(); resize();
}

initializeOcean();
