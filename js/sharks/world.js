// Adapted from https://github.com/stackedlol/ascii-sharks
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math.js";
import { pickSpecies, SPECIES } from "./species.js";
export const SHARK_NODES = 20;
const DEFAULT_SHARKS = [
    {
        kind: "classic",
        size: 1
    },
    {
        kind: "hammerhead",
        size: 0.74
    },
    {
        kind: "mako",
        size: 0.61
    },
    {
        kind: "thresher",
        size: 0.86
    }
];
const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 650;
const BLIND_COS = -0.6;
// Length changes with the viewport; biological mass does not.
function sharkLengthScale(width, height) {
    const side = Math.min(width, height);
    return Math.min(420, Math.max(160, side * 0.56), side * 0.72);
}
export class World {
    sharkSpecs;
    fishCount;
    width = 0;
    height = 0;
    time = 0;
    fish = [];
    sharks = [];
    events = [];
    pointer = {
        x: 0,
        y: 0,
        active: false
    };
    perception = 60;
    sepX = [];
    sepY = [];
    foreignSep = 40;
    bucketCols = 0;
    bucketRows = 0;
    bucketHead = new Int32Array(0);
    bucketCount = new Uint16Array(0);
    bucketNext = new Int32Array(0);
    lastSpawn = 0;
    tmp = {
        x: 0,
        y: 0
    };
    constructor(sharkSpecs = DEFAULT_SHARKS, fishCount){
        this.sharkSpecs = sharkSpecs;
        this.fishCount = fishCount;
    }
    resize(width, height, cellW, cellH) {
        if (!(width > 0 && height > 0)) return;
        const first = this.width === 0;
        const oldWidth = this.width, oldHeight = this.height;
        this.width = width;
        this.height = height;
        this.sepX = SPECIES.map((sp)=>sp.spacing[0] * cellW);
        this.sepY = SPECIES.map((sp)=>sp.spacing[1] * cellH);
        this.perception = Math.max(cellH * 3, cellW * 5.5);
        this.foreignSep = cellW * 3;
        if (first) {
            this.seed();
            return;
        }
        const sx = width / oldWidth, sy = height / oldHeight;
        const lengthScale = sharkLengthScale(width, height) / sharkLengthScale(oldWidth, oldHeight);
        for (const f of this.fish){
            f.x = clamp(f.x * sx, -60, width + 60);
            f.y = clamp(f.y * sy, -60, height + 60);
            const speed = Math.hypot(f.vx, f.vy);
            const direction = Math.atan2(f.vy * sy, f.vx * sx);
            f.vx = Math.cos(direction) * speed;
            f.vy = Math.sin(direction) * speed;
        }
        for (const sh of this.sharks){
            sh.baseLength *= lengthScale;
            sh.maxLength *= lengthScale;
            sh.length = sh.baseLength * Math.cbrt(sh.mass);
            sh.orbitRadius *= Math.min(width, height) / Math.min(oldWidth, oldHeight);
            sh.heading = Math.atan2(Math.sin(sh.heading) * sy, Math.cos(sh.heading) * sx);
            for(let i = 0; i < SHARK_NODES; i++){
                sh.nodes[i * 2] *= sx;
                sh.nodes[i * 2 + 1] *= sy;
            }
            this.constrainSpine(sh);
        }
        this.pointer.active = false;
    }
    seed() {
        const { width: W, height: H } = this;
        const minSide = Math.min(W, H);
        const adultLength = sharkLengthScale(W, H);
        const sharkCount = this.sharkSpecs.length;
        this.sharks = [];
        for(let i = 0; i < sharkCount; i++){
            const { kind, size } = this.sharkSpecs[i];
            const maxLength = adultLength * clamp(size, 0.45, 1);
            const growthLimit = 2.02 + (i % 3) * 0.04;
            const baseLength = maxLength / growthLimit;
            const length = baseLength;
            const orbitRadius = minSide * (rand(0.35, 0.39) + (i % 3 - 1) * 0.018);
            // The first two residents begin at the lower-left and upper-right margins.
            const a = [2.50, -0.65, 0.65, -2.20][i] ?? i / sharkCount * TAU;
            const orbitDir = i % 4 < 2 ? -1 : 1;
            const entry = [[0.23, 0.90, 0], [0.84, 0.095, Math.PI],
                [0.84, 0.87, Math.PI], [0.22, 0.115, 0],
                [0.075, 0.57, -Math.PI / 2], [0.93, 0.42, Math.PI / 2],
                [0.57, 0.075, 0]][i];
            const x = entry ? W * entry[0] : W / 2 + Math.cos(a) * orbitRadius * (W / minSide);
            const y = entry ? H * entry[1] : H / 2 + Math.sin(a) * orbitRadius * (H / minSide);
            const heading = entry ? entry[2] : Math.atan2(Math.cos(a) * H * orbitDir, -Math.sin(a) * W * orbitDir);
            const nodes = new Float32Array(SHARK_NODES * 2);
            const seg = length / (SHARK_NODES - 1);
            for(let n = 0; n < SHARK_NODES; n++){
                nodes[n * 2] = x - Math.cos(heading) * seg * n;
                nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
            }
            this.sharks.push({
                id: i + 1,
                kind,
                length,
                baseLength,
                maxLength,
                growthLimit,
                growthRate: 0.016 + ((i * 3) % 5) * 0.002,
                age: 0,
                mass: 1,
                nutrition: 0,
                nodes,
                heading,
                speed: 18 + length * 0.025,
                phase: rand(0, TAU),
                turn: 0,
                hunger: rand(0.25, 0.75),
                wander: 0,
                orbitDir,
                orbitRadius,
                target: null,
                retargetAt: 0,
                baseDepth: i < 4 ? 0.66 + i * 0.085 : 0.60 + (i - 4) * 0.065,
                depth: i < 4 ? 0.66 + i * 0.085 : 0.60 + (i - 4) * 0.065
            });
        }
        this.sharks.sort((a, b)=>a.depth - b.depth);
        const total = clamp(Math.round(this.fishCount ?? W * H / 15000), 0, 100);
        this.fish = [];
        while(this.fish.length < total){
            const species = pickSpecies();
            const sp = SPECIES[species];
            const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
            const millDir = Math.random() < 0.5 ? 1 : -1;
            const cx = rand(W * 0.06, W * 0.94);
            const cy = rand(H * 0.08, H * 0.92);
            const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
            for(let k = 0; k < size; k++){
                this.fish.push({
                    x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
                    y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
                    vx: Math.cos(dir) * sp.cruise,
                    vy: Math.sin(dir) * sp.cruise,
                    species,
                    alarm: 0,
                    alive: true,
                    respawnAt: 0,
                    phase: rand(0, TAU),
                    turn: 0,
                    depth: rand(0.55, 1),
                    millDir
                });
            }
        }
        this.bucketNext = new Int32Array(this.fish.length);
    }
    step(dt) {
        if (!Number.isFinite(dt) || dt <= 0 || !this.width || !this.height) return;
        dt = Math.min(dt, 0.1);
        this.time += dt;
        this.rebuildHash();
        this.stepFish(dt);
        this.stepSharks(dt);
        this.respawn();
    }
    rebuildHash() {
        const size = this.perception;
        const pad = 2;
        this.bucketCols = Math.ceil(this.width / size) + pad * 2;
        this.bucketRows = Math.ceil(this.height / size) + pad * 2;
        const n = this.bucketCols * this.bucketRows;
        if (this.bucketHead.length !== n) {
            this.bucketHead = new Int32Array(n);
            this.bucketCount = new Uint16Array(n);
        }
        this.bucketHead.fill(-1);
        this.bucketCount.fill(0);
        if (this.bucketNext.length !== this.fish.length) {
            this.bucketNext = new Int32Array(this.fish.length);
        }
        for(let i = 0; i < this.fish.length; i++){
            const f = this.fish[i];
            if (!f.alive) continue;
            const b = this.bucketOf(f.x, f.y);
            this.bucketNext[i] = this.bucketHead[b];
            this.bucketHead[b] = i;
            this.bucketCount[b]++;
        }
    }
    bucketOf(x, y) {
        const size = this.perception;
        const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
        const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
        return r * this.bucketCols + c;
    }
    stepFish(dt) {
        const { fish, sharks, pointer, width: W, height: H, time } = this;
        const R = this.perception;
        const R2 = R * R;
        const foreignSep = this.foreignSep;
        const size = this.perception;
        const cols = this.bucketCols;
        const rows = this.bucketRows;
        const head = this.bucketHead;
        const next = this.bucketNext;
        const cur = this.tmp;
        const calmDecay = Math.exp(-dt * 0.7);
        const contagion = Math.min(1, dt * 6);
        for(let i = 0; i < fish.length; i++){
            const f = fish[i];
            if (!f.alive) continue;
            const sp = SPECIES[f.species];
            const spread = 1 + 1.8 * f.alarm;
            const sepX = this.sepX[f.species] * spread;
            const sepY = this.sepY[f.species] * spread;
            const speed = Math.hypot(f.vx, f.vy) || 1;
            const hx = f.vx / speed;
            const hy = f.vy / speed;
            let ax = 0;
            let ay = 0;
            let sx = 0;
            let sy = 0;
            let avx = 0;
            let avy = 0;
            let cx = 0;
            let cy = 0;
            let n = 0;
            let neighbourAlarm = 0;
            const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
            const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
            for(let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++){
                for(let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++){
                    let j = head[r * cols + c];
                    while(j !== -1){
                        if (j !== i) {
                            const o = fish[j];
                            const dx = o.x - f.x;
                            const dy = o.y - f.y;
                            const d2 = dx * dx + dy * dy;
                            if (d2 < R2 && d2 > 1e-6) {
                                const d = Math.sqrt(d2);
                                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                                    const qx = dx / sepX;
                                    const qy = dy / sepY;
                                    const q2 = qx * qx + qy * qy;
                                    if (q2 < 1) {
                                        const q = Math.sqrt(q2) || 1e-3;
                                        const k = (1 - q) / q;
                                        sx -= qx * k;
                                        sy -= qy * k;
                                    }
                                    if (o.species === f.species) {
                                        avx += o.vx;
                                        avy += o.vy;
                                        cx += dx;
                                        cy += dy;
                                        n++;
                                    } else if (d < foreignSep) {
                                        const k = (1 - d / foreignSep) / d * 0.6;
                                        sx -= dx * k;
                                        sy -= dy * k;
                                    }
                                    if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                                }
                            }
                        }
                        j = next[j];
                    }
                }
            }
            ax += sx * FISH_SEPARATION_K;
            ay += sy * FISH_SEPARATION_K;
            if (n > 0) {
                const alignK = FISH_ALIGN_K * sp.align;
                const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
                ax += (avx / n - f.vx) * alignK + cx / n * cohesionK;
                ay += (avy / n - f.vy) * alignK + cy / n * cohesionK;
                if (sp.mill > 0) {
                    const cl = Math.hypot(cx, cy) || 1;
                    ax += -cy / cl * f.millDir * sp.mill * (1 - f.alarm);
                    ay += cx / cl * f.millDir * sp.mill * (1 - f.alarm);
                }
            }
            let fear = 0;
            for (const sh of sharks){
                const fearR = sh.length * 0.6 + 60;
                let best = Infinity;
                let bx = 0;
                let by = 0;
                for(let k = 0; k <= 12; k += 3){
                    const nx = sh.nodes[k * 2];
                    const ny = sh.nodes[k * 2 + 1];
                    const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
                    if (d2 < best) {
                        best = d2;
                        bx = nx;
                        by = ny;
                    }
                }
                const d = Math.sqrt(best);
                if (d >= fearR || d < 1e-3) continue;
                let w = 1 - d / fearR;
                w *= w;
                const awayX = (f.x - bx) / d;
                const awayY = (f.y - by) / d;
                const shx = Math.cos(sh.heading);
                const shy = Math.sin(sh.heading);
                const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
                ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
                ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
                fear = Math.max(fear, Math.sqrt(w));
            }
            if (pointer.active) {
                const pr = 130;
                const dx = f.x - pointer.x;
                const dy = f.y - pointer.y;
                const d = Math.hypot(dx, dy);
                if (d < pr && d > 1e-3) {
                    const w = (1 - d / pr) ** 2;
                    ax += dx / d * FISH_FLEE_K * w;
                    ay += dy / d * FISH_FLEE_K * w;
                    fear = Math.max(fear, Math.sqrt(w) * 0.8);
                }
            }
            let alarm = Math.max(f.alarm * calmDecay, fear);
            const relayed = neighbourAlarm * 0.86;
            if (relayed > alarm) alarm += (relayed - alarm) * contagion;
            f.alarm = alarm;
            const m = 36;
            if (f.x < m) ax += (m - f.x) * 7;
            else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
            if (f.y < m) ay += (m - f.y) * 7;
            else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;
            current(f.x, f.y, time, cur);
            ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
            ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
            ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);
            const preferred = sp.cruise * (1 + 0.6 * f.alarm);
            ax += (preferred - speed) * hx * 1.6;
            ay += (preferred - speed) * hy * 1.6;
            const before = Math.atan2(f.vy, f.vx);
            f.vx += ax * dt;
            f.vy += ay * dt;
            const maxSpeed = sp.maxSpeed * (1 + 0.9 * f.alarm);
            const s = Math.hypot(f.vx, f.vy);
            if (s > maxSpeed) {
                f.vx *= maxSpeed / s;
                f.vy *= maxSpeed / s;
            } else if (s < sp.minSpeed && s > 1e-3) {
                f.vx *= sp.minSpeed / s;
                f.vy *= sp.minSpeed / s;
            }
            f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
            f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
            f.x = clamp(f.x + f.vx * dt, -60, W + 60);
            f.y = clamp(f.y + f.vy * dt, -60, H + 60);
        }
    }
    stepSharks(dt) {
        const { sharks, width: W, height: H, time } = this;
        const minSide = Math.min(W, H);
        const cxW = W / 2;
        const cyW = H / 2;
        for (const sh of sharks){
            sh.age += dt;
            const naturalSize = 1 + (sh.growthLimit - 1) * (1 - Math.exp(-sh.age * sh.growthRate));
            const targetMass = Math.min(sh.growthLimit ** 3, naturalSize ** 3 + sh.nutrition);
            sh.mass += Math.max(0, targetMass - sh.mass) * (1 - Math.exp(-dt * 0.8));
            sh.length = Math.min(sh.maxLength, sh.baseLength * Math.cbrt(sh.mass));
            sh.depth = sh.baseDepth + Math.sin(time * 0.025 + sh.id) * 0.025;
            const L = sh.length;
            const nodes = sh.nodes;
            const hx = nodes[0];
            const hy = nodes[1];
            sh.hunger = Math.min(1, sh.hunger + dt * 0.018);
            let dx = Math.cos(sh.heading);
            let dy = Math.sin(sh.heading);
            sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 1.4, -0.8, 0.8);
            dx += Math.cos(sh.heading + sh.wander) * 0.30;
            dy += Math.sin(sh.heading + sh.wander) * 0.30;
            if (time >= sh.retargetAt) {
                sh.target = this.findPrey(sh);
                sh.retargetAt = time + 0.9;
            }
            const t = sh.target;
            let hunting = false;
            let closing = 0;
            if (t && t.alive && sh.hunger > 0.55) {
                const tx = t.x + t.vx * 0.35 - hx;
                const ty = t.y + t.vy * 0.35 - hy;
                const d = Math.hypot(tx, ty) || 1;
                const w = 0.5 + 0.8 * sh.hunger;
                dx += tx / d * w;
                dy += ty / d * w;
                hunting = true;
                closing = clamp(1 - d / (L * 0.9), 0, 1);
            }
            {
                const rx = (hx - cxW) / (W / minSide);
                const ry = (hy - cyW) / (H / minSide);
                const r = Math.hypot(rx, ry) || 1;
                const radius = sh.orbitRadius * (1 + 0.045 * Math.sin(time * 0.025 + sh.id));
                const radial = clamp((radius - r) / (radius * 0.35), -1, 1);
                const patrol = hunting ? 0.60 : 0.85;
                dx += (-ry / r * sh.orbitDir + rx / r * radial * 2.2) * patrol;
                dy += (rx / r * sh.orbitDir + ry / r * radial * 2.2) * patrol;
            }
            for (const other of sharks){
                if (other === sh) continue;
                for(let k = 0; k < SHARK_NODES; k += 4){
                    const ox = hx - other.nodes[k * 2];
                    const oy = hy - other.nodes[k * 2 + 1];
                    const d = Math.hypot(ox, oy);
                    const range = (L + other.length) * 0.45;
                    if (d < range && d > 1e-3) {
                        const w = (1 - d / range) * 1.2;
                        dx += ox / d * w;
                        dy += oy / d * w;
                    }
                }
            }
            const ex = (hx - cxW) / (W * 0.34);
            const ey = (hy - cyW) / (H * 0.31);
            const e2 = ex * ex + ey * ey;
            if (e2 < 1) {
                const e = Math.sqrt(e2) || 1e-3;
                const w = (1 - e) * 3.8;
                dx += ex / e * w;
                dy += ey / e * w;
            }
            // Begin turning before a large fin reaches the viewport edge.
            const insetX = Math.min(W * 0.24, 20 + L * 0.12);
            const insetY = Math.min(H * 0.24, 30 + L * 0.24);
            const wallRange = Math.max(60, L * 0.28);
            const aheadX = hx + Math.cos(sh.heading) * L * 0.30;
            const aheadY = hy + Math.sin(sh.heading) * L * 0.30;
            dx += (clamp((insetX - aheadX) / wallRange, 0, 1)
                - clamp((aheadX - (W - insetX)) / wallRange, 0, 1)) * 4.5;
            dy += (clamp((insetY - aheadY) / wallRange, 0, 1)
                - clamp((aheadY - (H - insetY)) / wallRange, 0, 1)) * 4.5;
            const desired = Math.atan2(dy, dx);
            const agility = Math.min(hunting ? 0.42 : 0.32, sh.speed / (L * 0.46));
            const maxTurn = agility * dt;
            const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
            sh.heading += turned;
            sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);
            const cruise = clamp(18 + L * 0.027, 18, 29);
            const targetSpeed = Math.min(34, cruise * (hunting ? 1.12 + closing * 0.08 : 1));
            sh.speed += (targetSpeed - sh.speed) * (1 - Math.exp(-dt * 0.7));
            sh.phase += dt * (1.1 + sh.speed / 32);
            nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
            nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
            this.constrainSpine(sh);
            if (sh.hunger > 0.15) {
                const mouthR = L * 0.035 + 5;
                const mx = nodes[0];
                const my = nodes[1];
                for (const f of this.fish){
                    if (!f.alive) continue;
                    if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
                        f.alive = false;
                        f.respawnAt = time + rand(3, 8);
                        sh.hunger = Math.max(0, sh.hunger - 0.16);
                        // A meal raises a bounded mass target; growth remains gradual.
                        sh.nutrition = Math.min(0.65, sh.nutrition + 0.035);
                        if (this.events.length < 128) this.events.push({
                            kind: "eat",
                            x: f.x,
                            y: f.y
                        });
                        break;
                    }
                }
            }
        }
    }
    constrainSpine(sh) {
        const nodes = sh.nodes, segment = sh.length / (SHARK_NODES - 1);
        let previous = sh.heading + Math.PI;
        for(let k = 1; k < SHARK_NODES; k++){
            const x = nodes[(k - 1) * 2], y = nodes[(k - 1) * 2 + 1];
            const direction = Math.atan2(nodes[k * 2 + 1] - y, nodes[k * 2] - x);
            const angle = previous + clamp(angleDiff(previous, direction), -0.16, 0.16);
            nodes[k * 2] = x + Math.cos(angle) * segment;
            nodes[k * 2 + 1] = y + Math.sin(angle) * segment;
            previous = angle;
        }
    }
    findPrey(sh) {
        const range = sh.length * 0.75 + 90;
        const hx = sh.nodes[0];
        const hy = sh.nodes[1];
        const fx = Math.cos(sh.heading);
        const fy = Math.sin(sh.heading);
        let best = null;
        let bestScore = Infinity;
        let currentScore = Infinity;
        for (const f of this.fish){
            if (!f.alive) continue;
            const dx = f.x - hx;
            const dy = f.y - hy;
            const d = Math.hypot(dx, dy);
            if (d > range || d < 1e-3) continue;
            const cos = (dx * fx + dy * fy) / d;
            if (cos < 0.2) continue;
            const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
            const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
            if (score < bestScore) {
                bestScore = score;
                best = f;
            }
            if (f === sh.target) currentScore = score;
        }
        if (sh.target && currentScore < bestScore * 1.3) return sh.target;
        return best;
    }
    respawn() {
        const { time, width: W, height: H } = this;
        const due = [];
        for (const f of this.fish)if (!f.alive && f.respawnAt <= time) due.push(f);
        if (due.length === 0) return;
        if (due.length < 6 && time - this.lastSpawn < 9) return;
        this.lastSpawn = time;
        const side = randInt(0, 3);
        const along = rand(0.15, 0.85);
        const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
        const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
        const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
        const species = pickSpecies();
        const sp = SPECIES[species];
        const millDir = Math.random() < 0.5 ? 1 : -1;
        for (const f of due.slice(0, sp.schoolSize[1])){
            f.alive = true;
            f.species = species;
            f.alarm = 0;
            f.turn = 0;
            f.millDir = millDir;
            f.x = x + rand(-1, 1) * this.perception;
            f.y = y + rand(-1, 1) * this.perception;
            f.vx = Math.cos(inward) * sp.cruise * 1.4;
            f.vy = Math.sin(inward) * sp.cruise * 1.4;
        }
    }
}
