import { paperShape } from './paper-shape.js?v=paper-20261020';

// An original, dependency-free paper surface. The caller owns animation and the
// accessible HTML; this canvas is only the transient, printed-paper visual.

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 aUV;
layout(location=1) in vec3 aCrumpled;
layout(location=2) in float aFold;
uniform vec2 uSize;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uProgress;
uniform float uCamera;
uniform vec3 uLightCenter;
uniform vec3 uLightRight;
uniform vec3 uLightUp;
uniform vec3 uLight;
uniform float uLightExtent;
uniform bool uDepthPass;
out vec2 vUV;
out vec3 vPosition;
out vec3 vShadow;
out float vFold;
void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float gathered = p * p * (3.0 - 2.0 * p);
  vec3 flat = vec3((aUV.x - 0.5) * uSize.x, (0.5 - aUV.y) * uSize.y, 0.0);
  vec3 ball = aCrumpled * uRadius + vec3(uCenter, 0.0);
  vec3 position = mix(flat, ball, gathered);
  // Before gathering, the loose edges lift and the same creases open out.
  // Both endpoints are exact, so the print joins its real HTML without a jump.
  float opening = sin(p * 3.14159265);
  float edge = pow(max(abs(aUV.x - 0.5), abs(aUV.y - 0.5)) * 2.0, 1.8);
  position.z += opening * uRadius * (0.18 + edge * 0.45 + aFold * 0.72);
  position.xy += opening * edge * uRadius * vec2(
    sin(aUV.y * 14.1 + aUV.x * 4.2) * 0.10,
    cos(aUV.x * 12.7 - aUV.y * 3.8) * 0.08
  );
  vec3 lightOffset = position - uLightCenter;
  vec3 lightClip = vec3(dot(lightOffset, uLightRight), dot(lightOffset, uLightUp), -dot(lightOffset, uLight)) / uLightExtent;
  vShadow = lightClip * 0.5 + 0.5;
  vPosition = position;
  vUV = aUV;
  vFold = aFold;
  if (uDepthPass) {
    gl_Position = vec4(lightClip, 1.0);
  } else {
    // A long lens gives volume while keeping the fully open sheet pixel-aligned.
    float perspective = uCamera / (uCamera - position.z);
    vec2 projected = uCenter * gathered + (position.xy - uCenter * gathered) * perspective;
    gl_Position = vec4(projected / (uSize * 0.5), -position.z / uCamera, 1.0);
  }
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vPosition;
in vec3 vShadow;
in float vFold;
uniform sampler2D uPrint;
uniform sampler2D uShadow;
uniform sampler2D uPaper;
uniform vec2 uSize;
uniform vec3 uLight;
uniform vec3 uFill;
uniform float uProgress;
uniform float uShadowPixel;
out vec4 color;

float visibility(vec3 n) {
  if (any(lessThan(vShadow, vec3(0.0))) || any(greaterThan(vShadow, vec3(1.0)))) return 1.0;
  float bias = 0.0007 + 0.0015 * (1.0 - max(dot(n, uLight), 0.0));
  vec3 sx = dFdx(vShadow), sy = dFdy(vShadow);
  float determinant = sx.x * sy.y - sx.y * sy.x;
  vec2 plane = abs(determinant) > 0.00000001
    ? vec2(sx.z * sy.y - sy.z * sx.y, sx.x * sy.z - sy.x * sx.z) / determinant : vec2(0.0);
  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 sampleUV = (floor(vShadow.xy / uShadowPixel) + vec2(float(x), float(y)) + 0.5) * uShadowPixel;
      float stored = texture(uShadow, sampleUV).r;
      float receiver = vShadow.z + dot(plane, sampleUV - vShadow.xy);
      lit += receiver - bias <= stored ? 1.0 : 0.0;
    }
  }
  return lit / 9.0;
}
void main() {
  vec4 ink = texture(uPrint, vUV);
  vec3 ivory = vec3(0.992, 0.981, 0.955);
  vec3 front = mix(ivory, ink.rgb, ink.a);
  float printTreatment = smoothstep(0.4, 1.0, uProgress);
  float luminance = dot(front, vec3(0.2126, 0.7152, 0.0722));
  front = mix(front, vec3(luminance), printTreatment);
  front = mix(front, ivory, printTreatment * 0.985);
  vec3 albedo = gl_FrontFacing ? front : ivory;
  float material = smoothstep(0.0, 0.18, uProgress);
  vec3 dx = dFdx(vPosition), dy = dFdy(vPosition);
  vec3 n = normalize(cross(dx, dy));
  if (n.z < 0.0) n = -n;

  vec3 paper = texture(uPaper, vUV).rgb;
  vec2 heightGradient = (paper.rg * 255.0 - 128.0) * (320.0 / 127.0);
  vec2 uvX = dFdx(vUV), uvY = dFdy(vUV);
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float determinant = dot(dx, rx);
  vec3 gradient = (dot(heightGradient, uvX) * rx + dot(heightGradient, uvY) * ry)
    / max(abs(determinant), 0.00001) * sign(determinant);
  float crease = smoothstep(0.65, 0.95, uProgress);
  gradient *= crease * (gl_FrontFacing ? 1.0 : -1.0);
  // Bound the local tilt, so folded-over UVs cannot create glossy black pits.
  gradient *= min(1.0, 0.38 / max(length(gradient), 0.00001));
  n = normalize(n - gradient);

  float shadowWeight = clamp((uProgress - 0.72) / 0.2, 0.0, 1.0);
  float shadow = 1.0 - (1.0 - visibility(n)) * 0.68 * shadowWeight;
  float key = max(dot(n, uLight), 0.0);
  float fill = max(dot(n, uFill), 0.0);
  float ambient = 0.28 + 0.14 * (0.5 + 0.5 * n.y);
  float light = (ambient + 0.66 * key * shadow + 0.12 * fill) * 0.90;
  // Local recesses collect a little ambient shadow, independently of the sun.
  light *= 1.0 - max(0.0, -vFold) * 0.16 * material;
  float fibres = (paper.b * 255.0 - 128.0) / 255.0;
  vec3 linearPaper = pow(max(albedo, vec3(0.0)), vec3(2.2));
  vec3 shaded = pow(max(linearPaper * light, vec3(0.0)), vec3(1.0 / 2.2));
  shaded += fibres * 0.014 * crease;
  // Champagne light catches the folds and grazing edges; the paper stays matte.
  // It disappears before the real profile and its original colors are revealed.
  float gold = smoothstep(0.55, 1.0, uProgress);
  float shadeLuminance = dot(shaded, vec3(0.2126, 0.7152, 0.0722));
  float recess = 1.0 - smoothstep(0.58, 0.91, shadeLuminance);
  float rim = pow(1.0 - abs(n.z), 3.0);
  float warmth = gold * (0.025 + recess * 0.16 + rim * 0.10);
  shaded = mix(shaded, vec3(1.0, 0.8314, 0.5294), warmth);
  shaded += gold * (0.25 + recess * 0.75) * vec3(0.012, 0.005, 0.0);
  // The surface is matte: broad illumination, crisp folds, no plastic glints.
  color = vec4(mix(front, min(shaded, vec3(1.0)), material), 1.0);
}`;

const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() { }
`;

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

