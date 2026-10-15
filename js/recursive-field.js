(() => {
  'use strict';

  function initializeBackground() {
    const canvas = document.getElementById('rsi-background-canvas');
    const wrapper = canvas && canvas.closest('.rsi-background');
    const motionControl = document.querySelector('[data-rsi-motion]');
    let ctx;
    try { ctx = canvas && canvas.getContext('2d', { alpha: true }); } catch (_) {}
    if (!ctx || !wrapper) return;

    const TAU = Math.PI * 2;
    const MAX_ACTIVE = 112;
    const MAX_TOTAL = 134;
    const MAX_EDGES = 256;
    const GROW_TIME = 1.05;
    const FADE_TIME = 4;
    const COLORS = ['151, 151, 149', '121, 121, 119'];
    const LIGHT = { x: -0.45, y: -0.60, z: 0.66 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const scenes = [];
    const connections = [];
    let waves = [];
    let contact = null, phase = 'growing', nextWave = Infinity, pulseCount = 0;
    let width = 0, height = 0, worldScale = 1, halfX = 1, halfY = 1;
    let time = 0, frame = 0, lastFrame = 0;
    let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
    let paused = false, seed = 76193, serial = 0, discoveries = 0;
    let readingBounds = null, photoBounds = null;
    let scrollPosition = window.scrollY;

    function random() {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    }
    function smooth(a, b, value) {
      const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function unit(x, y, z) {
      const length = Math.hypot(x, y, z) || 1;
      return { x: x / length, y: y / length, z: z / length };
    }
    function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    function worldPoint(u, v, z = 0) { return { x: (u * 2 - 1) * halfX, y: (v * 2 - 1) * halfY, z }; }
    // One matte, softly lit material is shared by all spheres.
    function sphereMaterial() {
      const surface = document.createElement('canvas');
      surface.width = 80; surface.height = 80;
      const painter = surface.getContext('2d');
      const pixels = painter.createImageData(80, 80);
      for (let y = 0; y < 80; y += 1) {
        for (let x = 0; x < 80; x += 1) {
          const u = (x + 0.5 - 40) / 40, v = (y + 0.5 - 40) / 40;
          const r = Math.hypot(u, v);
          if (r >= 1) continue;
          const z = Math.sqrt(1 - r * r);
          const light = Math.max(0, u * LIGHT.x + v * LIGHT.y + z * LIGHT.z);
          const shade = Math.round(207 + Math.pow(light, 0.8) * 48 - Math.pow(1 - z, 3) * 5);
          const i = (y * 80 + x) * 4;
          pixels.data[i] = shade; pixels.data[i + 1] = shade; pixels.data[i + 2] = shade;
          pixels.data[i + 3] = Math.round(Math.min(1, (1 - r) * 40) * 255);
        }
      }
      painter.putImageData(pixels, 0, 0);
      return surface;
    }
    const sphereSurface = sphereMaterial();
    function updateReadingBounds() {
      const details = document.querySelector('.about-details');
      const first = details && details.querySelector('p');
      const photo = document.querySelector('.about-photo');
      if (first) {
        const box = details.getBoundingClientRect();
        readingBounds = { left: box.left, right: box.right, top: first.getBoundingClientRect().top, bottom: box.bottom };
      }
      photoBounds = photo && photo.getBoundingClientRect();
    }
    function visibilityAt(x, y) {
      const side = smooth(0.30, 0.88, Math.abs(x / width - 0.5) * 2);
      const top = (1 - smooth(0.015, 0.27, y / height)) * 0.80;
      const bottom = smooth(0.74, 1.03, y / height) * 0.64;
      let result = 0.055 + Math.max(side, top, bottom) * 0.945;
      if (readingBounds) {
        const b = readingBounds;
        const inside = smooth(b.left - 25, b.left + 10, x)
          * (1 - smooth(b.right - 10, b.right + 25, x))
          * smooth(b.top - 18, b.top + 12, y)
          * (1 - smooth(b.bottom - 12, b.bottom + 24, y));
        result *= 1 - inside * 0.89;
      }
      return result;
    }
    function discoveryVisibility(p) {
      if (p.x < 12 || p.x > width - 14 || p.y < 14 || p.y > height - 20) return 0;
      if (photoBounds && p.x > photoBounds.left - 8 && p.x < photoBounds.right + 8
        && p.y > photoBounds.top - 8 && p.y < photoBounds.bottom + 8) return 0;
      return visibilityAt(p.x, p.y);
    }

    // Both colonies inhabit one 3D space, so contact is physical, not screen overlap.
    function updateCamera() {
      const yaw = Math.sin(time * 0.055) * 0.115 + pointerX * 0.15;
      const pitch = Math.sin(time * 0.045 + 0.4) * 0.065 + pointerY * 0.09;
      const roll = Math.sin(scrollPosition * 0.0005) * 0.012;
      for (const scene of scenes) {
        scene.cx = width * 0.5; scene.cy = height * 0.5; scene.scale = worldScale;
        scene.cYaw = Math.cos(yaw); scene.sYaw = Math.sin(yaw);
        scene.cPitch = Math.cos(pitch); scene.sPitch = Math.sin(pitch);
        scene.cRoll = Math.cos(roll); scene.sRoll = Math.sin(roll);
      }
    }
    function project(p, scene) {
      const x = p.x * scene.cYaw - p.z * scene.sYaw;
      const z = p.x * scene.sYaw + p.z * scene.cYaw;
      const y = p.y * scene.cPitch - z * scene.sPitch;
      const depth = p.y * scene.sPitch + z * scene.cPitch;
      const perspective = 3.7 / (3.7 - depth);
      const viewX = x * scene.cRoll - y * scene.sRoll;
      const viewY = x * scene.sRoll + y * scene.cRoll;
      return {
        x: scene.cx + viewX * scene.scale * perspective,
        y: scene.cy + viewY * scene.scale * perspective,
        z: depth, viewX, viewY, scale: scene.scale * perspective
      };
    }
    function fade(node) {
      return node.retiring === null ? 1 : 1 - smooth(0, FADE_TIME, time - node.retiring);
    }
    function appearance(node) { return smooth(0.62, GROW_TIME, time - node.born) * fade(node); }

    function addNode(scene, position, parent, born) {
      const roll = random();
      const node = {
        id: serial++, colony: scene.index, x: position.x, y: position.y, z: position.z,
        heading: parent ? unit(position.x - parent.x, position.y - parent.y, position.z - parent.z) : unit(scene.index ? -1 : 1, scene.index ? 0.4 : -0.4, 0.1),
        born, touched: born, retiring: null, degree: 0, protected: false,
        kind: roll < 0.55 ? 0 : roll < 0.80 ? 1 : 2,
        radius: 0.009 + random() * 0.007,
        phase: random() * TAU, flash: -100, chargeAt: -100, projected: null
      };
      if (node.kind) node.radius *= 1.30;
      scene.nodes.push(node);
      if (parent) addEdge(scene, parent, node, born, false);
      return node;
    }
    function addEdge(scene, a, b, born, bridge, crossColony = false) {
      const pool = crossColony ? connections : scene.edges;
      if (pool.length >= (crossColony ? 1 : MAX_EDGES)) return null;
      const direction = unit(b.x - a.x, b.y - a.y, b.z - a.z);
      const perpendicular = unit(-direction.y + random() * 0.2, direction.x, random() * 0.9 - 0.45);
      const bend = distance(a, b) * (bridge ? 0.20 : 0.12);
      const edge = { a, b, born, bridge, crossColony,
        bend: { x: perpendicular.x * bend, y: perpendicular.y * bend, z: perpendicular.z * bend } };
      pool.push(edge); a.degree += 1; b.degree += 1;
      a.touched = Math.max(a.touched, born); b.touched = Math.max(b.touched, born);
      return edge;
    }
    function candidate(scene, parent, preferVisible, initial = false) {
      let best = null, bestScore = -Infinity;
      const outward = unit(parent.x - scene.origin.x, parent.y - scene.origin.y, parent.z - scene.origin.z);
      for (let i = 0; i < 16; i += 1) {
        const d = unit(parent.heading.x * 0.42 + outward.x * 0.30 + random() * 2 - 1,
          parent.heading.y * 0.42 + outward.y * 0.30 + random() * 2 - 1,
          parent.heading.z * 0.25 - parent.z * 0.5 + random() * 1.4 - 0.7);
        const step = (initial ? 0.10 : 0.14) + random() * (initial ? 0.12 : 0.15);
        const p = { x: parent.x + d.x * step, y: parent.y + d.y * step, z: parent.z + d.z * step };
        if (Math.abs(p.x) > halfX * 0.97 || Math.abs(p.y) > halfY * 0.95 || Math.abs(p.z) > 0.54) continue;
        if (initial && distance(p, scene.origin) > 0.43) continue;
        let nearest = Infinity;
        for (const colony of scenes.length ? scenes : [scene]) {
          for (const node of colony.nodes) if (node.retiring === null) nearest = Math.min(nearest, distance(node, p));
        }
        // The second seed colony has not yet been inserted into scenes.
        if (!scenes.includes(scene)) {
          for (const node of scene.nodes) nearest = Math.min(nearest, distance(node, p));
        }
        if (nearest < (initial ? 0.080 : 0.095)) continue;
        const visible = preferVisible ? discoveryVisibility(project(p, scene)) : 0;
        const expansion = distance(p, scene.origin) - distance(parent, scene.origin);
        const score = nearest + visible * 0.85 + expansion * 1.20 + random() * 0.13;
        if (score > bestScore) { best = p; bestScore = score; }
      }
      return best;
    }
    function connectNearby(scene, child, parent, born) {
      const nearby = scene.nodes.filter(node => node !== child && node !== parent && node.retiring === null
        && node.degree < 5 && time - node.born > 2 && distance(child, node) < 0.36)
        .sort((a, b) => distance(child, a) - distance(child, b));
      if (nearby.length) addEdge(scene, child, nearby[0], born, true);
    }
    function routeLength(start, route) {
      let length = 0, point = start;
      for (const next of route) { length += distance(point, next); point = next; }
      return length;
    }
    function seedScene(index) {
      const origin = worldPoint(index ? 0.945 : 0.055, index ? 0.17 : 0.86, index ? -0.04 : 0.04);
      const route = (index ? [[0.92, 0.07], [0.73, 0.065], [0.515, 0.075]]
        : [[0.04, 0.55], [0.05, 0.24], [0.10, 0.07], [0.49, 0.075]]).map(p => worldPoint(...p));
      const scene = { index, origin, route, routeIndex: 0, leadSteps: 0, nodes: [], edges: [],
        nextBirth: index ? 0.45 : 0.80, nextLead: index ? 1.1 : 0.9, frontier: null, run: 0,
        leadStep: routeLength(origin, route) / 17 };
      const root = addNode(scene, origin, null, -45);
      root.kind = 0; root.radius = 0.025; root.protected = true;
      scene.leader = root;
      for (let i = 1; i < 27; i += 1) {
        let parent = null, position = null;
        for (let attempt = 0; attempt < 16 && !position; attempt += 1) {
          const pool = scene.nodes.filter(node => node.degree < 4);
          parent = pool[Math.floor(random() * pool.length)];
          if (parent) position = candidate(scene, parent, false, true);
        }
        if (!position) continue;
        const child = addNode(scene, position, parent, -42 + i * 0.65);
        if (i % 3 === 0) connectNearby(scene, child, parent, child.born + 1.2);
      }
      scenes.push(scene);
    }
    function retireOldest(scene) {
      const active = scene.nodes.filter(node => node.retiring === null);
      if (active.length < MAX_ACTIVE) return;
      const eligible = active.filter(node => !node.protected && time - node.born > 20
        && time - node.touched > 5);
      eligible.sort((a, b) => (time - b.born) / (1 + b.degree * 0.3) - (time - a.born) / (1 + a.degree * 0.3));
      // Retire only nodes whose removal preserves a path through the colony.
      const adjacency = new Map(active.map(node => [node, []]));
      for (const edge of scene.edges) {
        if (!adjacency.has(edge.a) || !adjacency.has(edge.b)) continue;
        if (edge.bridge && time - edge.born < GROW_TIME) continue;
        adjacency.get(edge.a).push(edge.b); adjacency.get(edge.b).push(edge.a);
      }
      for (const candidate of eligible) {
        const root = active.find(node => node.protected);
        const reached = new Set([root]), queue = [root];
        for (let i = 0; i < queue.length; i += 1) {
          for (const neighbor of adjacency.get(queue[i])) {
            if (neighbor === candidate || reached.has(neighbor)) continue;
            reached.add(neighbor); queue.push(neighbor);
          }
        }
        if (reached.size === active.length - 1) { candidate.retiring = time; break; }
      }
    }
    function cleanScene(scene) {
      scene.nodes = scene.nodes.filter(node => fade(node) > 0);
      const alive = new Set(scene.nodes);
      scene.edges = scene.edges.filter(edge => alive.has(edge.a) && alive.has(edge.b));
      for (const node of scene.nodes) node.degree = 0;
      for (const edge of scene.edges) { edge.a.degree += 1; edge.b.degree += 1; }
      for (const edge of connections) {
        if (edge.a.colony === scene.index) edge.a.degree += 1;
        if (edge.b.colony === scene.index) edge.b.degree += 1;
      }
      if (scene.frontier && !alive.has(scene.frontier)) scene.frontier = null;
    }
    function growLeader(scene) {
      if (contact || scene.routeIndex >= scene.route.length) return;
      cleanScene(scene); retireOldest(scene);
      if (scene.nodes.length >= MAX_TOTAL || scene.edges.length >= MAX_EDGES) return;
      const parent = scene.leader, target = scene.route[scene.routeIndex];
      const gap = distance(parent, target);
      let position;
      if (gap <= scene.leadStep * 1.10) {
        position = { ...target }; scene.routeIndex += 1;
      } else {
        const d = unit(target.x - parent.x, target.y - parent.y, target.z - parent.z);
        const offset = (random() - 0.5) * scene.leadStep * 0.22;
        position = { x: parent.x + d.x * scene.leadStep - d.y * offset,
          y: parent.y + d.y * scene.leadStep + d.x * offset,
          z: parent.z + d.z * scene.leadStep + (random() - 0.5) * scene.leadStep * 0.28 };
      }
      const child = addNode(scene, position, parent, time);
      child.protected = true; child.kind = scene.leadSteps % 3; child.radius *= 1.12;
      parent.flash = time; scene.leader = child; scene.leadSteps += 1;
      discoveries += 1;
    }
    function discover(scene) {
      cleanScene(scene); retireOldest(scene);
      if (scene.nodes.length >= MAX_TOTAL || scene.edges.length >= MAX_EDGES) return;
      let pool = scene.nodes.filter(node => node.retiring === null && time - node.born > 1.3 && node.degree < 5);
      if (!pool.length) pool = scene.nodes.filter(node => node.retiring === null && time - node.born > 1.3);
      const ranked = pool.map(node => ({ node, score: discoveryVisibility(project(node, scene)) * 0.9
        + distance(node, scene.origin) * 0.16 + 0.3 / (1 + Math.max(0, time - node.born) * 0.04)
        + random() * 0.65 - node.degree * 0.06 })).sort((a, b) => b.score - a.score);
      if (scene.frontier && scene.run > 0 && scene.frontier.retiring === null
        && time - scene.frontier.born > 1.3 && scene.frontier.degree < 4) ranked.unshift({ node: scene.frontier });
      let parent = null, position = null;
      for (const item of ranked) {
        position = candidate(scene, item.node, true);
        if (position) { parent = item.node; break; }
      }
      if (!parent || !position) return;
      const child = addNode(scene, position, parent, time);
      parent.flash = time; discoveries += 1;
      if (random() < 0.62) connectNearby(scene, child, parent, time + 1.2);
      scene.run = scene.frontier === parent && scene.run > 0 ? scene.run - 1 : 2 + Math.floor(random() * 2);
      scene.frontier = child;
    }
    function tryContact() {
      if (contact || time < 12) return;
      const a = scenes[0].leader, b = scenes[1].leader;
      const routesComplete = scenes.every(scene => scene.routeIndex >= scene.route.length);
      if (time - a.born < GROW_TIME || time - b.born < GROW_TIME
        || (!routesComplete && distance(a, b) > 0.145)) return;
      contact = addEdge(scenes[0], a, b, time, true, true);
      if (!contact) return;
      phase = 'connecting'; a.flash = time; b.flash = time;
    }
    function allEdges() { return scenes.flatMap(scene => scene.edges).concat(connections); }
    function startWave() {
      const nodes = scenes.flatMap(scene => scene.nodes).filter(node => node.retiring === null && appearance(node) > 0.95);
      const alive = new Set(nodes);
      const edges = allEdges().filter(edge => time - edge.born >= GROW_TIME && alive.has(edge.a) && alive.has(edge.b));
      const adjacency = new Map(nodes.map(node => [node, []]));
      for (const edge of edges) {
        const duration = Math.max(0.22, distance(edge.a, edge.b) / 1.4);
        adjacency.get(edge.a).push({ node: edge.b, edge, duration });
        adjacency.get(edge.b).push({ node: edge.a, edge, duration });
      }
      const arrival = new Map(nodes.map(node => [node, Infinity]));
      arrival.set(contact.a, 0); arrival.set(contact.b, 0);
      const pending = new Set(nodes);
      while (pending.size) {
        let best = null, value = Infinity;
        for (const node of pending) if (arrival.get(node) < value) { best = node; value = arrival.get(node); }
        if (!best) break;
        pending.delete(best);
        for (const step of adjacency.get(best)) {
          if (value + step.duration < arrival.get(step.node)) arrival.set(step.node, value + step.duration);
        }
      }
      const paths = new Map();
      for (const edge of edges) {
        const a = arrival.get(edge.a), b = arrival.get(edge.b);
        if (!Number.isFinite(Math.min(a, b))) continue;
        paths.set(edge, { start: time + Math.min(a, b), duration: Math.max(0.22, distance(edge.a, edge.b) / 1.4), fromA: a <= b });
      }
      const events = Array.from(arrival).filter(pair => Number.isFinite(pair[1]))
        .map(([node, delay]) => ({ node, at: time + delay })).sort((a, b) => a.at - b.at);
      const end = events.length ? events[events.length - 1].at + 2 : time + 2;
      waves.push({ paths, events, cursor: 0, end, strength: pulseCount ? 0.70 : 1 });
      pulseCount += 1;
      nextWave = time + 7.5;
    }
    function updateConduction() {
      tryContact();
      if (contact && phase === 'connecting' && time - contact.born >= GROW_TIME) {
        phase = 'conducting'; startWave();
      }
      if (phase === 'conducting' && time >= nextWave) startWave();
      for (const wave of waves) {
        while (wave.cursor < wave.events.length && wave.events[wave.cursor].at <= time) {
          const event = wave.events[wave.cursor++]; event.node.chargeAt = event.at;
        }
      }
      waves = waves.filter(wave => time < wave.end).slice(-3);
    }
    function syncStats() {
      canvas.dataset.discoveries = String(discoveries);
      canvas.dataset.nodeCount = String(scenes.reduce((sum, scene) => sum + scene.nodes.length, 0));
      canvas.dataset.lifePhase = phase;
      canvas.dataset.connections = String(connections.length);
      canvas.dataset.pulses = String(pulseCount);
    }
    function updateGraph() {
      let changed = false;
      for (const scene of scenes) {
        if (!contact && time >= scene.nextLead) {
          growLeader(scene); scene.nextLead = time + 1.35; changed = true;
        }
        if (time >= scene.nextBirth) {
          discover(scene); scene.nextBirth = time + 0.85 + random() * 0.35; changed = true;
        }
      }
      const previousPhase = phase, previousPulse = pulseCount;
      updateConduction();
      if (changed || previousPhase !== phase || previousPulse !== pulseCount) syncStats();
    }

    function edgePoint(edge, t) {
      const bend = Math.sin(t * Math.PI);
      return { x: edge.a.x + (edge.b.x - edge.a.x) * t + edge.bend.x * bend,
        y: edge.a.y + (edge.b.y - edge.a.y) * t + edge.bend.y * bend,
        z: edge.a.z + (edge.b.z - edge.a.z) * t + edge.bend.z * bend };
    }
    function drawSpark(p, alpha, radius, tone = 1) {
      if (alpha < 0.015) return;
      ctx.fillStyle = `rgba(${COLORS[tone]}, ${alpha * 0.10})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius * 3.8, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${COLORS[tone]}, ${alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius * 0.44, 0, TAU); ctx.fill();
    }
    function drawEdge(edge, scene) {
      const age = time - edge.born;
      if (age < 0) return;
      const growth = smooth(0, GROW_TIME, age);
      const midpoint = project(edgePoint(edge, growth * 0.5), scene);
      const foreground = smooth(-0.42, 0.48, midpoint.z);
      const ends = growth < 1 ? fade(edge.a) * fade(edge.b) : Math.min(appearance(edge.a), appearance(edge.b));
      const visibility = visibilityAt(midpoint.x, midpoint.y);
      const young = age < 3;
      const alpha = ends * visibility * (young ? 0.55 : 0.10 + foreground * 0.25);
      if (alpha < 0.006) return;
      ctx.strokeStyle = `rgba(${COLORS[young ? 1 : edge.bridge ? 0 : 1]}, ${alpha})`;
      ctx.lineWidth = (young ? 1.05 : 0.35) + foreground * 0.65;
      ctx.beginPath();
      for (let i = 0; i <= 12; i += 1) {
        const p = project(edgePoint(edge, growth * i / 12), scene);
        if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      // A quiet second pencil stroke keeps the connections hand-drawn as well.
      const a = project(edge.a, scene), b = project(edge.b, scene);
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      ctx.strokeStyle = `rgba(${COLORS[edge.bridge ? 0 : 1]}, ${alpha * 0.28})`;
      ctx.lineWidth = 0.40;
      ctx.beginPath();
      for (let i = 0; i <= 12; i += 1) {
        const t = growth * i / 12, p = project(edgePoint(edge, t), scene);
        const pencil = Math.sin(t * Math.PI) * (0.65 + Math.sin(t * 8 + edge.b.id) * 0.38);
        if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x + nx * pencil, p.y + ny * pencil);
      }
      ctx.stroke();
      if (growth < 1) {
        const p = project(edgePoint(edge, growth), scene);
        drawSpark(p, ends * visibilityAt(p.x, p.y) * 0.95, 1.8 + foreground);
      } else if ((edge.a.id + edge.b.id) % 5 === 0) {
        const t = (time * 0.20 + edge.b.id * 0.17) % 1;
        const p = project(edgePoint(edge, t), scene);
        drawSpark(p, ends * visibilityAt(p.x, p.y) * 0.52, 0.85 + foreground * 0.55, edge.bridge ? 0 : 1);
      }
      for (const wave of waves) {
        const path = wave.paths.get(edge);
        if (!path) continue;
        const progress = (time - path.start) / path.duration;
        if (progress < 0 || progress > 1.55) continue;
        const head = Math.min(1, progress), tail = Math.max(0, progress - 0.55);
        const strength = ends * wave.strength * (1 - smooth(1, 1.55, progress));
        ctx.strokeStyle = `rgba(${COLORS[1]}, ${strength * visibility * 0.95})`;
        ctx.lineWidth = edge.crossColony ? 2.3 : 1.55;
        ctx.beginPath();
        for (let i = 0; i <= 8; i += 1) {
          const t = tail + (head - tail) * i / 8;
          const p = project(edgePoint(edge, path.fromA ? t : 1 - t), scene);
          if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        const tip = project(edgePoint(edge, path.fromA ? head : 1 - head), scene);
        drawSpark(tip, strength * visibilityAt(tip.x, tip.y), 1.6 + foreground * 0.7);
      }
    }
    const OCTAHEDRON = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const OCTA_EDGES = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
    const TETRAHEDRON = [[0.70, 0.70, 0.70], [0.70, -0.70, -0.70], [-0.70, 0.70, -0.70], [-0.70, -0.70, 0.70]];
    const TETRA_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    // Stable pencil contours; each node keeps its own small imperfections.
    function sketchNodeContour(points, offsetX = 0, offsetY = 0, rounding = 0.18) {
      ctx.beginPath();
      const last = points[points.length - 1], first = points[0];
      ctx.moveTo(first.x + (last.x - first.x) * rounding + offsetX,
        first.y + (last.y - first.y) * rounding + offsetY);
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i], b = points[(i + 1) % points.length];
        ctx.quadraticCurveTo(a.x + offsetX, a.y + offsetY,
          a.x + (b.x - a.x) * rounding + offsetX, a.y + (b.y - a.y) * rounding + offsetY);
        ctx.lineTo(b.x + (a.x - b.x) * rounding + offsetX,
          b.y + (a.y - b.y) * rounding + offsetY);
      }
      ctx.closePath();
    }

    function sketchNodeHull(vertices) {
      const sorted = vertices.slice().sort((a, b) => a.x - b.x || a.y - b.y);
      const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const lower = [], upper = [];
      for (const p of sorted) {
        while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const p = sorted[i];
        while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      lower.pop(); upper.pop();
      return lower.concat(upper);
    }

    function drawNode(node, scene) {
      const p = node.projected;
      if (!p) return;
      const life = appearance(node);
      const visibility = visibilityAt(p.x, p.y);
      const foreground = smooth(-0.42, 0.48, p.z);
      const age = time - node.born;
      const chargeAge = Number.isFinite(node.chargeAt) ? time - node.chargeAt : Infinity;
      const charge = chargeAge >= 0 && chargeAge < 0.70 ? 1 - smooth(0, 0.70, chargeAge) : 0;
      const discovery = (1 - smooth(1, 4, age)) * 0.12;
      const alpha = life * visibility * Math.min(0.90, 0.30 + foreground * 0.48 + discovery + charge * 0.12);
      if (alpha < 0.008) return;
      const tone = charge > 0 || age < 10 ? 1 : node.id % 3 === 0 ? 1 : 0;
      const breathing = 1 + Math.sin(time * 0.72 + node.phase) * 0.022 + charge * 0.055;
      const growth = (0.60 + smooth(0.62, 1.05, age) * 0.40) * (1.02 + foreground * 0.42) * breathing;
      const radius = node.radius * p.scale * growth;
      const materialAlpha = life * Math.min(0.96, visibility * 1.25) * (0.70 + foreground * 0.30);
      const phase = (node.phase || 0) + node.id * 2.399963;
      const flashAge = Number.isFinite(node.flash) ? time - node.flash : Infinity;
      const tau = Math.PI * 2;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (age < 2.7 || flashAge < 1.7 || charge > 0) {
        const wave = charge > 0 ? smooth(0, 0.70, chargeAge)
          : age < 2.7 ? smooth(0.6, 2.7, age) : smooth(0, 1.7, flashAge);
        ctx.strokeStyle = `rgba(${COLORS[1]}, ${alpha * (1 - wave) * 0.50})`;
        ctx.lineWidth = charge > 0 ? 1.0 : 0.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, radius + wave * (charge > 0 ? 7 : 17), 0, tau); ctx.stroke();
        drawSpark(p, alpha * (1 - wave) * 0.30, radius * 1.25, 1);
      }

      let contour, vertices, edges;
      const visibleEdges = new Set();
      if (node.kind === 0) {
        contour = Array.from({ length: 16 }, (_, i) => {
          const angle = i / 16 * tau;
          const wobble = 1 + Math.sin(angle * 3 + phase) * 0.026 + Math.sin(angle * 5 - phase) * 0.012;
          return { x: p.x + Math.cos(angle) * radius * wobble,
            y: p.y + Math.sin(angle) * radius * wobble * (0.96 + Math.sin(phase) * 0.025) };
        });
      } else {
        const model = node.kind === 1 ? TETRAHEDRON : OCTAHEDRON;
        edges = node.kind === 1 ? TETRA_EDGES : OCTA_EDGES;
        const angle = (node.phase || 0) + time * 0.13;
        const c = Math.cos(angle), s = Math.sin(angle);
        vertices = model.map((v, i) => {
          const size = node.radius * 1.35 * growth * (1 + Math.sin(phase + i * 2.1) * 0.035);
          return project({ x: node.x + (v[0] * c - v[2] * s) * size,
            y: node.y + v[1] * size, z: node.z + (v[0] * s + v[2] * c) * size }, scene);
        });
        contour = sketchNodeHull(vertices);
      }
      if (contour.length < 3) { ctx.restore(); return; }
      const rounding = node.kind === 0 ? 0.46 : 0.12;
      sketchNodeContour(contour, 0, 0, rounding);
      ctx.fillStyle = `rgba(252, 252, 250, ${materialAlpha})`;
      ctx.fill();

      // Opaque-looking matte surfaces share one upper-left light direction.
      ctx.save();
      sketchNodeContour(contour, 0, 0, rounding);
      ctx.clip();
      if (node.kind === 0) {
        ctx.globalAlpha = materialAlpha;
        ctx.drawImage(sphereSurface, p.x - radius * 1.04, p.y - radius * 1.04, radius * 2.08, radius * 2.08);
        ctx.globalAlpha = 1;
      } else {
        const faces = node.kind === 1
          ? [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]
          : [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]];
        const frontFaces = faces.map(indices => {
          const face = indices;
          const v = face.map(i => vertices[i]);
          const ab = { x: v[1].viewX - v[0].viewX, y: v[1].viewY - v[0].viewY, z: v[1].z - v[0].z };
          const ac = { x: v[2].viewX - v[0].viewX, y: v[2].viewY - v[0].viewY, z: v[2].z - v[0].z };
          const normal = unit(ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x);
          const center = { x: (v[0].viewX + v[1].viewX + v[2].viewX) / 3,
            y: (v[0].viewY + v[1].viewY + v[2].viewY) / 3, z: (v[0].z + v[1].z + v[2].z) / 3 };
          if (normal.x * (center.x - p.viewX) + normal.y * (center.y - p.viewY) + normal.z * (center.z - p.z) < 0) {
            normal.x *= -1; normal.y *= -1; normal.z *= -1;
          }
          return { v, indices, normal, z: center.z,
            front: normal.x * -center.x + normal.y * -center.y + normal.z * (3.7 - center.z) > 0 };
        }).filter(face => face.front).sort((a, b) => a.z - b.z);
        for (const face of frontFaces) {
          const light = Math.max(0, face.normal.x * LIGHT.x + face.normal.y * LIGHT.y + face.normal.z * LIGHT.z);
          const shade = Math.round(207 + Math.round(light * 4) / 4 * 45);
          ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${materialAlpha})`;
          ctx.beginPath(); ctx.moveTo(face.v[0].x, face.v[0].y);
          ctx.lineTo(face.v[1].x, face.v[1].y); ctx.lineTo(face.v[2].x, face.v[2].y);
          ctx.closePath(); ctx.fill();
          for (let i = 0; i < 3; i += 1) {
            const a = face.indices[i], b = face.indices[(i + 1) % 3];
            visibleEdges.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
          }
        }
      }

      // Only larger foreground cells receive two or three fine pencil hatch marks.
      if (radius >= (node.kind === 0 ? 5.5 : 8)) {
        ctx.strokeStyle = `rgba(${COLORS[tone]}, ${alpha * 0.19})`;
        ctx.lineWidth = 0.40;
        ctx.beginPath();
        const count = radius > 9 ? 3 : 2;
        for (let i = 0; i < count; i += 1) {
          const offset = (i - 0.25) * radius * 0.30;
          ctx.moveTo(p.x + radius * 0.08 + offset, p.y + radius * 0.44);
          ctx.lineTo(p.x + radius * 0.47 + offset, p.y + radius * 0.06);
        }
        ctx.stroke();
      }
      ctx.restore();

      if (edges) {
        for (let i = 0; i < edges.length; i += 1) {
          if (!visibleEdges.has(`${edges[i][0]}:${edges[i][1]}`)) continue;
          const a = vertices[edges[i][0]], b = vertices[edges[i][1]];
          const bend = Math.sin(phase + i * 1.7) * 0.20;
          ctx.strokeStyle = `rgba(${COLORS[tone]}, ${alpha * 0.62})`;
          ctx.lineWidth = 0.50 + foreground * 0.22;
          ctx.beginPath(); ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo((a.x + b.x) / 2 + bend, (a.y + b.y) / 2 - bend, b.x, b.y);
          ctx.stroke();
        }
      }

      sketchNodeContour(contour, 0, 0, rounding);
      ctx.strokeStyle = `rgba(${COLORS[tone]}, ${alpha * (0.72 + charge * 0.20)})`;
      ctx.lineWidth = 0.65 + foreground * 0.24;
      ctx.stroke();
      if (radius >= 4) {
        sketchNodeContour(contour, Math.cos(phase) * 0.34, Math.sin(phase) * 0.28, rounding);
        ctx.strokeStyle = `rgba(${COLORS[tone]}, ${alpha * 0.25})`;
        ctx.lineWidth = 0.40;
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.92})`;
      ctx.lineWidth = Math.max(0.7, Math.min(1.15, radius * 0.13));
      ctx.beginPath();
      if (node.kind === 0) {
        ctx.arc(p.x - radius * 0.04, p.y - radius * 0.03, radius * 0.62, 3.65, 4.60);
      } else {
        ctx.moveTo(p.x - radius * 0.34, p.y - radius * 0.24);
        ctx.lineTo(p.x - radius * 0.06, p.y - radius * 0.40);
      }
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      updateCamera();
      const layers = [];
      for (const scene of scenes) {
        for (const node of scene.nodes) {
          node.projected = project(node, scene);
          layers.push({ type: 1, item: node, scene, depth: node.projected.z });
        }
        for (const edge of scene.edges) {
          layers.push({ type: 0, item: edge, scene, depth: (edge.a.projected.z + edge.b.projected.z) / 2 });
        }
      }
      for (const edge of connections) {
        layers.push({ type: 0, item: edge, scene: scenes[0], depth: (edge.a.projected.z + edge.b.projected.z) / 2 });
      }
      layers.sort((a, b) => a.depth - b.depth || a.type - b.type);
      for (const layer of layers) {
        if (layer.type) drawNode(layer.item, layer.scene);
        else drawEdge(layer.item, layer.scene);
      }
    }

    function shouldAnimate() { return !document.hidden && !reducedMotion.matches && !paused; }
    function updateMotionControl() {
      if (!motionControl) return;
      motionControl.hidden = reducedMotion.matches;
      motionControl.textContent = paused ? 'Play' : 'Pause';
      motionControl.setAttribute('aria-pressed', String(paused));
      motionControl.setAttribute('aria-label', paused ? 'Resume background animation' : 'Pause background animation');
    }
    function animate(timestamp) {
      frame = 0;
      if (!shouldAnimate()) return;
      if (!lastFrame) lastFrame = timestamp - 1000 / 60;
      const elapsed = timestamp - lastFrame;
      if (elapsed >= 1000 / 60 - 0.5) {
        const delta = Math.min(elapsed, 80);
        lastFrame = timestamp;
        time += delta / 1000;
        const easing = 1 - Math.exp(-delta * 0.004);
        pointerX += (targetX - pointerX) * easing;
        pointerY += (targetY - pointerY) * easing;
        updateCamera();
        updateGraph();
        draw();
      }
      frame = window.requestAnimationFrame(animate);
    }
    function stop() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0; lastFrame = 0;
    }
    function resume() {
      if (!frame && shouldAnimate()) { lastFrame = 0; frame = window.requestAnimationFrame(animate); }
    }
    function resize() {
      const oldX = halfX, oldY = halfY;
      width = window.innerWidth; height = window.innerHeight;
      worldScale = Math.min(width, height) * 0.62;
      halfX = width / (worldScale * 2); halfY = height / (worldScale * 2);
      if (!scenes.length) {
        seedScene(0); seedScene(1);
      } else {
        const sx = halfX / oldX, sy = halfY / oldY;
        for (const scene of scenes) {
          for (const node of scene.nodes) { node.x *= sx; node.y *= sy; }
          scene.origin.x *= sx; scene.origin.y *= sy;
          for (const point of scene.route) { point.x *= sx; point.y *= sy; }
          scene.leadStep = routeLength(scene.leader, scene.route.slice(scene.routeIndex)) / Math.max(3, 17 - scene.leadSteps);
          for (const edge of scene.edges) { edge.bend.x *= sx; edge.bend.y *= sy; }
        }
        for (const edge of connections) { edge.bend.x *= sx; edge.bend.y *= sy; }
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2000000 / (width * height)));
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      updateReadingBounds(); draw(); syncStats(); wrapper.classList.add('is-ready');
    }
    if (motionControl) motionControl.addEventListener('click', () => {
      paused = !paused; updateMotionControl();
      if (paused) stop(); else resume();
    });
    window.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches || paused) return;
      targetX = event.clientX / width * 2 - 1;
      targetY = event.clientY / height * 2 - 1;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; });
    window.addEventListener('scroll', () => {
      scrollPosition = window.scrollY; updateReadingBounds();
      if (!shouldAnimate()) draw();
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else resume(); });
    reducedMotion.addEventListener('change', () => {
      stop(); pointerX = 0; pointerY = 0; targetX = 0; targetY = 0;
      updateMotionControl(); draw(); resume();
    });
    const details = document.querySelector('.about-details');
    if (details && 'ResizeObserver' in window) new ResizeObserver(() => {
      updateReadingBounds(); if (!shouldAnimate()) draw();
    }).observe(details);
    canvas.dataset.discoveries = '0';
    canvas.dataset.nodeCount = String(scenes.reduce((sum, scene) => sum + scene.nodes.length, 0));
    resize(); updateMotionControl(); resume();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeBackground, { once: true });
  else initializeBackground();
})();
