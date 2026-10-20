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
uniform vec2 uSize;
uniform vec3 uLight;
uniform vec3 uFill;
uniform float uProgress;
uniform float uShadowPixel;
out vec4 color;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.11369));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
// Piecewise planar microfolds, rather than round noise or a shiny normal map.
float facets(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  float a = hash(cell), b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0)), d = hash(cell + 1.0);
  return f.x + f.y < 1.0
    ? a + (b - a) * f.x + (c - a) * f.y
    : d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
}
float visibility(vec3 n) {
  if (any(lessThan(vShadow, vec3(0.0))) || any(greaterThan(vShadow, vec3(1.0)))) return 1.0;
  float bias = 0.0007 + 0.0015 * (1.0 - max(dot(n, uLight), 0.0));
  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float stored = texture(uShadow, vShadow.xy + vec2(float(x), float(y)) * uShadowPixel).r;
      lit += vShadow.z - bias <= stored ? 1.0 : 0.0;
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
  front = mix(front, ivory, printTreatment * 0.75);
  vec3 albedo = gl_FrontFacing ? front : ivory;
  float material = smoothstep(0.0, 0.18, uProgress);
  vec3 dx = dFdx(vPosition), dy = dFdy(vPosition);
  vec3 n = normalize(cross(dx, dy));
  if (n.z < 0.0) n = -n;

  vec2 paper = vec2(vUV.x * 1.27 + vUV.y * 0.31, vUV.y * 0.93 - vUV.x * 0.38);
  float fine = facets(paper * 47.0) * 0.28 + facets(paper * 103.0 + 7.8) * 0.09;
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float determinant = dot(dx, rx);
  vec3 gradient = (dFdx(fine) * rx + dFdy(fine) * ry) / max(abs(determinant), 0.00001) * sign(determinant);
  n = normalize(n - gradient * material);

  float shadow = visibility(n);
  float key = max(dot(n, uLight), 0.0);
  float fill = max(dot(n, uFill), 0.0);
  float ambient = 0.43 + 0.15 * (0.5 + 0.5 * n.y);
  float light = ambient + 0.58 * key * shadow + 0.12 * fill;
  // Local recesses collect a little ambient shadow, independently of the sun.
  light *= 1.0 - max(0.0, -vFold) * 0.16 * material;
  float fibres = hash(floor(vUV * uSize * 1.35)) - 0.5;
  vec3 linearPaper = pow(max(albedo, vec3(0.0)), vec3(2.2));
  vec3 shaded = pow(max(linearPaper * light, vec3(0.0)), vec3(1.0 / 2.2));
  shaded += fibres * 0.009;
  // The surface is matte: broad illumination, crisp folds, no plastic glints.
  color = vec4(mix(front, min(shaded, vec3(1.0)), material), 1.0);
}`;

const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() { }
`;