// Fine compression wrinkles are a material detail, shared by both renderers.
// Bake them once in the sheet's UV space so they follow the print as it unfolds.
let cachedPaperMaterial;
function paperMaterial() {
  if (cachedPaperMaterial) return cachedPaperMaterial;
  const size = 512, height = new Float32Array(size * size);
  let seed = 19837;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let crease = 0; crease < 280; crease++) {
    const primary = crease < 62;
    const cx = random(), cy = random(), angle = random() * Math.PI * 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const length = primary ? .07 + random() * .12 : .018 + random() * .065;
    const width = primary ? .0035 + random() * .0025 : .0022 + random() * .0018;
    const amplitude = (primary ? 1.2 + random() * .8 : .35 + random() * .5) * (random() < .48 ? -1 : 1);
    const bend = (random() - .5) * width * 3;
    const extentX = Math.abs(dx) * length * .5 + width * 6;
    const extentY = Math.abs(dy) * length * .5 + width * 6;
    const minX = Math.max(0, Math.floor((cx - extentX) * size)), maxX = Math.min(size - 1, Math.ceil((cx + extentX) * size));
    const minY = Math.max(0, Math.floor((cy - extentY) * size)), maxY = Math.min(size - 1, Math.ceil((cy + extentY) * size));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const ux = (x + .5) / size - cx, uy = (y + .5) / size - cy;
      const along = (ux * dx + uy * dy) / length + .5;
      if (along <= 0 || along >= 1) continue;
      const taper = Math.sin(along * Math.PI);
      const across = (ux * -dy + uy * dx - bend * Math.sin(along * Math.PI * 2)) / width;
      if (Math.abs(across) > 5) continue;
      // A sharp compressed ridge and its softer neighboring valley make a
      // highlight/shadow pair, rather than speckles or a plastic normal map.
      const profile = Math.exp(-Math.abs(across) * 1.5) - .38 * Math.exp(-Math.abs(across + 1.7));
      height[y * size + x] += amplitude * taper * taper * profile;
    }
  }
  const pixels = new Uint8Array(size * size * 4), gradientRange = 320;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * size + x, out = at * 4;
    const du = (height[y * size + Math.min(size - 1, x + 1)] - height[y * size + Math.max(0, x - 1)]) * size * .5;
    const dv = (height[Math.min(size - 1, y + 1) * size + x] - height[Math.max(0, y - 1) * size + x]) * size * .5;
    pixels[out] = Math.round(128 + Math.max(-127, Math.min(127, du / gradientRange * 127)));
    pixels[out + 1] = Math.round(128 + Math.max(-127, Math.min(127, dv / gradientRange * 127)));
    // Grain only varies the diffuse paper by about one level out of 255.
    pixels[out + 2] = Math.round(128 + (random() - .5) * 84);
    pixels[out + 3] = 255;
  }
  cachedPaperMaterial = { size, pixels, gradientRange };
  return cachedPaperMaterial;
}

