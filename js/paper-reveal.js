import { createPaperProgress } from './paper-progress.js?v=paper-foreground-1';

// A decorative paper timeline unfolds into the original, fully interactive profile.
const card = document.getElementById('profile-sheet');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const hoverPointer = matchMedia('(hover: hover) and (pointer: fine)');

async function initializePaper() {
  if (!card || reducedMotion.matches) return;
  const listeners = new AbortController();
  const { signal } = listeners;
  let disposed = false, automaticReveal = true, automaticTrigger = null;
  let showAutomatically = null, updateCamera = null, isNearFigure = null;
  let automaticTimer;
  // Start with the page. A deadline reached while assets load keeps the native
  // profile visible; movement elsewhere restarts the ten-second idle interval.
  scheduleAutomaticReveal();

  function scheduleAutomaticReveal() {
    if (disposed || !automaticReveal) return;
    clearTimeout(automaticTimer);
    automaticTimer = setTimeout(() => requestAutomaticReveal('idle', { detail: 1 }), 10000);
  }

  function cancelAutomaticReveal() {
    automaticReveal = false;
    clearTimeout(automaticTimer);
  }

  function requestAutomaticReveal(trigger, event) {
    if (disposed || !automaticReveal) return;
    automaticTrigger = trigger;
    cancelAutomaticReveal();
    showAutomatically?.(event, trigger);
  }

  window.addEventListener('pointermove', event => {
    if (disposed) return;
    if (event.pointerType === 'mouse' && automaticReveal && isNearFigure?.(event)) {
      requestAutomaticReveal('proximity', event);
    } else scheduleAutomaticReveal();
    if (event.pointerType === 'mouse') updateCamera?.(event);
  }, { signal, passive: true });

  // The alternative stays opt-in while the two compositions are being reviewed.
  const spiralPreview = new URLSearchParams(location.search).get('paper') === 'spiral';
  let scene;
  try {
    if (spiralPreview) {
      const [module] = await Promise.all([
        import('./paper-spiral.js?v=paper-foreground-1'),
        new Promise((resolve, reject) => {
          const style = document.createElement('link');
          style.rel = 'stylesheet';
          style.href = new URL('../css/paper-spiral.css?v=paper-foreground-1', import.meta.url).href;
          style.onload = resolve;
          style.onerror = () => { style.remove(); reject(new Error('Paper sculpture stylesheet unavailable')); };
          document.head.append(style);
        }),
      ]);
      scene = module.createPaperSpiral();
      const camera = document.createElement('div');
      camera.className = 'paper-spiral-camera';
      while (scene.firstChild) camera.append(scene.firstChild);
      scene.append(camera);
    } else scene = createPaperProgress();
  } catch (error) {
    disposed = true;
    cancelAutomaticReveal();
    listeners.abort();
    console.warn('Paper sculpture unavailable; showing the original profile.', error);
    return;
  }
  if (reducedMotion.matches) {
    disposed = true;
    cancelAutomaticReveal();
    listeners.abort();
    return;
  }
  const stage = document.createElement('div');
  stage.className = 'paper-stage';
  stage.dataset.paperVariant = spiralPreview ? 'spiral' : 'timeline';
  card.before(stage);
  stage.append(card);
  const art = document.createElement('div');
  art.className = 'paper-art';
  art.append(scene);
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'paper-open';
  open.setAttribute('aria-label', "Unfold Mingchen Zhuge's profile");
  open.setAttribute('aria-controls', card.id);
  open.setAttribute('aria-expanded', 'false');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'paper-close';
  close.setAttribute('aria-label', 'Return to the paper timeline');
  close.setAttribute('aria-controls', card.id);
  close.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="m3 14 5-2 4-2 5-2M3 14v3l5-2v-3m0 3 4-2v-3m0 3 5-2V8M3 8V5h4M3 5l5 5"/></svg>';
  for (const element of [art, open, close]) { element.hidden = true; stage.append(element); }

  let opened = false, targetOpen = false, moving = false;
  let transitions = [], version = 0;
  let paperX = 0, paperY = 0, artScale = 1;
  const originalTabIndex = card.getAttribute('tabindex');
  const motionControl = document.querySelector('[data-rsi-motion]');
  const observer = new ResizeObserver(dimensions);
  const motionObserver = new MutationObserver(updateMotion);

  function updateMotion() {
    stage.dataset.motionPaused = String(document.hidden || moving || opened || motionControl?.getAttribute('aria-pressed') === 'true');
  }

  function restore() {
    if (disposed) return;
    disposed = true;
    version++;
    transitions.forEach(animation => animation.cancel());
    cancelAutomaticReveal();
    showAutomatically = updateCamera = isNearFigure = null;
    listeners.abort();
    observer.disconnect();
    motionObserver.disconnect();
    card.inert = false;
    card.removeAttribute('aria-hidden');
    if (originalTabIndex === null) card.removeAttribute('tabindex');
    else card.setAttribute('tabindex', originalTabIndex);
    stage.before(card);
    stage.remove();
  }

  function dimensions() {
    if (disposed) return;
    const rect = stage.getBoundingClientRect();
    // Center the artwork in the visible part of the site's fixed-width layout.
    const visibleWidth = Math.max(180, Math.min(rect.width, innerWidth - Math.max(0, rect.left)));
    artScale = Math.min(1.12, (visibleWidth - 66) / 940);
    paperX = Math.max(90, Math.min(rect.width / 2, (innerWidth - rect.left) / 2));
    paperY = Math.min(rect.height / 2, 350);
    stage.style.setProperty('--paper-x', `${paperX}px`);
    stage.style.setProperty('--paper-y', `${paperY}px`);
    stage.style.setProperty('--art-scale', String(artScale));
    stage.style.setProperty('--art-width', `${900 * artScale}px`);
    stage.style.setProperty('--art-height', `${(spiralPreview ? 570 : 360) * artScale}px`);
    stage.style.setProperty('--paper-control-x', `${Math.max(100, Math.min(rect.width - 18, innerWidth - rect.left - 28))}px`);
  }

  function settled(nextOpen, focus) {
    opened = targetOpen = nextOpen;
    moving = false;
    stage.dataset.paperState = nextOpen ? 'open' : 'closed';
    card.inert = !nextOpen;
    if (nextOpen) card.removeAttribute('aria-hidden');
    else card.setAttribute('aria-hidden', 'true');
    art.hidden = nextOpen;
    open.hidden = nextOpen;
    open.setAttribute('aria-expanded', String(nextOpen));
    close.hidden = !nextOpen;
    transitions.forEach(animation => animation.cancel());
    transitions = [];
    updateMotion();
    if (focus) {
      if (nextOpen) card.tabIndex = -1;
      (nextOpen ? card : open).focus({ preventScroll: true });
    }
  }

  function move(nextOpen, event, trigger = 'activation') {
    if (disposed || targetOpen === nextOpen) return;
    // Automatic reveal happens only once. Explicit replay stays under the
    // visitor's control, even when the pointer moves or the old deadline passes.
    cancelAutomaticReveal();
    const focusOrigin = document.activeElement;
    const focus = trigger === 'activation' && (event.detail === 0 || stage.contains(focusOrigin));
    const fromCard = getComputedStyle(card), fromScene = getComputedStyle(scene);
    const cardStart = { opacity: fromCard.opacity, transform: fromCard.transform };
    const sceneStart = { opacity: fromScene.opacity, transform: fromScene.transform };
    transitions.forEach(animation => animation.cancel());
    const currentVersion = ++version;
    targetOpen = nextOpen;
    moving = true;
    stage.dataset.paperTrigger = trigger;
    stage.dataset.paperState = 'moving';
    card.inert = true;
    card.setAttribute('aria-hidden', 'true');
    open.hidden = close.hidden = true;
    art.hidden = false;
    updateMotion();
    const timing = { duration: 1150, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both' };
    const cardEnd = { opacity: nextOpen ? 1 : 0, transform: nextOpen ? 'none' : 'translateY(48px) rotateX(12deg) scale(.9)' };
    const sceneEnd = { opacity: nextOpen ? 0 : 1, transform: nextOpen ? 'translateY(70px) rotateX(76deg) scale(.84)' : 'none' };
    transitions = [
      card.animate([cardStart, cardEnd], { ...timing, delay: nextOpen ? 150 : 0 }),
      scene.animate([sceneStart, sceneEnd], { ...timing, duration: nextOpen ? 750 : 1200, delay: nextOpen ? 0 : 120 }),
    ];
    Promise.all(transitions.map(animation => animation.finished)).then(() => {
      if (!disposed && version === currentVersion) {
        const focusUnchanged = document.activeElement === focusOrigin || document.activeElement === document.body;
        settled(nextOpen, focus && focusUnchanged);
      }
    }).catch(() => { /* A reversed reveal or cleanup cancels the previous transition. */ });
  }

  updateCamera = event => {
    if (!spiralPreview || !hoverPointer.matches || disposed || targetOpen || stage.dataset.motionPaused === 'true') return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    scene.style.setProperty('--look-y', `${Math.max(-3, Math.min(3, (x - paperX) / 130))}deg`);
    scene.style.setProperty('--look-x', `${Math.max(-2, Math.min(2, (paperY - y) / 150))}deg`);
  };

  try {
    // A failed asset leaves the ordinary profile visible and usable.
    await Promise.all([...scene.querySelectorAll('img')].map(image => image.decode()));
    if (disposed || reducedMotion.matches) { restore(); return; }
    dimensions();
    const initiallyOpen = automaticTrigger !== null || card.contains(document.activeElement);
    settled(initiallyOpen, false);
    if (initiallyOpen) cancelAutomaticReveal();
    if (automaticTrigger) stage.dataset.paperTrigger = automaticTrigger;
    showAutomatically = (event, trigger) => move(true, event, trigger);
    const figures = [...scene.querySelectorAll('.paper-progress-figure')];
    isNearFigure = event => {
      if (disposed || targetOpen || moving || art.hidden) return false;
      const margin = Math.max(12, Math.min(24, 20 * artScale));
      // Use each moving cutout's projected bounds, not the large scene/button
      // rectangle. This also follows camera motion, scrolling and viewport size.
      return figures.some(figure => {
        const rect = figure.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          event.clientX >= rect.left - margin && event.clientX <= rect.right + margin &&
          event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin;
      });
    };
    observer.observe(card);
    if (motionControl) motionObserver.observe(motionControl, { attributes: true, attributeFilter: ['aria-pressed'] });
    open.addEventListener('click', event => {
      if (event.detail === 0 || isNearFigure(event)) move(true, event);
    }, { signal });
    close.addEventListener('click', event => move(false, event), { signal });
    window.addEventListener('resize', dimensions, { signal, passive: true });
    window.addEventListener('scroll', dimensions, { signal, passive: true });
    document.addEventListener('visibilitychange', updateMotion, { signal });
    reducedMotion.addEventListener('change', restore, { signal });
    window.addEventListener('beforeprint', restore, { signal });
  } catch (error) {
    console.warn('Paper timeline unavailable; showing the original profile.', error);
    restore();
  }
}

initializePaper();
