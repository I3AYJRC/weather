/* 2D 像素场景引擎：低分辨率画布 + 像素放大，绘制昼夜天空、城市、路灯与天气粒子 */
window.Scene = (function () {
  'use strict';

  var canvas = document.getElementById('scene');
  if (!canvas) return { init: function () {}, set: function () {} };
  var ctx = canvas.getContext('2d', { alpha: false });

  var W = 320;
  var H = 200;
  var groundY = 132;
  var t = 0;
  var lastTs = 0;
  var rafId = 0;
  var resizeTimer = 0;

  var weather = { kind: 'clear', isDay: false, wind: 6, intensity: 1 };

  var flakes = [];
  var drops = [];
  var splashes = [];
  var stars = [];
  var clouds = [];
  var buildings = [];
  var farBuildings = [];
  var decor = [];

  var nextFlash = 4;
  var flash = 0;
  var bolt = null;
  var boltLife = 0;

  var lampX = 0;
  var lampTop = 0;
  var lampLit = true;

  var SKY = {
    clear: { day: ['#2f8fd6', '#c3e9ff'], night: ['#04060f', '#1b2046'] },
    partly: { day: ['#3f83b8', '#cadff0'], night: ['#060a16', '#1e2546'] },
    cloudy: { day: ['#677d9b', '#c3d2e2'], night: ['#090d1a', '#252c44'] },
    rain: { day: ['#37465a', '#8194ab'], night: ['#04070d', '#151c2b'] },
    snow: { day: ['#7b93b3', '#e0ebf7'], night: ['#050915', '#1d2547'] },
    thunder: { day: ['#282f3e', '#5d6c82'], night: ['#03050a', '#101420'] },
    fog: { day: ['#76818f', '#c6ced8'], night: ['#0a0e15', '#2b3240'] }
  };

  var CLOUD_SHAPE = [
    [0, 2, 9, 3],
    [2, 1, 5, 2],
    [4, 0, 4, 2],
    [7, 1, 3, 2],
    [9, 2, 3, 2],
    [1, 4, 11, 2]
  ];

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function rndi(a, b) {
    return Math.floor(rnd(a, b + 1));
  }

  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, k) {
    var A = hexRgb(a);
    var B = hexRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * k) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * k) + ')';
  }

  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function disc(cx, cy, rad, color) {
    ctx.fillStyle = color;
    for (var y = -rad; y <= rad; y++) {
      var w = Math.floor(Math.sqrt(rad * rad - y * y));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }

  function skyBands(top, bottom) {
    var bands = Math.max(12, Math.round(H / 5));
    var step = Math.ceil(H / bands);
    for (var i = 0; i < bands; i++) {
      px(0, i * step, W, step + 1, mix(top, bottom, i / (bands - 1)));
    }
  }

  function groundColors(kind, isDay) {
    if (kind === 'snow') {
      return isDay ? ['#eef6ff', '#cfdff0', '#a9bed9'] : ['#36466a', '#283552', '#1d2740'];
    }
    if (kind === 'rain' || kind === 'thunder') {
      return isDay ? ['#3d4654', '#2b3340', '#1e2530'] : ['#0c1120', '#080c16', '#060a12'];
    }
    if (kind === 'fog') {
      return isDay ? ['#4a5560', '#39434e', '#2c353e'] : ['#12171f', '#0c1117', '#080b10'];
    }
    return isDay ? ['#3f7d4f', '#2e603c', '#224a2e'] : ['#12301f', '#0d2418', '#091a12'];
  }

  function buildStars() {
    stars = [];
    var n = Math.round((W * H) / 2200);
    for (var i = 0; i < n; i++) {
      stars.push({
        x: rndi(0, W),
        y: rndi(0, Math.floor(groundY * 0.82)),
        phase: rnd(0, Math.PI * 2),
        size: Math.random() < 0.18 ? 2 : 1
      });
    }
  }

  function buildClouds() {
    clouds = [];
    var kind = weather.kind;
    var n = kind === 'clear' ? 2 : kind === 'partly' ? 3 : 4;
    var scale = W < 190 ? 1 : (Math.random() < 0.4 ? 2 : 1);
    for (var i = 0; i < n; i++) {
      clouds.push({
        x: rnd(-20, W),
        y: rnd(4, H * 0.3),
        s: i === 0 ? scale : (W < 190 ? 1 : (Math.random() < 0.35 ? 2 : 1)),
        a: rnd(0.7, 1)
      });
    }
  }

  function buildCity() {
    buildings = [];
    farBuildings = [];
    var fx = -6;
    while (fx < W + 10) {
      var fw = rndi(12, Math.max(16, Math.round(W * 0.08)));
      var fh = rndi(Math.round(H * 0.05), Math.round(H * 0.17));
      farBuildings.push({ x: fx, w: fw, h: fh });
      fx += fw + rndi(0, 5);
    }

    var x = -6;
    while (x < W + 8) {
      var w = rndi(9, Math.max(12, Math.round(W * 0.075)));
      var h = rndi(Math.round(H * 0.07), Math.round(H * 0.26));
      var b = { x: x, w: w, h: h, wins: [], antenna: Math.random() < 0.22, seed: rnd(0, 10) };
      for (var wy = 4; wy < h - 3; wy += 5) {
        for (var wx = 3; wx < w - 2; wx += 4) {
          if (Math.random() < 0.5) {
            b.wins.push({ x: wx, y: wy, on: Math.random() < 0.55, warm: Math.random() < 0.78 });
          }
        }
      }
      buildings.push(b);
      x += w + rndi(1, 6);
    }
  }

  function buildDecor() {
    decor = [];
    for (var i = 0; i < 16; i++) {
      decor.push({ x: Math.random() * W, w: rnd(2, 6), h: rnd(1, 2) });
    }
  }

  function buildParticles() {
    flakes = [];
    drops = [];
    splashes = [];
    var i;
    if (weather.kind === 'snow') {
      var sn = Math.round((W * H) / 620 * Math.min(1.8, weather.intensity));
      for (i = 0; i < sn; i++) {
        flakes.push({
          x: rnd(0, W),
          y: rnd(-H, groundY),
          vy: rnd(5, 12) * (H / 200),
          sway: rnd(1, 4),
          sp: rnd(0.5, 1.5),
          ph: rnd(0, Math.PI * 2),
          size: Math.random() < 0.2 ? 2 : 1
        });
      }
    }
    if (weather.kind === 'rain' || weather.kind === 'thunder') {
      var rn = Math.round((W * H) / 700 * Math.min(1.7, weather.intensity));
      for (i = 0; i < rn; i++) {
        drops.push({
          x: rnd(-8, W + 8),
          y: rnd(-H, groundY),
          len: rnd(2, 5),
          v: rnd(70, 115) * (H / 200)
        });
      }
    }
  }

  function buildAll() {
    buildStars();
    buildClouds();
    buildCity();
    buildDecor();
    buildParticles();
  }

  function cloudColors() {
    var night = !weather.isDay;
    var k = weather.kind;
    if (k === 'rain' || k === 'thunder') return night ? ['#2c3548', '#202838'] : ['#7c8ea5', '#5f7188'];
    if (k === 'snow') return night ? ['#3a4460', '#2b344c'] : ['#e6eef9', '#c3d2e6'];
    if (k === 'cloudy') return night ? ['#2b344b', '#212940'] : ['#dfe8f4', '#b9c9dd'];
    return night ? ['#2a3450', '#1e2740'] : ['#f4f8ff', '#cddaea'];
  }

  function drawStars() {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.phase));
      px(s.x, s.y, s.size, s.size, '#dce7ff');
    }
    ctx.globalAlpha = 1;
  }

  function drawSun(x, y, rad) {
    ctx.globalAlpha = 0.08;
    disc(x, y, rad + Math.round(rad * 0.8), '#ffd97a');
    ctx.globalAlpha = 0.1;
    disc(x, y, rad + Math.round(rad * 0.35), '#ffe08c');
    ctx.globalAlpha = 1;
    disc(x, y, rad, '#ffcf5c');
    disc(x - Math.round(rad * 0.18), y - Math.round(rad * 0.2), Math.round(rad * 0.66), '#ffe08a');
    var e = Math.max(1, Math.round(rad * 0.16));
    px(x - Math.round(rad * 0.38), y, e, e, '#8a5b00');
    px(x + Math.round(rad * 0.22), y, e, e, '#8a5b00');
    px(x - Math.round(rad * 0.14), y + Math.round(rad * 0.38), Math.max(2, Math.round(rad * 0.42)), 1, '#8a5b00');
    var rl = Math.max(2, Math.round(rad * 0.34));
    var gap = rad + Math.max(2, Math.round(rad * 0.24));
    px(x - 1, y - gap - rl, 2, rl, '#ffb347');
    px(x - 1, y + gap, 2, rl, '#ffb347');
    px(x - gap - rl, y - 1, rl, 2, '#ffb347');
    px(x + gap, y - 1, rl, 2, '#ffb347');
    var d = Math.round(gap * 0.72);
    px(x - d, y - d, 2, 2, '#ffb347');
    px(x + d, y - d, 2, 2, '#ffb347');
    px(x - d, y + d, 2, 2, '#ffb347');
    px(x + d, y + d, 2, 2, '#ffb347');
  }

  function crescent(cx, cy, rad, ox, oy, cutRad, color) {
    ctx.fillStyle = color;
    for (var y = -rad; y <= rad; y++) {
      var w1 = Math.floor(Math.sqrt(Math.max(0, rad * rad - y * y)));
      var dy = y - oy;
      var w2 = Math.abs(dy) <= cutRad ? Math.floor(Math.sqrt(Math.max(0, cutRad * cutRad - dy * dy))) : -1;
      if (w2 < 0) {
        ctx.fillRect(Math.round(cx - w1), Math.round(cy + y), w1 * 2 + 1, 1);
        continue;
      }
      var leftEnd = Math.min(cx + w1, cx + ox - w2 - 1);
      if (leftEnd >= cx - w1) {
        ctx.fillRect(Math.round(cx - w1), Math.round(cy + y), Math.round(leftEnd - (cx - w1)) + 1, 1);
      }
      var rightStart = Math.max(cx - w1, cx + ox + w2 + 1);
      if (rightStart <= cx + w1) {
        ctx.fillRect(Math.round(rightStart), Math.round(cy + y), Math.round(cx + w1 - rightStart) + 1, 1);
      }
    }
  }

  function drawMoon(x, y, rad) {
    ctx.globalAlpha = 0.1;
    disc(x, y, rad + Math.round(rad * 0.9), '#a9c2ff');
    ctx.globalAlpha = 0.06;
    disc(x, y, rad + Math.round(rad * 1.7), '#8fa9f0');
    ctx.globalAlpha = 1;
    crescent(x, y, rad, Math.round(rad * 0.5), -Math.round(rad * 0.35), rad, '#e9f0ff');
    px(x - Math.round(rad * 0.5), y + Math.round(rad * 0.1), Math.max(1, Math.round(rad * 0.2)), Math.max(1, Math.round(rad * 0.2)), '#c7d6f4');
    px(x - Math.round(rad * 0.7), y - Math.round(rad * 0.45), Math.max(1, Math.round(rad * 0.15)), Math.max(1, Math.round(rad * 0.15)), '#c7d6f4');
  }

  function drawClouds() {
    var col = cloudColors();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.globalAlpha = c.a;
      for (var j = 0; j < CLOUD_SHAPE.length; j++) {
        var p = CLOUD_SHAPE[j];
        px(c.x + p[0] * c.s, c.y + p[1] * c.s, p[2] * c.s, p[3] * c.s, col[0]);
      }
      px(c.x + 1 * c.s, c.y + 5 * c.s, 10 * c.s, c.s, col[1]);
      ctx.globalAlpha = 1;
    }
  }

  function drawFarCity() {
    var night = !weather.isDay;
    var col = night ? '#1a2338' : '#8fa2b9';
    for (var i = 0; i < farBuildings.length; i++) {
      var b = farBuildings[i];
      px(b.x, groundY - b.h, b.w, b.h, col);
    }
  }

  function drawCity() {
    var night = !weather.isDay;
    var body = night ? '#0b1222' : '#5f7189';
    var edge = night ? '#141d33' : '#8296ad';
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var y = groundY - b.h;
      px(b.x, y, b.w, b.h, body);
      px(b.x, y, b.w, 1, edge);
      if (b.antenna) px(b.x + Math.floor(b.w / 2), y - 4, 1, 4, night ? '#1a2438' : '#6d7f96');
      if (!night) continue;
      for (var k = 0; k < b.wins.length; k++) {
        var w = b.wins[k];
        if (!w.on) continue;
        ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.7 + b.seed + w.x * 0.3));
        px(b.x + w.x, y + w.y, 2, 2, w.warm ? '#ffca6b' : '#9fdcff');
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawGround() {
    var g = groundColors(weather.kind, weather.isDay);
    px(0, groundY, W, H - groundY, g[0]);
    px(0, groundY, W, 2, g[1]);
    px(0, groundY + Math.round((H - groundY) * 0.5), W, Math.max(2, Math.round((H - groundY) * 0.2)), g[2]);

    var i;
    if (weather.kind === 'snow') {
      for (i = 0; i < decor.length; i++) {
        px(decor[i].x, groundY - decor[i].h, decor[i].w, 1, '#c9d9ef');
      }
    } else if (weather.kind === 'rain' || weather.kind === 'thunder') {
      ctx.globalAlpha = 0.16;
      for (i = 0; i < decor.length; i++) {
        px(decor[i].x, groundY + 5 + (i % 3) * 4, decor[i].w * 3, 1, '#7fb6e8');
      }
      ctx.globalAlpha = 1;
    } else {
      for (i = 0; i < decor.length; i++) {
        px(decor[i].x, groundY - decor[i].h, 1, decor[i].h, g[2]);
      }
    }
  }

  function drawLamp() {
    var x = lampX;
    var lit = lampLit;

    if (lit) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var rows = groundY - lampTop;
      for (var i = 0; i < rows; i += 2) {
        var k = i / rows;
        var half = 3 + k * (W * 0.05);
        ctx.globalAlpha = 0.32;
        px(x - half, lampTop + i, half * 2, 2, '#3d2c0e');
      }
      ctx.globalAlpha = 0.55;
      disc(x, lampTop - 1, Math.max(3, Math.round(W * 0.016)), '#5a4315');
      ctx.globalAlpha = 0.2;
      disc(x, lampTop - 1, Math.max(6, Math.round(W * 0.035)), '#3a2a0c');
      ctx.globalAlpha = 0.4;
      disc(x, groundY + 1, Math.max(6, Math.round(W * 0.045)), '#3d2c0e');
      ctx.restore();
    }

    px(x - 3, groundY - 2, 6, 2, '#101521');
    px(x - 1, lampTop, 2, groundY - lampTop, '#151a28');
    px(x, lampTop, 1, groundY - lampTop, '#2a3350');
    px(x - 4, lampTop - 3, 8, 4, '#20263a');
    px(x - 4, lampTop - 4, 8, 1, '#2a3350');
    px(x - 3, lampTop - 1, 6, 2, lit ? '#ffe9a8' : '#4a5674');

    if (lit) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      disc(x, groundY + 1, Math.max(8, Math.round(W * 0.07)), '#3d2c0e');
      ctx.restore();
    }
  }

  function inLampLight(x, y) {
    if (!lampLit || y < lampTop) return false;
    var k = Math.min(1, (y - lampTop) / (groundY - lampTop));
    var half = 3 + k * (W * 0.1);
    return Math.abs(x - lampX) < half;
  }

  function drawCat(x, gy) {
    var c = '#0d1119';
    px(x, gy - 7, 1, 1, c);
    px(x + 3, gy - 7, 1, 1, c);
    px(x, gy - 6, 4, 2, c);
    px(x - 1, gy - 4, 6, 3, c);
    px(x + 5, gy - 5, 2, 1, c);
    px(x + 6, gy - 7, 1, 2, c);
    px(x - 2, gy - 1, 2, 1, c);
    px(x + 4, gy - 1, 2, 1, c);
    var blink = Math.floor(t * 0.8) % 6;
    if (blink !== 0) {
      px(x, gy - 6, 1, 1, lampLit ? '#ffd166' : '#9fd0ff');
      px(x + 2, gy - 6, 1, 1, lampLit ? '#ffd166' : '#9fd0ff');
    }
  }

  function drawSnowman(x, gy) {
    px(x - 3, gy - 4, 7, 4, '#eef6ff');
    px(x - 3, gy - 1, 7, 1, '#c3d5ec');
    px(x - 2, gy - 8, 5, 4, '#f6faff');
    px(x - 1, gy - 7, 1, 1, '#1a2436');
    px(x + 1, gy - 7, 1, 1, '#1a2436');
    px(x, gy - 6, 2, 1, '#ff9f43');
    px(x - 4, gy - 3, 2, 1, '#8a5a2b');
    px(x + 3, gy - 3, 2, 1, '#8a5a2b');
    px(x - 3, gy - 9, 7, 1, '#ff5d5d');
    px(x - 1, gy - 11, 3, 2, '#ff5d5d');
  }

  function drawForeground() {
    if (weather.kind === 'snow') {
      drawSnowman(lampX - 26, groundY);
      drawCat(lampX + 17, groundY);
    } else if (weather.kind !== 'rain' && weather.kind !== 'thunder' && weather.kind !== 'fog') {
      drawCat(lampX + 17, groundY);
    }
  }

  function drawParticles() {
    var i;
    if (weather.kind === 'snow') {
      for (i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        var lit = inLampLight(f.x, f.y);
        ctx.globalAlpha = lit ? 0.95 : 0.72;
        px(f.x, f.y, f.size, f.size, lit ? '#fff7d6' : '#e9f2ff');
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (weather.kind === 'rain' || weather.kind === 'thunder') {
      ctx.globalAlpha = 0.5;
      for (i = 0; i < drops.length; i++) {
        var d = drops[i];
        var steps = Math.max(2, Math.round(d.len));
        for (var s = 0; s < steps; s++) {
          px(d.x + Math.round(s * 0.4), d.y + s, 1, 1, '#a8d4ff');
        }
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < splashes.length; i++) {
        var s = splashes[i];
        ctx.globalAlpha = Math.min(1, s.life * 2);
        px(s.x - 1, s.y, 3, 1, '#bfe2ff');
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (weather.kind === 'fog') {
      for (i = 0; i < 4; i++) {
        var yy = groundY - 12 - i * Math.max(6, H * 0.055) + Math.sin(t * 0.3 + i) * 2;
        ctx.globalAlpha = 0.08 + i * 0.02;
        px(Math.sin(t * 0.12 + i) * 10 - 10, yy, W, Math.max(3, Math.round(H * 0.035)), '#dbe6f2');
      }
      ctx.globalAlpha = 1;
    }
  }

  function makeBolt() {
    var x = rnd(W * 0.18, W * 0.82);
    var y = groundY - H * 0.28;
    var pts = [[x, y]];
    var cy = y;
    while (cy < groundY - 6) {
      cy += rnd(4, 9);
      x += rnd(-7, 7);
      pts.push([x, cy]);
    }
    return pts;
  }

  function drawBolt() {
    if (!bolt) return;
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = Math.max(1, Math.round(W / 220));
    ctx.beginPath();
    for (var i = 0; i < bolt.length; i++) {
      if (i === 0) ctx.moveTo(bolt[i][0], bolt[i][1]);
      else ctx.lineTo(bolt[i][0], bolt[i][1]);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function update(dt) {
    var wind = weather.wind || 0;
    var i;

    for (i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.x += (Math.sin(t * f.sp + f.ph) * f.sway + wind * 0.25) * dt;
      if (f.y > groundY + 2) {
        f.y = -3;
        f.x = rnd(0, W);
      }
      if (f.x < -4) f.x = W + 3;
      else if (f.x > W + 4) f.x = -3;
    }

    for (i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.y += d.v * dt;
      d.x += wind * 0.16 * dt;
      if (d.y > groundY) {
        if (splashes.length < 40) splashes.push({ x: d.x, y: groundY - 1, life: 0.3 });
        d.y = rnd(-H * 0.5, -4);
        d.x = rnd(-10, W + 10);
      }
    }

    for (i = splashes.length - 1; i >= 0; i--) {
      splashes[i].life -= dt;
      if (splashes[i].life <= 0) splashes.splice(i, 1);
    }

    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += (0.8 + wind * 0.11) * c.s * dt;
      if (c.x > W + 24) {
        c.x = -24;
        c.y = rnd(4, H * 0.3);
      }
    }

    if (weather.kind === 'thunder') {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flash = 1;
        bolt = makeBolt();
        boltLife = 0.18;
        nextFlash = rnd(3.5, 7);
      }
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
    if (boltLife > 0) boltLife -= dt;
  }

  function draw() {
    var pal = (SKY[weather.kind] || SKY.clear)[weather.isDay ? 'day' : 'night'];
    skyBands(pal[0], pal[1]);

    var night = !weather.isDay;
    var kind = weather.kind;
    var showStars = night && (kind === 'clear' || kind === 'partly');
    if (showStars) drawStars();

    var cx = W * 0.8;
    var portrait = H / W > 1.2;
    var skyY = H * (portrait ? 0.34 : 0.2);
    if (kind === 'clear' || kind === 'partly') {
      var rad = Math.max(6, Math.round(Math.min(W, H) * 0.072));
      if (weather.isDay) drawSun(cx, skyY, rad);
      else drawMoon(cx, skyY - H * 0.01, Math.round(rad * 0.92));
    }

    drawClouds();
    drawFarCity();
    drawCity();
    drawGround();
    drawLamp();
    drawForeground();
    drawParticles();
    if (boltLife > 0) drawBolt();
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.42;
      px(0, 0, W, H, '#eaf2ff');
      ctx.globalAlpha = 1;
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    t += dt;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function resize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var unit = vw < 620 ? 2.6 : 3.2;
    W = Math.max(110, Math.min(430, Math.round(vw / unit)));
    H = Math.max(150, Math.round(W * vh / vw));
    canvas.width = W;
    canvas.height = H;
    groundY = Math.round(H * 0.66);
    lampX = Math.round(W * 0.76);
    lampTop = Math.round(groundY - H * 0.26);
    lampLit = !weather.isDay || weather.kind === 'snow' || weather.kind === 'rain' || weather.kind === 'thunder' || weather.kind === 'fog';
    buildAll();
  }

  function set(next) {
    var w = next || {};
    weather.kind = w.kind || 'clear';
    weather.isDay = !!w.isDay;
    weather.wind = typeof w.wind === 'number' ? w.wind : 6;
    weather.intensity = typeof w.intensity === 'number' ? w.intensity : 1;
    lampLit = !weather.isDay || weather.kind === 'snow' || weather.kind === 'rain' || weather.kind === 'thunder' || weather.kind === 'fog';
    buildClouds();
    buildParticles();
    nextFlash = rnd(2.5, 5);
    flash = 0;
    boltLife = 0;
  }

  function init() {
    resize();
    lastTs = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });
  }

  return { init: init, set: set };
})();