// Refine the simulated sheet while retaining the sharpest mountain/valley folds.
// UVs follow the same subdivision, so the opened surface still covers the profile.
function refineSheet(points, faces) {
  const edges = new Map(), neighbors = points.map(() => new Set()), sharp = points.map(() => []);
  const normals = [];
  for (let f = 0; f < faces.length; f += 3) {
    const a = points[faces[f]], b = points[faces[f + 1]], c = points[faces[f + 2]];
    const ab = b.slice(2).map((n, j) => n - a[j + 2]), ac = c.slice(2).map((n, j) => n - a[j + 2]);
    normals.push(normalize(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]));
    for (let i = 0; i < 3; i++) {
      const a = faces[f + i], b = faces[f + (i + 1) % 3], opposite = faces[f + (i + 2) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let edge = edges.get(key);
      if (!edge) { edge = { a, b, opposite: [], faces: [] }; edges.set(key, edge); }
      edge.opposite.push(opposite); edge.faces.push(f / 3);
      neighbors[a].add(b); neighbors[b].add(a);
    }
  }
  for (const edge of edges.values()) {
    const [a, b] = edge.faces.map(f => normals[f]);
    edge.sharp = !b || a.reduce((sum, n, i) => sum + n * b[i], 0) < 0.78;
    if (edge.sharp) { sharp[edge.a].push(edge.b); sharp[edge.b].push(edge.a); }
  }
  const next = points.map((point, i) => {
    if (sharp[i].length > 2 || (point[0] === 0 || point[0] === 1) && (point[1] === 0 || point[1] === 1)) return point.slice();
    if (sharp[i].length === 2) return point.map((p, j) => p * .75 + (points[sharp[i][0]][j] + points[sharp[i][1]][j]) * .125);
    const list = [...neighbors[i]], beta = list.length === 3 ? 3 / 16 : 3 / (8 * list.length);
    return point.map((p, j) => p * (1 - list.length * beta) + list.reduce((s, k) => s + points[k][j] * beta, 0));
  });
  for (const edge of edges.values()) {
    edge.index = next.length;
    next.push(points[edge.a].map((p, j) => edge.sharp
      ? (p + points[edge.b][j]) * .5
      : (p + points[edge.b][j]) * .375 + (points[edge.opposite[0]][j] + points[edge.opposite[1]][j]) * .125));
  }
  const midpoint = (a, b) => edges.get(a < b ? `${a}:${b}` : `${b}:${a}`).index;
  const triangles = [];
  for (let f = 0; f < faces.length; f += 3) {
    const a = faces[f], b = faces[f + 1], c = faces[f + 2];
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    triangles.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { points: next, faces: triangles };
}

function geometry(passes = 2) {
  const { uvs, positions, indices } = paperShape;
  let points = [], faces = [...indices];
  // Use the same irregular triangles that were compressed in the bake. A
  // different diagonal would cut across the folds and create false sharp edges.
  for (let i = 0; i < uvs.length / 2; i++) {
    points.push([uvs[i * 2], uvs[i * 2 + 1], ...positions.slice(i * 3, i * 3 + 3)]);
  }
  for (let pass = 0; pass < passes; pass++) ({ points, faces } = refineSheet(points, faces));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis + 2]); max[axis] = Math.max(max[axis], point[axis + 2]);
  }
  const scale = 2 / Math.max(max[0] - min[0], max[1] - min[1]);
  const vertices = new Float32Array(points.length * 6);
  for (let i = 0; i < points.length; i++) {
    vertices[i * 6] = points[i][0]; vertices[i * 6 + 1] = points[i][1];
    for (let axis = 0; axis < 3; axis++) vertices[i * 6 + 2 + axis] = (points[i][axis + 2] - (min[axis] + max[axis]) * .5) * scale;
  }
  return { vertices, indices: new Uint16Array(faces) };
}

function program(gl, vertex, fragment) {
  const shaders = [];
  let linked;
  try {
    for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Paper shader unavailable');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Paper shader failed');
    }
    linked = gl.createProgram();
    if (!linked) throw new Error('Paper renderer unavailable');
    for (const shader of shaders) gl.attachShader(linked, shader);
    gl.linkProgram(linked);
    if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(linked) || 'Paper program failed');
    return linked;
  } catch (error) {
    if (linked) gl.deleteProgram(linked);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

// A small directional depth map gives the software path the same overlapping
// folds as WebGL. No offscreen DOM, external image or continuously running loop.
function paperDepthMap(world, indices, light, centerX, centerY, radius, size = 384) {
  const extent = radius * 1.65, scale = size / (extent * 2);
  const right = normalize(light[2], 0, -light[0]);
  const up = [light[1] * right[2], light[2] * right[0] - light[0] * right[2], -light[1] * right[0]];
  const projected = new Float32Array(world.length), depth = new Float32Array(size * size);
  depth.fill(-1e30);
  for (let i = 0; i < world.length; i += 3) {
    const x = world[i] - centerX, y = world[i + 1] - centerY, z = world[i + 2];
    projected[i] = (x * right[0] + y * right[1] + z * right[2]) * scale + size / 2;
    projected[i + 1] = (x * up[0] + y * up[1] + z * up[2]) * scale + size / 2;
    projected[i + 2] = x * light[0] + y * light[1] + z * light[2];
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = projected[a], ay = projected[a + 1], az = projected[a + 2];
    const bx = projected[b], by = projected[b + 1], bz = projected[b + 2];
    const cx = projected[c], cy = projected[c + 1], cz = projected[c + 2];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < .005) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    const inverse = 1 / area, stepBX = (cy - ay) * inverse, stepCX = -(by - ay) * inverse;
    for (let y = minY; y <= maxY; y++) {
      let wb = ((minX + .5 - ax) * (cy - ay) - (y + .5 - ay) * (cx - ax)) * inverse;
      let wc = ((bx - ax) * (y + .5 - ay) - (by - ay) * (minX + .5 - ax)) * inverse;
      for (let x = minX; x <= maxX; x++, wb += stepBX, wc += stepCX) {
        const wa = 1 - wb - wc;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const at = y * size + x, z = wa * az + wb * bz + wc * cz;
        if (z > depth[at]) depth[at] = z;
      }
    }
  }
  return { size, projected, depth };
}

