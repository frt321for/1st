/* ============================================================
   NAILONG®VOXEL-LAB
   程序化 SDF → 体素化 → GPU instanced 渲染 → 交互解构
   ============================================================ */
(function () {
'use strict';
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message || e)));

/* ---------------- 0. 工具 ---------------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const pad3 = n => String(Math.round(n)).padStart(3, '0');
const $ = s => document.querySelector(s);

/* ---------------- 1. 音频引擎（WebAudio 极简合成器） ---------------- */
const Audio = {
  ctx: null, master: null, on: false,
  noiseGain: null, noiseFilt: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // 常驻噪声通道 → 解构呼啸
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.noiseFilt = this.ctx.createBiquadFilter();
    this.noiseFilt.type = 'lowpass';
    this.noiseFilt.frequency.value = 160;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;
    src.connect(this.noiseFilt); this.noiseFilt.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    src.start();
  },
  toggle() {
    this.init();
    if (!this.ctx) return false;
    this.on = !this.on;
    if (this.on && this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.on && this.noiseGain) this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    return this.on;
  },
  blip(f0, f1, dur, vol) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  tick() { this.blip(1500, 900, 0.05, 0.06); },
  whoosh(v, hz) {
    if (!this.on || !this.ctx || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    this.noiseGain.gain.setTargetAtTime(Math.min(0.18, v), t, 0.06);
    this.noiseFilt.frequency.setTargetAtTime(140 + hz * 1100, t, 0.06);
  }
};

/* ---------------- 2. 源图取色（全图扫描，抗背景干扰） ---------------- */
function samplePalette() {
  const FALL = {
    yellowTop: '#f7ca3e', belly: '#f6eed8', eye: '#5da33a', pupil: '#17150f',
    glint: '#f4f1e8', mouth: '#4a3a26', hand: '#66705f', feet: '#3e443c'
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const fallback = () => {
    const o = { source: false };
    for (const k in FALL) o[k] = hex(FALL[k]);
    o.yellowBot = o.yellowTop.map(v => v * 0.93);
    return Promise.resolve(o);
  };
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = 220; cv.height = Math.max(60, Math.round(220 * img.naturalHeight / img.naturalWidth));
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          const d = cx.getImageData(0, 0, cv.width, cv.height).data;
          let ys = 0, yr = 0, yg = 0, yb = 0, gs = 0, gr = 0, gg = 0, gb = 0;
          for (let i = 0; i < d.length; i += 16) {
            const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
            if (r > 0.6 && g > 0.45 && b < 0.62 && r > b + 0.2 && g > b + 0.15) { ys++; yr += r; yg += g; yb += b; }
            else if (g > 0.45 && g > r + 0.08 && g > b + 0.15) { gs++; gr += r; gg += g; gb += b; }
          }
          if (ys < 30) return resolve(fallback());
          const mixv = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
          const Y = [yr / ys, yg / ys, yb / ys];
          const E = gs > 10 ? [gr / gs, gg / gs, gb / gs] : hex(FALL.eye);
          resolve({
            yellowTop: mixv(Y, hex(FALL.yellowTop), 0.15),
            yellowBot: Y.map(v => v * 0.92),
            belly: mixv(Y, [0.97, 0.95, 0.88], 0.55),
            eye: mixv(E, hex(FALL.eye), 0.2),
            pupil: hex(FALL.pupil), glint: hex(FALL.glint), mouth: hex(FALL.mouth),
            hand: hex(FALL.hand), feet: hex(FALL.feet), source: true
          });
        } catch (e) { resolve(fallback()); }
      };
      img.onerror = () => resolve(fallback());
      img.src = window.NAILONG_SRC;
    } catch (e) { resolve(fallback()); }
  });
}

