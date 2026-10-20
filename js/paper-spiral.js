// A continuous, rising sheet carries the same hand-drawn evolution cutouts as
// the timeline. Geometry is static; the host owns reveal and camera behavior.
const STAGES = [
  { id: 'fire', image: 'fire-maker.png', size: [294, 317], t: .035, height: 108 },
  { id: 'pottery', image: 'potter.png', size: [188, 438], t: .19, height: 138 },
  { id: 'industry', image: 'industrial-maker.png', size: [225, 450], t: .345, height: 139 },
  { id: 'business', image: 'businessman.png', size: [204, 447], t: .5, height: 140 },
  { id: 'astronaut', image: 'astronaut.png', size: [235, 452], t: .655, height: 144 },
  { id: 'vr', image: 'vr-person.png', size: [209, 448], t: .81, height: 142 },
  { id: 'augmented', image: 'flying-augmented.png', size: [249, 424], t: .965, height: 145 },
];

const LANDMARKS = [
  { id: 'train', image: 'train.png', size: [269, 146], x: 274, y: 311, z: -130, width: 160, opacity: .48, rotate: -3 },
  { id: 'computer', image: 'computer.png', size: [156, 149], x: 471, y: 227, z: -120, width: 88, opacity: .48, rotate: 3 },
  { id: 'spacecraft', image: 'spacecraft.png', size: [290, 107], x: 662, y: 116, z: -155, width: 140, opacity: .43, rotate: -6 },
  { id: 'rocket', image: 'rocket.png', size: [143, 240], x: 805, y: 154, z: -130, width: 56, opacity: .5, rotate: 5 },
];

const SURFACE_SEGMENTS = 88;
const FEEDBACK_SEGMENTS = 52;
const TAU = Math.PI * 2;

function element(className, tag = 'div') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function position(node, { x, y, z = 0 }) {
  node.style.setProperty('--x', `${x.toFixed(3)}px`);
  node.style.setProperty('--y', `${y.toFixed(3)}px`);
  node.style.setProperty('--z', `${z.toFixed(3)}px`);
}

function cutout(file, className, [width, height]) {
  const image = element(className, 'img');
  image.src = new URL(`../images/paper-progress/${file}`, import.meta.url).href;
  image.width = width;
  image.height = height;
  image.alt = '';
  image.loading = 'eager';
  image.decoding = 'async';
  image.draggable = false;
  return image;
}

function ribbonPoint(t) {
  return {
    x: 90 + 720 * t,
    y: 462 - 250 * t,
    z: 85 * Math.sin(TAU * t - .25),
  };
}

function ribbonWidth(t) {
  // The ends narrow gently, like an unrolled strip of heavy drawing paper.
  return 90 * (.48 + .52 * Math.pow(Math.max(0, Math.sin(Math.PI * t)), .35));
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function frame(start, end, vertical = false) {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const along = normalize(delta);
  const across = vertical ? { x: 0, y: 1, z: 0 } : normalize({ x: -along.z, y: 0, z: along.x });
  const normal = normalize(cross(along, across));
  return {
    along,
    across,
    normal,
    length: Math.hypot(delta.x, delta.y, delta.z),
    // CSS matrices are column-major: X follows the path; Y spans the paper.
    matrix: [along.x, along.y, along.z, 0, across.x, across.y, across.z, 0, normal.x, normal.y, normal.z, 0, 0, 0, 0, 1]
      .map(value => Number(value.toFixed(6))).join(','),
  };
}

function segment(className, start, end, index, width, vertical = false) {
  const node = element(className, 'span');
  const basis = frame(start, end, vertical);
  const light = normalize({ x: -.45, y: -.9, z: .35 });
  const lightness = Math.max(0, basis.normal.x * light.x + basis.normal.y * light.y + basis.normal.z * light.z);
  position(node, start);
  node.style.setProperty('--i', String(index));
  // A small overlap prevents subpixel cracks between neighboring strips.
  node.style.setProperty('--length', `${(basis.length + .65).toFixed(3)}px`);
  node.style.setProperty('--ribbon-width', `${width.toFixed(3)}px`);
  node.style.setProperty('--surface-matrix', basis.matrix);
  node.style.setProperty('--shade', (vertical ? .86 + .05 * lightness : .9 + .105 * lightness).toFixed(3));
  return { node, basis };
}

function nearEdge(t, inset = 0) {
  const point = ribbonPoint(t);
  const before = ribbonPoint(Math.max(0, t - .001));
  const after = ribbonPoint(Math.min(1, t + .001));
  const { across } = frame(before, after);
  const halfWidth = ribbonWidth(t) / 2 - inset;
  return { x: point.x + across.x * halfWidth, y: point.y, z: point.z + across.z * halfWidth };
}

function feedbackPoint(t) {
  // A quiet return through the space behind the paper, from the newest stage
  // toward the first. Only the traveling light needs to make this loop visible.
  const a = ribbonPoint(.99);
  const b = { x: 724, y: 126, z: -162 };
  const c = { x: 246, y: 219, z: -215 };
  const d = ribbonPoint(.02);
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
    z: u ** 3 * a.z + 3 * u ** 2 * t * b.z + 3 * u * t ** 2 * c.z + t ** 3 * d.z,
  };
}

