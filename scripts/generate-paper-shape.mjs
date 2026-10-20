import fs from 'node:fs';

// Offline generation of the homepage's original crumpled sheet (seed 4471).
// A jittered triangular sheet with one diagonal per cell can fold independently;
// constraining both diagonals would turn the cells into rigid origami panels.
// Thin vertex–triangle contacts keep the compressed faces from passing through
// each other. The browser receives only the baked mesh, never this simulation.
// This is a visual approximation, not a collision-complete cloth physics engine.
const columns = 64, rows = 46;
const count = (columns + 1) * (rows + 1);
const positions = new Float64Array(count * 3);
const previous = new Float64Array(positions.length);
const constraints = [], uvs = [], indices = [], edges = new Map();
let state = 4471;
function random() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
}

for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
  const i = (y * (columns + 1) + x) * 3;
  // The smaller jitter keeps every triangle correctly oriented in the flat UVs.
  const u = (x + ((x === 0 || x === columns) ? 0 : (random() - .5) * .45)) / columns;
  const v = (y + ((y === 0 || y === rows) ? 0 : (random() - .5) * .45)) / rows;
  uvs.push(u, v);
  positions[i] = (u - .5) * 5.8;
  positions[i + 1] = (.5 - v) * 4.2;
  positions[i + 2] = .09 * Math.sin(u * 17 + v * 5)
    + .07 * Math.cos(v * 15 - u * 4) + .012 * (random() - .5);
}
previous.set(positions);

function addConstraint(a, b, stiffness) {
  const rest = Math.hypot((uvs[a * 2] - uvs[b * 2]) * 5.8,
    (uvs[a * 2 + 1] - uvs[b * 2 + 1]) * 4.2);
  constraints.push([a * 3, b * 3, rest, stiffness]);
}
for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
  const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
  if (random() < .5) indices.push(a, c, d, a, d, b);
  else indices.push(a, c, b, b, c, d);
}
for (let f = 0; f < indices.length; f += 3) for (let j = 0; j < 3; j++) {
  const a = indices[f + j], b = indices[f + (j + 1) % 3], opposite = indices[f + (j + 2) % 3];
  const key = a < b ? a + ':' + b : b + ':' + a;
  const edge = edges.get(key);
  if (edge) edge.push(opposite);
  else edges.set(key, [a, b, opposite]);
}
for (const edge of edges.values()) {
  addConstraint(edge[0], edge[1], .92);
  if (edge.length === 4) addConstraint(edge[2], edge[3], .045);
}

const gap = .025;
const pointCells = new Map(), pointInv = 1 / gap;
// All simulated coordinates remain well within this integer hash domain.
const cellKey = (x, y, z) => ((x + 96) * 192 + y + 96) * 192 + z + 96;
function adjacent(a, b) {
  return Math.abs(a % (columns + 1) - b % (columns + 1)) <= 1
    && Math.abs(Math.floor(a / (columns + 1)) - Math.floor(b / (columns + 1))) <= 1;
}
function pointContacts() {
  pointCells.clear();
  for (let a = 0; a < count; a++) {
    const i = a * 3;
    const key = cellKey(Math.floor(positions[i] * pointInv),
      Math.floor(positions[i + 1] * pointInv), Math.floor(positions[i + 2] * pointInv));
    let list = pointCells.get(key);
    if (!list) pointCells.set(key, list = []);
    list.push(a);
  }
  for (let a = 0; a < count; a++) {
    const i = a * 3, x = Math.floor(positions[i] * pointInv);
    const y = Math.floor(positions[i + 1] * pointInv), z = Math.floor(positions[i + 2] * pointInv);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = pointCells.get(cellKey(x + dx, y + dy, z + dz));
      if (!list) continue;
      for (const b of list) {
        if (b <= a || adjacent(a, b)) continue;
        const j = b * 3, xx = positions[j] - positions[i];
        const yy = positions[j + 1] - positions[i + 1], zz = positions[j + 2] - positions[i + 2];
        const squared = xx * xx + yy * yy + zz * zz;
        if (squared >= gap * gap || squared < 1e-12) continue;
        const distance = Math.sqrt(squared), correction = (gap - distance) / distance * .48;
        positions[i] -= xx * correction; positions[i + 1] -= yy * correction; positions[i + 2] -= zz * correction;
        positions[j] += xx * correction; positions[j + 1] += yy * correction; positions[j + 2] += zz * correction;
      }
    }
  }
}

