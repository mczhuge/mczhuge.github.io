import { PaperMesh } from './paper-mesh.js?v=6';

// Inspired by the tactile interaction of Matthias Ölschlegel's CrumpledPaperReveal.
// The mesh is original; the live profile DOM is restored as soon as the sheet settles.
const card = document.getElementById('profile-sheet');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const hoverPointer = matchMedia('(hover: hover) and (pointer: fine)');

async function initializePaper() {
  if (!card || reducedMotion.matches) return;
  const stage = document.createElement('div');
  stage.className = 'paper-stage';
  card.before(stage);
  stage.append(card);
  const canvas = document.createElement('canvas');
  canvas.className = 'paper-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const shadow = document.createElement('div');
  shadow.className = 'paper-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'paper-open';
  open.setAttribute('aria-label', "Unfold Mingchen Zhuge's profile");
  open.setAttribute('aria-controls', card.id);
  open.setAttribute('aria-expanded', 'false');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'paper-close';
  close.setAttribute('aria-label', 'Crumple profile into a paper ball');
  close.setAttribute('aria-controls', card.id);
  close.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="m5 2 8 1 4 5-2 8-8 2-5-6 3-10Z M5 2l4 7 4-6M2 12l7-3 6 7M7 18l2-9 8-1"/></svg>';
  for (const element of [canvas, shadow, open, close]) { element.hidden = true; stage.append(element); }
  let mesh, frame = 0, progress = 1, animation = null, disposed = false;
  let pointerX = 0, pointerY = 0, textureWidth = 0, textureHeight = 0;
  let capturing = false, captureAgain = false, resizeTimer = 0, focusOnFinish = false;
  let leaveTimer = 0, hoverSuppressed = false, keyboardMode = false;
  let ballX = 0, ballY = 0, ballRadius = 190;
  const originalTabIndex = card.getAttribute('tabindex');
  const listeners = new AbortController();
  const signal = listeners.signal;

  function restore() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(resizeTimer);
    clearTimeout(leaveTimer);
    listeners.abort();
    observer?.disconnect();
    mesh?.dispose();
    card.inert = false;
    card.removeAttribute('aria-hidden');
    if (originalTabIndex === null) card.removeAttribute('tabindex');
    else card.setAttribute('tabindex', originalTabIndex);
    stage.before(card);
    stage.remove();
  }

  function dimensions() {
    const rect = card.getBoundingClientRect();
    // Keep the ball in the visible part of the site's existing fixed-width layout.
    const visibleWidth = Math.min(rect.width, innerWidth - Math.max(0, rect.left));
    ballRadius = Math.min(190, visibleWidth * .42, rect.height * .29);
    ballX = Math.max(ballRadius + 8, Math.min(rect.width / 2, (innerWidth - rect.left) / 2));
    ballY = Math.min(rect.height / 2, 360);
    stage.style.setProperty('--paper-x', `${ballX}px`);
    stage.style.setProperty('--paper-y', `${ballY}px`);
    stage.style.setProperty('--paper-radius', `${ballRadius}px`);
    stage.style.setProperty('--paper-control-x', `${Math.max(100, Math.min(rect.width - 18, innerWidth - rect.left - 28))}px`);
    mesh.resize(rect.width, rect.height, Math.min(2, Math.max(1.5, devicePixelRatio || 1)), ballX, ballRadius);
    return rect;
  }

  function settled(opened) {
    animation = null;
    progress = opened ? 0 : 1;
    stage.dataset.paperState = opened ? 'open' : 'closed';
    card.inert = !opened;
    if (opened) card.removeAttribute('aria-hidden');
    else card.setAttribute('aria-hidden', 'true');
    open.hidden = opened;
    open.disabled = false;
    open.setAttribute('aria-expanded', String(opened));
    close.hidden = !opened;
    close.disabled = false;
    shadow.hidden = opened;
    shadow.style.opacity = '1';
    if (focusOnFinish) {
      if (opened) card.tabIndex = -1;
      (opened ? card : open).focus({ preventScroll: true });
    }
    focusOnFinish = false;
  }

  function draw(now) {
    frame = 0;
    if (disposed || document.hidden) return;
    if (animation) {
      const t = Math.min(1, (now - animation.start) / animation.duration);
      // Quintic easing gives the sheet a soft start and a slow, tactile settling.
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      progress = animation.from + (animation.to - animation.from) * eased;
      shadow.style.opacity = String(progress * progress);
      mesh.render(progress, pointerX, pointerY);
      if (t === 1) settled(animation.to === 0);
      else frame = requestAnimationFrame(draw);
    } else if (progress > 0) mesh.render(progress, pointerX, pointerY);
  }

  function requestDraw() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function move(to, event, trigger = 'activation') {
    if (capturing || disposed || (animation?.to ?? progress) === to) return;
    clearTimeout(leaveTimer);
    focusOnFinish = trigger === 'activation' && (event.detail === 0 || stage.contains(document.activeElement));
    stage.dataset.paperTrigger = trigger;
    stage.dataset.paperState = 'moving';
    card.inert = true;
    card.setAttribute('aria-hidden', 'true');
    open.hidden = true;
    close.hidden = true;
    shadow.hidden = false;
    animation = { from: progress, to, start: performance.now(), duration: Math.max(650, (to === 0 ? 1600 : 1500) * Math.abs(progress - to)) };
    pointerX = pointerY = 0;
    requestDraw();
  }

  async function capture() {
    if (capturing) { captureAgain = true; return; }
    capturing = true;
    captureAgain = false;
    const capturedRect = card.getBoundingClientRect();
    try {
      const texture = await window.html2canvas(card, {
        backgroundColor: '#fffdf7', scale: Math.min(2, Math.max(1.5, devicePixelRatio || 1)),
        width: capturedRect.width, height: capturedRect.height,
        windowWidth: innerWidth, windowHeight: innerHeight,
        useCORS: true, logging: false, imageTimeout: 2500,
        onclone(documentClone) {
          const clone = documentClone.getElementById(card.id);
          clone.style.cssText += ';opacity:1!important;visibility:visible!important;background:#fffdf7!important;border-radius:3px;box-shadow:none!important';
          clone.parentElement.removeAttribute('data-paper-state');
          clone.inert = false;
          // The texture needs only the profile; skip unrelated canvases and animations.
          documentClone.querySelectorAll('canvas, .paper-open, .paper-close, .paper-shadow').forEach(el => el.remove());
        }
      });
      if (disposed) return;
      if (mesh) mesh.setTexture(texture);
      else mesh = new PaperMesh(canvas, texture);
      const rect = dimensions();
      textureWidth = capturedRect.width;
      textureHeight = capturedRect.height;
      captureAgain ||= Math.abs(rect.width - textureWidth) > 1 || Math.abs(rect.height - textureHeight) > 1;
      mesh.render(progress, pointerX, pointerY);
    } finally {
      capturing = false;
      if (captureAgain && !disposed) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => capture().catch(restore), 180);
      }
    }
  }

  const observer = new ResizeObserver(() => {
    if (!mesh || disposed) return;
    const rect = dimensions();
    requestDraw();
    if (Math.abs(textureWidth - rect.width) < 1 && Math.abs(textureHeight - rect.height) < 1) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => capture().catch(restore), 180);
  });

  function holdOpen() {
    return keyboardMode || stage.contains(document.activeElement) || Boolean(window.getSelection()?.toString());
  }

  function leavePaper() {
    if (holdOpen() || (animation?.to ?? progress) === 1 || leaveTimer) return;
    leaveTimer = setTimeout(() => {
      leaveTimer = 0;
      if (!holdOpen()) move(1, { detail: 1 }, 'proximity');
    }, 800);
  }

  function followPointer(event) {
    if (!hoverPointer.matches || event.pointerType === 'touch' || disposed) return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const nearBall = Math.hypot(x - ballX, y - ballY) < ballRadius + 75;
    if (!nearBall) hoverSuppressed = false;
    if (event.buttons) return;
    if (nearBall && !hoverSuppressed && (animation?.to ?? progress) === 1) {
      keyboardMode = false;
      move(0, event, 'proximity');
    }
    if ((animation?.to ?? progress) === 0) {
      if (x > -40 && x < rect.width + 40 && y > -40 && y < rect.height + 40) {
        clearTimeout(leaveTimer); leaveTimer = 0;
      } else leavePaper();
    }
  }

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/vendor/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    await document.fonts.ready;
    await capture();
    if (reducedMotion.matches || disposed) { restore(); return; }
    canvas.hidden = false;
    settled(false);
    observer.observe(card);
    open.addEventListener('click', event => { keyboardMode = event.detail === 0; move(0, event); }, { signal });
    close.addEventListener('click', event => { hoverSuppressed = true; move(1, event); }, { signal });
    window.addEventListener('pointermove', followPointer, { signal, passive: true });
    document.documentElement.addEventListener('pointerleave', leavePaper, { signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (animation?.to ?? progress) === 0) {
        hoverSuppressed = true;
        move(1, { detail: 0 });
      }
    }, { signal });
    stage.addEventListener('keydown', event => { if (event.key === 'Tab') keyboardMode = true; }, { signal });
    stage.addEventListener('focusout', () => {
      queueMicrotask(() => { if (!stage.contains(document.activeElement)) keyboardMode = false; });
    }, { signal });
    window.addEventListener('resize', () => { dimensions(); requestDraw(); }, { signal, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else requestDraw();
    }, { signal });
    canvas.addEventListener('webglcontextlost', restore, { signal });
    reducedMotion.addEventListener('change', restore, { signal });
    window.addEventListener('beforeprint', restore, { signal });
  } catch (error) {
    console.warn('Paper reveal unavailable; showing the original profile.', error);
    restore();
  }
}

initializePaper();
