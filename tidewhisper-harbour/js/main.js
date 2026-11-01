/* =========================================================================
 * 汐语港 · TIDEWHISPER HARBOUR
 * 一个 120 秒过完昼夜的 3D 箱庭海镇 —— 全程序化几何,无外部素材。
 * 结构:渲染/相机 → 环境(天/水/光) → 地形 → 建造 → 交通与居民 → 昼夜 → UI
 * ========================================================================= */
'use strict';
(function () {

  // ---------- 基础 ----------
  const T = window.Terrain;
  const groundH = T.groundH;
  const { lerp, clamp } = THREE.MathUtils;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe2ea, 80, 300);

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 900);

  // ---------- 调色板 ----------
  const C = {
    plasterA: 0xefe3cd, plasterB: 0xe4cfae, plasterC: 0xf4ecdc, white: 0xf5f2ea,
    terra: 0xc1613e, terraDeep: 0xa84c30, tealRoof: 0x3f6f6a, slate: 0x4c5560,
    wood: 0x77573a, woodDark: 0x54391f, stone: 0xb3a288, stoneDark: 0x8d8170,
    teal: 0x2e6f6a, navy: 0x35507a, mustard: 0xd9a441, coral: 0xd96a4b, red: 0xb8433a,
    leafA: 0x6fa057, leafB: 0x8fb96a, cypress: 0x3f6d4f, trunk: 0x7b5a3e,
    cream: 0xf1e7d2, gold: 0xd9a441, glassDark: 0x1d2732
  };

  // ---------- 材质工厂(按色缓存) ----------
  const matCache = new Map();
  function M(color, opt) {
    const key = color + '|' + JSON.stringify(opt || {});
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0 }, opt)));
    return matCache.get(key);
  }

  // ---------- 网格小工具 ----------
  function mesh(geo, mat, x, y, z, cast, recv) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = cast !== false; m.receiveShadow = recv !== false;
    return m;
  }
  const B = (w, h, d, c, o) => new THREE.BoxGeometry(w, h, d);
  function box(g, w, h, d, c, x, y, z, ry, opt) {
    const m = mesh(new THREE.BoxGeometry(w, h, d), M(c, opt), x, y, z);
    if (ry) m.rotation.y = ry; g.add(m); return m;
  }
  function cyl(g, rt, rb, h, c, x, y, z, seg, opt) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), M(c, opt), x, y, z);
    g.add(m); return m;
  }
  function cone(g, r, h, c, x, y, z, seg, opt) {
    const m = mesh(new THREE.ConeGeometry(r, h, seg || 4), M(c, opt), x, y, z);
    g.add(m); return m;
  }
  function sph(g, r, c, x, y, z, seg, opt) {
    const m = mesh(new THREE.SphereGeometry(r, seg || 14, seg ? Math.max(8, seg * 0.7) | 0 : 10), M(c, opt), x, y, z);
    g.add(m); return m;
  }
  // 双坡屋顶
  function gableRoof(g, w, d, h, c, x, y, z, ry) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); if (ry) grp.rotation.y = ry;
    const slope = Math.atan2(h, d / 2);
    const len = Math.sqrt(h * h + d * d / 4) + 0.12;
    const s1 = mesh(new THREE.BoxGeometry(w + 0.3, 0.1, len), M(c), 0, 0, 0);
    s1.rotation.x = -(Math.PI / 2 - slope); s1.position.set(0, h / 2, -d / 4 + 0.02);
    const s2 = s1.clone(); s2.rotation.x = Math.PI / 2 - slope; s2.position.set(0, h / 2, d / 4 - 0.02);
    const tri = new THREE.Shape(); tri.moveTo(-d / 2 - 0.06, 0); tri.lineTo(d / 2 + 0.06, 0); tri.lineTo(0, h); tri.closePath();
    const triG = new THREE.ShapeGeometry(tri);
    const e1 = mesh(triG, M(c, { side: THREE.DoubleSide }), 0, 0, -(w / 2 + 0.14) * 0);
    e1.rotation.y = Math.PI / 2; e1.position.set(-(w / 2 + 0.13), 0, 0);
    const e2 = mesh(triG, M(c, { side: THREE.DoubleSide }), 0, 0, 0);
    e2.rotation.y = -Math.PI / 2; e2.position.set(w / 2 + 0.13, 0, 0);
    grp.add(s1, s2, e1, e2); g.add(grp); return grp;
  }
  // 四坡/金字塔顶
  function pyrRoof(g, w, d, h, c, x, y, z) {
    const m = mesh(new THREE.ConeGeometry(0.71, h, 4), M(c), x, y + h / 2, z);
    m.rotation.y = Math.PI / 4; m.scale.set(w, 1, d); g.add(m); return m;
  }
  // 条纹雨棚
  function awning(g, w, depth, n, cA, cB, x, y, z, ry, tilt) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry || 0; grp.rotation.x = tilt || 0.32;
    const sw = w / n;
    for (let i = 0; i < n; i++) {
      const m = mesh(new THREE.BoxGeometry(sw * 0.96, 0.05, depth), M(i % 2 ? cA : cB), -w / 2 + sw * (i + 0.5), 0, depth / 2);
      grp.add(m);
    }
    g.add(grp); return grp;
  }

  // ---------- 昼夜关键帧 ----------
  // [小时, 天顶, 地平, 雾, 环境强度, 水深色, 水浅色, 半球天, 半球地]
  const KEYS = [
    [0.0, 0x060a18, 0x0d1526, 0x0a1120, 0.20, 0x081524, 0x122a3c, 0x17203a, 0x0b0d12],
    [4.6, 0x060a18, 0x0d1526, 0x0a1120, 0.20, 0x081524, 0x122a3c, 0x17203a, 0x0b0d12],
    [6.1, 0x22325c, 0xe9824d, 0x83708a, 0.30, 0x133a52, 0x3f7f88, 0x545070, 0x30291f],
    [7.6, 0x3e77b3, 0xf6cd9c, 0xbcc7cd, 0.42, 0x155d7e, 0x51b0b2, 0x9db4c8, 0x6f7f5c],
    [12.0, 0x2e6db4, 0xb4dbeb, 0xcfe2ea, 0.52, 0x186686, 0x58c0c1, 0xbcd6ea, 0x7c8c64],
    [16.5, 0x3a72ab, 0xd8d2ae, 0xd2d8c8, 0.46, 0x175f80, 0x55b4b6, 0xb0c4d8, 0x76845f],
    [18.6, 0x2b2f5c, 0xf0794a, 0xa8707a, 0.30, 0x1d3d55, 0x6f9a94, 0x5e567a, 0x3a3427],
    [19.8, 0x121a38, 0x5c3a5e, 0x2c2540, 0.22, 0x0e2233, 0x1e3c4a, 0x2e3652, 0x191b1e],
    [21.4, 0x060a18, 0x0d1526, 0x0a1120, 0.20, 0x081524, 0x122a3c, 0x17203a, 0x0b0d12],
    [24.0, 0x060a18, 0x0d1526, 0x0a1120, 0.20, 0x081524, 0x122a3c, 0x17203a, 0x0b0d12]
  ];
  const _ca = new THREE.Color(), _cb = new THREE.Color();
  function sampleKeys(t) {
    let i = 0; while (KEYS[i + 1][0] < t) i++;
    const A = KEYS[i], Bk = KEYS[i + 1];
    const f = ss(A[0], Bk[0], t);
    return {
      top: _ca.setHex(A[1]).lerp(_cb.setHex(Bk[1]), f).clone(),
      hor: _ca.setHex(A[2]).lerp(_cb.setHex(Bk[2]), f).clone(),
      fog: _ca.setHex(A[3]).lerp(_cb.setHex(Bk[3]), f).clone(),
      amb: lerp(A[4], Bk[4], f),
      deep: _ca.setHex(A[5]).lerp(_cb.setHex(Bk[5]), f).clone(),
      shal: _ca.setHex(A[6]).lerp(_cb.setHex(Bk[6]), f).clone(),
      hemiS: _ca.setHex(A[7]).lerp(_cb.setHex(Bk[7]), f).clone(),
      hemiG: _ca.setHex(A[8]).lerp(_cb.setHex(Bk[8]), f).clone()
    };
  }

  // =========================================================================
  // 灯光
  // =========================================================================
  const hemi = new THREE.HemisphereLight(0xbcd6ea, 0x7c8c64, 0.5); scene.add(hemi);
  const amb = new THREE.AmbientLight(0x2c3242, 0.35); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);

  // =========================================================================
  // 天空穹顶(渐变 + 太阳 + 月亮 + 程序星星)
  // =========================================================================
  const skyU = {
    uTop: { value: new THREE.Color(0x2e6db4) },
    uHor: { value: new THREE.Color(0xb4dbeb) },
    uSunDir: { value: V3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(0xfff1dc) },
    uMoonDir: { value: V3(0, -1, 0) },
    uNight: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(360, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vD; uniform vec3 uTop,uHor,uSunDir,uSunCol,uMoonDir; uniform float uNight;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        void main(){
          vec3 d = normalize(vD);
          float y = clamp(d.y, -0.12, 1.0);
          vec3 col = mix(uHor, uTop, pow(max(y,0.0), 0.58));
          if(d.y < 0.0) col = mix(uHor, uHor*0.55, clamp(-d.y*3.0,0.0,1.0));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 320.0)*1.1 + pow(sd, 9.0)*0.20);
          float md = max(dot(d, uMoonDir), 0.0);
          float disc = smoothstep(0.99935, 0.99965, md);
          col += vec3(0.86,0.9,1.0) * (disc*0.85 + pow(md, 260.0)*0.30 + pow(md, 30.0)*0.05) * uNight;
          vec3 cell = floor(d*68.0);
          float h = hash(cell);
          vec3 f = fract(d*68.0) - 0.5;
          float star = smoothstep(0.996, 1.0, h) * smoothstep(0.34, 0.06, length(f));
          col += vec3(0.9,0.93,1.0) * star * uNight * smoothstep(0.02, 0.25, d.y) * (0.5+0.5*sin(h*90.0));
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  scene.add(sky);

  // 云
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x8a8f9a, emissiveIntensity: 0.14, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const n = 3 + (Math.random() * 3 | 0);
    for (let j = 0; j < n; j++) {
      const s = rand(2.2, 4.6);
      const m = mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat, j * s * 0.9 - n * 1.2, rand(-0.4, 0.5), rand(-1, 1), false, false);
      m.scale.y = 0.55; g.add(m);
    }
    const a = rand(0, Math.PI * 2), r = rand(55, 130);
    g.position.set(Math.cos(a) * r, rand(46, 72), Math.sin(a) * r);
    g.userData.spd = rand(0.35, 0.8);
    scene.add(g); clouds.push(g);
  }

  // =========================================================================
  // 地形网格(顶点着色)
  // =========================================================================
  (function buildTerrain() {
    const SIZE = 112, SEG = 148;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const P = T.P;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundH(x, z);
      pos.setY(i, h);
      const hx = groundH(x + 0.9, z) - h, hz = groundH(x, z + 0.9) - h;
      const slope = Math.sqrt(hx * hx + hz * hz) / 0.9;
      const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const noise = (n - Math.floor(n)) * 0.06;
      if (h < 0.7) col.setHex(0xd9c49a);                                   // 沙
      else if (slope > 0.85) col.setHex(0x93866f);                          // 崖壁
      else if (slope > 0.5) col.setHex(0x9a9078);
      else {
        col.setHex(h > 6.2 ? 0x6d9c58 : (h > 3.2 ? 0x79a862 : 0x86b06c));   // 草坪分层
      }
      // 广场铺装 / 环港石砌
      const dPlaza = Math.sqrt((x - 6) * (x - 6) + (z + 1) * (z + 1));
      if (dPlaza < 7.6 && h > 2.9) col.setHex(0xc9b795);
      const sH = T.sHarbor(x, z);
      if (sH > 0.95 && sH < 2.5 && h > 1.2 && h < 2.4) col.setHex(0xbfae90);
      if (Math.abs(x + 6) < 1.4 && z > -14.4 && z < -12.4 && h > 4.5) col.setHex(0x6d9c58); // 山道
      if (Math.abs(x - 4.6) < 1.3 && z > 2.8 && z < 6.6 && h > 1.4) col.setHex(0xbfae90);   // 石阶
      col.offsetHSL(0, 0, noise - 0.03);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    terrain.receiveShadow = true; terrain.castShadow = true;
    scene.add(terrain);
  })();

  // =========================================================================
  // 海面(波浪顶点位移 + 岸线泡沫 + 菲涅尔 + 日光耀斑)
  // =========================================================================
  const WATER_EXT = 55, HTEX_N = 176;
  const heightTex = (function () {
    const data = new Uint8Array(HTEX_N * HTEX_N * 4);
    for (let j = 0; j < HTEX_N; j++) for (let i = 0; i < HTEX_N; i++) {
      const x = -WATER_EXT + (i / (HTEX_N - 1)) * WATER_EXT * 2;
      const z = -WATER_EXT + (j / (HTEX_N - 1)) * WATER_EXT * 2;
      const h = clamp((groundH(x, z) + 6) / 18, 0, 1);
      const k = (j * HTEX_N + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = h * 255; data[k + 3] = 255;
    }
    const t = new THREE.DataTexture(data, HTEX_N, HTEX_N, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();

  const waterU = {
    uTime: { value: 0 },
    uSunDir: { value: V3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(0xfff1dc) },
    uSky: { value: new THREE.Color(0xb4dbeb) },
    uDeep: { value: new THREE.Color(0x186686) },
    uShal: { value: new THREE.Color(0x58c0c1) },
    uFog: { value: new THREE.Color(0xcfe2ea) },
    uMap: { value: heightTex },
    uExt: { value: WATER_EXT }
  };
  const water = new THREE.Mesh(
    (function () { const g = new THREE.PlaneGeometry(460, 460, 140, 140); g.rotateX(-Math.PI / 2); return g; })(),
    new THREE.ShaderMaterial({
      uniforms: waterU, fog: false,
      vertexShader: `
        uniform float uTime; varying vec3 vP; varying float vW;
        void main(){
          vec3 p = position;
          float w = sin(p.x*0.30 + uTime*0.85)*0.5 + sin(p.z*0.21 - uTime*0.62)*0.5;
          w += sin((p.x+p.z)*0.52 + uTime*1.5)*0.28;
          p.y += w*0.16;
          vW = w;
          vec4 wp = modelMatrix * vec4(p,1.0);
          vP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSunDir,uSunCol,uSky,uDeep,uShal,uFog; uniform sampler2D uMap; uniform float uExt;
        varying vec3 vP; varying float vW;
        void main(){
          vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
          if(n.y < 0.0) n = -n;
          n.x += (sin(vP.x*2.0+uTime*1.8)+sin(vP.z*1.6-uTime*1.4))*0.045;
          n.z += (sin(vP.z*2.3-uTime*1.5)+sin(vP.x*1.4+uTime*1.1))*0.045;
          n = normalize(n);
          vec2 uv = (vP.xz + uExt) / (2.0*uExt);
          float hW = mix(-6.0, 12.0, texture2D(uMap, clamp(uv,0.0,1.0)).r);
          float depth = max(0.0, -hW);
          vec3 col = mix(uShal, uDeep, clamp(depth*0.30, 0.0, 1.0));
          float band = 1.0 - smoothstep(0.0, 1.15, depth);
          float ripple = 0.5 + 0.5*sin(depth*8.5 - uTime*2.1 + sin(vP.x*0.75+vP.z*0.6)*2.2);
          float foam = band * smoothstep(0.42, 0.95, ripple);
          foam += smoothstep(0.62, 0.95, vW) * 0.13 * step(1.1, depth);
          col = mix(col, vec3(0.96,0.97,0.95), clamp(foam,0.0,1.0)*0.85);
          vec3 V = normalize(cameraPosition - vP);
          float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          col = mix(col, uSky, fr*0.5);
          vec3 R = reflect(-uSunDir, n);
          col += uSunCol * pow(max(dot(R, V), 0.0), 120.0) * 1.1;
          float dist = length(vP.xz - cameraPosition.xz);
          col = mix(col, uFog, smoothstep(70.0, 240.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  scene.add(water);

  // =========================================================================
  // 全局注册表(昼夜更新用)
  // =========================================================================
  const REG = {
    windowMats: [],   // {mat, jit}
    lampLights: [],   // {light, sprite, jit}
    clockHands: null, // {hour, minute}
    beam: null,       // 灯塔扫光组
    lampRoom: null,   // 灯室发光
    fireflies: null,
    glowTex: makeGlowTex()
  };
  function makeGlowTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,220,150,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  // ---------- 窗户 ----------
  const winGeo = new THREE.BoxGeometry(0.4, 0.55, 0.06);
  function windowAt(g, x, y, z, ry, big) {
    const jit = (Math.random() * 10 | 0) / 10;
    const mat = new THREE.MeshStandardMaterial({ color: C.glassDark, roughness: 0.4, metalness: 0.1, emissive: 0xffb45e, emissiveIntensity: 0 });
    REG.windowMats.push({ mat, jit: jit * 0.55 });
    const m = mesh(big ? new THREE.BoxGeometry(0.52, 0.68, 0.06) : winGeo, mat, x, y, z);
    m.rotation.y = ry || 0; m.castShadow = false;
    g.add(m);
    return m;
  }
  function doorAt(g, x, y, z, ry, w, h, c) {
    const m = mesh(new THREE.BoxGeometry(w || 0.62, h || 1.05, 0.08), M(c || C.woodDark), x, y, z);
    m.rotation.y = ry || 0; g.add(m);
    const step = mesh(new THREE.BoxGeometry((w || 0.62) + 0.3, 0.1, 0.5), M(C.stone), x, y - (h || 1.05) / 2 - 0.03, z);
    step.rotation.y = ry || 0; step.castShadow = false; g.add(step);
    return m;
  }

  // =========================================================================
  // 建筑
  // =========================================================================
  const town = new THREE.Group(); scene.add(town);
  function plinth(g, w, d, h) { box(g, w + 0.5, 0.5, d + 0.5, C.stoneDark, 0, -0.22, 0); }

  // --- 钟塔 ---
  const clockHands = { hour: [], minute: [] };
  (function clockTower() {
    const g = new THREE.Group(); g.position.set(7, groundH(7, 0), 0);
    plinth(g, 3.1, 3.1);
    box(g, 3.4, 0.42, 3.4, C.stone, 0, 0.2, 0);
    box(g, 2.05, 4.6, 2.05, C.plasterC, 0, 2.7, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(g, 0.36, 4.6, 0.36, C.stone, sx * 1.02, 2.7, sz * 1.02));
    box(g, 2.5, 1.5, 2.5, C.plasterA, 0, 5.78, 0);
    // 四面钟
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Group();
      const dirs = [[0, 1.28, 0], [Math.PI, -1.28, 0], [Math.PI / 2, 0, -1.28], [-Math.PI / 2, 0, 1.28]];
      face.position.set(dirs[i][1], 5.78, dirs[i][2]); face.rotation.y = dirs[i][0];
      const disc = mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.1, 24), M(0xf7f2e6), 0, 0, 0);
      disc.rotation.x = Math.PI / 2; disc.castShadow = false; face.add(disc);
      const rim = mesh(new THREE.TorusGeometry(0.92, 0.055, 8, 28), M(0x3a3128), 0, 0, 0.04); rim.castShadow = false; face.add(rim);
      for (let k = 0; k < 12; k++) {
        const tick = mesh(new THREE.BoxGeometry(0.045, 0.14, 0.03), M(0x3a3128), Math.sin(k / 12 * Math.PI * 2) * 0.74, Math.cos(k / 12 * Math.PI * 2) * 0.74, 0.09);
        tick.rotation.z = -k / 12 * Math.PI * 2; tick.castShadow = false; face.add(tick);
      }
      const mkHand = (len, w) => {
        const hg = new THREE.Group();
        const hm = mesh(new THREE.BoxGeometry(w, len, 0.035), M(0x2b241c), 0, len / 2 - 0.06, 0.11);
        hm.castShadow = false; hg.add(hm); face.add(hg); return hg;
      };
      clockHands.hour.push(mkHand(0.46, 0.07));
      clockHands.minute.push(mkHand(0.68, 0.05));
      town.add(face); g.add(face);
    }
    box(g, 2.72, 0.24, 2.72, C.stone, 0, 6.62, 0);
    // 钟室
    box(g, 1.85, 0.16, 1.85, C.stone, 0, 6.86, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(g, 0.22, 0.95, 0.22, C.stone, sx * 0.78, 7.4, sz * 0.78));
    const bell = mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.34, 10), M(0xc9a24a), 0, 7.42, 0); g.add(bell);
    pyrRoof(g, 2.1, 2.1, 1.5, C.tealRoof, 0, 7.9, 0);
    cyl(g, 0.03, 0.03, 0.6, 0x3a3128, 0, 9.4, 0, 6);
    sph(g, 0.09, C.gold, 0, 9.75, 0, 10);
    town.add(g);
  })();

  // --- 市政厅(穹顶 + 旗帜) ---
  let hallFlag = null;
  (function townHall() {
    const g = new THREE.Group(); const y = groundH(11.8, -3.8); g.position.set(11.8, y, -3.8);
    plinth(g, 5.4, 4.2);
    box(g, 5.4, 2.9, 4.2, C.plasterA, 0, 1.7, 0);
    box(g, 5.7, 0.26, 4.5, C.stone, 0, 3.24, 0);
    const roof = mesh(new THREE.ConeGeometry(0.72, 1.5, 4), M(C.terra), 0, 4.05, 0);
    roof.rotation.y = Math.PI / 4; roof.scale.set(5.4 / 0.72 / 2 * 0.72, 1, 4.2 / 0.72 / 2 * 0.72); g.add(roof);
    cyl(g, 1.12, 1.12, 0.95, C.plasterC, -0.6, 3.85, 0.6, 16);
    const dome = mesh(new THREE.SphereGeometry(1.12, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5e8f86), -0.6, 4.32, 0.6); g.add(dome);
    cyl(g, 0.05, 0.05, 0.8, 0x8d8170, -0.6, 5.85, 0.6, 6);
    sph(g, 0.09, C.gold, -0.6, 6.3, 0.6, 8);
    // 旗帜(顶点波动)
    const flagGeo = new THREE.PlaneGeometry(1.15, 0.62, 8, 4);
    flagGeo.translate(0.575, 0, 0);
    hallFlag = mesh(flagGeo, M(C.coral, { side: THREE.DoubleSide }), -0.6, 6.05, 0.6, true, false);
    town.add(hallFlag);
    // 门廊
    for (let i = 0; i < 3; i++) box(g, 2.3 - i * 0.3, 0.16, 0.7, C.stone, 0, 0.1 + i * 0.17, 2.3 + i * 0.32);
    doorAt(g, 0, 1.0, 2.13, 0, 0.9, 1.6, C.woodDark);
    box(g, 0.18, 1.7, 0.18, C.plasterC, -0.75, 1.15, 2.2); box(g, 0.18, 1.7, 0.18, C.plasterC, 0.75, 1.15, 2.2);
    box(g, 1.9, 0.2, 0.5, C.stone, 0, 2.1, 2.2);
    // 窗
    windowAt(g, -1.9, 1.9, 2.13, 0, true); windowAt(g, 1.9, 1.9, 2.13, 0, true);
    windowAt(g, -2.73, 1.9, -0.6, Math.PI / 2); windowAt(g, -2.73, 1.9, 0.9, Math.PI / 2);
    windowAt(g, 2.73, 1.9, -0.6, -Math.PI / 2); windowAt(g, 2.73, 1.9, 0.9, -Math.PI / 2);
    windowAt(g, -1.2, 1.9, -2.13, Math.PI); windowAt(g, 1.4, 1.9, -2.13, Math.PI);
    town.add(g);
  })();

  // --- 咖啡馆(雨棚 + 露台 + 烟囱) ---
  let smokeA = null;
  (function cafe() {
    const g = new THREE.Group(); const y = groundH(2.2, -1.8); g.position.set(2.2, y, -1.8);
    plinth(g, 3.6, 3.0);
    box(g, 3.6, 2.5, 3.0, C.plasterB, 0, 1.45, 0);
    box(g, 3.8, 0.2, 3.2, C.terraDeep, 0, 2.78, 0);
    awning(g, 3.3, 1.1, 6, C.coral, C.cream, 0, 2.42, 1.28, 0, 0.38);
    doorAt(g, -0.9, 0.92, 1.53, 0, 0.66, 1.15);
    windowAt(g, 0.45, 1.5, 1.53, 0, true); windowAt(g, 1.45, 1.5, 1.53, 0, true);
    windowAt(g, 1.83, 1.5, -0.4, -Math.PI / 2);
    box(g, 0.5, 0.9, 0.5, C.terraDeep, 1.2, 3.2, -0.7); // 烟囱
    box(g, 1.15, 0.3, 0.08, C.woodDark, 0.3, 2.28, 1.62); // 招牌板
    // 露台
    const terr = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 20), M(0xc9b795), 0.4, -0.02, 2.6); terr.castShadow = false; g.add(terr);
    [[-0.5, 3.1], [1.6, 3.6]].forEach(([tx, tz], i) => {
      cyl(g, 0.34, 0.34, 0.06, C.cream, tx, 0.62, tz, 10);
      cyl(g, 0.05, 0.05, 0.6, C.woodDark, tx, 0.32, tz, 6);
      const um = cone(g, 0.85, 0.42, i ? C.teal : C.coral, tx, 1.55, tz, 8);
      um.rotation.y = rand(0, 1);
      cyl(g, 0.03, 0.03, 1.1, C.woodDark, tx, 1.05, tz, 5);
      sph(g, 0.3, M(C.cream), tx + 0.55, 0.42, tz, 8); sph(g, 0.3, M(C.cream), tx - 0.55, 0.42, tz, 8);
    });
    town.add(g);
  })();

  // --- 市场(条纹棚 + 摊位) ---
  (function market() {
    const g = new THREE.Group(); const y = groundH(12.5, 9.5); g.position.set(12.5, y, 9.5);
    plinth(g, 4.4, 3.0);
    box(g, 4.4, 0.22, 3.0, C.stone, 0, 0.14, 0);
    [[-1.9, -1.2], [1.9, -1.2], [-1.9, 1.2], [1.9, 1.2], [0, 1.45]].forEach(([px, pz]) => cyl(g, 0.07, 0.07, 2.15, C.wood, px, 1.3, pz, 7));
    const roof = awning(g, 4.7, 3.3, 9, C.coral, C.cream, 0, 2.5, -0.1, 0, 0.14);
    box(g, 1.7, 0.75, 0.7, C.wood, -0.8, 0.62, 0.5);
    box(g, 1.7, 0.75, 0.7, C.wood, 1.0, 0.62, -0.5);
    // 鱼获与果蔬
    const fishC = [0x9fb7c4, 0x7d98a8, 0xb5c8d0];
    for (let i = 0; i < 5; i++) sph(g, 0.11, fishC[i % 3], -1.35 + i * 0.28, 1.06, 0.42, 8);
    for (let i = 0; i < 7; i++) sph(g, 0.09, [0xd96a4b, 0xe8b25c, 0x9fae5a][i % 3], 0.55 + (i % 4) * 0.22, 1.05, -0.42 + (i > 3 ? 0.22 : 0), 8);
    box(g, 0.62, 0.7, 0.1, C.woodDark, 0, 1.75, 1.52);
    windowAt(g, -1.9, 1.45, -1.28, Math.PI); windowAt(g, 1.9, 1.45, -1.28, Math.PI);
    town.add(g);
  })();

  // --- 船坞(滑道入水) ---
  (function boathouse() {
    const x = -13.0, z = 11.6, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = 0.5;
    plinth(g, 3.2, 2.8);
    box(g, 3.2, 2.1, 2.8, C.wood, 0, 1.25, 0);
    gableRoof(g, 3.2, 2.8, 0.85, C.woodDark, 0, 2.3, 0);
    doorAt(g, 1.63, 0.95, 0, Math.PI / 2, 1.3, 1.6, 0x6a4a2e);
    windowAt(g, -1.63, 1.5, 0.4, -Math.PI / 2);
    // 滑道
    const slip = mesh(new THREE.BoxGeometry(0.16, 3.4, 1.5), M(C.stoneDark), 2.9, -0.55, 0);
    slip.rotation.z = -0.34; slip.castShadow = false; slip.receiveShadow = true; g.add(slip);
    town.add(g);
  })();

  // --- 联排住宅 ×3 ---
  function townhouse(x, z, w, d, h, bodyC, roofC, ry) {
    const g = new THREE.Group(); const y = groundH(x, z); g.position.set(x, y, z); g.rotation.y = ry;
    plinth(g, w, d);
    box(g, w, h, d, bodyC, 0, h / 2 + 0.2, 0);
    gableRoof(g, w, d, h * 0.42, roofC, 0, h + 0.2, 0);
    doorAt(g, 0, 0.85, d / 2 + 0.04, 0, 0.6, 1.05);
    windowAt(g, -w * 0.28, h * 0.62, d / 2 + 0.04, 0);
    windowAt(g, w * 0.28, h * 0.62, d / 2 + 0.04, 0);
    windowAt(g, -w * 0.28, h * 0.28, d / 2 + 0.04, 0);
    windowAt(g, w * 0.28, h * 0.28, d / 2 + 0.04, 0);
    windowAt(g, w / 2 + 0.04, h * 0.5, 0, Math.PI / 2);
    box(g, 0.4, 0.8, 0.4, roofC, w * 0.3, h + h * 0.42 + 0.2, -d * 0.2);
    // 窗台花箱
    [[-w * 0.28, h * 0.42], [w * 0.28, h * 0.42]].forEach(([fx, fy]) => {
      box(g, 0.5, 0.1, 0.14, C.wood, fx, fy, d / 2 + 0.12);
      for (let i = 0; i < 3; i++) sph(g, 0.05, [0xd96a4b, 0xe8b25c, 0xd477a0][i], fx - 0.14 + i * 0.14, fy + 0.1, d / 2 + 0.12, 6);
    });
    town.add(g);
  }
  townhouse(8.8, -5.2, 2.5, 2.3, 3.0, C.plasterA, C.terra, 0.22);
  townhouse(11.2, -6.3, 2.3, 2.2, 3.55, C.plasterC, C.tealRoof, 0.22);
  townhouse(13.3, -4.9, 2.7, 2.4, 2.75, C.plasterB, C.terraDeep, 0.22);

  // --- 山丘别墅(环廊) ---
  (function villa() {
    const x = -6, z = -10.5, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = 0.35;
    plinth(g, 3.4, 3.0);
    box(g, 3.4, 2.5, 3.0, C.plasterC, 0, 1.45, 0);
    pyrRoof(g, 3.9, 3.5, 1.3, C.terra, 0, 2.7, 0);
    box(g, 0.45, 1.0, 0.45, C.terra, 1.1, 3.9, -0.6);
    doorAt(g, 0.2, 0.95, 1.53, 0, 0.7, 1.2);
    windowAt(g, -1.0, 1.6, 1.53, 0); windowAt(g, 1.73, 1.6, 0.4, -Math.PI / 2); windowAt(g, 1.73, 1.6, -0.7, -Math.PI / 2);
    // 环廊(南/西)
    const vp = new THREE.Group(); g.add(vp);
    box(vp, 1.3, 0.12, 3.6, C.stone, -2.3, 0.28, 0);
    [[-2.85, -1.5], [-2.85, 0], [-2.85, 1.5], [-1.75, 1.62]].forEach(([px, pz]) => cyl(vp, 0.06, 0.06, 1.9, C.plasterC, px, 1.25, pz, 7));
    box(vp, 1.5, 0.14, 3.9, C.terra, -2.35, 2.28, 0);
    box(vp, 1.2, 0.07, 3.2, C.stone, -2.32, 0.85, 0); // 栏杆
    town.add(g);
  })();

  // --- 风车(R10 机械动态) ---
  const windmillSails = { sails: null, fantail: null };
  (function windmill() {
    const x = -13, z = -12, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = 0.4;
    plinth(g, 3.0, 3.0);
    cyl(g, 1.22, 1.68, 4.3, C.stone, 0, 2.35, 0, 16);
    const cap = mesh(new THREE.SphereGeometry(1.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(C.woodDark), 0, 4.5, 0); g.add(cap);
    doorAt(g, 0, 0.85, 1.5, 0, 0.68, 1.3);
    windowAt(g, 0.9, 2.9, 1.06, 0); windowAt(g, -0.9, 2.9, 1.06, 0);
    // 叶片(绕 +z 水平轴旋转)
    const sails = new THREE.Group(); sails.position.set(0, 5.1, 1.45);
    cyl(sails, 0.16, 0.2, 0.34, C.woodDark, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      const beam = mesh(new THREE.BoxGeometry(0.09, 2.35, 0.06), M(C.wood), 0, 1.25, 0); arm.add(beam);
      const cloth = mesh(new THREE.BoxGeometry(0.5, 1.55, 0.04), M(C.cream, { side: THREE.DoubleSide }), 0.26, 1.55, 0.05); arm.add(cloth);
      const lattice = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.05), M(C.wood), 0, 2.35, 0.05); arm.add(lattice);
      sails.add(arm);
    }
    sails.rotation.x = -0.12;
    g.add(sails); windmillSails.sails = sails;
    // 尾舵小风轮
    const ft = new THREE.Group(); ft.position.set(0, 4.9, -1.5);
    for (let i = 0; i < 8; i++) {
      const bl = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), M(C.cream), 0, 0.32, 0);
      const hub = new THREE.Group(); hub.rotation.z = i / 8 * Math.PI * 2; hub.add(bl); ft.add(hub);
    }
    ft.children.forEach(h => { h.rotation.x = Math.PI / 2; });
    ft.rotation.x = 0; ft.position.y = 4.85;
    const ftpole = cyl(g, 0.05, 0.05, 0.8, C.woodDark, 0, 4.6, -1.5, 6);
    g.add(ft); windmillSails.fantail = ft;
    town.add(g);
  })();

  // --- 缆车站 ×2 ---
  function station(x, z, ry) {
    const g = new THREE.Group(); const y = groundH(x, z); g.position.set(x, y, z); g.rotation.y = ry;
    plinth(g, 2.1, 1.7);
    box(g, 2.1, 1.55, 1.7, C.plasterA, 0, 0.95, 0);
    const roof = mesh(new THREE.BoxGeometry(2.4, 0.09, 2.0), M(C.tealRoof), 0, 1.85, -0.05);
    roof.rotation.x = 0.16; g.add(roof);
    doorAt(g, 0.35, 0.75, 0.88, 0, 0.56, 1.0);
    windowAt(g, -0.5, 1.0, 0.88, 0);
    box(g, 0.5, 0.36, 0.06, C.tealRoof, -0.6, 1.45, 0.88);
    return g;
  }
  town.add(station(-13.2, -4.4, 2.6));   // 上站
  town.add(station(-11.3, 9.8, 0.9));    // 下站(码头)

  // --- 公园凉亭 ---
  (function gazebo() {
    const x = -1.5, z = -13, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    cyl(g, 1.55, 1.65, 0.3, C.stone, 0, 0.12, 0, 6);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      cyl(g, 0.07, 0.07, 1.8, C.wood, Math.cos(a) * 1.25, 1.2, Math.sin(a) * 1.25, 7);
    }
    cone(g, 1.95, 1.15, C.tealRoof, 0, 2.65, 0, 6);
    sph(g, 0.12, C.gold, 0, 3.3, 0, 8);
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffc06a, emissiveIntensity: 0 });
    REG.windowMats.push({ mat: lanternMat, jit: 0.1 });
    sph(g, 0.11, lanternMat, 0, 2.1, 0, 8);
    box(g, 1.1, 0.09, 0.35, C.wood, 0, 0.55, 0.75); // 座椅
    town.add(g);
  })();

  // =========================================================================
  // 基础设施:石阶 / 桥 / 栈桥 / 电车道 / 缆车道 / 广场
  // =========================================================================
  // --- 石阶(广场→码头) ---
  (function stairs() {
    const g = new THREE.Group(); town.add(g);
    const x = 4.6, z0 = 3.35, z1 = 6.3, n = 11;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const z = lerp(z0, z1, u), h = lerp(3.42, 1.72, u);
      box(g, 1.8, 0.16, 0.30, C.stone, x, h - 0.02, z);
    }
    box(g, 0.28, 0.5, 3.2, C.stoneDark, x - 1.0, 2.4, (z0 + z1) / 2);
    box(g, 0.28, 0.5, 3.2, C.stoneDark, x + 1.0, 2.4, (z0 + z1) / 2);
  })();

  // --- 栈桥(东岬→灯塔岛) ---
  (function bridge() {
    const g = new THREE.Group(); town.add(g);
    const A = V3(10.6, groundH(10.6, 19.2), 19.2), Bp = V3(13.8, groundH(13.8, 22.6), 22.6);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = A.clone().lerp(Bp, u);
      const arch = Math.sin(u * Math.PI) * 0.38;
      p.y += arch;
      const seg = mesh(new THREE.BoxGeometry(1.5, 0.14, 0.78), C.stone ? M(0xa79880) : null, p.x, p.y, p.z);
      seg.rotation.y = Math.atan2(Bp.x - A.x, Bp.z - A.z);
      g.add(seg);
      if (i % 2 === 0) {
        const rail = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), M(C.stoneDark), p.x, p.y + 0.3, p.z - 0.34);
        rail.rotation.y = seg.rotation.y; g.add(rail);
        const rail2 = rail.clone(); rail2.position.z = p.z + 0.34; g.add(rail2);
      }
    }
    const mid = A.clone().lerp(Bp, 0.5);
    cyl(g, 0.3, 0.42, 3.4, C.stoneDark, mid.x, -0.6, mid.z, 8);
  })();

  // --- 栈桥码头(渔夫) ---
  (function pier() {
    const g = new THREE.Group(); town.add(g);
    const x = -5.2;
    for (let i = 0; i < 11; i++) {
      const z = 6.1 + i * 0.42;
      const y = groundH(x, z) < 0 ? 1.78 : groundH(x, z) + 0.14;
      const plank = box(g, 1.5, 0.09, 0.4, C.wood, x, Math.max(y, 1.78), z);
      plank.rotation.y = Math.sin(i * 2.7) * 0.03;
      if (i % 3 === 0) { cyl(g, 0.09, 0.11, 2.4, C.woodDark, x - 0.6, 0.7, z, 7); cyl(g, 0.09, 0.11, 2.4, C.woodDark, x + 0.6, 0.7, z, 7); }
    }
  })();

  // --- 电车轨道(折返线) ---
  const TRAM_PTS = [
    [10.5, 18.4], [10.8, 17.8], [11.15, 16.4], [11.2, 15], [11.3, 14], [11.3, 11],
    [10.6, 8.6], [9, 7.2], [6, 6.4], [4.6, 5.9], [0, 5.7], [-4.6, 5.9], [-6, 6.4],
    [-9, 7.2], [-10.6, 8.6], [-11.3, 11], [-11.3, 14], [-11.2, 15], [-11.15, 16.4],
    [-10.8, 17.8], [-10.5, 18.4]
  ];
  const tramCurve = new THREE.CatmullRomCurve3(TRAM_PTS.map(p => V3(p[0], 0, p[1])), false, 'catmullrom', 0.35);
  const TRAM_LEN = tramCurve.getLength();
  (function tramTrack() {
    const g = new THREE.Group(); town.add(g);
    const N = 220;
    const railGeo = [], tieMats = [];
    const dummy = new THREE.Object3D();
    const tieCount = Math.floor(TRAM_LEN / 0.92);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.16, 0.05, 0.26), M(0x5c4a34), tieCount);
    let tieI = 0;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const p0 = tramCurve.getPointAt(u0), p1 = tramCurve.getPointAt(u1);
      const t = tramCurve.getTangentAt(u0);
      const y0 = groundH(p0.x, p0.z), y1 = groundH(p1.x, p1.z);
      // 道砟带
      const mid = p0.clone().lerp(p1, 0.5);
      const bed = mesh(new THREE.BoxGeometry(1.5, 0.07, p0.distanceTo(p1) + 0.06), M(0x6e675c), mid.x, (y0 + y1) / 2 + 0.05, mid.z);
      bed.rotation.y = Math.atan2(t.x, t.z); bed.castShadow = false; bed.receiveShadow = true;
      g.add(bed);
      // 钢轨
      for (const off of [-0.44, 0.44]) {
        const px = -t.z * off, pz = t.x * off;
        const r = mesh(new THREE.BoxGeometry(0.09, 0.09, p0.distanceTo(p1) + 0.04), M(0x4d4a46, { metalness: 0.5, roughness: 0.5 }),
          p0.x + px, y0 + 0.13, p0.z + pz);
        r.rotation.y = Math.atan2(t.x, t.z); r.castShadow = false; g.add(r);
      }
      // 轨枕
      if (tieI < tieCount && (i % 4 === 0)) {
        dummy.position.set(p0.x, y0 + 0.09, p0.z);
        dummy.rotation.set(0, Math.atan2(t.x, t.z), 0);
        dummy.updateMatrix();
        ties.setMatrixAt(tieI++, dummy.matrix);
      }
    }
    ties.instanceMatrix.needsUpdate = true; ties.castShadow = false; ties.receiveShadow = true;
    g.add(ties);
  })();
  // 电车站 ×3
  const TRAM_STOPS_U = [];
  function tramStop(x, z, side) {
    // 找 u
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 400; i++) {
      const p = tramCurve.getPointAt(i / 400);
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bd) { bd = d; best = i / 400; }
    }
    TRAM_STOPS_U.push(best);
    const p = tramCurve.getPointAt(best), t = tramCurve.getTangentAt(best);
    const g = new THREE.Group(); town.add(g);
    const y = groundH(p.x, p.z);
    const ang = Math.atan2(t.x, t.z);
    const ox = -t.z * side, oz = t.x * side;
    const plat = mesh(new THREE.BoxGeometry(1.9, 0.22, 0.85), M(0xa79880), p.x + ox * 0.75, y + 0.13, p.z + oz * 0.75);
    plat.rotation.y = ang; g.add(plat);
    const pole = cyl(g, 0.04, 0.04, 1.9, 0x3a3f46, p.x + ox * 1.25, y + 0.95, p.z + oz * 1.25, 6);
    const sign = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), M(C.mustard), p.x + ox * 1.25, y + 1.75, p.z + oz * 1.25);
    sign.rotation.y = ang; g.add(sign);
    // 小雨棚
    const roofp = mesh(new THREE.BoxGeometry(1.5, 0.06, 0.7), M(C.tealRoof), p.x + ox * 0.85, y + 1.35, p.z + oz * 0.85);
    roofp.rotation.y = ang; g.add(roofp);
    for (const o of [-0.6, 0.6]) {
      const post = cyl(g, 0.03, 0.03, 1.3, 0x3a3f46, p.x + ox * 0.85 - t.z * 0 * o + t.x * 0, y + 0.7, p.z + oz * 0.85, 5);
      post.position.x += t.x * o; post.position.z += -t.z * o;
    }
  }
  tramStop(10.5, 18.4, 1); tramStop(4.6, 5.9, 1); tramStop(-10.5, 18.4, 1);

  // --- 缆车轨道 ---
  const FUNI_A = { x: -11.3, z: 9.8 }, FUNI_B = { x: -13.2, z: -4.4 };
  const FUNI = { hA: groundH(FUNI_A.x, FUNI_A.z), hB: groundH(FUNI_B.x, FUNI_B.z) };
  FUNI.len = Math.sqrt((FUNI_B.x - FUNI_A.x) ** 2 + (FUNI_B.z - FUNI_A.z) ** 2 + (FUNI.hB - FUNI.hA) ** 2);
  FUNI.yaw = Math.atan2(FUNI_B.x - FUNI_A.x, FUNI_B.z - FUNI_A.z);
  FUNI.pitch = Math.atan2(FUNI.hB - FUNI.hA, Math.sqrt((FUNI_B.x - FUNI_A.x) ** 2 + (FUNI_B.z - FUNI_A.z) ** 2));
  (function funiTrack() {
    const g = new THREE.Group(); town.add(g);
    const mid = V3((FUNI_A.x + FUNI_B.x) / 2, (FUNI.hA + FUNI.hB) / 2, (FUNI_A.z + FUNI_B.z) / 2);
    const yaw = FUNI.yaw;
    for (const off of [-0.42, 0.42]) {
      const rail = mesh(new THREE.BoxGeometry(0.09, 0.09, FUNI.len + 0.6), M(0x4d4a46, { metalness: 0.5, roughness: 0.5 }), mid.x, mid.y + 0.14, mid.z);
      rail.rotation.order = 'YXZ'; rail.rotation.y = yaw; rail.rotation.x = -FUNI.pitch;
      const dir = V3(Math.sin(yaw), 0, Math.cos(yaw));
      rail.position.addScaledVector(V3(dir.z, 0, -dir.x), off);
      rail.position.y += Math.sin(FUNI.pitch) * 0; g.add(rail);
    }
    const cable = mesh(new THREE.CylinderGeometry(0.022, 0.022, FUNI.len + 0.6, 5), M(0x2e2b28), 0, 0.52, 0);
    cable.rotation.x = Math.PI / 2 - FUNI.pitch; cable.castShadow = false;
    const cableWrap = new THREE.Group(); cableWrap.position.set(mid.x, mid.y, mid.z); cableWrap.rotation.y = yaw;
    cableWrap.add(cable); g.add(cableWrap);
    // 轨枕
    const n = Math.floor(FUNI.len / 0.85);
    const dummy = new THREE.Object3D();
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.05, 0.26), M(0x5c4a34), n);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = lerp(FUNI_A.x, FUNI_B.x, u), z = lerp(FUNI_A.z, FUNI_B.z, u);
      const y = lerp(FUNI.hA, FUNI.hB, u);
      dummy.position.set(x, y + 0.09, z); dummy.rotation.set(0, yaw, -FUNI.pitch * 0); dummy.updateMatrix();
      ties.setMatrixAt(i, dummy.matrix);
    }
    ties.instanceMatrix.needsUpdate = true; ties.castShadow = false; g.add(ties);
    // 支架
    for (const u of [0.28, 0.55, 0.8]) {
      const x = lerp(FUNI_A.x, FUNI_B.x, u), z = lerp(FUNI_A.z, FUNI_B.z, u), y = groundH(x, z);
      const hHere = lerp(FUNI.hA, FUNI.hB, u);
      cyl(g, 0.07, 0.09, hHere - y + 0.2, C.stoneDark, x, (hHere + y) / 2, z, 7);
    }
    // 端部滑轮(R10 补充细节,随缆车转动)
    FUNI.pulleys = [];
    for (const [px, pz, py] of [[FUNI_A.x, FUNI_A.z, FUNI.hA], [FUNI_B.x, FUNI_B.z, FUNI.hB]]) {
      const pw = mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 18), M(0x3a3f46, { metalness: 0.4 }), px, py + 0.5, pz);
      pw.rotation.y = yaw; pw.castShadow = false; g.add(pw); FUNI.pulleys.push(pw);
    }
  })();

  // --- 广场铺装 + 喷泉 ---
  const fountain = { jet: null, drops: [] };
  (function plaza() {
    const g = new THREE.Group(); town.add(g);
    const pad = mesh(new THREE.CylinderGeometry(5.4, 5.55, 0.14, 36), M(0xc9b795), 6, groundH(6, -1) + 0.02, -1);
    pad.receiveShadow = true; g.add(pad);
    const ring = mesh(new THREE.TorusGeometry(2.6, 0.06, 6, 40), M(0xa79880), 6, groundH(6, -1) + 0.1, -1);
    ring.rotation.x = Math.PI / 2; ring.castShadow = false; g.add(ring);
    // 喷泉
    const fx = 4.2, fz = 0.8, fy = groundH(fx, fz);
    cyl(g, 1.05, 1.2, 0.55, C.stone, fx, fy + 0.28, fz, 18);
    const basinW = mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x3f8fa0, roughness: 0.25, metalness: 0.1 }), fx, fy + 0.52, fz);
    basinW.castShadow = false; g.add(basinW);
    cyl(g, 0.09, 0.12, 0.7, C.stone, fx, fy + 0.85, fz, 8);
    const jet = mesh(new THREE.ConeGeometry(0.13, 0.85, 10), new THREE.MeshStandardMaterial({ color: 0xbfe6ee, transparent: true, opacity: 0.75, roughness: 0.2 }), fx, fy + 1.35, fz);
    jet.castShadow = false; g.add(jet); fountain.jet = jet; fountain.baseY = fy;
    for (let i = 0; i < 7; i++) {
      const d = mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xd6f0f5, transparent: true, opacity: 0.8 }), 0, 0, 0);
      d.castShadow = false; g.add(d); fountain.drops.push(d);
    }
  })();

  // =========================================================================
  // 植被 / 岩石 / 座椅 / 摊位 / 灯
  // =========================================================================
  function blobTree(x, z, s) {
    const g = new THREE.Group(); const y = groundH(x, z);
    g.position.set(x, y, z); g.rotation.y = rand(0, 6);
    cyl(g, 0.09 * s, 0.14 * s, 0.9 * s, C.trunk, 0, 0.45 * s, 0, 7);
    const leafC = Math.random() > 0.5 ? C.leafA : C.leafB;
    sph(g, 0.72 * s, leafC, 0, 1.25 * s, 0, 10);
    sph(g, 0.5 * s, leafC, 0.42 * s, 1.02 * s, 0.2 * s, 9);
    sph(g, 0.44 * s, leafC, -0.4 * s, 1.1 * s, -0.15 * s, 9);
    town.add(g);
  }
  function cypress(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
    cyl(g, 0.05 * s, 0.08 * s, 0.4 * s, C.trunk, 0, 0.2 * s, 0, 6);
    cone(g, 0.5 * s, 2.1 * s, C.cypress, 0, 1.35 * s, 0, 8);
    town.add(g);
  }
  function bush(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
    sph(g, 0.34 * s, Math.random() > 0.5 ? C.leafA : C.leafB, 0, 0.24 * s, 0, 9);
    sph(g, 0.24 * s, C.leafB, 0.22 * s, 0.16 * s, 0.1 * s, 8);
    town.add(g);
  }
  function rock(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, groundH(x, z), z); g.rotation.y = rand(0, 6);
    const m = mesh(new THREE.DodecahedronGeometry(0.4 * s, 0), M(0x93866f), 0, 0.18 * s, 0);
    m.scale.set(1, rand(0.5, 0.8), rand(0.8, 1.2)); g.add(m); town.add(g);
  }
  function flowerBed(x, z, r, n) {
    const y = groundH(x, z);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * r;
      const fx = x + Math.cos(a) * rr, fz = z + Math.sin(a) * rr;
      const fy = groundH(fx, fz);
      const stem = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 4), M(0x5d8a4a), fx, fy + 0.1, fz);
      stem.castShadow = false; town.add(stem);
      const fl = mesh(new THREE.SphereGeometry(0.055, 6, 5), M([0xd96a4b, 0xe8b25c, 0xd477a0, 0xe8e3d2][i % 4]), fx, fy + 0.22, fz);
      fl.castShadow = false; town.add(fl);
    }
  }
  // 布置
  blobTree(-3.2, -14.6, 1.15); blobTree(0.6, -14.9, 0.95); blobTree(-8.4, -9.2, 1.0);
  blobTree(10.8, 1.3, 0.85); blobTree(-15.7, -10.1, 1.1); blobTree(-10.1, -15.1, 1.2);
  blobTree(16.6, 9.6, 1.05); blobTree(14.6, 3.6, 0.9); blobTree(-15.1, -3.2, 0.9);
  blobTree(-14.2, 7.0, 0.95);
  // 东南坡果园(填补东侧草坪)
  blobTree(12.2, 3.4, 0.8); blobTree(13.6, 5.4, 0.85); blobTree(15.2, 6.8, 0.8); blobTree(13.0, 1.6, 0.75);
  flowerBed(13.2, 4.4, 2.2, 8);
  cypress(13.5, -1.7, 1.0); cypress(13.6, -5.9, 1.1); cypress(4.3, -3.3, 0.9);
  cypress(-4.4, -8.8, 0.95); cypress(-7.9, -8.6, 0.9); cypress(-3.5, -12.0, 0.85);
  cypress(0.5, -11.9, 0.8); cypress(-10.5, -10.4, 1.0);
  bush(9.2, 2.4, 1); bush(2.6, 2.9, 1.2); bush(12.0, -0.6, 0.9); bush(11.4, 7.9, 1);
  bush(-13.9, 8.6, 1.1); bush(9.2, 16.9, 0.9); bush(-2.9, -9.9, 1); bush(-11.9, -14.9, 1.1);
  rock(15.0, 24.2, 1.2); rock(12.6, 24.6, 0.9); rock(15.4, 21.2, 0.8);
  rock(9.4, 20.0, 0.8); rock(-9.8, 20.4, 0.9); rock(19.5, 13.5, 1.3); rock(21.0, 11.2, 0.9);
  rock(-15.3, -13.8, 1.1); rock(-9.6, -13.0, 0.8); rock(17.8, 6.0, 1.0);
  flowerBed(4.2, 0.8, 1.5, 9); flowerBed(-1.5, -13.9, 1.2, 7); flowerBed(-6, -8.9, 1.0, 6); flowerBed(11.6, -1.6, 0.9, 5);

  // 座椅
  function bench(x, z, ry) {
    const g = new THREE.Group(); const y = groundH(x, z);
    g.position.set(x, y, z); g.rotation.y = ry;
    box(g, 1.15, 0.08, 0.4, C.wood, 0, 0.42, 0);
    box(g, 1.15, 0.42, 0.07, C.wood, 0, 0.62, -0.18);
    box(g, 0.08, 0.42, 0.36, C.woodDark, -0.48, 0.21, 0);
    box(g, 0.08, 0.42, 0.36, C.woodDark, 0.48, 0.21, 0);
    town.add(g); return g;
  }
  bench(5.6, 2.7, -0.5); bench(2.6, -0.2, 1.3); bench(8.6, 1.6, 2.4); bench(-2.7, -11.4, 0.6);

  // 摊位(广场果摊)
  (function stall() {
    const g = new THREE.Group(); const y = groundH(2.4, 2.2); g.position.set(2.4, y, 2.2); g.rotation.y = -0.4;
    box(g, 1.7, 0.08, 0.85, C.wood, 0, 0.78, 0);
    [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]].forEach(([px, pz]) => cyl(g, 0.04, 0.04, 1.6, C.wood, px, 0.8, pz, 6));
    awning(g, 1.8, 0.9, 4, C.mustard, C.cream, 0, 1.62, 0.1, 0, 0.2);
    for (let i = 0; i < 8; i++) sph(g, 0.08, [0xd96a4b, 0xe8b25c, 0x9fae5a][i % 3], -0.6 + (i % 4) * 0.24, 0.9, i > 3 ? 0.18 : -0.14, 7);
    town.add(g);
  })();

  // 灯柱
  const LAMP_POS = [
    [3.0, 2.3, 1], [9.0, -0.4, 1], [1.2, 6.6, 1], [-7.6, 7.1, 1],
    [10.1, 18.6, 1], [-2.8, -11.6, 1], [11.6, 8.4, 0]
  ];
  LAMP_POS.forEach(([x, z, real], i) => {
    const g = new THREE.Group(); const y = groundH(x, z);
    g.position.set(x, y, z);
    cyl(g, 0.05, 0.07, 2.5, 0x2f343b, 0, 1.25, 0, 7);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc06a, emissiveIntensity: 0 });
    REG.windowMats.push({ mat: armMat, jit: (i % 5) * 0.12 });
    sph(g, 0.14, armMat, 0, 2.58, 0, 9);
    const cap = cone(g, 0.2, 0.14, 0x2f343b, 0, 2.76, 0, 8); cap.castShadow = false;
    town.add(g);
    if (real) {
      const pl = new THREE.PointLight(0xffbf72, 0, 10.5, 2);
      pl.position.set(x, y + 2.5, z); scene.add(pl);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: REG.glowTex, color: 0xffc680, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.set(1.9, 1.9, 1); sp.position.copy(pl.position); scene.add(sp);
      REG.lampLights.push({ light: pl, sprite: sp, jit: (i % 5) * 0.1 });
    }
  });

  // =========================================================================
  // 居民
  // =========================================================================
  const people = [];
  function limb(cMat, r, len) {
    const g = new THREE.Group();
    const m = mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 7), cMat, 0, -len / 2, 0);
    g.add(m); return g;
  }
  function makePerson(o) {
    const g = new THREE.Group();
    const skin = M(o.skin || 0xe2ac84);
    const shirt = M(o.shirt), pants = M(o.pants);
    const legL = limb(pants, 0.062, 0.36), legR = limb(pants, 0.062, 0.36);
    legL.position.set(-0.085, 0.4, 0); legR.position.set(0.085, 0.4, 0);
    const body = mesh(new THREE.CylinderGeometry(0.155, 0.12, 0.42, 9), shirt, 0, 0.62, 0);
    const armL = limb(o.armC ? M(o.armC) : shirt, 0.045, 0.32), armR = limb(o.armC ? M(o.armC) : shirt, 0.045, 0.32);
    armL.position.set(-0.2, 0.78, 0); armR.position.set(0.2, 0.78, 0);
    const head = mesh(new THREE.SphereGeometry(0.135, 10, 9), skin, 0, 0.98, 0);
    g.add(legL, legR, body, armL, armR, head);
    if (o.hat === 'brim') {
      cyl(g, 0.19, 0.19, 0.03, M(o.hatC || 0xd9c9a3), 0, 1.09, 0, 10).castShadow = false;
      cyl(g, 0.11, 0.12, 0.1, M(o.hatC || 0xd9c9a3), 0, 1.14, 0, 9).castShadow = false;
    } else if (o.hat === 'cap') {
      sph(g, 0.13, M(o.hatC || C.red), 0, 1.07, 0, 9).castShadow = false;
      box(g, 0.16, 0.02, 0.1, M(o.hatC || C.red), 0, 1.06, 0.14).castShadow = false;
    } else if (o.hat === 'hood') {
      sph(g, 0.15, shirt, 0, 1.03, -0.02, 9).castShadow = false;
    }
    const p = {
      g, legL, legR, armL, armR, head, phase: rand(0, 6),
      walk: function (speed, dt) {
        this.phase += dt * speed * 4.6;
        const s = Math.sin(this.phase);
        this.legL.rotation.x = s * 0.62; this.legR.rotation.x = -s * 0.62;
        this.armL.rotation.x = -s * 0.45; this.armR.rotation.x = s * 0.45;
        this.g.position.y = this.groundY + Math.abs(Math.cos(this.phase)) * 0.022;
      },
      idle: function (dt, t) {
        this.legL.rotation.x = this.legR.rotation.x = 0;
        this.g.position.y = this.groundY + Math.sin(t * 1.6 + this.phase) * 0.008;
      },
      groundY: 0
    };
    people.push(p);
    scene.add(g);
    return p;
  }

  // 路径行走者(闭环 / 往返)
  function walker(pts, closed, opt) {
    const p = makePerson(opt);
    const v3 = pts.map(q => V3(q[0], 0, q[1]));
    const segs = []; let len = 0;
    const n = closed ? v3.length : v3.length - 1;
    for (let i = 0; i < n; i++) {
      const a = v3[i], b = v3[(i + 1) % v3.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ a, b, l, s0: len }); len += l;
    }
    p.route = { segs, len, closed, s: rand(0, len * 0.5), dir: 1, speed: opt.speed, heading: 0 };
    p.updateWalker = function (dt) {
      const r = this.route;
      r.s += r.dir * r.speed * dt;
      if (r.closed) r.s = (r.s % r.len + r.len) % r.len;
      else {
        if (r.s >= r.len) { r.s = r.len; r.dir = -1; }
        if (r.s <= 0) { r.s = 0; r.dir = 1; }
      }
      let seg = segs[0];
      for (const sg of segs) if (r.s >= sg.s0) seg = sg;
      const u = clamp((r.s - seg.s0) / seg.l, 0, 1);
      const x = lerp(seg.a.x, seg.b.x, u), z = lerp(seg.a.z, seg.b.z, u);
      const th = Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z) * (r.dir > 0 || r.closed ? 1 : -1);
      this.heading = angLerp(this.heading, closed ? th : th, 1 - Math.exp(-dt * 7));
      this.g.rotation.y = this.heading;
      this.groundY = groundH(x, z);
      this.g.position.x = x; this.g.position.z = z;
      this.walk(r.speed, dt);
    };
    return p;
  }
  // 环广场者
  walker([[8.4, -3.4], [9.4, -1], [8.4, 1.4], [6, 2.6], [3.4, 1.4], [2.6, -1], [3.4, -3.4], [6, -4.6]], true,
    { shirt: C.teal, pants: 0x3d3a36, hat: 'cap', hatC: C.coral, speed: 0.85 });
  // 码头↔广场
  walker([[4.6, 2.6], [4.6, 6.4], [6.6, 6.9], [8.8, 7.9]], false,
    { shirt: C.terra, pants: C.navy, speed: 0.8 });
  // 公园↔广场
  walker([[1.8, -8.2], [0.2, -10.4], [-0.8, -12.2]], false,
    { shirt: C.mustard, pants: 0x4a4440, hat: 'brim', speed: 0.75 });

  // 渔夫(工作)
  const fisher = makePerson({ shirt: C.mustard, pants: 0x3d3a36, hat: 'brim', hatC: 0xcbb68e, armC: C.mustard });
  {
    const fx = -5.2, fz = 10.15;
    fisher.groundY = 1.9; fisher.g.position.set(fx, 1.9, fz);
    fisher.g.rotation.y = 0.35;
    const rod = mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.5, 5), M(C.woodDark), 0.12, 0.75, 0.28);
    rod.rotation.x = -1.05; rod.rotation.z = -0.25;
    fisher.g.add(rod);
    const lineM = mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 }), 0.52, 0.18, 0.78);
    lineM.castShadow = false; fisher.g.add(lineM);
    fisher.rod = rod;
  }
  // 摊主(市场,工作:招手)
  const vendor = makePerson({ shirt: C.coral, pants: 0x4a4440, hat: 'bandana' ? 'cap' : 'cap', hatC: 0xe8e3d2 });
  {
    const vx = 13.4, vz = 9.0;
    vendor.groundY = groundH(vx, vz); vendor.g.position.set(vx, vendor.groundY, vz);
    vendor.g.rotation.y = Math.PI + 0.4;
  }
  // 长椅闲谈 ×2(休息)
  const sitA = makePerson({ shirt: C.cream, pants: C.navy, hat: 'cap', hatC: C.navy });
  const sitB = makePerson({ shirt: 0x9fae5a, pants: 0x3d3a36, hat: 'hood' });
  function sit(p, x, z, ry, flip) {
    const y = groundH(x, z);
    p.groundY = y - 0.18;
    p.g.position.set(x, y - 0.18, z);
    p.g.rotation.y = ry;
    p.legL.rotation.x = p.legR.rotation.x = -1.35;
    p.legL.position.z = 0.12; p.legR.position.z = 0.12;
    if (flip) { p.legL.position.z = -0.12; p.legR.position.z = -0.12; }
  }
  sit(sitA, 5.35, 3.05, -0.5 + Math.PI, false);
  sit(sitB, 5.95, 2.5, -0.5 + Math.PI * 0.75, true);

  // =========================================================================
  // 交通:电车 / 缆车 / 渔船
  // =========================================================================
  // --- 电车 ---
  const tram = (function () {
    const g = new THREE.Group(); scene.add(g);
    box(g, 1.24, 0.5, 3.3, C.mustard, 0, 0.52, 0);
    box(g, 1.3, 0.85, 3.1, C.cream, 0, 1.18, 0);
    box(g, 1.34, 0.1, 3.16, C.woodDark, 0, 1.66, 0);
    const winMat = new THREE.MeshStandardMaterial({ color: C.glassDark, roughness: 0.35, metalness: 0.15, emissive: 0xffc98a, emissiveIntensity: 0 });
    REG.windowMats.push({ mat: winMat, jit: 0 });
    for (const s of [1, -1]) {
      const w = mesh(new THREE.BoxGeometry(0.05, 0.5, 2.6), winMat, s * 0.66, 1.22, 0); w.castShadow = false; g.add(w);
    }
    for (const zc of [1.53, -1.53]) {
      const w = mesh(new THREE.BoxGeometry(1.0, 0.5, 0.05), winMat, 0, 1.22, zc); w.castShadow = false; g.add(w);
    }
    // 转向架 + 车轮
    const wheels = [];
    for (const zc of [1.05, -1.05]) {
      box(g, 1.0, 0.12, 0.5, 0x2f343b, 0, 0.28, zc);
      for (const xc of [-0.42, 0.42]) {
        const wm = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), M(0x2a2d33, { metalness: 0.5, roughness: 0.4 }), xc, 0.17, zc);
        wm.rotation.z = Math.PI / 2; g.add(wm); wheels.push(wm);
      }
    }
    // 集电杆
    const pole1 = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), M(0x2f343b), 0, 2.1, -1.1);
    pole1.rotation.x = 0.5; g.add(pole1);
    const pole2 = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), M(0x2f343b), 0, 2.62, -0.72);
    pole2.rotation.x = -0.35; g.add(pole2);
    return { g, wheels, u: 0, dir: 1, mode: 'run', dwell: 0, speed: TRAM_LEN / 15, yaw: 0, stops: TRAM_STOPS_U.slice().sort((a, b) => a - b), lastStop: -1, cycleT: 0 };
  })();

  // --- 缆车车厢 ---
  const funi = (function () {
    const g = new THREE.Group(); scene.add(g);
    g.rotation.order = 'YXZ';
    g.rotation.y = FUNI.yaw; g.rotation.x = -FUNI.pitch;
    box(g, 1.15, 0.24, 1.62, C.red, 0, 0.42, 0);
    box(g, 1.2, 0.72, 1.5, C.cream, 0, 0.9, 0);
    box(g, 1.26, 0.08, 1.56, C.red, 0, 1.31, 0);
    const winMat = new THREE.MeshStandardMaterial({ color: C.glassDark, roughness: 0.35, emissive: 0xffc98a, emissiveIntensity: 0 });
    REG.windowMats.push({ mat: winMat, jit: 0.05 });
    for (const s of [1, -1]) {
      const w = mesh(new THREE.BoxGeometry(0.04, 0.34, 1.1), winMat, s * 0.62, 0.94, 0); w.castShadow = false; g.add(w);
    }
    const wheels = [];
    for (const zc of [0.55, -0.55]) for (const xc of [-0.38, 0.38]) {
      const wm = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), M(0x2a2d33), xc, 0.24, zc);
      wm.rotation.z = Math.PI / 2; g.add(wm); wheels.push(wm);
    }
    // 吊臂
    box(g, 0.05, 0.42, 0.05, 0x2f343b, -0.2, 1.5, 0); box(g, 0.05, 0.42, 0.05, 0x2f343b, 0.2, 1.5, 0);
    box(g, 0.5, 0.05, 0.05, 0x2f343b, 0, 1.7, 0);
    return { g, wheels, s: 0, dir: 1, mode: 'run', dwell: 0, speed: FUNI.len / 8 };
  })();

  // --- 渔船(港内环线) ---
  const boat = (function () {
    const g = new THREE.Group(); scene.add(g);
    box(g, 1.0, 0.42, 2.5, 0x3f6f6a, 0, 0.2, 0);
    // 船艏
    const bow = mesh(new THREE.ConeGeometry(0.5, 0.9, 4), M(0x3f6f6a), 0, 0.2, 1.65);
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.84); g.add(bow);
    box(g, 1.06, 0.1, 2.5, 0xd8cdb4, 0, 0.44, 0);
    box(g, 0.78, 0.5, 0.9, C.cream, 0, 0.72, -0.35);
    box(g, 0.84, 0.07, 0.96, C.terra, 0, 1.0, -0.35);
    const winMat = new THREE.MeshStandardMaterial({ color: C.glassDark, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 0.4 });
    REG.windowMats.push({ mat: winMat, jit: 0.2 });
    const bw = mesh(new THREE.BoxGeometry(0.6, 0.26, 0.05), winMat, 0, 0.78, 0.12); bw.castShadow = false; g.add(bw);
    cyl(g, 0.1, 0.12, 0.34, 0x3a3f46, 0, 1.05, -0.62, 8);
    const mast = cyl(g, 0.025, 0.03, 1.5, C.wood, 0, 1.1, 0.55, 6);
    const flagGeo = new THREE.PlaneGeometry(0.55, 0.3, 6, 3); flagGeo.translate(0.275, 0, 0);
    const bflag = mesh(flagGeo, M(C.coral, { side: THREE.DoubleSide }), 0, 1.75, 0.55, true, false);
    g.add(bflag);
    return { g, bflag, theta: 0, yaw: 0 };
  })();
  const rowboat = (function () {
    const g = new THREE.Group(); scene.add(g);
    g.position.set(-4.0, 0, 11.6);
    box(g, 0.6, 0.3, 1.5, 0x8a6a48, 0, 0.05, 0);
    box(g, 0.5, 0.06, 1.2, 0x6a4e32, 0, 0.2, 0);
    cyl(g, 0.03, 0.03, 1.1, C.wood, 0.1, 0.3, -0.3, 5).rotation.z = 0.6;
    return { g };
  })();

  // =========================================================================
  // 灯塔
  // =========================================================================
  let beamGroup, lampBulb, lighthouseLight;
  (function lighthouse() {
    const x = 13.8, z = 22.6, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    rock(x + 0.9, z - 0.8, 1.3); rock(x - 1.1, z + 0.7, 1.0);
    cyl(g, 1.3, 1.55, 0.5, C.stoneDark, 0, 0.1, 0, 16);
    cyl(g, 0.76, 1.06, 1.7, C.red, 0, 1.2, 0, 18);
    cyl(g, 0.64, 0.76, 1.75, C.white, 0, 2.92, 0, 18);
    cyl(g, 0.52, 0.64, 1.7, C.red, 0, 4.62, 0, 18);
    cyl(g, 1.02, 1.02, 0.16, 0x3a3f46, 0, 5.55, 0, 18);
    const rail = mesh(new THREE.TorusGeometry(0.92, 0.03, 6, 22), M(0x3a3f46), 0, 5.98, 0); rail.rotation.x = Math.PI / 2; g.add(rail);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      cyl(g, 0.022, 0.022, 0.42, 0x3a3f46, Math.cos(a) * 0.92, 5.85, Math.sin(a) * 0.92, 5).castShadow = false;
    }
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffe9bd, transparent: true, opacity: 0.32, roughness: 0.15, emissive: 0xffc06a, emissiveIntensity: 0 });
    REG.windowMats.push({ mat: glassMat, jit: 0 });
    cyl(g, 0.42, 0.42, 0.72, glassMat, 0, 6.0, 0, 14).castShadow = false;
    lampBulb = mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffd9a0, emissiveIntensity: 0.15 }), 0, 6.0, 0);
    lampBulb.castShadow = false; g.add(lampBulb);
    cone(g, 0.56, 0.5, C.red, 0, 6.6, 0, 12);
    sph(g, 0.07, C.gold, 0, 6.9, 0, 8);
    doorAt(g, 0, 0.72, 1.08, 0, 0.5, 0.85);
    // 扫光:两束相反方向的水平光锥(顶点在灯室,向外展开)
    beamGroup = new THREE.Group(); beamGroup.position.y = 6.0; g.add(beamGroup);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffdca0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of [1, -1]) {
      const bg = new THREE.ConeGeometry(2.6, 24, 20, 1, true);
      bg.translate(0, -12, 0);          // 顶点在原点,向 -y 展开
      bg.rotateZ(s * Math.PI / 2);      // 转到 ±x 水平方向
      const beam = new THREE.Mesh(bg, beamMat);
      beam.castShadow = false; beamGroup.add(beam);
    }
    lighthouseLight = new THREE.PointLight(0xffd9a0, 0, 34, 2);
    lighthouseLight.position.set(x, y + 6.0, z); scene.add(lighthouseLight);
    // 岛上小旗
    const fg = new THREE.PlaneGeometry(0.7, 0.4, 6, 3); fg.translate(0.35, 0, 0);
    const fl = mesh(fg, M(C.navy, { side: THREE.DoubleSide }), x + 1.3, groundH(x + 1.3, z - 0.9) + 2.0, z - 0.9, true, false);
    cyl(g, 0.02, 0.02, 2.0, 0x8d8170, 1.3, 1.0, -0.9, 5);
    town.add(fl); boat._extraFlag = fl;
    town.add(g);
  })();

  // =========================================================================
  // 空中:海鸥 ×4 + 热气球
  // =========================================================================
  const gulls = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = mesh(new THREE.ConeGeometry(0.075, 0.42, 6), M(0xf2f2ee), 0, 0, 0);
    body.rotation.x = Math.PI / 2; g.add(body);
    const wingL = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.16), M(0xf2f2ee), -0.27, 0.02, 0); wingL.castShadow = false; g.add(wingL);
    const wingR = wingL.clone(); wingR.position.x = 0.27; g.add(wingR);
    const tail = mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), M(0xd8d4c8), 0, 0, -0.24); tail.castShadow = false; g.add(tail);
    const cx = i < 2 ? 13.8 : 0, cz = i < 2 ? 22.6 : 13;
    g.scale.setScalar(0.85);
    gulls.push({
      g, wingL, wingR, cx, cz,
      r: i % 2 ? rand(7, 10) : rand(5, 8), a: rand(0, 6), w: rand(0.25, 0.42) * (i % 2 ? 1 : -1),
      h: rand(11, 16), phi: rand(0, 6)
    });
    scene.add(g);
  }
  const balloon = (function () {
    const g = new THREE.Group(); scene.add(g);
    const env = mesh(new THREE.SphereGeometry(1.55, 16, 14), M(C.coral), 0, 0, 0);
    env.scale.y = 1.18; g.add(env);
    const top = mesh(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(C.cream), 0, 1.28, 0);
    top.scale.y = 1.1; g.add(top);
    const band = mesh(new THREE.TorusGeometry(1.32, 0.09, 8, 24), M(C.cream), 0, 0.25, 0); band.rotation.x = Math.PI / 2; g.add(band);
    box(g, 0.52, 0.4, 0.52, C.woodDark, 0, -2.5, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rope = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.05, 4), M(0x6a4e32), sx * 0.24, -1.8, sz * 0.24);
      rope.rotation.z = sx * 0.12; rope.rotation.x = -sz * 0.12; rope.castShadow = false; g.add(rope);
    }
    return { g, a: rand(0, 6) };
  })();

  // =========================================================================
  // 萤火虫 / 烟 / 气泡
  // =========================================================================
  const fireflyN = 56;
  const fireflyPos = new Float32Array(fireflyN * 3);
  const fireflySeed = [];
  for (let i = 0; i < fireflyN; i++) {
    const a = rand(0, 6.28), r = rand(0.5, 4.2);
    const bx = -1.5 + Math.cos(a) * r, bz = -13 + Math.sin(a) * r;
    fireflySeed.push({ bx, bz, by: groundH(bx, bz) + rand(0.4, 1.7), p1: rand(0, 6), p2: rand(0, 6), s1: rand(0.5, 1.2), s2: rand(0.4, 1) });
    fireflyPos[i * 3] = bx; fireflyPos[i * 3 + 1] = 2; fireflyPos[i * 3 + 2] = bz;
  }
  const fireflyGeo = new THREE.BufferGeometry();
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
  const fireflyMat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.13, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  REG.fireflies = new THREE.Points(fireflyGeo, fireflyMat); scene.add(REG.fireflies);

  function makeSmoke(x, y, z) {
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const m = mesh(new THREE.SphereGeometry(0.14, 7, 6), new THREE.MeshBasicMaterial({ color: 0xcfd3d8, transparent: true, opacity: 0 }), x, y, z);
      m.castShadow = false; scene.add(m); puffs.push({ m, off: i / 4 });
    }
    return { puffs, x, y, z };
  }
  const smokes = [makeSmoke(3.4, groundH(2.2, -1.8) + 3.8, -2.5), makeSmoke(-4.9, groundH(-6, -10.5) + 4.5, -11.1)];

  // =========================================================================
  // 昼夜更新
  // =========================================================================
  function updateEnvironment(t, D) {
    const K = sampleKeys(t);
    const phi = (t - 6) / 12 * Math.PI;
    const sunEl = Math.sin(phi);
    const dayF = ss(-0.03, 0.18, sunEl);
    const sd = V3(Math.cos(phi), sunEl, 0.38).normalize();
    skyU.uSunDir.value.copy(sd);
    skyU.uTop.value.copy(K.top); skyU.uHor.value.copy(K.hor);
    skyU.uNight.value = D;
    const sunCol = new THREE.Color(0xff8b4a).lerp(new THREE.Color(0xfff3de), ss(0.02, 0.5, sunEl));
    skyU.uSunCol.value.copy(sunCol);
    waterU.uSunDir.value.copy(sd); waterU.uSunCol.value.copy(sunCol);
    waterU.uSky.value.copy(K.hor); waterU.uDeep.value.copy(K.deep); waterU.uShal.value.copy(K.shal);
    waterU.uFog.value.copy(K.fog);
    scene.fog.color.copy(K.fog);
    hemi.color.copy(K.hemiS); hemi.groundColor.copy(K.hemiG);
    hemi.intensity = 0.18 + 0.5 * dayF;
    amb.intensity = K.amb;
    if (sunEl > -0.04) {
      sun.position.copy(sd).multiplyScalar(90); sun.target.position.set(0, 0, 0);
      sun.color.copy(sunCol); sun.intensity = 0.15 + 1.1 * ss(0.02, 0.32, sunEl);
    } else {
      const md = V3(-Math.cos(phi), Math.max(0.3, -sunEl * 0.9), -0.3).normalize();
      sun.position.copy(md).multiplyScalar(90); sun.target.position.set(0, 0, 0);
      sun.color.setHex(0x93a7cf); sun.intensity = 0.22;
    }
    // 窗光
    for (const w of REG.windowMats) {
      const lit = clamp((D - 0.35 - w.jit * 0.55) / 0.22, 0, 1);
      w.mat.emissiveIntensity = lit * 1.55;
    }
    // 路灯
    for (const l of REG.lampLights) {
      const lit = clamp((D - 0.3 - l.jit * 0.5) / 0.2, 0, 1);
      l.light.intensity = lit * 1.5;
      l.sprite.material.opacity = lit * 0.85;
    }
    // 灯塔
    const bl = clamp((D - 0.45) / 0.25, 0, 1);
    lampBulb.material.emissiveIntensity = 0.15 + bl * 2.4;
    lighthouseLight.intensity = bl * 1.7;
    beamGroup.children.forEach(b => { b.material.opacity = bl * 0.22; });
    fireflyMat.opacity = D * 0.95;
    cloudMat.opacity = 0.92 - D * 0.25;
    cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(0x39404e), D * 0.85);
    return { dayF };
  }

  // =========================================================================
  // 时间系统与 UI
  // =========================================================================
  const state = {
    t: 9.0,            // 场景时刻(小时)
    auto: true,        // 自动昼夜
    paused: false,     // 全局暂停
    tween: null,       // {from,to,t0,dur}
    dragging: false
  };
  const HOUR_PER_SEC = 24 / 120;   // 现实 120s = 场景 24h

  const $ = id => document.getElementById(id);
  const elClock = $('clock'), elPhase = $('phase'), elStatus = $('status'), elStatusTxt = $('statusTxt');
  const elMarker = $('marker'), elSlider = $('timeSlider');
  const btnDay = $('btnDay'), btnNight = $('btnNight'), btnAuto = $('btnAuto'), btnPause = $('btnPause'), btnCam = $('btnCam');
  // 表盘刻度
  (function ticks() {
    const g = $('ticks');
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI / 2 + (i - 12) / 24 * Math.PI * 2;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const r1 = i % 6 === 0 ? 36.5 : 38.5;
      l.setAttribute('x1', 50 + Math.cos(a) * r1); l.setAttribute('y1', 50 + Math.sin(a) * r1);
      l.setAttribute('x2', 50 + Math.cos(a) * 41); l.setAttribute('y2', 50 + Math.sin(a) * 41);
      l.setAttribute('class', 'tick');
      g.appendChild(l);
    }
  })();
  const PHASES = [[5, '拂晓 · DAWN'], [7, '清晨 · MORNING'], [11, '上午 · FORENOON'], [13, '正午 · NOON'], [16.5, '午后 · AFTERNOON'], [18.5, '黄昏 · DUSK'], [20, '入夜 · EVENING'], [22.5, '夜晚 · NIGHT'], [24.01, '深夜 · MIDNIGHT']];
  function phaseName(t) {
    if (t < 5) return '深夜 · MIDNIGHT';
    for (const [h, n] of PHASES) if (t < h) return n;
    return '深夜 · MIDNIGHT';
  }
  let lastClockStr = '';
  function updateClockUI() {
    const hh = Math.floor(state.t), mm = Math.floor((state.t - hh) * 60);
    const str = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    if (str !== lastClockStr) {
      lastClockStr = str;
      elClock.textContent = str;
      elPhase.textContent = phaseName(state.t);
      if (!state.dragging) elSlider.value = Math.round(state.t * 60) % 1440;
      const a = -Math.PI / 2 + (state.t - 12) / 24 * Math.PI * 2;
      elMarker.setAttribute('cx', 50 + Math.cos(a) * 41);
      elMarker.setAttribute('cy', 50 + Math.sin(a) * 41);
      const isDay = state.t > 5.5 && state.t < 18.5;
      elMarker.classList.toggle('night', !isDay);
    }
  }
  function updateStatusUI() {
    btnAuto.classList.toggle('on', state.auto);
    btnPause.classList.toggle('paused', state.paused);
    btnPause.querySelector('b').textContent = state.paused ? '继续' : '暂停';
    btnPause.querySelector('i').textContent = state.paused ? 'RESUME' : 'PAUSE';
    elStatus.className = state.paused ? 'paused' : (state.auto ? '' : 'manual');
    elStatusTxt.textContent = state.paused ? '已暂停' : (state.auto ? '自动运行' : '手动时刻');
  }
  function setAuto(v) { state.auto = v; if (v) state.tween = null; updateStatusUI(); }
  function setTime(t, opts) {
    state.t = ((t % 24) + 24) % 24;
    state.tween = null;
    if (!opts || !opts.keepAuto) setAuto(false);
    updateClockUI(); updateStatusUI();
  }
  function tweenTo(t) {
    setAuto(false);
    const from = state.t, to = ((t % 24) + 24) % 24;
    let delta = (to - from) % 24; if (delta > 12) delta -= 24; if (delta < -12) delta += 24;
    state.tween = { from, to: from + delta, t0: performance.now(), dur: 1100 };
    updateStatusUI();
  }
  btnDay.addEventListener('click', () => tweenTo(12));
  btnNight.addEventListener('click', () => tweenTo(22));
  btnAuto.addEventListener('click', () => setAuto(!state.auto));
  btnPause.addEventListener('click', () => { state.paused = !state.paused; updateStatusUI(); });
  elSlider.addEventListener('pointerdown', () => { state.dragging = true; });
  window.addEventListener('pointerup', () => { state.dragging = false; });
  elSlider.addEventListener('input', () => { setTime(elSlider.value / 60); });
  window.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') tweenTo(12);
    else if (e.key === 'n' || e.key === 'N') tweenTo(22);
    else if (e.key === 'a' || e.key === 'A') setAuto(!state.auto);
    else if (e.key === ' ') { e.preventDefault(); state.paused = !state.paused; updateStatusUI(); }
    else if (e.key === 'r' || e.key === 'R') orbit.reset();
  });

  // =========================================================================
  // 相机(自制环绕控制器,带阻尼与范围限制)
  // =========================================================================
  const orbit = new (function () {
    const target = V3(0, 3.2, 5.5);
    const DEF = { r: 55, phi: 1.07, theta: 0.58, ty: 3.2 };
    let cur = { r: DEF.r, phi: DEF.phi, theta: DEF.theta };
    let dst = { r: DEF.r, phi: DEF.phi, theta: DEF.theta };
    const self = this;
    function apply() {
      cur.phi = clamp(cur.phi, 0.18, 1.45);
      cur.r = clamp(cur.r, 15, 115);
      const sp = Math.sin(cur.phi), cp = Math.cos(cur.phi);
      camera.position.set(
        target.x + cur.r * sp * Math.sin(cur.theta),
        target.y + cur.r * cp,
        target.z + cur.r * sp * Math.cos(cur.theta)
      );
      camera.lookAt(target);
    }
    this.update = function (dt) {
      const k = 1 - Math.exp(-dt * 8);
      cur.theta += (dst.theta - cur.theta) * k;
      cur.phi += (dst.phi - cur.phi) * k;
      cur.r += (dst.r - cur.r) * k;
      apply();
    };
    this.rotate = (dx, dy) => {
      dst.theta -= dx * 0.0052;
      dst.phi = clamp(dst.phi - dy * 0.0038, 0.18, 1.45);
    };
    this.zoom = f => { dst.r = clamp(dst.r * f, 15, 115); };
    this.reset = () => { dst = { r: DEF.r, phi: DEF.phi, theta: DEF.theta }; };
    this.snapshot = () => ({ r: dst.r, phi: dst.phi, theta: dst.theta });
    // 指针交互
    let dragging = false, px = 0, py = 0, pinch = 0;
    const pointers = new Map();
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      dragging = true; px = e.clientX; py = e.clientY;
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0) self.zoom(pinch / d);
        pinch = d;
      } else if (dragging) {
        self.rotate(e.clientX - px, e.clientY - py);
        px = e.clientX; py = e.clientY;
      }
    });
    const up = e => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; pinch = 0; canvas.classList.remove('dragging'); } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); self.zoom(Math.exp(e.deltaY * 0.0011)); }, { passive: false });
    canvas.addEventListener('dblclick', () => self.reset());
    apply();
  })();

  // =========================================================================
  // 主循环
  // =========================================================================
  let last = performance.now(), waveT = 0, fpsAcc = 0, fpsN = 0, fpsDowngraded = false;

  function animate(now) {
    requestAnimationFrame(animate);
    const dtReal = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const dt = state.paused ? 0 : dtReal;
    waveT += dt;

    // 时间推进
    if (state.tween) {
      const k = clamp((now - state.tween.t0) / state.tween.dur, 0, 1);
      state.t = lerp(state.tween.from, state.tween.to, k * k * (3 - 2 * k));
      if (k >= 1) state.tween = null;
    } else if (state.auto && !state.paused) {
      state.t = (state.t + dtReal * HOUR_PER_SEC) % 24;
    }
    updateClockUI();

    // 环境亮度因子 D(0=白昼,1=深夜)
    const phi0 = (state.t - 6) / 12 * Math.PI;
    const D = 1 - ss(-0.12, 0.05, Math.sin(phi0));
    updateEnvironment(state.t, D);

    // ---- 钟面 ----
    const hourA = -(state.t % 12) / 12 * Math.PI * 2;
    const minA = -((state.t * 60) % 60) / 60 * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      clockHands.hour[i].rotation.z = hourA;
      clockHands.minute[i].rotation.z = minA;
    }

    // ---- 旗帜 / 烟 / 喷泉(由 waveT 驱动,暂停时冻结) ----
    for (const flag of [hallFlag, boat.bflag]) {
      if (!flag) continue;
      const pos = flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 5.2 - waveT * 6.5) * 0.085 * (x / 1.15 + 0.08));
      }
      pos.needsUpdate = true;
    }
    for (const sm of smokes) {
      for (const p of sm.puffs) {
        const t = (waveT * 0.22 + p.off) % 1;
        p.m.position.set(sm.x + t * 0.5, sm.y + t * 2.3, sm.z + Math.sin(t * 9) * 0.15);
        const sc = 0.5 + t * 1.6;
        p.m.scale.set(sc, sc, sc);
        p.m.material.opacity = (1 - t) * 0.34;
      }
    }
    if (fountain.jet) {
      fountain.jet.scale.y = 1 + Math.sin(waveT * 3.2) * 0.16;
      fountain.jet.scale.x = fountain.jet.scale.z = 1 + Math.cos(waveT * 2.6) * 0.1;
      fountain.drops.forEach((d, i) => {
        const t = (waveT * 0.75 + i / 7) % 1;
        const a = i / 7 * Math.PI * 2;
        d.position.set(
          fountain.jet.position.x + Math.cos(a) * t * 0.55,
          fountain.baseY + 1.5 + 1.15 * t * (1 - t) * 2.2 - 0.2,
          fountain.jet.position.z + Math.sin(a) * t * 0.55
        );
        d.material.opacity = 0.8 * (1 - t * 0.6);
      });
    }

    // ---- 电车 ----
    {
      const tr = tram;
      tr.cycleT += dt;
      if (tr.mode === 'dwell') {
        tr.dwell -= dt;
        if (tr.dwell <= 0) {
          tr.mode = 'run';
          if (tr.pendingFlip) { tr.dir *= -1; tr.pendingFlip = false; }
          tr.lastStop = tr.stopIdx;
        }
      } else {
        const du = tr.dir * tr.speed * dt / TRAM_LEN;
        const prev = tr.u;
        tr.u = clamp(tr.u + du, 0, 1);
        for (let i = 0; i < tr.stops.length; i++) {
          const su = tr.stops[i];
          const hit = tr.dir > 0 ? (prev < su && tr.u >= su) : (prev > su && tr.u <= su);
          if (hit && tr.lastStop !== i) {
            tr.u = su; tr.mode = 'dwell'; tr.dwell = 2.0; tr.stopIdx = i;
            tr.pendingFlip = (su <= 0.002 || su >= 0.998);
            break;
          }
        }
      }
      const p = tramCurve.getPointAt(tr.u);
      const tan = tramCurve.getTangentAt(tr.u);
      const fwd = tr.dir > 0 ? tan : tan.clone().negate();
      tr.yaw = angLerp(tr.yaw, Math.atan2(fwd.x, fwd.z), 1 - Math.exp(-dtReal * (tr.mode === 'dwell' ? 4 : 10)));
      tr.g.position.set(p.x, groundH(p.x, p.z) + 0.02, p.z);
      tr.g.rotation.y = tr.yaw;
      const roll = tr.speed * dt / 0.17;
      tr.wheels.forEach(w => { w.rotation.x += roll; });
    }

    // ---- 缆车 ----
    {
      const f = funi;
      if (f.mode === 'dwell') {
        f.dwell -= dt;
        if (f.dwell <= 0) { f.mode = 'run'; f.dir *= -1; }
      } else {
        f.s += f.dir * f.speed * dt;
        if (f.s >= FUNI.len) { f.s = FUNI.len; f.mode = 'dwell'; f.dwell = 2.0; }
        if (f.s <= 0) { f.s = 0; f.mode = 'dwell'; f.dwell = 2.0; }
      }
      const u = f.s / FUNI.len;
      const x = lerp(FUNI_A.x, FUNI_B.x, u), z = lerp(FUNI_A.z, FUNI_B.z, u);
      f.g.position.set(x, lerp(FUNI.hA, FUNI.hB, u), z);
      const roll = f.speed * f.dir * dt / 0.11;
      f.wheels.forEach(w => { w.rotation.x += roll; });
      FUNI.pulleys.forEach((pw, i) => { pw.rotation.x += (i ? -1 : 1) * f.speed * f.dir * dt / 0.24; });
    }

    // ---- 渔船 ----
    {
      boat.theta += dt * 0.205;
      const bx = Math.cos(boat.theta) * 6.6, bz = 15.2 + Math.sin(boat.theta) * 5.0;
      const dx = -Math.sin(boat.theta) * 6.6, dz = Math.cos(boat.theta) * 5.0;
      const targetYaw = Math.atan2(dx, dz);
      boat.yaw = angLerp(boat.yaw, targetYaw, 1 - Math.exp(-dt * 2.5));
      boat.g.position.set(bx, -0.06 + Math.sin(waveT * 1.25) * 0.055, bz);
      boat.g.rotation.order = 'YXZ';
      boat.g.rotation.y = boat.yaw;
      boat.g.rotation.x = Math.sin(waveT * 0.9) * 0.035;
      boat.g.rotation.z = Math.sin(waveT * 0.72 + 1) * 0.045;
      const fpos = boat.bflag.geometry.attributes.position;
      for (let i = 0; i < fpos.count; i++) {
        const x = fpos.getX(i);
        fpos.setZ(i, Math.sin(x * 9 - waveT * 7) * 0.05 * (x / 0.55 + 0.1));
      }
      fpos.needsUpdate = true;
    }
    {
      rowboat.g.position.y = -0.04 + Math.sin(waveT * 1.4 + 2) * 0.05;
      rowboat.g.rotation.z = Math.sin(waveT * 1.1 + 0.5) * 0.05;
      rowboat.g.rotation.x = Math.sin(waveT * 0.9 + 1) * 0.03;
    }

    // ---- 海鸥 ----
    for (const gu of gulls) {
      gu.a += gu.w * dt;
      const x = gu.cx + Math.cos(gu.a) * gu.r;
      const z = gu.cz + Math.sin(gu.a) * gu.r * 0.82;
      const y = gu.h + Math.sin(waveT * 0.5 + gu.phi) * 1.5;
      gu.g.position.set(x, y, z);
      const dx = -Math.sin(gu.a) * gu.r, dz = Math.cos(gu.a) * gu.r * 0.82;
      gu.g.rotation.y = Math.atan2(dx, dz) + (gu.w > 0 ? 0 : 0);
      gu.g.rotation.z = (gu.w > 0 ? 1 : -1) * -0.32;
      gu.g.rotation.x = Math.sin(waveT * 0.4 + gu.phi) * 0.08;
      const flap = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(waveT * 0.31 + gu.phi * 2));
      const f = Math.sin(waveT * 7.5 + gu.phi) * 0.85 * flap;
      gu.wingL.rotation.z = f; gu.wingR.rotation.z = -f;
    }

    // ---- 热气球 ----
    {
      balloon.a += dt * 0.048;
      const bx = Math.cos(balloon.a) * 24, bz = 4 + Math.sin(balloon.a) * 20;
      balloon.g.position.set(bx, 20.5 + Math.sin(waveT * 0.13 + 2) * 2.2, bz);
      balloon.g.rotation.z = Math.sin(waveT * 0.42) * 0.05;
      balloon.g.rotation.x = Math.sin(waveT * 0.35 + 1) * 0.04;
      balloon.g.rotation.y += dt * 0.05;
    }

    // ---- 风车 ----
    if (windmillSails.sails) windmillSails.sails.rotation.z += dt * 0.85;
    if (windmillSails.fantail) windmillSails.fantail.rotation.y += dt * 1.7;

    // ---- 灯塔扫光 ----
    beamGroup.rotation.y += dt * 0.85;

    // ---- 居民 ----
    for (const p of people) {
      if (p.updateWalker) p.updateWalker(dt);
    }
    fisher.idle(dt, waveT);
    fisher.rod.rotation.x = -1.05 + Math.sin(waveT * 0.6) * 0.06;
    fisher.rod.rotation.z = -0.25 + Math.sin(waveT * 0.35) * 0.05;
    vendor.idle(dt, waveT);
    vendor.armR.rotation.z = -0.9 - Math.max(0, Math.sin(waveT * 1.4)) * 0.7;
    vendor.g.rotation.y = Math.PI + 0.4 + Math.sin(waveT * 0.8) * 0.12;
    // 交谈:头部缓转
    sitA.head.rotation.y = Math.sin(waveT * 0.6) * 0.35;
    sitB.head.rotation.y = Math.sin(waveT * 0.6 + Math.PI) * 0.35;
    sitA.idle(dt, waveT); sitB.idle(dt, waveT);

    // ---- 萤火虫 ----
    if (fireflyMat.opacity > 0.01) {
      const fp = REG.fireflies.geometry.attributes.position;
      for (let i = 0; i < fireflyN; i++) {
        const s = fireflySeed[i];
        fp.setXYZ(i,
          s.bx + Math.sin(waveT * s.s1 + s.p1) * 0.7,
          s.by + Math.sin(waveT * s.s2 + s.p2) * 0.45,
          s.bz + Math.cos(waveT * s.s1 * 0.8 + s.p2) * 0.7);
      }
      fp.needsUpdate = true;
    }

    // ---- 水 / 天空 ----
    waterU.uTime.value = waveT;
    for (const cl of clouds) {
      cl.position.x += cl.userData.spd * dt;
      if (cl.position.x > 150) cl.position.x = -150;
    }

    orbit.update(dtReal);
    renderer.render(scene, camera);

    // 自适应降载(仅一次)
    fpsAcc += dtReal; fpsN++;
    if (!fpsDowngraded && fpsN >= 120) {
      const fps = fpsN / fpsAcc;
      if (fps < 33) { renderer.setPixelRatio(1); fpsDowngraded = true; }
      fpsAcc = 0; fpsN = 0;
    }
  }

  // ---- 自适应视口 ----
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ---- 调试接口(自动化验收用) ----
  window.__H = {
    get state() { return { t: state.t, auto: state.auto, paused: state.paused }; },
    setTime: t => setTime(t, { keepAuto: true }),
    setAuto: v => setAuto(v),
    setPaused: v => { state.paused = v; updateStatusUI(); },
    tram: () => ({ u: tram.u, mode: tram.mode, dwell: tram.dwell, dir: tram.dir, len: TRAM_LEN, stops: tram.stops }),
    funi: () => ({ s: funi.s, mode: funi.mode, dwell: funi.dwell, len: FUNI.len }),
    boat: () => ({ theta: boat.theta, pos: boat.g.position.toArray() }),
    orbit: () => orbit.snapshot(),
    resetCam: () => orbit.reset(),
    errors: window.__errs || []
  };
  window.addEventListener('error', e => { (window.__errs = window.__errs || []).push(String(e.message)); });

  // ---- 启动 ----
  updateStatusUI(); updateClockUI(); updateEnvironment(9, 0);
  requestAnimationFrame(animate);
  setTimeout(() => document.getElementById('veil').classList.add('gone'), 900);
  setTimeout(() => document.getElementById('veil').remove(), 2400);
})();
