// Decorative paper diorama. The reveal controller owns interaction and the
// original profile DOM; CSS owns every animation in this illustration.
const STAGES = [
  { id: 'fire', image: 'fire-maker.png', size: [294, 317], x: 70, y: 365, z: 0, height: 101, width: 104 },
  { id: 'pottery', image: 'potter.png', size: [188, 438], x: 197, y: 350, z: 7, height: 140, width: 108 },
  { id: 'industry', image: 'industrial-maker.png', size: [225, 450], x: 323, y: 335, z: 14, height: 140, width: 112 },
  { id: 'business', image: 'businessman.png', size: [204, 447], x: 450, y: 320, z: 21, height: 140, width: 116 },
  { id: 'astronaut', image: 'astronaut.png', size: [235, 452], x: 577, y: 305, z: 28, height: 143, width: 120 },
  { id: 'vr', image: 'vr-person.png', size: [209, 448], x: 703, y: 290, z: 35, height: 140, width: 124 },
  { id: 'augmented', image: 'flying-augmented.png', size: [249, 424], x: 830, y: 275, z: 42, height: 141, width: 128 },
];

const LANDMARKS = [
  { id: 'train', image: 'train.png', size: [269, 146], x: 338, y: 268, z: -76, width: 176, opacity: .55, rotate: -3 },
  { id: 'computer', image: 'computer.png', size: [156, 149], x: 549, y: 213, z: -88, width: 96, opacity: .52, rotate: 4 },
  { id: 'spacecraft', image: 'spacecraft.png', size: [290, 107], x: 725, y: 145, z: -110, width: 150, opacity: .48, rotate: -8 },
  { id: 'rocket', image: 'rocket.png', size: [143, 240], x: 846, y: 174, z: -82, width: 64, opacity: .52, rotate: 8 },
];

const MOTES = [
  [121, 267, 14, 2], [262, 225, 8, 2], [372, 194, 20, 2],
  [487, 168, 12, 2], [618, 140, 24, 2], [747, 115, 17, 2],
  [849, 192, 30, 3], [880, 233, 18, 2],
];

function element(className, tag = 'div') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function position(node, { x, y, z = 0 }) {
  node.style.setProperty('--x', `${x}px`);
  node.style.setProperty('--y', `${y}px`);
  node.style.setProperty('--z', `${z}px`);
}

function cutout(file, className, size) {
  const image = element(className, 'img');
  image.src = new URL(`../images/paper-progress/${file}`, import.meta.url).href;
  image.alt = '';
  image.loading = 'eager';
  image.decoding = 'async';
  image.draggable = false;
  if (size) [image.width, image.height] = size;
  return image;
}

function futurePath() {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', 'paper-progress-future');
  svg.setAttribute('viewBox', '0 0 900 480');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths = [
    ['paper-progress-future-line', 'M 844 279 C 866 273 879 255 881 232 C 883 216 879 202 871 190'],
    ['paper-progress-future-ray', 'M 865 181 L 859 170'],
    ['paper-progress-future-ray', 'M 881 179 L 884 168'],
    ['paper-progress-future-ray', 'M 893 190 L 900 185'],
  ];
  for (const [className, d] of paths) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('pathLength', '1');
    svg.append(path);
  }
  return svg;
}

// The result has no listeners, timers, or external state. Removing it from the
// DOM is sufficient cleanup, including its CSS animations.
export function createPaperProgress() {
  const scene = element('paper-progress');
  scene.setAttribute('aria-hidden', 'true');
  scene.style.setProperty('--world-width', '900px');
  scene.style.setProperty('--world-height', '480px');
  const world = element('paper-progress-world');
  const landmarks = element('paper-progress-landmarks');
  const path = element('paper-progress-path');
  const links = element('paper-progress-links');
  const particles = element('paper-progress-particles');

  LANDMARKS.forEach((landmark, index) => {
    const slot = element(`paper-progress-landmark paper-progress-landmark-${landmark.id}`);
    slot.dataset.landmark = landmark.id;
    position(slot, landmark);
    slot.style.setProperty('--i', String(index));
    slot.style.setProperty('--landmark-width', `${landmark.width}px`);
    slot.style.setProperty('--landmark-opacity', String(landmark.opacity));
    slot.style.setProperty('--landmark-rotate', `${landmark.rotate}deg`);
    slot.style.setProperty('--float-delay', `${-index * 1.37}s`);
    slot.append(
      element('paper-progress-landmark-shadow', 'span'),
      cutout(`landmarks/${landmark.image}`, 'paper-progress-landmark-image', landmark.size),
    );
    landmarks.append(slot);
  });

  STAGES.forEach((stage, index) => {
    if (index < STAGES.length - 1) {
      const next = STAGES[index + 1];
      const link = element('paper-progress-link', 'span');
      const dx = next.x - stage.x, dy = next.y - stage.y;
      position(link, { x: stage.x, y: stage.y + 10, z: stage.z - 4 });
      link.style.setProperty('--i', String(index));
      link.style.setProperty('--delay', `${index * .58}s`);
      link.style.setProperty('--length', `${Math.hypot(dx, dy)}px`);
      link.style.setProperty('--angle', `${Math.atan2(dy, dx) * 180 / Math.PI}deg`);
      link.append(element('paper-progress-link-light', 'span'));
      links.append(link);
    }

    const step = element(`paper-progress-step paper-progress-step-${stage.id}`);
    step.dataset.stage = stage.id;
    position(step, stage);
    step.style.setProperty('--i', String(index));
    step.style.setProperty('--stage-fraction', String(index / (STAGES.length - 1)));
    step.style.setProperty('--delay', `${index * .58}s`);
    step.style.setProperty('--float-delay', `${-index * .73}s`);
    step.style.setProperty('--figure-height', `${stage.height}px`);
    step.style.setProperty('--figure-width', `${stage.height * stage.size[0] / stage.size[1]}px`);
    step.style.setProperty('--step-width', `${stage.width}px`);
    step.style.setProperty('--step-depth', '54px');
    step.style.setProperty('--step-height', '12px');
    step.append(
      element('paper-progress-step-shadow', 'span'),
      element('paper-progress-step-side', 'span'),
      element('paper-progress-step-top', 'span'),
      element('paper-progress-figure-shadow', 'span'),
      cutout(stage.image, 'paper-progress-figure', stage.size),
    );
    path.append(step);
  });

  MOTES.forEach(([x, y, z, size], index) => {
    const mote = element('paper-progress-mote', 'span');
    position(mote, { x, y, z });
    mote.style.setProperty('--i', String(index));
    mote.style.setProperty('--size', `${size}px`);
    mote.style.setProperty('--delay', `${-index * 1.11}s`);
    mote.style.setProperty('--duration', `${5.4 + index % 4 * .8}s`);
    particles.append(mote);
  });

  links.append(futurePath());
  world.append(landmarks, links, path, particles);
  scene.append(world);
  return scene;
}