/* ---------------- 3. SDF → 体素化 ---------------- */
function voxelize(pal) {
  const H = 1.95, RES = 96;
  const step = H / RES;
  const NX = Math.ceil(1.75 / step), NY = RES + 2, NZ = Math.ceil(1.4 / step);
  const x0 = -NX * step / 2, z0 = -NZ * step / 2, y0 = -0.02;

  const sdEll = (px, py, pz, cx, cy, cz, rx, ry, rz) => {
    const qx = (px - cx) / rx, qy = (py - cy) / ry, qz = (pz - cz) / rz;
    const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    const k1 = Math.sqrt(qx * qx / (rx * rx) + qy * qy / (ry * ry) + qz * qz / (rz * rz));
    return k0 * (k0 - 1) / (k1 || 1e-6);
  };
  const sdCap = (px, py, pz, ax, ay, az, bx, by, bz, r) => {
    const pax = px - ax, pay = py - ay, paz = pz - az;
    const bax = bx - ax, bay = by - ay, baz = bz - az;
    const bb = bax * bax + bay * bay + baz * baz;
    let t = (pax * bax + pay * bay + paz * baz) / bb; t = clamp(t, 0, 1);
    const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  };
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); };

  // 奶龙形体场（依据源图身体比例）
  function sdf(px, py, pz) {
    let d = sdEll(px, py, pz, 0, 0.78, 0, 0.485, 0.62, 0.435);          // 躯干
    d = smin(d, sdEll(px, py, pz, 0, 0.53, 0.045, 0.535, 0.46, 0.455), 0.13); // 下腹隆起
    d = smin(d, sdEll(px, py, pz, 0, 1.43, 0.02, 0.395, 0.43, 0.375), 0.15);  // 头部
    d = smin(d, sdCap(px, py, pz, 0.45, 1.07, 0.10, 0.585, 0.56, 0.175, 0.115), 0.09); // 臂R
    d = smin(d, sdCap(px, py, pz, -0.45, 1.07, 0.10, -0.585, 0.56, 0.175, 0.115), 0.09);
    d = smin(d, sdEll(px, py, pz, 0.60, 0.50, 0.185, 0.145, 0.145, 0.145), 0.07);      // 手R
    d = smin(d, sdEll(px, py, pz, -0.60, 0.50, 0.185, 0.145, 0.145, 0.145), 0.07);
    d = smin(d, sdCap(px, py, pz, 0.205, 0.38, 0.045, 0.235, 0.11, 0.075, 0.135), 0.10); // 腿R
    d = smin(d, sdCap(px, py, pz, -0.205, 0.38, 0.045, -0.235, 0.11, 0.075, 0.135), 0.10);
    d = smin(d, sdEll(px, py, pz, 0.245, 0.085, 0.10, 0.15, 0.085, 0.195), 0.075);       // 脚R
    d = smin(d, sdEll(px, py, pz, -0.245, 0.085, 0.10, 0.15, 0.085, 0.195), 0.075);
    d = smin(d, sdCap(px, py, pz, 0, 0.46, -0.38, 0, 0.30, -0.56, 0.072), 0.09);         // 尾
    return d;
  }

  // 填充栅格
  const N = NX * NY * NZ;
  const grid = new Uint8Array(N);
  const IDX = (ix, iy, iz) => ix + iy * NX + iz * NX * NY;
  for (let iz = 0; iz < NZ; iz++) {
    const z = z0 + (iz + 0.5) * step;
    for (let iy = 0; iy < NY; iy++) {
      const y = y0 + (iy + 0.5) * step;
      for (let ix = 0; ix < NX; ix++) {
        const x = x0 + (ix + 0.5) * step;
        if (sdf(x, y, z) < 0) grid[IDX(ix, iy, iz)] = 1;
      }
    }
  }

  // 表面壳提取 + 颜色/法线/AO
  const offs = [], cols = [], nrms = [], rnds = [], aos = [], dirs = [];
  const nb = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const rnd = () => Math.random();
  const smileZ = 0.375;
  const bodyColor = y => {
    const t = clamp((y - 0.15) / 1.7, 0, 1);
    const j = 0.97 + rnd() * 0.06;
    return [lerp(pal.yellowBot[0], pal.yellowTop[0], t) * j,
            lerp(pal.yellowBot[1], pal.yellowTop[1], t) * j,
            lerp(pal.yellowBot[2], pal.yellowTop[2], t) * j];
  };
  for (let iz = 1; iz < NZ - 1; iz++) {
    for (let iy = 1; iy < NY - 1; iy++) {
      for (let ix = 1; ix < NX - 1; ix++) {
        if (!grid[IDX(ix, iy, iz)]) continue;
        let empty = 0, nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 6; k++) {
          const dx = nb[k][0], dy = nb[k][1], dz = nb[k][2];
          if (!grid[IDX(ix + dx, iy + dy, iz + dz)]) {
            empty++; nx += dx; ny += dy; nz += dz;
          }
        }
        if (empty === 0) { /* 内部体素：保留体积，法线在坐标声明后处理 */ }

        const px = x0 + (ix + 0.5) * step;
        const py = y0 + (iy + 0.5) * step;
        const pz = z0 + (iz + 0.5) * step;
        if (empty === 0) { nx = px; ny = py - 0.95; nz = pz; } // 内部体素 → 径向伪法线

        // ---- 上色 ----
        let c;
        const inHand = sdEll(px, py, pz, 0.60, 0.50, 0.185, 0.155, 0.155, 0.155) < 0.004 ||
                       sdEll(px, py, pz, -0.60, 0.50, 0.185, 0.155, 0.155, 0.155) < 0.004;
        const inFoot = sdEll(px, py, pz, 0.245, 0.085, 0.10, 0.165, 0.10, 0.21) < 0.004 ||
                       sdEll(px, py, pz, -0.245, 0.085, 0.10, 0.165, 0.10, 0.21) < 0.004;
        if (inHand) c = pal.hand;
        else if (inFoot) c = pal.feet;
        else if (py > 1.26) {
          c = null;
          for (let s = -1; s <= 1 && !c; s += 2) {
            const ex = s * 0.128, ey = 1.50;
            const u = (px - ex) / 0.066, v = (py - ey) / 0.096;
            if (u * u + v * v < 1.0 && pz > 0.30) {
              const up = (px - ex) / 0.036, vp = (py - ey) / 0.040;
              if (up * up + vp * vp < 1.0) c = pal.pupil;
              else {
                const gx = px - (ex + s * 0.024), gy = py - (ey + 0.032);
                if (gx * gx + gy * gy < 0.00017) c = pal.glint;
                else c = pal.eye;
              }
            }
          }
          if (!c && Math.abs(px) < 0.098 && pz > smileZ - 0.05) {
            const tt = clamp(px / 0.088, -1, 1);
            const my = 1.335 - 0.022 * (1 - tt * tt);
            if (Math.abs(py - my) < 0.014) c = pal.mouth;
          }
          if (!c) c = bodyColor(py);
        }
        else {
          const inBelly = sdEll(px, py, pz, 0, 0.66, 0.06, 0.30, 0.46, 0.44) < 0;
          c = inBelly ? pal.belly : bodyColor(py);
        }

        // ---- 法线（栅格梯度；内部退化时取竖直向上） ----
        let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl < 1e-4) { nx = 0; ny = 1; nz = 0; nl = 1; }

        // ---- AO ----
        const ao = clamp(1 - Math.min(empty, 3) * 0.13, 0.4, 1);

        // ---- 解构方向 ----
        let dx = px - 0, dy = py - 0.95, dz = pz - 0;
        dx += (rnd() - 0.5) * 0.55; dy += (rnd() - 0.5) * 0.55 + 0.18; dz += (rnd() - 0.5) * 0.55;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

        offs.push(px, py, pz);
        cols.push(c[0], c[1], c[2]);
        nrms.push(nx / nl, ny / nl, nz / nl);
        rnds.push(rnd(), rnd(), rnd(), rnd());
        aos.push(ao);
        dirs.push(dx / dl, dy / dl, dz / dl);
      }
    }
  }

  return {
    count: aos.length, step, res: RES,
    offsets: new Float32Array(offs), colors: new Float32Array(cols),
    normals: new Float32Array(nrms), rnds: new Float32Array(rnds),
    aos: new Float32Array(aos), dirs: new Float32Array(dirs)
  };
}