function paperVisibility(map, a, b, c, key) {
  const { size, projected, depth } = map;
  const cx = (projected[a] + projected[b] + projected[c]) / 3;
  const cy = (projected[a + 1] + projected[b + 1] + projected[c + 1]) / 3;
  const z = (projected[a + 2] + projected[b + 2] + projected[c + 2]) / 3;
  const abx = projected[b] - projected[a], aby = projected[b + 1] - projected[a + 1], abz = projected[b + 2] - projected[a + 2];
  const acx = projected[c] - projected[a], acy = projected[c + 1] - projected[a + 1], acz = projected[c + 2] - projected[a + 2];
  const area = abx * acy - aby * acx;
  const slopeX = Math.abs(area) > .00001 ? (abz * acy - acz * aby) / area : 0;
  const slopeY = Math.abs(area) > .00001 ? (abx * acz - acx * abz) / area : 0;
  const x = Math.floor(cx), y = Math.floor(cy);
  const bias = 1.5 + 2.8 * (1 - key);
  let lit = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const px = x + dx, py = y + dy;
    // Compare each sample with this receiver plane, not the centroid's depth.
    // This prevents a continuous, sloping paper panel from shadowing itself.
    const receiver = z + slopeX * (px + .5 - cx) + slopeY * (py + .5 - cy);
    lit += px < 0 || py < 0 || px >= size || py >= size || receiver + bias >= depth[py * size + px] ? 1 : 0;
  }
  return lit / 9;
}