function randomAt(x, y, seed) {
  let n = Math.imul(x ^ seed, 374761393) + Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

function triangular(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = randomAt(ix, iy, seed), b = randomAt(ix + 1, iy, seed);
  const c = randomAt(ix, iy + 1, seed), d = randomAt(ix + 1, iy + 1, seed);
  return fx + fy < 1
    ? a + (b - a) * fx + (c - a) * fy
    : d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
}

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function geometry(columns = 192, rows = 144) {
  const stride = 6;
  const vertices = new Float32Array((columns + 1) * (rows + 1) * stride);
  const indices = new Uint16Array(columns * rows * 6);
  const creaseLines = [];
  for (let i = 0; i < 46; i++) {
    const unit = n => (randomAt(i, n, 811) + 1) * 0.5;
    const angle = unit(1) * Math.PI * 2;
    creaseLines.push({ x: unit(2), y: unit(3), dx: Math.cos(angle), dy: Math.sin(angle),
      length: 0.06 + unit(4) * 0.19, width: 0.006 + unit(5) * 0.012,
      height: (0.02 + unit(6) * 0.04) * (unit(7) < 0.3 ? -1 : 1) });
  }
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  let cursor = 0;
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      const u = x / columns, v = y / rows;
      const px = (u - 0.5) * 2, py = (0.5 - v) * 2;
      const radial = Math.hypot(px, py);
      const broad = triangular(u * 4.9 + v * 2.1, v * 5.3 - u * 1.8, 37);
      const fold = triangular(u * 11.3 - v * 4.7, v * 12.1 + u * 5.1, 93);
      const crinkle = triangular(u * 27.9 + v * 10.3, v * 28.7 - u * 8.9, 151);
      let ridges = 0;
      for (const line of creaseLines) {
        const cx = u - line.x, cy = v - line.y;
        const along = (cx * line.dx + cy * line.dy) / line.length;
        if (Math.abs(along) > 1.8) continue;
        const across = (cx * -line.dy + cy * line.dx) / line.width;
        if (Math.abs(across) > 5) continue;
        ridges += line.height * Math.exp(-along * along * 2)
          * (Math.exp(-Math.abs(across) * 1.6) - 0.48 * Math.exp(-Math.abs(across + 1.5)));
      }
      // The square sheet wraps past its equator. Unequal local fold angles
      // overlap at the rim and reveal occasional unprinted reverse faces.
      const angle = Math.atan2(py, px) + 0.14 * broad + 0.21 * fold + 0.045 * crinkle;
      const corner = Math.exp(-Math.pow((u - 0.12) / 0.17, 2) - Math.pow(v / 0.16, 2));
      const side = Math.exp(-Math.pow((u - 0.98) / 0.13, 2) - Math.pow((v - 0.65) / 0.22, 2));
      const latitude = radial * (2.48 + broad * 0.21 + fold * 0.13) - corner * 0.82 - side * 0.48;
      const radius = 0.93 + broad * 0.19 + fold * 0.13 + crinkle * 0.038 + ridges + corner * 0.16 + side * 0.10;
      let bx = Math.sin(latitude) * Math.cos(angle) * radius;
      let by = Math.sin(latitude) * Math.sin(angle) * radius;
      let bz = Math.cos(latitude) * radius;
      // A small fixed lean prevents a manufactured, rotationally symmetric ball.
      const lean = 0.16;
      const tiltedY = by * Math.cos(lean) - bz * Math.sin(lean);
      bz = by * Math.sin(lean) + bz * Math.cos(lean);
      by = tiltedY * 0.94;
      bx += by * 0.035;
      const point = [bx, by, bz];
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], point[axis]);
        maximum[axis] = Math.max(maximum[axis], point[axis]);
      }
      vertices[cursor++] = u; vertices[cursor++] = v;
      vertices[cursor++] = bx; vertices[cursor++] = by; vertices[cursor++] = bz;
      vertices[cursor++] = fold * 0.65 + broad * 0.35 + ridges * 2;
    }
  }
  const scale = 2 / Math.max(maximum[0] - minimum[0], maximum[1] - minimum[1]);
  for (let i = 0; i < vertices.length; i += stride) {
    for (let axis = 0; axis < 3; axis++) vertices[i + 2 + axis] = (vertices[i + 2 + axis] - (minimum[axis] + maximum[axis]) * 0.5) * scale;
  }
  cursor = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
      if ((x + y) % 2) {
        indices.set([a, c, d, a, d, b], cursor);
      } else {
        indices.set([a, c, b, b, c, d], cursor);
      }
      cursor += 6;
    }
  }
  return { vertices, indices };
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

