/**
 * Bake the original homepage paper sculpture without a physics runtime.
 * Run: node scripts/generate-paper-shape.mjs
 *
 * A pre-creased sheet is gradually gathered by a soft ellipsoidal boundary.
 * Distance constraints retain the paper's local area; broad panels bend more
 * reluctantly than the designed crease lines. This is a decorative surface,
 * not a self-collision cloth solver. No reference-component assets are used.
 */
import { writeFileSync } from 'node:fs';

const columns = 54;
const rows = 38;
const positions = new Float64Array((columns + 1) * (rows + 1) * 3);
const previous = new Float64Array(positions.length);
const constraints = [];
const creases = [
  [1, .35, .38, .34], [.35, 1, .54, -.30], [1, -.7, .14, .38],
  [.8, 1, .94, -.28], [1, .1, .72, -.32], [-.5, 1, .15, .30],
  [1, 1, 1.45, .36],
];
let seed = 741;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
  const at = (y * (columns + 1) + x) * 3, u = x / columns, v = y / rows;
  positions[at] = (u - .5) * 5.8;
  positions[at + 1] = (.5 - v) * 4.2;
  positions[at + 2] = creases.reduce((z, [nx, ny, offset, height]) =>
    z + height * Math.abs(nx * u + ny * v - offset), 0) + .003 * (random() - .5);
}
previous.set(positions);

function constrain(a, b, stiffness) {
  const i = a * 3, j = b * 3;
  if (stiffness < .1) {
    const u = ((a % (columns + 1)) + (b % (columns + 1))) / (2 * columns);
    const v = (Math.floor(a / (columns + 1)) + Math.floor(b / (columns + 1))) / (2 * rows);
    stiffness = creases.some(([nx, ny, offset]) => Math.abs(nx * u + ny * v - offset) < .035) ? .004 : .23;
  }
  const length = Math.hypot(positions[i] - positions[j], positions[i + 1] - positions[j + 1], positions[i + 2] - positions[j + 2]);
  constraints.push([i, j, length, stiffness]);
}
for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
  const a = y * (columns + 1) + x;
  if (x < columns) constrain(a, a + 1, .9);
  if (y < rows) constrain(a, a + columns + 1, .9);
  if (x < columns && y < rows) {
    constrain(a, a + columns + 2, .7);
    constrain(a + 1, a + columns + 1, .7);
  }
  if (x + 2 <= columns) constrain(a, a + 2, .045);
  if (y + 2 <= rows) constrain(a, a + (columns + 1) * 2, .045);
}

for (let frame = 0; frame < 240; frame++) {
  const t = Math.min(1, frame / 195);
  const radius = 3.5 - (3.5 - 1.04) * (t * t * (3 - 2 * t));
  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    positions[i] += (positions[i] - previous[i]) * .4;
    previous[i] = current;
  }
  for (let iteration = 0; iteration < 25; iteration++) {
    const reverse = (iteration + frame) % 2;
    for (let e = 0; e < constraints.length; e++) {
      const [a, b, length, stiffness] = constraints[reverse ? constraints.length - 1 - e : e];
      const x = positions[b] - positions[a], y = positions[b + 1] - positions[a + 1], z = positions[b + 2] - positions[a + 2];
      const actual = Math.hypot(x, y, z) || 1;
      const correction = (actual - length) / actual * .5 * stiffness;
      positions[a] += x * correction; positions[a + 1] += y * correction; positions[a + 2] += z * correction;
      positions[b] -= x * correction; positions[b + 1] -= y * correction; positions[b + 2] -= z * correction;
    }
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      const distance = Math.hypot(x, y / .86, z / .82);
      const u = (i / 3 % (columns + 1)) / columns, v = Math.floor(i / 3 / (columns + 1)) / rows;
      // Allow a small loose corner to retain the identity of a single sheet.
      const loose = Math.exp(-Math.pow(u / .18, 2) - Math.pow(v / .25, 2));
      const boundary = radius * (1 + loose * .25);
      if (distance > boundary) {
        const amount = 1 - (distance - boundary) / distance * .25;
        positions[i] *= amount; positions[i + 1] *= amount; positions[i + 2] *= amount;
      }
      if (t > .55 && loose > .02) {
        const amount = loose * .008 * (t - .55) / .45;
        positions[i] += (-.8 - positions[i]) * amount;
        positions[i + 1] += (1.08 - positions[i + 1]) * amount;
        positions[i + 2] += (.62 - positions[i + 2]) * amount;
      }
    }
  }
}

function rotate(xAngle, yAngle, zAngle) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const yy = y * Math.cos(xAngle) - z * Math.sin(xAngle), zz = y * Math.sin(xAngle) + z * Math.cos(xAngle);
    const xx = x * Math.cos(yAngle) + zz * Math.sin(yAngle), zzz = -x * Math.sin(yAngle) + zz * Math.cos(yAngle);
    positions[i] = xx * Math.cos(zAngle) - yy * Math.sin(zAngle);
    positions[i + 1] = xx * Math.sin(zAngle) + yy * Math.cos(zAngle);
    positions[i + 2] = zzz;
  }
}
rotate(.45, -.25, 0);
rotate(0, 3.1, 0);
rotate(-.15, 0, -.08);
const shape = { columns, rows, positions: Array.from(positions, value => +value.toFixed(5)) };
const output = new URL('../js/paper-shape.js', import.meta.url);
writeFileSync(output, '// Generated by scripts/generate-paper-shape.mjs (seed 741).\n// Original pre-creased sheet; no third-party model or texture.\nexport const paperShape = ' + JSON.stringify(shape) + ';\n');
console.log(`Baked ${positions.length / 3} paper vertices.`);