// Embedded browsers can disable GPU contexts. This renderer uses the very same
// sheet and a real depth buffer, so folds still overlap correctly in that case.
class SoftwarePaperMesh {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    if (!this.context) throw new Error('Paper canvas is unavailable');
    this.mesh = geometry();
    this.motionMesh = geometry(1);
    const count = this.mesh.vertices.length / 6;
    this.world = new Float32Array(count * 3);
    this.screen = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    this.disposed = false;
    this.width = 1; this.height = 1;
    this.shadeTable = new Uint8Array(96 * 256);
    for (let shade = 0; shade < 96; shade++) {
      const lighting = 0.24 + shade / 95 * 0.92;
      for (let value = 0; value < 256; value++) {
        this.shadeTable[shade * 256 + value] = Math.min(255, Math.round(value * Math.pow(lighting, 1 / 2.2)));
      }
    }
    this.material = paperMaterial();
    this.setTexture(source);
  }

  setTexture(source) {
    if (this.disposed || !source) return;
    const texture = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
    texture.width = Math.max(1, Math.round(source.width * scale));
    texture.height = Math.max(1, Math.round(source.height * scale));
    const context = texture.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Paper print is unavailable');
    context.fillStyle = '#fdfaf4';
    context.fillRect(0, 0, texture.width, texture.height);
    context.drawImage(source, 0, 0, texture.width, texture.height);
    this.texture = context.getImageData(0, 0, texture.width, texture.height).data;
    this.textureWidth = texture.width;
    this.textureHeight = texture.height;
    this.source = source;
  }

  resize(width, height, dpr = 1, centerX = width / 2, radiusLimit = Infinity) {
    if (this.disposed) return;
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    // Supersample the resting paper even in embedded 1× browser surfaces.
    this.dpr = 2;
    this.radius = Math.max(1, Math.min(190, Math.min(this.width, this.height) * 0.29, radiusLimit));
    this.centerX = Math.max(this.radius + 8, Math.min(this.width - this.radius - 8, centerX));
    this.centerY = Math.min(this.height / 2, 360);
    this.previousRegion = null;
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
  }

  render(progress, pointerX = 0, pointerY = 0) {
    if (this.disposed || !this.texture || !this.radius) return;
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const scale = p >= 0.9999 || p < 0.0001 ? this.dpr : Math.min(1.3, this.dpr);
    const targetWidth = Math.max(1, Math.round(this.width * scale));
    const targetHeight = Math.max(1, Math.round(this.height * scale));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth; this.canvas.height = targetHeight;
      this.previousRegion = null;
    }
    const context = this.context, width = this.canvas.width, height = this.canvas.height;
    if (p < 0.0001) {
      context.clearRect(0, 0, width, height);
      context.drawImage(this.source, 0, 0, width, height);
      this.previousRegion = { x: 0, y: 0, width, height };
      return;
    }
    const gathered = p * p * (3 - 2 * p), opening = Math.sin(p * Math.PI);
    const centerX = this.centerX - this.width / 2, centerY = this.height / 2 - this.centerY;
    const camera = Math.max(this.width, this.height) * 1.8;
    const sx = width / this.width, sy = height / this.height;
    const { vertices, indices } = p >= .9999 ? this.mesh : this.motionMesh;
    const world = this.world, screen = this.screen, radius = this.radius;
    const normals = this.normals;
    let left = width, right = 0, top = height, bottom = 0;
    for (let i = 0, j = 0; i < vertices.length; i += 6, j += 3) {
      const u = vertices[i], v = vertices[i + 1];
      const edge = Math.pow(Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2, 1.8);
      const x = (u - 0.5) * this.width * (1 - gathered)
        + (vertices[i + 2] * radius + centerX) * gathered
        + opening * edge * radius * Math.sin(v * 14.1 + u * 4.2) * 0.10;
      const y = (0.5 - v) * this.height * (1 - gathered)
        + (vertices[i + 3] * radius + centerY) * gathered
        + opening * edge * radius * Math.cos(u * 12.7 - v * 3.8) * 0.08;
      const z = vertices[i + 4] * radius * gathered
        + opening * radius * (0.18 + edge * 0.45 + vertices[i + 5] * 0.72);
      world[j] = x; world[j + 1] = y; world[j + 2] = z;
      const perspective = camera / (camera - z);
      screen[j] = (centerX * gathered + (x - centerX * gathered) * perspective) * sx + width / 2;
      screen[j + 1] = height / 2 - (centerY * gathered + (y - centerY * gathered) * perspective) * sy;
      screen[j + 2] = z;
      left = Math.min(left, screen[j]); right = Math.max(right, screen[j]);
      top = Math.min(top, screen[j + 1]); bottom = Math.max(bottom, screen[j + 1]);
    }
    normals.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const abx = world[b] - world[a], aby = world[b + 1] - world[a + 1], abz = world[b + 2] - world[a + 2];
      const acx = world[c] - world[a], acy = world[c + 1] - world[a + 1], acz = world[c + 2] - world[a + 2];
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
      normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
      normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
    }
    for (let i = 0; i < vertices.length / 2; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
    }
    const roiX = Math.max(0, Math.floor(left) - 2), roiY = Math.max(0, Math.floor(top) - 2);
    const roiWidth = Math.max(1, Math.min(width - roiX, Math.ceil((right - roiX + 3) / 32) * 32));
    const roiHeight = Math.max(1, Math.min(height - roiY, Math.ceil((bottom - roiY + 3) / 32) * 32));
    if (!this.image || this.image.width !== roiWidth || this.image.height !== roiHeight) {
      this.image = context.createImageData(roiWidth, roiHeight);
      this.pixels = new Uint32Array(this.image.data.buffer);
      this.depth = new Float32Array(roiWidth * roiHeight);
    }
    this.pixels.fill(0); this.depth.fill(-1e30);
    const px = Math.max(-1, Math.min(1, pointerX)), py = Math.max(-1, Math.min(1, pointerY));
    const light = normalize(-0.55 + px * 0.13, 0.78 - py * 0.10, 1.10);
    const fill = normalize(0.7, -0.25, 0.8);
    const shadowMap = p > 0.72 ? paperDepthMap(world, indices, light, centerX * gathered, centerY * gathered, radius + (1 - gathered) * this.width * .5, p >= .9999 ? 384 : 192) : null;
    const shadowWeight = Math.max(0, Math.min(1, (p - .72) / .2));
    const material = Math.min(1, p / 0.18);
    const creaseLevel = Math.max(0, Math.min(1, (p - .65) / .30));
    const crease = creaseLevel * creaseLevel * (3 - 2 * creaseLevel);
    const paper = this.material.pixels, paperSize = this.material.size;
    const gradientUnit = this.material.gradientRange / 127;
    const treatment = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
    const printTreatment = treatment * treatment * (3 - 2 * treatment);
    const ivoryWeight = printTreatment * 0.985;
    const colorWeight = (1 - printTreatment) * (1 - ivoryWeight);
    const grayWeight = printTreatment * (1 - ivoryWeight);
    const depth = this.depth, output = this.pixels, texture = this.texture;
    const tw = this.textureWidth, th = this.textureHeight, shades = this.shadeTable;
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const ia = indices[triangle], ib = indices[triangle + 1], ic = indices[triangle + 2];
      const a = ia * 3, b = ib * 3, c = ic * 3;
      const ax = screen[a], ay = screen[a + 1], az = screen[a + 2];
      const bx = screen[b], by = screen[b + 1], bz = screen[b + 2];
      const cx = screen[c], cy = screen[c + 1], cz = screen[c + 2];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 0.005) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      if (maxX < minX || maxY < minY) continue;
      const front = area < 0;
      const abx = world[b] - world[a], aby = world[b + 1] - world[a + 1], abz = world[b + 2] - world[a + 2];
      const acx = world[c] - world[a], acy = world[c + 1] - world[a + 1], acz = world[c + 2] - world[a + 2];
      let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      const norm = Math.hypot(nx, ny, nz) * (front ? 1 : -1);
      if (Math.abs(norm) < 1e-9) continue;
      nx /= norm; ny /= norm; nz /= norm;
      const key = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      const bounce = Math.max(0, nx * fill[0] + ny * fill[1] + nz * fill[2]);
      const visibility = shadowMap ? 1 - (1 - paperVisibility(shadowMap, a, b, c, key)) * shadowWeight * .68 : 1;
      const ambient = 0.28 + 0.14 * (0.5 + 0.5 * ny);
      const illumination = 1 + ((ambient + key * .66 * visibility + bounce * .12) * .90 - 1) * material;
      const faceShade = Math.max(0, Math.min(95, (illumination - .24) / .92 * 95));
      const shadeAt = index => {
        let x = normals[index], y = normals[index + 1], z = normals[index + 2];
        if (!front) { x = -x; y = -y; z = -z; }
        // Fade toward the face normal at a sharp fold. A hard normal cutoff
        // made otherwise continuous paper faces break into visible triangles.
        const alignment = x * nx + y * ny + z * nz;
        const level = Math.max(0, Math.min(1, (alignment - .55) / .40));
        if (level <= 0) return faceShade;
        const blend = level * level * (3 - 2 * level) * .45;
        const key = Math.max(0, x * light[0] + y * light[1] + z * light[2]);
        const bounce = Math.max(0, x * fill[0] + y * fill[1] + z * fill[2]);
        const ambient = .28 + .14 * (.5 + .5 * y);
        const lit = 1 + ((ambient + key * .66 * visibility + bounce * .12) * .90 - 1) * material;
        const vertexShade = Math.max(0, Math.min(95, (lit - .24) / .92 * 95));
        return faceShade + (vertexShade - faceShade) * blend;
      };
      const shadeA = shadeAt(a), shadeB = shadeAt(b), shadeC = shadeAt(c);
      const au = vertices[ia * 6], av = vertices[ia * 6 + 1];
      const bu = vertices[ib * 6], bv = vertices[ib * 6 + 1];
      const cu = vertices[ic * 6], cv = vertices[ic * 6 + 1];
      // UV covectors convert the shared crease-height derivatives into a
      // local light response. This is constant per face, cheap per visible pixel.
      const uvDet = (bu - au) * (cv - av) - (bv - av) * (cu - au);
      let creaseU = 0, creaseV = 0;
      if (crease > 0 && Math.abs(uvDet) > 1e-12) {
        const pux = (abx * (cv - av) - acx * (bv - av)) / uvDet;
        const puy = (aby * (cv - av) - acy * (bv - av)) / uvDet;
        const puz = (abz * (cv - av) - acz * (bv - av)) / uvDet;
        const pvx = (acx * (bu - au) - abx * (cu - au)) / uvDet;
        const pvy = (acy * (bu - au) - aby * (cu - au)) / uvDet;
        const pvz = (acz * (bu - au) - abz * (cu - au)) / uvDet;
        const ux = pvy * nz - pvz * ny, uy = pvz * nx - pvx * nz, uz = pvx * ny - pvy * nx;
        const vx = ny * puz - nz * puy, vy = nz * pux - nx * puz, vz = nx * puy - ny * pux;
        const metric = pux * ux + puy * uy + puz * uz;
        if (Math.abs(metric) > 1e-8) {
          const weight = -crease * (front ? 1 : -1) * gradientUnit * 95 / .92 / metric * .90;
          const keyWeight = key > 0 ? .66 * visibility : 0, fillWeight = bounce > 0 ? .12 : 0;
          creaseU = (uy * .07 + (ux * light[0] + uy * light[1] + uz * light[2]) * keyWeight
            + (ux * fill[0] + uy * fill[1] + uz * fill[2]) * fillWeight) * weight;
          creaseV = (vy * .07 + (vx * light[0] + vy * light[1] + vz * light[2]) * keyWeight
            + (vx * fill[0] + vy * fill[1] + vz * fill[2]) * fillWeight) * weight;
        }
      }
      const inverse = 1 / area;
      const stepBX = (cy - ay) * inverse, stepCX = -(by - ay) * inverse;
      const stepBY = -(cx - ax) * inverse, stepCY = (bx - ax) * inverse;
      let rowB = ((minX + 0.5 - ax) * (cy - ay) - (minY + 0.5 - ay) * (cx - ax)) * inverse;
      let rowC = ((bx - ax) * (minY + 0.5 - ay) - (by - ay) * (minX + 0.5 - ax)) * inverse;
      for (let y = minY; y <= maxY; y++) {
        let wb = rowB, wc = rowC, address = (y - roiY) * roiWidth + minX - roiX;
        for (let x = minX; x <= maxX; x++, address++, wb += stepBX, wc += stepCX) {
          const wa = 1 - wb - wc;
          if (wa < -0.00001 || wb < -0.00001 || wc < -0.00001) continue;
          const z = wa * az + wb * bz + wc * cz;
          if (z <= depth[address]) continue;
          depth[address] = z;
          const u = wa * au + wb * bu + wc * cu, v = wa * av + wb * bv + wc * cv;
          let shadeLevel = wa * shadeA + wb * shadeB + wc * shadeC;
          if (crease > 0) {
            const mx = Math.max(0, Math.min(paperSize - 1, (u * (paperSize - 1) + .5) | 0));
            const my = Math.max(0, Math.min(paperSize - 1, (v * (paperSize - 1) + .5) | 0));
            const at = (my * paperSize + mx) * 4;
            const relief = (paper[at] - 128) * creaseU + (paper[at + 1] - 128) * creaseV;
            shadeLevel += Math.max(-15, Math.min(15, relief)) + (paper[at + 2] - 128) * .009 * crease;
          }
          const shade = Math.max(0, Math.min(95, Math.round(shadeLevel))) * 256;
          if (!front) {
            output[address] = (255 << 24) | (shades[shade + 244] << 16) | (shades[shade + 250] << 8) | shades[shade + 253];
            continue;
          }
          const tx = Math.max(0, Math.min(tw - 1, Math.round(u * (tw - 1))));
          const ty = Math.max(0, Math.min(th - 1, Math.round(v * (th - 1))));
          const source = (ty * tw + tx) * 4;
          if (printTreatment > 0) {
            const luminance = texture[source] * 0.2126 + texture[source + 1] * 0.7152 + texture[source + 2] * 0.0722;
            const gray = luminance * grayWeight;
            const red = (texture[source] * colorWeight + gray + 253 * ivoryWeight + 0.5) | 0;
            const green = (texture[source + 1] * colorWeight + gray + 250 * ivoryWeight + 0.5) | 0;
            const blue = (texture[source + 2] * colorWeight + gray + 244 * ivoryWeight + 0.5) | 0;
            output[address] = (255 << 24) | (shades[shade + blue] << 16)
              | (shades[shade + green] << 8) | shades[shade + red];
          } else {
            output[address] = (255 << 24) | (shades[shade + texture[source + 2]] << 16)
              | (shades[shade + texture[source + 1]] << 8) | shades[shade + texture[source]];
          }
        }
        rowB += stepBY; rowC += stepCY;
      }
    }
    if (p > 0.55) {
      // A small screen-space cavity term: concave folds shade themselves while
      // broad convex paper faces keep their ivory. Fold and edge illumination
      // shares the WebGL champagne treatment and fades completely by p=.55.
      const reach = Math.max(2, Math.round(scale * 5));
      const vertical = reach * roiWidth;
      const strength = Math.min(1, (p - 0.55) / 0.3);
      const glowProgress = Math.min(1, (p - 0.55) / 0.45);
      const gold = glowProgress * glowProgress * (3 - 2 * glowProgress);
      for (let y = 0; y < roiHeight; y++) {
        for (let x = 0, at = y * roiWidth; x < roiWidth; x++, at++) {
          if (!output[at]) continue;
          const pixel = output[at];
          let red = pixel & 255, green = (pixel >>> 8) & 255, blue = (pixel >>> 16) & 255;
          let rim = 0;
          if (x >= reach && x < roiWidth - reach && y >= reach && y < roiHeight - reach) {
            const leftDepth = depth[at - reach], rightDepth = depth[at + reach];
            const upDepth = depth[at - vertical], downDepth = depth[at + vertical];
            if (leftDepth > -1e20 && rightDepth > -1e20 && upDepth > -1e20 && downDepth > -1e20) {
              const valley = (leftDepth + rightDepth + upDepth + downDepth) * 0.25 - depth[at] - 0.4;
              if (valley > 0) {
                const light = 1 - Math.min(0.20, valley * 0.018) * strength;
                red = (red * light + 0.5) | 0;
                green = (green * light + 0.5) | 0;
                blue = (blue * light + 0.5) | 0;
              }
              const slope = (Math.abs(leftDepth - rightDepth) + Math.abs(upDepth - downDepth)) * scale / (reach * 2);
              const grazing = slope / (slope + 4);
              rim = grazing * grazing * grazing;
            } else rim = 1;
          } else rim = 1;
          const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
          const level = Math.max(0, Math.min(1, (luminance - 0.58) / 0.33));
          const recess = 1 - level * level * (3 - 2 * level);
          const warmth = gold * (0.025 + recess * 0.16 + rim * 0.10);
          const emission = gold * (0.25 + recess * 0.75);
          red = Math.min(255, (red + (255 - red) * warmth + emission * 3.06 + 0.5) | 0);
          green = Math.min(255, (green + (212 - green) * warmth + emission * 1.275 + 0.5) | 0);
          blue = Math.min(255, (blue + (135 - blue) * warmth + 0.5) | 0);
          output[at] = (255 << 24) | (blue << 16) | (green << 8) | red;
        }
      }
    }
    if (this.previousRegion) {
      const old = this.previousRegion;
      context.clearRect(old.x, old.y, old.width, old.height);
    }
    context.putImageData(this.image, roiX, roiY);
    this.previousRegion = { x: roiX, y: roiY, width: roiWidth, height: roiHeight };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh = this.motionMesh = this.world = this.screen = this.normals = this.image = this.pixels = this.depth = this.texture = this.source = null;
  }
}

