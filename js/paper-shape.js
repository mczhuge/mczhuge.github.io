// Original paper-cut planet. Both rendering resolutions sample the same surface,
// and every UV triangle is retained so the globe can unfold into the full profile.
const TAU = Math.PI * 2;
function unitVector(x, y, z) {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}
function smoothBand(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// A few irregular archipelagos, sculpted in direction space rather than wrapped
// image coordinates: relief joins seamlessly across the back of the globe.
const islands = [
  [-.48, .52, .78, .36, .52, -.35],
  [-.65, .12, .74, .30, .43, .25],
  [-.32, -.11, .94, .24, .33, -.50],
  [.48, -.31, .82, .39, .29, -.55],
  [.59, -.57, .56, .26, .34, .20],
  [.40, .58, .71, .21, .27, -.30],
  [.28, .24, -.93, .51, .44, .50],
  [-.59, -.47, -.65, .47, .38, -.60],
].map(([x, y, z, width, height, angle]) => {
  const normal = unitVector(x, y, z);
  const right = unitVector(normal[2], 0, -normal[0]);
  const up = [normal[1] * right[2], normal[2] * right[0] - normal[0] * right[2], -normal[1] * right[0]];
  return { normal, right, up, width, height, cosine: Math.cos(angle), sine: Math.sin(angle) };
});

function paperRelief(x, y, z) {
  const irregularity = .10 * Math.sin(x * 13 + y * 7 - z * 5)
    + .035 * Math.sin(y * 21 - x * 11 + z * 9);
  let land = -2;
  for (const island of islands) {
    const alignment = x * island.normal[0] + y * island.normal[1] + z * island.normal[2];
    if (alignment < .5) continue;
    const tx = x * island.right[0] + y * island.right[1] + z * island.right[2];
    const ty = x * island.up[0] + y * island.up[1] + z * island.up[2];
    const horizontal = (tx * island.cosine + ty * island.sine) / island.width;
    const vertical = (-tx * island.sine + ty * island.cosine) / island.height;
    land = Math.max(land, 1 - horizontal * horizontal - vertical * vertical + irregularity);
  }
  // Beveled edges of four stacked sheets. Small relief keeps a round silhouette;
  // grazing light supplies the contour lines instead of dark painted continents.
  let relief = 0;
  for (const level of [-.18, .06, .32, .59]) {
    relief += .009 * smoothBand(level - .07, level + .07, land);
  }
  return relief;
}

function paperDirection(u, v) {
  const longitude = (u - .5) * TAU, latitude = v * Math.PI;
  const equator = Math.sin(latitude);
  return [equator * Math.sin(longitude), Math.cos(latitude), equator * Math.cos(longitude)];
}

function paperPoint(u, v) {
  const [x, y, z] = paperDirection(u, v);
  // Shallow, long paper folds give the quiet areas a handmade surface. The poles
  // stay smooth and closed; no seams or holes are introduced into the silhouette.
  const foldA = Math.sin(x * 8.4 + y * 5.3 + z * 2.7);
  const foldB = Math.sin(x * 4.7 - y * 9.1 + z * 3.6);
  const folds = .0035 * (Math.sqrt(foldA * foldA + .018) + Math.sqrt(foldB * foldB + .018) - 1);
  // Fine paper layers live in the shared height material, where their edges
  // remain smooth at any mesh resolution. Geometry supplies the rounded volume.
  const radius = .988 + folds;
  // A slight axial tilt keeps the geography and paper ring from feeling rigid.
  const tilt = -.10, yy = y * Math.cos(tilt) - z * Math.sin(tilt), zz = y * Math.sin(tilt) + z * Math.cos(tilt);
  return [x * radius, yy * radius, zz * radius];
}

export const paperShape = {
  columns: 192, rows: 128, point: paperPoint,
  height: (u, v) => paperRelief(...paperDirection(u, v)),
};