const contactPrevious = new Float64Array(positions);
const triangleCells = new Map(), triangleInv = 1 / .19;
function triangleContacts() {
  triangleCells.clear();
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
    const minX = Math.floor((Math.min(positions[a], positions[b], positions[c]) - gap) * triangleInv);
    const maxX = Math.floor((Math.max(positions[a], positions[b], positions[c]) + gap) * triangleInv);
    const minY = Math.floor((Math.min(positions[a + 1], positions[b + 1], positions[c + 1]) - gap) * triangleInv);
    const maxY = Math.floor((Math.max(positions[a + 1], positions[b + 1], positions[c + 1]) + gap) * triangleInv);
    const minZ = Math.floor((Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) - gap) * triangleInv);
    const maxZ = Math.floor((Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) + gap) * triangleInv);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      const key = cellKey(x, y, z);
      let list = triangleCells.get(key);
      if (!list) triangleCells.set(key, list = []);
      list.push(f);
    }
  }
  for (let a = 0; a < count; a++) {
    const i = a * 3;
    const list = triangleCells.get(cellKey(Math.floor(positions[i] * triangleInv),
      Math.floor(positions[i + 1] * triangleInv), Math.floor(positions[i + 2] * triangleInv)));
    if (!list) continue;
    for (const f of list) {
      const ids = [indices[f], indices[f + 1], indices[f + 2]];
      if (ids.some(b => adjacent(a, b))) continue;
      const b = ids[0] * 3, c = ids[1] * 3, d = ids[2] * 3;
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      const cx = positions[c] - bx, cy = positions[c + 1] - by, cz = positions[c + 2] - bz;
      const dx = positions[d] - bx, dy = positions[d + 1] - by, dz = positions[d + 2] - bz;
      let nx = cy * dz - cz * dy, ny = cz * dx - cx * dz, nz = cx * dy - cy * dx;
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-8) continue;
      nx /= length; ny /= length; nz /= length;
      const px = positions[i] - bx, py = positions[i + 1] - by, pz = positions[i + 2] - bz;
      const distance = px * nx + py * ny + pz * nz;
      if (Math.abs(distance) > .06) continue;
      const cc = cx * cx + cy * cy + cz * cz, dd = dx * dx + dy * dy + dz * dz;
      const cd = cx * dx + cy * dy + cz * dz, pc = px * cx + py * cy + pz * cz;
      const pd = px * dx + py * dy + pz * dz, denominator = cc * dd - cd * cd;
      if (denominator < 1e-12) continue;
      const w1 = (dd * pc - cd * pd) / denominator, w2 = (cc * pd - cd * pc) / denominator;
      const w0 = 1 - w1 - w2;
      if (Math.min(w0, w1, w2) < -.005) continue;

      // Retain the previous side of the triangle when a point crosses its plane.
      const ocx = contactPrevious[c] - contactPrevious[b];
      const ocy = contactPrevious[c + 1] - contactPrevious[b + 1], ocz = contactPrevious[c + 2] - contactPrevious[b + 2];
      const odx = contactPrevious[d] - contactPrevious[b];
      const ody = contactPrevious[d + 1] - contactPrevious[b + 1], odz = contactPrevious[d + 2] - contactPrevious[b + 2];
      const onx = ocy * odz - ocz * ody, ony = ocz * odx - ocx * odz, onz = ocx * ody - ocy * odx;
      const oldDistance = (contactPrevious[i] - contactPrevious[b]) * onx
        + (contactPrevious[i + 1] - contactPrevious[b + 1]) * ony
        + (contactPrevious[i + 2] - contactPrevious[b + 2]) * onz;
      let sign = distance >= 0 ? 1 : -1;
      if (oldDistance * distance < 0) sign = oldDistance >= 0 ? 1 : -1;
      if (sign * distance >= gap) continue;
      const correction = Math.min(.035, (gap - sign * distance) / (1 + w0 * w0 + w1 * w1 + w2 * w2)) * .75 * sign;
      positions[i] += nx * correction; positions[i + 1] += ny * correction; positions[i + 2] += nz * correction;
      for (const [j, weight] of [[b, w0], [c, w1], [d, w2]]) {
        positions[j] -= nx * correction * weight;
        positions[j + 1] -= ny * correction * weight;
        positions[j + 2] -= nz * correction * weight;
      }
    }
  }
  contactPrevious.set(positions);
}

