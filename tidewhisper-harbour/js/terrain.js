/* 汐语港 · 地形高度场(单一数据源)
 * 同一份函数用于:地形网格、角色/载具贴地、水岸泡沫采样。
 * 设计:自然山体 → 台地量化(箱庭阶地)→ 超椭圆港湾开凿 → 环港码头平台 → 建筑垫层 → 坡道走廊。
 * UMD 包装,浏览器与 node 预览脚本共用。 */
(function (g) {
  'use strict';

  var P = {
    terrace: 1.7,                                  // 台地层高
    coastBase: 36,                                 // 海岸基准半径
    bay: { x: 0, z: 15.2, s: 7.5, d: 15.0 },       // 港湾开凿(南向开口)
    hill: { x: -13, z: -12, s: 8.5, h: 3.0 },      // 西北山丘(风车)
    mid: { x: 6, z: -3, s: 8.0, h: 1.2 },          // 中央隆起(广场)
    west: { x: -6, z: -8, s: 6.5, h: 1.2 },        // 中阶台地
    // 港湾:超椭圆 (x/10.8)^4 + ((z-15)/8.6)^4
    harbor: { cx: 0, cz: 15, a: 10.8, b: 8.6 },
    // 垫层 pads:{x,z,r0(全内),r1(外缘),h}
    pads: [
      { x: 6, z: -1, r0: 5.6, r1: 8.5, h: 3.4 },     // 下城广场平台
      { x: -13, z: -12, r0: 3.4, r1: 5.0, h: 6.8 },  // 风车丘顶
      { x: -1.5, z: -13, r0: 2.6, r1: 4.4, h: 5.1 }, // 公园
      { x: -6, z: -10.5, r0: 2.2, r1: 3.8, h: 5.1 }, // 别墅
      { x: -13.2, z: -4.4, r0: 1.6, r1: 3.0, h: 5.1 },// 缆车上站
      { x: 10.6, z: 19.2, r0: 1.5, r1: 2.4, h: 1.7 },// 港东岬角(电车折返)
      { x: -10.6, z: 19.2, r0: 1.5, r1: 2.4, h: 1.7 },// 港西岬角(电车折返)
      { x: 11.15, z: 16.3, r0: 1.1, r1: 2.0, h: 1.7 },// 东侧轨道补台
      { x: -11.15, z: 16.3, r0: 1.1, r1: 2.0, h: 1.7 },// 西侧轨道补台
      { x: 13.8, z: 22.6, r0: 1.4, r1: 2.3, h: 1.7 } // 灯塔岩岛
    ],
    channel: { x: 12.2, z: 20.9, s: 1.35, d: 4.0 }, // 东岬与灯塔岛之间的水道
    // 坡道走廊 ramps:{x1,z1,x2,z2,w}
    ramps: [
      { x1: -11.3, z1: 9.8, x2: -13.2, z2: -4.4, w: 2.6 },  // 缆车坡道
      { x1: 4.6, z1: 3.4, x2: 4.6, z2: 6.2, w: 1.9 },       // 石阶:广场→码头
      { x1: -3.2, z1: -13.6, x2: -11.8, z2: -12.8, w: 2.0 } // 山道:公园→风车(绕开别墅)
    ]
  };

  function ss(e0, e1, x) {
    var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }
  function gauss(dx, dz, s) { return Math.exp(-(dx * dx + dz * dz) / (2 * s * s)); }

  function coastR(th) {
    return P.coastBase + 5.0 * Math.sin(th * 2 + 0.9) + 3.0 * Math.sin(th * 3 + 2.2) + 2.2 * Math.sin(th * 5 + 4.1);
  }

  function terrace(h) {
    var t = P.terrace;
    if (h < 0.55) return h;
    var k = Math.floor(h / t), f = h / t - k;
    if (k === 0) return h + (t - h) * ss(0.45, 0.85, f);
    return (k + ss(0.30, 0.72, f)) * t;
  }

  function raw(x, z) {
    var r = Math.sqrt(x * x + z * z), th = Math.atan2(z, x);
    var cr = coastR(th);
    var m = 1 - ss(cr - 7, cr, r);
    var p = 1.2 + 4.6 * (1 - ss(4, 26, r));
    var h = p + 0.35 * gauss(x - 2, z - 6, 12);
    h += P.hill.h * gauss(x - P.hill.x, z - P.hill.z, P.hill.s);
    h += P.mid.h * gauss(x - P.mid.x, z - P.mid.z, P.mid.s);
    h += P.west.h * gauss(x - P.west.x, z - P.west.z, P.west.s);
    h -= P.bay.d * gauss(x - P.bay.x, z - P.bay.z, P.bay.s);
    return h * m - (1 - m) * 3.2;
  }

  function sHarbor(x, z) {
    var dx = (x - P.harbor.cx) / P.harbor.a;
    var dz = (z - P.harbor.cz) / P.harbor.b;
    return dx * dx * dx * dx + dz * dz * dz * dz;
  }

  function base(x, z) {
    var h = terrace(raw(x, z));
    // 港湾水域:超椭圆内部压到水下
    var s = sHarbor(x, z);
    var w = 1 - ss(0.86, 1.0, s);
    if (w > 0) h = h * (1 - w) + (-1.7) * w;
    // 环港码头平台(南口方向淡出,保持港湾与外海连通)
    var q = ss(1.0, 1.10, s) * (1 - ss(2.2, 2.6, s));
    if (q > 0) {
      var ang = Math.abs(Math.atan2(x, -(z - P.harbor.cz)));
      q *= 1 - ss(2.35, 2.85, ang);
      h = h * (1 - q) + 1.7 * q;
    }
    // 灯塔岛水道(在码头平台之后、垫层之前开凿,岛与岬角由桥连接)
    if (P.channel) {
      var ch = P.channel;
      var cd = gauss(x - ch.x, z - ch.z, ch.s);
      h -= ch.d * cd * Math.max(0, Math.min(1, (h + 0.4) / 2)); // 仅削低地,不抬高海
    }
    // 建筑垫层
    for (var i = 0; i < P.pads.length; i++) {
      var pd = P.pads[i];
      var d = Math.sqrt((x - pd.x) * (x - pd.x) + (z - pd.z) * (z - pd.z));
      var b = 1 - ss(pd.r0, pd.r1, d);
      if (b > 0) h = h * (1 - b) + pd.h * b;
    }
    return h;
  }

  function groundH(x, z) {
    var h = base(x, z);
    for (var i = 0; i < P.ramps.length; i++) {
      var rp = P.ramps[i];
      var vx = rp.x2 - rp.x1, vz = rp.z2 - rp.z1;
      var u = ((x - rp.x1) * vx + (z - rp.z1) * vz) / (vx * vx + vz * vz);
      u = Math.max(0, Math.min(1, u));
      var px = rp.x1 + vx * u, pz = rp.z1 + vz * u;
      var d = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
      var hy = base(rp.x1, rp.z1) * (1 - u) + base(rp.x2, rp.z2) * u;
      var wgt = 1 - ss(rp.w * 0.6, rp.w, d);
      h = h * (1 - wgt) + hy * wgt;
    }
    return h;
  }

  g.Terrain = {
    P: P, groundH: groundH, base: base, raw: raw, terrace: terrace,
    coastR: coastR, sHarbor: sHarbor
  };
})(typeof window !== 'undefined' ? window : globalThis);