/* ---------------- 4. 着色器 ---------------- */
const VERT = `
attribute vec3 aOffset;
attribute vec3 aColor;
attribute vec3 aNrm;
attribute vec4 aRnd;
attribute float aAO;

uniform float uTime, uBuild, uExplode, uBurst, uPointerF, uMode, uVox, uGlitch;
uniform vec3 uPointer;

varying vec3 vColor; varying vec3 vN; varying vec3 vWp;
varying float vRnd; varying float vAO; varying float vFly;

mat3 rotAxis(vec3 a, float ang){
  float s = sin(ang), c = cos(ang); float oc = 1.0 - c;
  return mat3(
    oc*a.x*a.x + c,     oc*a.x*a.y - a.z*s, oc*a.z*a.x + a.y*s,
    oc*a.x*a.y + a.z*s, oc*a.y*a.y + c,     oc*a.y*a.z - a.x*s,
    oc*a.z*a.x - a.y*s, oc*a.y*a.z + a.x*s, oc*a.z*a.z + c
  );
}

void main(){
  float s1 = aRnd.x, s2 = aRnd.y, s3 = aRnd.z, s4 = aRnd.w;

  // 自底向上的「打印」建构
  float delay = (clamp((aOffset.y + 0.02) / 1.95, 0.0, 1.0) * 0.55 + s4 * 0.38) * 0.62;
  float t = smoothstep(delay, delay + 0.40, uBuild);
  t = t * t * (3.0 - 2.0 * t);

  // 解构 / 爆炸
  float ex = clamp(uExplode + uBurst, 0.0, 1.4);
  vec3 pos = mix(aOffset + aDir0 * (1.2 + s2 * 2.6) + vec3(0.0, 0.3 + s3 * 0.7, 0.0), aOffset, t);
  pos += aDir0 * ex * (1.15 + s2 * 2.3);
  pos.y += ex * s3 * 0.65;
  float scl = t * mix(1.0, 0.60 + 0.40 * s3, ex);
  mat3 R = rotAxis(normalize(aRnd.xyz * 2.0 - 1.0 + 0.001), ex * (s1 * 2.0 - 1.0) * 9.0);

  // 呼吸微动
  pos.y += sin(uTime * 1.5 + s1 * 6.2831) * 0.006;
  pos += aDir0 * sin(uTime * 0.8 + s2 * 6.2831) * 0.0045;

  // 指针斥力场
  vec3 dp = pos - uPointer;
  float dl = length(dp);
  pos += dp / max(dl, 0.0001) * exp(-dl * dl * 10.0) * uPointerF * 0.45;

  // 熔融扰动
  if (uMode > 2.5) {
    float n = sin(pos.x * 8.0 + uTime * 2.4) * sin(pos.y * 6.5 - uTime * 1.8) * sin(pos.z * 7.5 + uTime * 2.1);
    pos += vec3(n * 0.03, n * 0.05, n * 0.03);
  }

  // 毛刺切片
  pos.x += uGlitch * step(0.72, fract(pos.y * 5.0 + floor(uTime * 24.0) * 0.618)) * (s3 - 0.5) * 0.4;

  vec3 local = R * (position * scl * uVox);
  vec3 wp = pos + local;

  vColor = aColor;
  vN = normalize(mat3(modelMatrix) * (R * normalize(aNrm)));
  vWp = wp;
  vRnd = s1;
  vAO = aAO;
  vFly = ex * (0.35 + s2 * 0.65);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

// 注：aDir0 由 JS 端注入 —— 见下方材质 onBeforeCompile 之前的手动 attribute 声明占位
const FRAG = `
precision highp float;
varying vec3 vColor; varying vec3 vN; varying vec3 vWp;
varying float vRnd; varying float vAO; varying float vFly;
uniform float uTime, uMode;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWp);
  if (dot(N, V) < 0.0) N = -N;

  vec3 L1 = normalize(vec3(0.5, 0.85, 0.6));
  vec3 L2 = normalize(vec3(-0.65, 0.2, -0.45));
  float dif = max(dot(N, L1), 0.0);
  float bak = max(dot(N, L2), 0.0);
  float fre = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 col;
  if (uMode < 0.5) {
    // 原色：源图采样色 + 柔和摄影棚光
    col = vColor * (0.38 + 0.72 * dif) + vColor * bak * 0.22 + fre * 0.30 * vec3(1.0, 0.95, 0.78);
    col *= mix(0.76, 1.0, vAO);
  } else if (uMode < 1.5) {
    // 陶瓷：单色瓷体 + 随机导光体素
    vec3 base = vec3(0.92, 0.90, 0.85);
    col = base * (0.30 + 0.72 * dif) + base * bak * 0.15 + fre * 0.55;
    col *= mix(0.80, 1.0, vAO);
    if (vRnd > 0.962) col = vec3(1.0, 0.72, 0.10) * 2.2;
  } else if (uMode < 2.5) {
    // 全息：菲涅尔能量体 + 扫描带
    float scan = 0.5 + 0.5 * sin(vWp.y * 70.0 - uTime * 7.0);
    vec3 mint = vec3(0.32, 1.0, 0.72);
    float sweepY = mod(uTime * 0.38, 2.9) - 0.4;
    float band = exp(-abs(vWp.y - sweepY) * 16.0);
    col = vec3(0.012, 0.05, 0.045);
    col += mint * (0.10 + fre * 1.30) + mint * scan * 0.16 + mint * band * 1.5;
    col += vec3(0.05, 0.5, 0.35) * dif * 0.12;
  } else {
    // 熔融：热力梯度脉冲
    float heat = 0.5 + 0.5 * sin(vWp.y * 9.0 - uTime * 2.2 + vRnd * 6.2831);
    vec3 hot = mix(vec3(1.0, 0.52, 0.06), vec3(0.82, 0.09, 0.04), heat * 0.55);
    hot = mix(vColor * 1.15, hot, 0.60);
    float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + vRnd * 6.2831);
    col = hot * (0.34 + 0.78 * dif) * pulse + hot * fre * 0.9;
  }

  col *= 1.0 - vFly * 0.30;
  col *= 0.96 + 0.08 * hash(gl_FragCoord.xy + fract(uTime) * 7.0);

  float dist = length(cameraPosition - vWp);
  col = mix(col, vec3(0.039, 0.039, 0.043), smoothstep(6.0, 11.5, dist));

  col = pow(max(col, 0.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------- 5. 场景 ---------------- */
let renderer, scene, camera, composer, bloomPass;
let voxMesh, voxGeo, voxMat, modelGroup;
let dust, gridFloor, glowDisc, ringShock;
const TARGET = new THREE.Vector3(0, 0.96, 0);

function initScene(pal, vox) {
  const canvas = $('#gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0a0b, 1);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.42, 5.05);
  camera.lookAt(TARGET);

  // ---- 体素 instanced geometry ----
  const box = new THREE.BoxGeometry(1, 1, 1);
  voxGeo = new THREE.InstancedBufferGeometry();
  voxGeo.index = box.index;
  voxGeo.setAttribute('position', box.attributes.position);
  voxGeo.setAttribute('normal', box.attributes.normal);
  voxGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(vox.offsets, 3));
  voxGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(vox.colors, 3));
  voxGeo.setAttribute('aNrm', new THREE.InstancedBufferAttribute(vox.normals, 3));
  voxGeo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(vox.rnds, 4));
  voxGeo.setAttribute('aAO', new THREE.InstancedBufferAttribute(vox.aos, 1));
  voxGeo.setAttribute('aDir0', new THREE.InstancedBufferAttribute(vox.dirs, 3));
  voxGeo.instanceCount = vox.count;

  voxMat = new THREE.ShaderMaterial({
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 }, uBuild: { value: 0 }, uExplode: { value: 0 }, uBurst: { value: 0 },
      uPointer: { value: new THREE.Vector3(0, -99, 0) }, uPointerF: { value: 0 },
      uMode: { value: 0 }, uVox: { value: vox.step * 0.98 }, uGlitch: { value: 0 }
    }
  });
  voxMat.vertexShader = 'attribute vec3 aDir0;\n' + VERT;

  modelGroup = new THREE.Group();
  voxMesh = new THREE.Mesh(voxGeo, voxMat);
  voxMesh.frustumCulled = false;
  modelGroup.add(voxMesh);
  scene.add(modelGroup);

  // ---- 极坐标地面网格 ----
  {
    const pts = [];
    const rings = [0.7, 1.35, 2.0, 2.65, 3.3];
    rings.forEach(r => {
      const seg = 96;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        pts.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
      }
    });
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      pts.push(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, Math.cos(a) * 3.45, 0, Math.sin(a) * 3.45);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gridFloor = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x232329, transparent: true, opacity: 0.55 }));
    gridFloor.position.y = -0.004;
    scene.add(gridFloor);
  }

  // ---- 地面辉光 ----
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(245,197,49,0.20)');
    gr.addColorStop(0.5, 'rgba(245,197,49,0.05)');
    gr.addColorStop(1, 'rgba(245,197,49,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    glowDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 4.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.y = 0.002;
    scene.add(glowDisc);
  }

  // ---- 冲击波环 ----
  ringShock = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.5, 80),
    new THREE.MeshBasicMaterial({ color: 0xf5c531, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ringShock.rotation.x = -Math.PI / 2;
  ringShock.position.y = 0.02;
  scene.add(ringShock);

  // ---- 尘埃 ----
  {
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 7;
      pos[i * 3 + 1] = Math.random() * 3.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x8a8272, size: 0.016, sizeAttenuation: true,
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    scene.add(dust);
  }

  // ---- 后期：Bloom ----
  composer = new THREE.EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.9);
  composer.addPass(bloomPass);

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

/* ---------------- 6. 交互状态 ---------------- */
const S = {
  build: 0, buildDone: false,
  explode: 0, explodeTarget: 0, explodeVel: 0,
  burst: 0,
  yaw: 0, yawVel: 0, pitch: 0, pitchTarget: 0,
  dragging: false, lastX: 0, lastY: 0,
  mx: 0, my: 0,                 // NDC
  pointerW: new THREE.Vector3(0, -99, 0),   // 世界空间斥力点
  pointerO: new THREE.Vector3(0, -99, 0),   // 模型空间
  pointerF: 0, pointerFTarget: 1,
  lastInteract: performance.now(),
  mode: 0, glitch: 0,
  ring: { t: 1, active: false }
};
const MODE_NAMES = ['原色 ORIGIN', '陶瓷 CLAY', '全息 HOLO', '熔融 MELT'];

function setupInput() {
  const stage = $('#stage');

  window.addEventListener('pointerdown', e => {
    if (e.target.closest('.chips') || e.target.closest('.mono-btn') || e.target.closest('.src')) return;
    S.dragging = true; S.lastX = e.clientX; S.lastY = e.clientY;
    S.lastInteract = performance.now();
    ringEl.classList.add('drag'); curLabel.textContent = '旋转 ROTATE';
  });
  window.addEventListener('pointermove', e => {
    // 光标
    dotX = e.clientX; dotY = e.clientY;
    S.mx = (e.clientX / window.innerWidth) * 2 - 1;
    S.my = -((e.clientY / window.innerHeight) * 2 - 1);
    if (S.dragging) {
      const dx = e.clientX - S.lastX, dy = e.clientY - S.lastY;
      S.yaw += dx * 0.0062;
      S.yawVel = lerp(S.yawVel, dx * 0.0062, 0.5);
      S.pitchTarget = clamp(S.pitchTarget + dy * 0.0042, -0.5, 0.55);
      S.lastX = e.clientX; S.lastY = e.clientY;
      S.lastInteract = performance.now();
    }
    // 斥力点：射线 ↔ 过模型中心、面向相机的平面
    raycaster.setFromCamera(new THREE.Vector2(S.mx, S.my), camera);
    if (raycaster.ray.intersectPlane(plane, tmpV)) {
      S.pointerW.copy(tmpV);
      S.pointerFTarget = 1;
    } else S.pointerFTarget = 0;
  });
  window.addEventListener('pointerup', () => {
    S.dragging = false;
    ringEl.classList.remove('drag'); curLabel.textContent = '';
  });
  window.addEventListener('wheel', e => {
    e.preventDefault();
    S.explodeTarget = clamp(S.explodeTarget + e.deltaY * 0.00072, 0, 1);
    S.lastInteract = performance.now();
  }, { passive: false });
  window.addEventListener('dblclick', e => {
    if (e.target.closest('.chips') || e.target.closest('.mono-btn')) return;
    S.burst = 1.05;
    S.ring = { t: 0, active: true };
    Audio.whoosh(0.18, 1);
    Audio.blip(90, 40, 0.4, 0.22);
    S.lastInteract = performance.now();
  });
  window.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '4') setMode(+e.key - 1);
    else if (e.key.toLowerCase() === 'r') { S.explodeTarget = 0; S.pitchTarget = 0; S.yaw = 0; S.yawVel = 0; }
    else if (e.code === 'Space') { e.preventDefault(); S.explodeTarget = S.explodeTarget > 0.5 ? 0 : 0.62; Audio.tick(); }
    S.lastInteract = performance.now();
  });

  // chips
  document.querySelectorAll('.chip').forEach(ch => {
    ch.addEventListener('click', () => { setMode(+ch.dataset.mode); Audio.tick(); });
  });

  // 声音
  $('#snd').addEventListener('click', () => {
    const on = Audio.toggle();
    $('#snd').textContent = on ? 'SND\u00a0[ON]' : 'SND\u00a0[OFF]';
    $('#snd').classList.toggle('on', on);
    if (on) Audio.blip(220, 660, 0.25, 0.12);
  });

  // 悬停光标态
  document.querySelectorAll('[data-cursor]').forEach(el => {
    el.addEventListener('pointerenter', () => {
      ringEl.classList.add('hover'); curLabel.textContent = el.dataset.cursor;
    });
    el.addEventListener('pointerleave', () => {
      ringEl.classList.remove('hover'); curLabel.textContent = '';
    });
  });
}