// Embedded browsers can disable GPU contexts. This renderer uses the very same
// sheet and a real depth buffer, so folds still overlap correctly in that case.
class SoftwarePaperMesh {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    if (!this.context) throw new Error('Paper canvas is unavailable');
    this.mesh = geometry(192, 144);
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
    const scale = p >= 0.9 || p < 0.0001 ? this.dpr : Math.min(1.2, this.dpr);
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
    const { vertices, indices } = this.mesh;
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
    const material = Math.min(1, p / 0.18);
    const treatment = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
    const printTreatment = treatment * treatment * (3 - 2 * treatment);
    const ivoryWeight = printTreatment * 0.75;
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
      let smoothX = normals[a] + normals[b] + normals[c];
      let smoothY = normals[a + 1] + normals[b + 1] + normals[c + 1];
      let smoothZ = normals[a + 2] + normals[b + 2] + normals[c + 2];
      const smoothNorm = Math.hypot(smoothX, smoothY, smoothZ) * (front ? 1 : -1);
      if (Math.abs(smoothNorm) > 1e-9) {
        smoothX /= smoothNorm; smoothY /= smoothNorm; smoothZ /= smoothNorm;
        // Smooth only the fine tessellation. A real sharp fold keeps its planes.
        if (smoothX * nx + smoothY * ny + smoothZ * nz > 0.93) {
          nx = nx * 0.3 + smoothX * 0.7;
          ny = ny * 0.3 + smoothY * 0.7;
          nz = nz * 0.3 + smoothZ * 0.7;
        }
      }
      const key = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      const bounce = Math.max(0, nx * fill[0] + ny * fill[1] + nz * fill[2]);
      const fold = (vertices[ia * 6 + 5] + vertices[ib * 6 + 5] + vertices[ic * 6 + 5]) / 3;
      const ambient = 0.43 + 0.15 * (0.5 + 0.5 * ny);
      let illumination = (ambient + key * 0.58 + bounce * 0.12) * (1 - Math.max(0, -fold) * 0.22);
      illumination = 1 + (illumination - 1) * material;
      const shade = Math.max(0, Math.min(95, Math.round((illumination - 0.24) / 0.92 * 95))) * 256;
      const backColor = (255 << 24) | (shades[shade + 244] << 16) | (shades[shade + 250] << 8) | shades[shade + 253];
      const au = vertices[ia * 6], av = vertices[ia * 6 + 1];
      const bu = vertices[ib * 6], bv = vertices[ib * 6 + 1];
      const cu = vertices[ic * 6], cv = vertices[ic * 6 + 1];
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
          if (!front) { output[address] = backColor; continue; }
          const tx = Math.max(0, Math.min(tw - 1, Math.round((wa * au + wb * bu + wc * cu) * (tw - 1))));
          const ty = Math.max(0, Math.min(th - 1, Math.round((wa * av + wb * bv + wc * cv) * (th - 1))));
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
      // broad convex paper faces and the silhouette keep their clean ivory.
      const reach = Math.max(2, Math.round(scale * 5));
      const vertical = reach * roiWidth;
      const strength = Math.min(1, (p - 0.55) / 0.3);
      for (let y = reach; y < roiHeight - reach; y++) {
        for (let x = reach, at = y * roiWidth + reach; x < roiWidth - reach; x++, at++) {
          if (!output[at]) continue;
          const leftDepth = depth[at - reach], rightDepth = depth[at + reach];
          const upDepth = depth[at - vertical], downDepth = depth[at + vertical];
          if (leftDepth < -1e20 || rightDepth < -1e20 || upDepth < -1e20 || downDepth < -1e20) continue;
          const valley = (leftDepth + rightDepth + upDepth + downDepth) * 0.25 - depth[at] - 0.4;
          if (valley <= 0) continue;
          const light = 1 - Math.min(0.20, valley * 0.018) * strength;
          const pixel = output[at];
          const red = ((pixel & 255) * light + 0.5) | 0;
          const green = (((pixel >>> 8) & 255) * light + 0.5) | 0;
          const blue = (((pixel >>> 16) & 255) * light + 0.5) | 0;
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
    this.mesh = this.world = this.screen = this.normals = this.image = this.pixels = this.depth = this.texture = this.source = null;
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