// No listeners, animation loops, or global state: removing the returned node
// also removes the complete scene and all of its CSS-driven motion.
export function createPaperSpiral() {
  const scene = element('paper-progress paper-spiral');
  scene.setAttribute('aria-hidden', 'true');
  scene.style.setProperty('--world-width', '900px');
  scene.style.setProperty('--world-height', '620px');
  const world = element('paper-progress-world');
  const landmarks = element('paper-progress-landmarks');
  const ribbon = element('paper-spiral-ribbon');
  const edges = element('paper-spiral-edges');
  const trace = element('paper-spiral-trace');
  const feedback = element('paper-spiral-feedback');
  const path = element('paper-progress-path');
  const future = element('paper-spiral-future');

  for (let index = 0; index < SURFACE_SEGMENTS; index++) {
    const t = index / SURFACE_SEGMENTS;
    const next = (index + 1) / SURFACE_SEGMENTS;
    const { node: surface } = segment('paper-spiral-segment', ribbonPoint(t), ribbonPoint(next), index, ribbonWidth((t + next) / 2));
    surface.style.setProperty('--cycle-delay', `${(t * 6.4).toFixed(3)}s`);
    surface.style.setProperty('--delay', `${(t * 6.4).toFixed(3)}s`);
    ribbon.append(surface);

    const { node: edge } = segment('paper-spiral-edge', nearEdge(t), nearEdge(next), index, 3, true);
    edges.append(edge);

    const start = nearEdge(t, 4), end = nearEdge(next, 4);
    start.y -= .55;
    end.y -= .55;
    const { node: gold } = segment('paper-spiral-trace-segment', start, end, index, 1.15);
    gold.style.setProperty('--cycle-delay', `${(t * 6.4).toFixed(3)}s`);
    gold.style.setProperty('--delay', `${(t * 6.4).toFixed(3)}s`);
    trace.append(gold);
  }

  for (let index = 0; index < FEEDBACK_SEGMENTS; index++) {
    const t = index / FEEDBACK_SEGMENTS;
    const { node: line } = segment('paper-spiral-feedback-segment', feedbackPoint(t), feedbackPoint((index + 1) / FEEDBACK_SEGMENTS), index, .8, true);
    line.style.setProperty('--cycle-delay', `${(6.4 + t * 2.6).toFixed(3)}s`);
    line.style.setProperty('--delay', `${(6.4 + t * 2.6).toFixed(3)}s`);
    feedback.append(line);
  }

  for (const [index, landmark] of LANDMARKS.entries()) {
    const slot = element(`paper-progress-landmark paper-progress-landmark-${landmark.id}`);
    slot.dataset.landmark = landmark.id;
    position(slot, landmark);
    slot.style.setProperty('--i', String(index));
    slot.style.setProperty('--landmark-width', `${landmark.width}px`);
    slot.style.setProperty('--landmark-opacity', String(landmark.opacity));
    slot.style.setProperty('--landmark-rotate', `${landmark.rotate}deg`);
    slot.style.setProperty('--float-delay', '0s');
    slot.append(
      element('paper-progress-landmark-shadow', 'span'),
      cutout(`landmarks/${landmark.image}`, 'paper-progress-landmark-image', landmark.size),
    );
    landmarks.append(slot);
  }

  for (const [index, stage] of STAGES.entries()) {
    const slot = element(`paper-progress-step paper-spiral-step paper-spiral-step-${stage.id}`);
    slot.dataset.stage = stage.id;
    position(slot, ribbonPoint(stage.t));
    slot.style.setProperty('--i', String(index));
    slot.style.setProperty('--stage-fraction', String(index / (STAGES.length - 1)));
    slot.style.setProperty('--delay', `${(stage.t * 6.4).toFixed(3)}s`);
    slot.style.setProperty('--cycle-delay', `${(stage.t * 6.4).toFixed(3)}s`);
    slot.style.setProperty('--float-delay', '0s');
    slot.style.setProperty('--figure-height', `${stage.height}px`);
    slot.style.setProperty('--figure-width', `${(stage.height * stage.size[0] / stage.size[1]).toFixed(3)}px`);
    slot.style.setProperty('--step-width', '108px');
    slot.style.setProperty('--step-depth', '58px');
    slot.append(
      element('paper-progress-figure-shadow', 'span'),
      cutout(stage.image, 'paper-progress-figure', stage.size),
    );
    path.append(slot);
  }

  const tip = ribbonPoint(1);
  for (let index = 0; index < 3; index++) {
    const ray = element('paper-spiral-future-ray', 'span');
    position(ray, { x: tip.x + 12 + index * 7, y: tip.y - 14 - index * 3, z: tip.z });
    ray.style.setProperty('--i', String(index));
    ray.style.setProperty('--ray-rotate', `${-50 + index * 36}deg`);
    future.append(ray);
  }

  world.append(landmarks, feedback, ribbon, edges, trace, path, future);
  scene.append(world);
  return scene;
}