export class PaperMesh {
  constructor(canvas, textureCanvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: 'low-power' });
    if (!this.gl) return new SoftwarePaperMesh(canvas, textureCanvas);
    this.resources = [];
    this.disposed = false;
    this.width = 1; this.height = 1; this.dpr = 1;
    this.centerX = 0.5; this.centerY = 0.5;
    const gl = this.gl;
    const own = (kind, object) => { if (!object) throw new Error('Paper resource unavailable'); this.resources.push([kind, object]); return object; };
    try {
      this.surface = own('Program', program(gl, VERTEX, FRAGMENT));
      this.depth = own('Program', program(gl, VERTEX, DEPTH_FRAGMENT));
      this.uniforms = new Map();
      for (const item of [this.surface, this.depth]) {
        const uniforms = {};
        const count = gl.getProgramParameter(item, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
          const info = gl.getActiveUniform(item, i);
          uniforms[info.name] = gl.getUniformLocation(item, info.name);
        }
        this.uniforms.set(item, uniforms);
      }
      const mesh = geometry();
      this.indexCount = mesh.indices.length;
      this.vao = own('VertexArray', gl.createVertexArray());
      gl.bindVertexArray(this.vao);
      const vertexBuffer = own('Buffer', gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      const indexBuffer = own('Buffer', gl.createBuffer());
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      for (const [location, count, offset] of [[0, 2, 0], [1, 3, 8], [2, 1, 20]]) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, count, gl.FLOAT, false, 24, offset);
      }
      gl.bindVertexArray(null);
      this.print = own('Texture', gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, this.print);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const material = paperMaterial();
      this.paper = own('Texture', gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, this.paper);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, material.size, material.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, material.pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.shadowSize = 1024;
      this.shadowTexture = own('Texture', gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
      for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
      this.shadowBuffer = own('Framebuffer', gl.createFramebuffer());
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowBuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTexture, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Paper depth target unavailable');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.CULL_FACE);
      gl.frontFace(gl.CCW);
      gl.clearColor(0, 0, 0, 0);
      this.setTexture(textureCanvas);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  setTexture(source) {
    if (this.disposed || !source) return;
    const gl = this.gl;
    let upload = source;
    const maximum = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    if (source.width > maximum || source.height > maximum) {
      const ratio = maximum / Math.max(source.width, source.height);
      upload = document.createElement('canvas');
      upload.width = Math.max(1, Math.round(source.width * ratio));
      upload.height = Math.max(1, Math.round(source.height * ratio));
      const context = upload.getContext('2d');
      if (!context) throw new Error('Paper print unavailable');
      context.drawImage(source, 0, 0, upload.width, upload.height);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.print);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  resize(width, height, dpr = 1, centerX = width / 2, radiusLimit = Infinity) {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = 2;
    this.radius = Math.max(1, Math.min(190, Math.min(this.width, this.height) * 0.29, radiusLimit));
    this.centerX = Math.max(this.radius + 8, Math.min(this.width - this.radius - 8, centerX));
    this.centerY = Math.min(this.height / 2, 360);
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
  }

  render(progress, pointerX = 0, pointerY = 0) {
    if (this.disposed || this.gl.isContextLost()) return;
    const gl = this.gl;
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const gathered = p * p * (3 - 2 * p);
    const center = [this.centerX - this.width / 2, this.height / 2 - this.centerY];
    // Pointer values are normalized, small lighting shifts rather than a wobble.
    const px = Math.max(-1, Math.min(1, pointerX)), py = Math.max(-1, Math.min(1, pointerY));
    const light = normalize(-0.55 + px * 0.13, 0.78 - py * 0.10, 1.10);
    const right = normalize(light[2], 0, -light[0]);
    const up = [light[1] * right[2], light[2] * right[0] - light[0] * right[2], -light[1] * right[0]];
    const lightCenter = [center[0] * gathered, center[1] * gathered, 0];
    const extent = Math.max(this.width, this.height) * 0.85 * (1 - gathered) + this.radius * 1.8 * gathered;
    const apply = (item, depthPass) => {
      gl.useProgram(item);
      const u = this.uniforms.get(item);
      if (u.uSize) gl.uniform2f(u.uSize, this.width, this.height);
      if (u.uCenter) gl.uniform2fv(u.uCenter, center);
      if (u.uRadius) gl.uniform1f(u.uRadius, this.radius);
      if (u.uProgress) gl.uniform1f(u.uProgress, p);
      if (u.uCamera) gl.uniform1f(u.uCamera, Math.max(this.width, this.height) * 1.8);
      if (u.uLight) gl.uniform3fv(u.uLight, light);
      if (u.uFill) gl.uniform3fv(u.uFill, normalize(0.7, -0.25, 0.8));
      if (u.uLightRight) gl.uniform3fv(u.uLightRight, right);
      if (u.uLightUp) gl.uniform3fv(u.uLightUp, up);
      if (u.uLightCenter) gl.uniform3fv(u.uLightCenter, lightCenter);
      if (u.uLightExtent) gl.uniform1f(u.uLightExtent, extent);
      if (u.uDepthPass) gl.uniform1i(u.uDepthPass, depthPass ? 1 : 0);
      if (u.uPrint) gl.uniform1i(u.uPrint, 0);
      if (u.uShadow) gl.uniform1i(u.uShadow, 1);
      if (u.uPaper) gl.uniform1i(u.uPaper, 2);
      if (u.uShadowPixel) gl.uniform1f(u.uShadowPixel, 1 / this.shadowSize);
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowBuffer);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindVertexArray(this.vao);
    apply(this.depth, true);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.print);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paper);
    gl.bindVertexArray(this.vao);
    apply(this.surface, false);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const [kind, object] of this.resources || []) gl[`delete${kind}`](object);
    this.resources = [];
    this.uniforms?.clear();
  }
}