function setMode(m) {
  if (m === S.mode) return;
  S.mode = m;
  voxMat.uniforms.uMode.value = m;
  // 材质切换 → 体素短暂散开重组
  S.build = Math.min(S.build, 0.55);
  $('#idxNum').textContent = String(m + 1).padStart(2, '0');
  $('#rMode').textContent = MODE_NAMES[m];
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', +c.dataset.mode === m));
  Audio.blip(180 + m * 120, 420 + m * 160, 0.22, 0.12);
}

/* ---------------- 7. HUD ---------------- */
let dotX = -100, dotY = -100, ringX = -100, ringY = -100;
let ringEl, dotEl, curLabel;
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const tmpV = new THREE.Vector3();

function initHUD(pal, vox) {
  $('#srcThumb').src = window.NAILONG_SRC;
  $('#rVox').textContent = vox.count.toLocaleString();
  $('#rGrid').textContent = vox.res + '³ · SOLID FIELD';

  const sw = $('#swatches');
  [['YLW', pal.yellowTop], ['CRM', pal.belly], ['GRN', pal.eye], ['DRK', pal.hand]].forEach(([l, c]) => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.dataset.l = l;
    d.style.background = `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
    sw.appendChild(d);
  });

  const items = 'VOXELIZED FROM 奶蛙.JPEG <b>●</b> ' + vox.count.toLocaleString() + ' VOXELS <b>●</b> ' + vox.res + '³ SDF SOLID FIELD <b>●</b> <span class="cjk">体素化 · 解构 · 重组</span> <b>●</b> DRAG 旋转 — SCROLL 解构 — DBLCLICK 爆炸 <b>●</b> NAILONG®VOXEL-LAB <b>●</b> ';
  $('#marqueeTrack').innerHTML = items.repeat(4);

  dotEl = $('#curDot'); ringEl = $('#curRing'); curLabel = $('#curLabel');

  // 视差层
  const layers = document.querySelectorAll('.parallax');
  window.addEventListener('pointermove', e => {
    const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
    layers.forEach(l => {
      const d = parseFloat(l.dataset.depth || 0.02);
      l.style.translate = `${-nx * d * 900}px ${-ny * d * 500}px`;
    });
  });
}

/* ---------------- 8. 主循环 ---------------- */
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 60, hudT = 0;
let paused = false;

window.__nailong = {
  pause() { paused = true; },
  resume() { paused = false; lastT = performance.now(); },
  state: S,
  skip() {
    $('#loader').classList.add('done');
    document.body.classList.add('ready');
    S.build = 0.0001;
  },
  setMode(m) { setMode(m); },
  step(dtSec, times) { for (let i = 0; i < (times || 1); i++) tick(dtSec, performance.now()); },
  renderOnce() {
    voxMat.uniforms.uTime.value = performance.now() / 1000;
    composer.render();
  }
};

function loop(now) {
  requestAnimationFrame(loop);
  if (paused) { lastT = now; return; }
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  tick(dt, now);
}

function tick(dt, now) {
  const t = now / 1000;

  // --- 构建 ---
  if (S.build < 1) S.build = Math.min(1, S.build + dt / 2.6);
  else if (!S.buildDone) S.buildDone = true;

  // --- 物理：爆炸弹簧 ---
  S.explodeVel += (S.explodeTarget - S.explode) * 0.055;
  S.explodeVel *= 0.86;
  S.explode += S.explodeVel;
  S.burst *= Math.pow(0.12, dt); // 快速衰减

  // 音频呼啸联动
  const wv = Math.abs(S.explodeVel) * 2.2 + S.burst * 0.5;
  Audio.whoosh(wv * 0.5, wv);

  // --- 旋转 ---
  if (!S.dragging) {
    S.yaw += S.yawVel; S.yawVel *= 0.94;
    if (now - S.lastInteract > 4000 && S.buildDone) S.yaw += dt * 0.16; // 闲置自转
  }
  S.pitch = lerp(S.pitch, S.pitchTarget, 0.08);
  modelGroup.rotation.y = S.yaw;
  modelGroup.rotation.x = S.pitch * 0.6;

  // --- 相机视差 ---
  camera.position.x = lerp(camera.position.x, S.mx * 0.34, 0.04);
  camera.position.y = lerp(camera.position.y, 1.42 + S.my * 0.22, 0.04);
  camera.lookAt(TARGET);

  // --- 斥力点平滑（→ 模型空间） ---
  S.pointerF = lerp(S.pointerF, S.pointerFTarget, 0.1);
  modelGroup.updateMatrixWorld();
  tmpV.copy(S.pointerW);
  modelGroup.worldToLocal(tmpV);
  S.pointerO.lerp(tmpV, 0.16);

  // --- 毛刺 ---
  if (S.buildDone && Math.random() < 0.006) S.glitch = 0.6 + Math.random() * 0.4;
  S.glitch *= Math.pow(0.001, dt);

  // --- 冲击环 ---
  if (S.ring.active) {
    S.ring.t += dt / 0.8;
    if (S.ring.t >= 1) { S.ring.active = false; ringShock.material.opacity = 0; }
    else {
      const e = easeOutCubic(S.ring.t);
      ringShock.scale.setScalar(lerp(0.5, 3.0, e));
      ringShock.material.opacity = 0.85 * (1 - e);
    }
  }

  // --- 尘埃 / 网格 ---
  dust.rotation.y += dt * 0.02;
  gridFloor.rotation.y -= dt * 0.012;

  // --- uniforms ---
  voxMat.uniforms.uTime.value = t;
  voxMat.uniforms.uBuild.value = S.build;
  voxMat.uniforms.uExplode.value = S.explode;
  voxMat.uniforms.uBurst.value = S.burst;
  voxMat.uniforms.uPointer.value.copy(S.pointerO);
  voxMat.uniforms.uPointerF.value = S.pointerF;
  voxMat.uniforms.uGlitch.value = S.glitch;

  composer.render();

  // --- 光标 ---
  dotEl.style.left = dotX + 'px'; dotEl.style.top = dotY + 'px';
  ringX = lerp(ringX, dotX, 0.16); ringY = lerp(ringY, dotY, 0.16);
  ringEl.style.left = ringX + 'px'; ringEl.style.top = ringY + 'px';

  // --- HUD 遥测 ---
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
  hudT += dt;
  if (hudT > 0.2) {
    fpsShow = Math.round(fpsAcc / fpsN); fpsAcc = 0; fpsN = 0; hudT = 0;
    $('#rFps').textContent = fpsShow;
    $('#rExpl').textContent = pad3(clamp(S.explode, 0, 1) * 100) + '%';
    const deg = Math.round(((S.yaw * 180 / Math.PI) % 360 + 360) % 360);
    $('#rRot').textContent = '+' + String(deg).padStart(3, '0') + '°';
  }
}

/* ---------------- 9. 启动 ---------------- */
function boot() {
  const pct = $('#pct'), bar = $('#barFill');
  let p = 0, ready = false, launched = false;
  const t0 = performance.now();

  requestAnimationFrame(function loader() {
    requestAnimationFrame(loader);
    const el = (performance.now() - t0) / 1000;
    const target = ready ? 1 : Math.min(el / 1.5, 0.9) ;
    p = lerp(p, target, 0.08);
    if (ready && p > 0.995) p = 1;
    pct.textContent = String(Math.floor(p * 100)).padStart(2, '0');
    bar.style.width = (p * 100) + '%';
    if (p >= 1 && !launched && ready) {
      launched = true;
      setTimeout(() => {
        $('#loader').classList.add('done');
        document.body.classList.add('ready');
        S.build = 0.0001; // 触发自底向上建构
      }, 220);
    }
  });

  samplePalette().then(pal => {
    setTimeout(() => {
      let vox;
      try { vox = voxelize(pal); } catch (e) {
        window.__errs.push('VOXELIZE: ' + (e && e.message) + ' @ ' + (e && e.stack ? e.stack.split('\n')[1] : ''));
        console.error(e); ready = true; return;
      }
      try {
        initScene(pal, vox);
      } catch (e) {
        window.__errs.push('INITSCENE: ' + (e && e.message) + ' | ' + (e && e.stack ? e.stack.split('\n')[1] : ''));
        $('#webglFail').hidden = false;
        console.error(e);
        return;
      }
      initHUD(pal, vox);
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), TARGET);
      setupInput();
      requestAnimationFrame(loop);
      ready = true;
    }, 60);
  });
}

boot();
})();
