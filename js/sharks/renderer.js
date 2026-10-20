// Shark silhouettes and articulated ASCII sampling adapted from:
// https://github.com/stackedlol/ascii-sharks
// The homepage uses a transparent graphite palette and a quiet reading area.
import { clamp, hash3, smoothstep } from "./math.js";
import { SHARK_NODES } from "./world.js";
const SKIN_RAMP = ":;t%SX8#@";
const FIN_GLYPHS = "%;tS:";
const RIDGE_GLYPHS = "@8%";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
const FLAG_EYE = 5;
const FLAG_MARK = 6;
const MARK_GLYPHS = "#%@";
const SUBSAMPLES = [
    0.25,
    0.3,
    0.75,
    0.3,
    0.25,
    0.72,
    0.75,
    0.72
];
function classicHalfWidth(s) {
    if (s < 0.13) return 0.09 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.95);
    if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
    if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
    const k = (s - 0.84) / 0.16;
    return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}
const SHAPES = {
    classic: {
        halfWidth: classicHalfWidth,
        pectoral: [
            0.15,
            0.43,
            0.55,
            0.26
        ],
        falcate: true,
        pelvic: [
            0.57,
            0.65,
            0.69,
            0.085
        ],
        caudal: 0.085,
        dorsal: [
            0.33,
            0.47
        ],
        secondDorsal: [
            0.71,
            0.76
        ],
        eye: [
            0.1,
            0.14
        ],
        gills: [
            0.19,
            0.29
        ],
    },
    hammerhead: {
        halfWidth: (s)=>{
            if (s < 0.06) return 0.045;
            if (s < 0.3) return 0.045 + 0.061 * smoothstep(0.06, 0.3, s);
            return classicHalfWidth(s) * 0.92;
        },
        head: {
            span: 0.17,
            sweep: 0.035,
            depth: 0.09,
            notch: 0
        },
        pectoral: [
            0.17,
            0.4,
            0.5,
            0.22
        ],
        falcate: true,
        pelvic: [
            0.56,
            0.63,
            0.67,
            0.075
        ],
        caudal: 0.11,
        dorsal: [
            0.28,
            0.44
        ],
        secondDorsal: [
            0.7,
            0.74
        ],
        eye: null,
        gills: [
            0.16,
            0.26
        ],
    },
    tiger: {
        halfWidth: (s)=>{
            if (s < 0.13) return 0.1 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.45);
            if (s < 0.3) return 0.1 + 0.014 * smoothstep(0.13, 0.3, s);
            if (s < 0.84) return 0.019 + 0.095 * Math.pow(1 - (s - 0.3) / 0.54, 1.2);
            const k = (s - 0.84) / 0.16;
            return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
        },
        pectoral: [
            0.15,
            0.42,
            0.53,
            0.25
        ],
        falcate: true,
        pelvic: [
            0.57,
            0.65,
            0.69,
            0.085
        ],
        caudal: 0.095,
        dorsal: [
            0.33,
            0.46
        ],
        secondDorsal: [
            0.71,
            0.75
        ],
        eye: [
            0.08,
            0.12
        ],
        gills: [
            0.19,
            0.28
        ],
    },
    zebra: {
        halfWidth: (s)=>{
            if (s < 0.1) return 0.075 * Math.pow(Math.sin(s / 0.1 * Math.PI / 2), 0.7);
            if (s < 0.28) return 0.075 + 0.025 * smoothstep(0.1, 0.28, s);
            if (s < 0.55) return 0.022 + 0.078 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
            const k = (s - 0.55) / 0.45;
            return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
        },
        pectoral: [
            0.12,
            0.3,
            0.36,
            0.19
        ],
        falcate: false,
        pelvic: [
            0.42,
            0.48,
            0.51,
            0.065
        ],
        caudal: 0,
        dorsal: [
            0.36,
            0.44
        ],
        secondDorsal: [
            0.49,
            0.53
        ],
        eye: [
            0.06,
            0.09
        ],
        gills: [
            0.13,
            0.2
        ],
    },
    greathammer: {
        halfWidth: (s)=>{
            if (s < 0.05) return 0.04;
            if (s < 0.3) return 0.04 + 0.07 * smoothstep(0.05, 0.3, s);
            return classicHalfWidth(s) * 0.95;
        },
        head: {
            span: 0.21,
            sweep: 0.006,
            depth: 0.085,
            notch: 0.014
        },
        pectoral: [
            0.16,
            0.38,
            0.49,
            0.24
        ],
        falcate: true,
        pelvic: [
            0.55,
            0.62,
            0.67,
            0.085
        ],
        caudal: 0.13,
        dorsal: [
            0.24,
            0.45
        ],
        secondDorsal: [
            0.68,
            0.74
        ],
        eye: null,
        gills: [
            0.15,
            0.25
        ],
    },
    mako: {
        halfWidth: (s)=>{
            if (s < 0.17) return 0.088 * Math.pow(Math.sin(s / 0.17 * Math.PI / 2), 1.5);
            if (s < 0.32) return 0.088 + 0.012 * smoothstep(0.17, 0.32, s);
            if (s < 0.86) return 0.014 + 0.086 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
            const k = (s - 0.86) / 0.14;
            return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
        },
        pectoral: [
            0.18,
            0.4,
            0.5,
            0.21
        ],
        falcate: true,
        pelvic: [
            0.58,
            0.64,
            0.68,
            0.06
        ],
        caudal: 0.13,
        dorsal: [
            0.34,
            0.45
        ],
        secondDorsal: [
            0.76,
            0.79
        ],
        eye: [
            0.11,
            0.15
        ],
        gills: [
            0.2,
            0.3
        ],
    },
    thresher: {
        halfWidth: (s)=>{
            if (s < 0.08) return 0.07 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.75);
            if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
            if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
            const k = (s - 0.48) / 0.52;
            return 0.012 * (1 - k) + 0.006 * Math.sin(k * Math.PI * 0.9) + 0.002;
        },
        pectoral: [
            0.12,
            0.27,
            0.36,
            0.2
        ],
        falcate: true,
        pelvic: [
            0.37,
            0.41,
            0.44,
            0.045
        ],
        caudal: 0,
        dorsal: [
            0.24,
            0.32
        ],
        secondDorsal: [
            0.45,
            0.47
        ],
        eye: [
            0.05,
            0.1
        ],
        gills: [
            0.11,
            0.18
        ],
    },
    nurse: {
        halfWidth: (s)=>{
            if (s < 0.08) return 0.085 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.4);
            if (s < 0.3) return 0.085 + 0.02 * smoothstep(0.08, 0.3, s);
            if (s < 0.72) return 0.022 + 0.083 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
            const k = (s - 0.72) / 0.28;
            return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
        },
        pectoral: [
            0.16,
            0.34,
            0.4,
            0.17
        ],
        falcate: false,
        pelvic: [
            0.45,
            0.52,
            0.55,
            0.075
        ],
        caudal: 0,
        dorsal: [
            0.5,
            0.58
        ],
        secondDorsal: [
            0.63,
            0.69
        ],
        eye: [
            0.05,
            0.075
        ],
        gills: [
            0.14,
            0.22
        ],
    }
};
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
}
export class AsciiRenderer {
    width = 0; height = 0; dpr = 1; cw = 6; ch = 8; cols = 0; rows = 0;
    spine = new Float32Array(SHARK_NODES * 2);
    arc = new Float32Array(SHARK_NODES);
    arcTotal = 1; shape = SHAPES.classic; sharkId = 0;
    finTipLeft = 0; finTipRight = 0;
    hitFlag = 0; hitShade = 0; hitS = 0; hitV = 0; hitDist = 0;
    ripples = [];

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        if (!this.ctx) throw new Error('Canvas unavailable');
    }
    get cellWidth() { return this.cw; }
    get cellHeight() { return this.ch; }

    resize(width, height, dpr) {
        this.width = width; this.height = height; this.dpr = dpr;
        // Keep a fine character texture while bounding work on large displays.
        this.cw = Math.max(4.5, Math.min(7, width / 210), Math.sqrt(width * height / 22000));
        this.ch = this.cw * 1.35;
        this.cols = Math.ceil(width / this.cw); this.rows = Math.ceil(height / this.ch);
        this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
        const count = this.cols * this.rows;
        this.sharkFlag = new Uint8Array(count);
        this.sharkShade = new Float32Array(count);
        this.sharkKey = new Uint32Array(count);
        this.sharkDepth = new Float32Array(count);
        this.visibility = new Float32Array(count);
        this.updateReadingArea();
    }

    updateReadingArea() {
        const details = document.querySelector('.about-details');
        const first = details && details.querySelector('p');
        const box = first && details.getBoundingClientRect();
        const top = first && first.getBoundingClientRect().top;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = (c + 0.5) * this.cw, y = (r + 0.5) * this.ch;
                const side = smoothstep(0.15, 0.82, Math.abs(x / this.width - 0.5) * 2);
                const rim = Math.max(1 - smoothstep(0.02, 0.22, y / this.height), smoothstep(0.72, 1, y / this.height));
                let opacity = 0.30 + 0.70 * Math.max(side, rim * 0.90);
                if (box) {
                    const inside = smoothstep(box.left - 100, box.left + 35, x)
                        * (1 - smoothstep(box.right - 35, box.right + 100, x))
                        * smoothstep(top - 65, top + 35, y)
                        * (1 - smoothstep(box.bottom - 35, box.bottom + 65, y));
                    opacity *= 1 - inside * 0.54;
                }
                this.visibility[r * this.cols + c] = opacity;
            }
        }
    }

    render(world, dt) {
        const { ctx, dpr } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `500 ${this.ch * 0.98}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // The same individuals keep their depth as they grow.
        this.rasterizeSharks([...world.sharks].sort((a, b) => a.depth - b.depth), world.time);
        this.drawFish(world);
        this.drawSharks();
        // Feeding is a small, fading ring; no flashes or coloured effects.
        for (const event of world.events) {
            if (event.kind === 'eat' && this.ripples.length < 12) this.ripples.push({ x: event.x, y: event.y, age: 0 });
        }
        world.events.length = 0;
        for (const ripple of this.ripples) {
            ripple.age += dt;
            const alpha = Math.max(0, 1 - ripple.age / 1.6);
            ctx.strokeStyle = `rgba(115, 118, 116, ${alpha * 0.12})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.arc(ripple.x, ripple.y, 2 + ripple.age * 10, 0, Math.PI * 2); ctx.stroke();
        }
        this.ripples = this.ripples.filter(r => r.age < 1.6);
    }
    sampleShark(px, py, L) {
        const { spine, arc } = this;
        const N = SHARK_NODES;
        let best = Infinity;
        let bestS = 0;
        let bestSign = 1;
        let bestNx = 0;
        let bestNy = 0;
        for(let k = 0; k < N - 1; k++){
            const ax = spine[k * 2];
            const ay = spine[k * 2 + 1];
            const sx = spine[(k + 1) * 2] - ax;
            const sy = spine[(k + 1) * 2 + 1] - ay;
            const len2 = sx * sx + sy * sy || 1;
            const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
            const qx = ax + sx * u;
            const qy = ay + sy * u;
            const d2 = (px - qx) ** 2 + (py - qy) ** 2;
            if (d2 < best) {
                best = d2;
                const len = Math.sqrt(len2);
                bestS = (arc[k] + u * len) / this.arcTotal;
                bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
                bestNx = -sy / len * bestSign;
                bestNy = sx / len * bestSign;
            }
        }
        const a = Math.sqrt(best);
        const s = bestS;
        const u = s * L;
        const shape = this.shape;
        const w = shape.halfWidth(s) * L;
        this.hitDist = a;
        this.hitS = s;
        this.hitV = a * bestSign;
        const head = this.shape.head;
        if (head && u < L * (head.sweep + head.depth + head.notch)) {
            const span = L * head.span;
            const r = a / span;
            const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
            const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
            if (r <= 1 && u >= front && u <= front + depth) {
                this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
                this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
                return true;
            }
        }
        if (a <= w) {
            const across = a / (w || 1);
            const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
            let shade = 0.58 - across * across * 0.42 + facing * 0.26;
            let flag = FLAG_BODY;
            if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
                flag = FLAG_RIDGE;
                shade = 1;
            } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
                shade = Math.max(shade, 0.82);
            } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
                flag = FLAG_EYE;
                shade = 0;
            } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
                if (Math.floor((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0]) * 5) % 2 === 0) shade *= 0.45;
            } else if (s < 0.05) {
                shade = Math.max(shade, 0.7);
            } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
                shade = Math.max(shade, 0.8);
            } else if (this.marked(s, a * bestSign, L, across)) {
                flag = FLAG_MARK;
            }
            this.hitFlag = flag;
            this.hitShade = shade;
            return true;
        }
        const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
        const [p0, p1, p2] = shape.pectoral;
        if (inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) && !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))) {
            this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
            this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
            return true;
        }
        const [v0, v1, v2, vr] = shape.pelvic;
        if (inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) || shape.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal)) {
            this.hitFlag = FLAG_FIN;
            this.hitShade = 0.36;
            return true;
        }
        return false;
    }
    marked(s, v, L, across) {
        if (this.shape === SHAPES.tiger) {
            if (s < 0.2 || s > 0.9 || across > 0.85) return false;
            const wobble = 0.35 * Math.sin(v / L * 25 + s * 5);
            const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
            return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
        }
        if (this.shape === SHAPES.zebra) {
            if (s < 0.07) return false;
            const gu = s * L / (L * 0.06);
            const gv = v / (L * 0.045);
            const cu = Math.floor(gu);
            const cv = Math.floor(gv);
            const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
            const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
            return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
        }
        return false;
    }
    rasterizeSharks(sharks, t) {
        const { sharkFlag, sharkShade, sharkKey, sharkDepth, spine, arc, cw, ch, cols, rows } = this;
        sharkFlag.fill(0);
        for (const sh of sharks){
            const L = sh.length;
            const N = SHARK_NODES;
            const n = sh.nodes;
            const swim = clamp(sh.speed / 60, 0.4, 1.4);
            this.shape = SHAPES[sh.kind];
            this.sharkId = sh.id;
            for(let k = 0; k < N; k++){
                const s = k / (N - 1);
                const a = Math.max(0, k - 1);
                const b = Math.min(N - 1, k + 1);
                let tx = n[a * 2] - n[b * 2];
                let ty = n[a * 2 + 1] - n[b * 2 + 1];
                const tl = Math.hypot(tx, ty) || 1;
                tx /= tl;
                ty /= tl;
                const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim;
                const off = amp * Math.sin(sh.phase - s * 5.2);
                spine[k * 2] = n[k * 2] - ty * off;
                spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
            }
            arc[0] = 0;
            for(let k = 1; k < N; k++){
                arc[k] = arc[k - 1] + Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
            }
            this.arcTotal = arc[N - 1] || 1;
            const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
            const flex = 1 + 0.06 * Math.sin(sh.phase * 0.5);
            const reachFin = this.shape.pectoral[3];
            this.finTipRight = L * reachFin * flex * (1 - bank);
            this.finTipLeft = L * reachFin * flex * (1 + bank);
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for(let k = 0; k < N; k++){
                minX = Math.min(minX, spine[k * 2]);
                maxX = Math.max(maxX, spine[k * 2]);
                minY = Math.min(minY, spine[k * 2 + 1]);
                maxY = Math.max(maxY, spine[k * 2 + 1]);
            }
            const reach = L * 0.36;
            const c0 = Math.max(0, Math.floor((minX - reach) / cw));
            const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
            const r0 = Math.max(0, Math.floor((minY - reach) / ch));
            const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
            if (c0 > c1 || r0 > r1) continue;
            const skipBeyond = reach + Math.hypot(cw, ch);
            for(let r = r0; r <= r1; r++){
                for(let c = c0; c <= c1; c++){
                    const x = c * cw;
                    const y = r * ch;
                    const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
                    if (!centerHit && this.hitDist > skipBeyond) continue;
                    const flag = this.hitFlag;
                    const shade = this.hitShade;
                    const s = this.hitS;
                    const v = this.hitV;
                    let hits = centerHit ? 1 : 0;
                    for(let k = 0; k < SUBSAMPLES.length; k += 2){
                        if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
                    }
                    if (hits === 0) continue;
                    const coverage = hits / 5;
                    const i = r * cols + c;
                    const key = hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295 >>> 0;
                    sharkKey[i] = key;
                    sharkDepth[i] = sh.depth;
                    if (centerHit && coverage >= 0.6) {
                        sharkFlag[i] = flag;
                        sharkShade[i] = clamp(shade, 0, 1);
                    } else {
                        sharkFlag[i] = FLAG_EDGE;
                        sharkShade[i] = coverage;
                    }
                }
            }
        }
    }
    drawSharks() {
        const { ctx, cols, cw, ch } = this;
        for (let i = 0; i < this.sharkFlag.length; i++) {
            const flag = this.sharkFlag[i];
            if (!flag) continue;
            const x = (i % cols + 0.5) * cw, y = (Math.floor(i / cols) + 0.5) * ch;
            const key = this.sharkKey[i], shade = this.sharkShade[i];
            const opacity = this.visibility[i] * (0.65 + this.sharkDepth[i] * 0.35);
            let glyph, ink;
            if (flag === FLAG_EDGE) {
                const ramp = shade > 0.45 ? EDGE_HEAVY : EDGE_LIGHT;
                glyph = ramp[(key >>> 8) % ramp.length]; ink = 0.20 + shade * 0.32;
            } else {
                if (flag === FLAG_EYE) { glyph = 'o'; ink = 0.68; }
                else if (flag === FLAG_RIDGE) { glyph = ':'; ink = 0.28; }
                else if (flag === FLAG_MARK) { glyph = MARK_GLYPHS[(key >>> 8) % MARK_GLYPHS.length]; ink = 0.57; }
                else if (flag === FLAG_FIN) { glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length]; ink = 0.44; }
                else {
                    glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + ((key >>> 4) % 3) - 1, 0, SKIN_RAMP.length - 1)];
                    ink = 0.40 + (1 - shade) * 0.30;
                }
                // A little matte material beneath the letters gives the back volume.
                ctx.fillStyle = `rgba(124, 127, 124, ${opacity * (0.07 + (1 - shade) * 0.15)})`;
                ctx.fillRect(x - cw / 2, y - ch / 2, cw + 0.2, ch + 0.2);
            }
            ctx.fillStyle = `rgba(89, 94, 90, ${opacity * ink})`;
            ctx.fillText(glyph, x, y);
        }
    }

    drawFish(world) {
        const { ctx, cw, ch, cols, rows } = this;
        for (const fish of world.fish) {
            if (!fish.alive) continue;
            const c = Math.floor(fish.x / cw), r = Math.floor(fish.y / ch);
            if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
            const i = r * cols + c;
            if (this.sharkFlag[i]) continue;
            ctx.fillStyle = `rgba(116, 120, 116, ${this.visibility[i] * (0.12 + fish.depth * 0.13)})`;
            ctx.save(); ctx.translate(fish.x, fish.y); ctx.rotate(Math.atan2(fish.vy, fish.vx));
            ctx.fillText('·', -2, 0); ctx.fillText('–', 1, 0); ctx.restore();
        }
    }
}