for (let frame = 0; frame < 340; frame++) {
  const t = Math.min(1, frame / 280), radius = 3.5 - (3.5 - .85) * t * t * (3 - 2 * t);
  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    positions[i] += (positions[i] - previous[i]) * .4;
    previous[i] = current;
  }
  for (let iteration = 0; iteration < 18; iteration++) {
    for (let edge = 0; edge < constraints.length; edge++) {
      const [a, b, rest, stiffness] = constraints[(iteration + frame) % 2 ? constraints.length - 1 - edge : edge];
      const x = positions[b] - positions[a], y = positions[b + 1] - positions[a + 1], z = positions[b + 2] - positions[a + 2];
      const distance = Math.hypot(x, y, z) || 1, correction = (distance - rest) / distance * .5 * stiffness;
      positions[a] += x * correction; positions[a + 1] += y * correction; positions[a + 2] += z * correction;
      positions[b] -= x * correction; positions[b + 1] -= y * correction; positions[b + 2] -= z * correction;
    }
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      const distance = Math.hypot(x / (1 + .04 * Math.sin(frame * .021)), y / .96, z / .92);
      if (distance > radius) {
        const correction = 1 - (distance - radius) / distance * .20;
        positions[i] *= correction; positions[i + 1] *= correction; positions[i + 2] *= correction;
      }
    }
    if (iteration % 3 === 2) { pointContacts(); triangleContacts(); }
  }
}

// Present the compact side of the wad, with the loose edge tucked behind it.
// The runtime only opens the baked sheet; it does not run the simulation.
const tilt = -.15, yaw = Math.PI * 7 / 6, pitch = .2;
for (let i = 0; i < positions.length; i += 3) {
  const x = positions[i], y = positions[i + 1], z = positions[i + 2];
  const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
  const zz = y * Math.sin(tilt) + z * Math.cos(tilt);
  const turnedZ = -x * Math.sin(yaw) + zz * Math.cos(yaw);
  positions[i] = x * Math.cos(yaw) + zz * Math.sin(yaw);
  positions[i + 1] = yy * Math.cos(pitch) - turnedZ * Math.sin(pitch);
  positions[i + 2] = yy * Math.sin(pitch) + turnedZ * Math.cos(pitch);
}
const shape = {
  columns, rows,
  uvs: uvs.map(value => +value.toFixed(8)),
  indices,
  positions: Array.from(positions, value => +value.toFixed(5)),
};
let area = 0;
for (let f = 0; f < indices.length; f += 3) {
  const [a, b, c] = indices.slice(f, f + 3).map(index => index * 2), uv = shape.uvs;
  const signed = (uv[b] - uv[a]) * (uv[c + 1] - uv[a + 1]) - (uv[b + 1] - uv[a + 1]) * (uv[c] - uv[a]);
  if (signed >= -1e-10) throw new Error('The rounded paper UVs contain a flipped or degenerate triangle.');
  area -= signed / 2;
}
if (Math.abs(area - 1) > 1e-8 || shape.uvs.some(value => value < 0 || value > 1)
  || shape.positions.some(value => !Number.isFinite(value) || Math.abs(value) > 4)) {
  throw new Error('Generated paper mesh failed its coordinate bounds check.');
}
const header = '// Generated by scripts/generate-paper-shape.mjs (seed 4471).\n'
  + '// Original compressed sheet with thin self-contact; no third-party model or texture.\n';
fs.writeFileSync(new URL('../js/paper-shape.js', import.meta.url),
  header + 'export const paperShape = ' + JSON.stringify(shape) + ';\n');
console.log('Generated ' + count + ' paper vertices and ' + indices.length / 3 + ' triangles.');
