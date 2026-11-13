/* 16x16 像素天气图标：直接在低分辨率画布上按像素绘制，再由 CSS 放大 */
window.PixelIcon = (function () {
  'use strict';

  var C = {
    sun: '#ffd166',
    sunDark: '#f0a43a',
    sunLight: '#ffe9a3',
    cloud: '#eef4ff',
    cloudShade: '#c3d2e8',
    cloudNight: '#4a5878',
    cloudNightShade: '#343f5c',
    rain: '#8fd0ff',
    snow: '#ffffff',
    bolt: '#ffe066',
    fog: '#d3dfeb',
    eye: '#96610a'
  };

  function ctxOf(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function r(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function disc(ctx, cx, cy, rad, color) {
    ctx.fillStyle = color;
    for (var y = -rad; y <= rad; y++) {
      var w = Math.floor(Math.sqrt(rad * rad - y * y));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }

  function sun(ctx, ox, oy, rad) {
    ox = ox || 0;
    oy = oy || 0;
    rad = rad || 4;
    r(ctx, ox + 7, oy, 2, 2, C.sunDark);
    r(ctx, ox + 7, oy + 14, 2, 2, C.sunDark);
    r(ctx, ox, oy + 7, 2, 2, C.sunDark);
    r(ctx, ox + 14, oy + 7, 2, 2, C.sunDark);
    r(ctx, ox + 2, oy + 2, 2, 2, C.sunDark);
    r(ctx, ox + 12, oy + 2, 2, 2, C.sunDark);
    r(ctx, ox + 2, oy + 12, 2, 2, C.sunDark);
    r(ctx, ox + 12, oy + 12, 2, 2, C.sunDark);
    disc(ctx, ox + 8, oy + 8, rad, C.sun);
    r(ctx, ox + 6, oy + 5, 3, 2, C.sunLight);
    r(ctx, ox + 6, oy + 9, 1, 1, C.eye);
    r(ctx, ox + 9, oy + 9, 1, 1, C.eye);
    r(ctx, ox + 7, oy + 11, 2, 1, C.eye);
  }

  var MOON_SPRITE = [
    '................',
    '......xxxx......',
    '....xxxxxx......',
    '...xxxx.........',
    '..xxxx..........',
    '..xxx...........',
    '.xxxx...........',
    '.xxxx...........',
    '.xxxx...........',
    '.xxxx...........',
    '..xxx...........',
    '..xxxx..........',
    '...xxxxxxx......',
    '.....xxxxx......',
    '................',
    '................'
  ];

  function moon(ctx) {
    for (var y = 0; y < MOON_SPRITE.length; y++) {
      var row = MOON_SPRITE[y];
      for (var x = 0; x < row.length; x++) {
        if (row.charAt(x) === 'x') r(ctx, x, y, 1, 1, '#e9f0ff');
      }
    }
    r(ctx, 2, 6, 1, 1, '#c8d8f4');
    r(ctx, 3, 10, 1, 1, '#c8d8f4');
    r(ctx, 4, 2, 1, 1, '#c8d8f4');
  }

  function cloud(ctx, ox, oy, night) {
    var main = night ? C.cloudNight : C.cloud;
    var shade = night ? C.cloudNightShade : C.cloudShade;
    r(ctx, ox + 3, oy + 5, 10, 4, main);
    r(ctx, ox + 5, oy + 3, 6, 3, main);
    r(ctx, ox + 8, oy + 2, 3, 2, main);
    r(ctx, ox + 1, oy + 7, 2, 2, main);
    r(ctx, ox + 12, oy + 6, 2, 2, main);
    r(ctx, ox + 3, oy + 8, 10, 1, shade);
    r(ctx, ox + 1, oy + 8, 2, 1, shade);
  }

  function drops(ctx) {
    r(ctx, 3, 11, 1, 3, C.rain);
    r(ctx, 6, 12, 1, 3, C.rain);
    r(ctx, 9, 11, 1, 2, C.rain);
    r(ctx, 12, 12, 1, 3, C.rain);
  }

  function flakes(ctx) {
    r(ctx, 3, 12, 1, 1, C.snow);
    r(ctx, 6, 11, 1, 1, C.snow);
    r(ctx, 9, 13, 1, 1, C.snow);
    r(ctx, 12, 11, 1, 1, C.snow);
    r(ctx, 7, 14, 1, 1, C.snow);
  }

  function bolt(ctx) {
    r(ctx, 9, 10, 1, 1, C.bolt);
    r(ctx, 9, 11, 1, 1, C.bolt);
    r(ctx, 8, 11, 1, 1, C.bolt);
    r(ctx, 8, 12, 1, 1, C.bolt);
    r(ctx, 7, 12, 1, 1, C.bolt);
    r(ctx, 7, 13, 1, 1, C.bolt);
    r(ctx, 6, 13, 1, 1, C.bolt);
    r(ctx, 6, 14, 1, 1, C.bolt);
  }

  function fog(ctx) {
    r(ctx, 2, 4, 9, 2, C.fog);
    r(ctx, 5, 4, 8, 1, 'rgba(211,223,235,0.6)');
    r(ctx, 3, 7, 11, 1, C.fog);
    r(ctx, 1, 10, 9, 1, C.fog);
    r(ctx, 6, 13, 9, 1, 'rgba(211,223,235,0.65)');
    r(ctx, 4, 15, 6, 1, 'rgba(211,223,235,0.4)');
  }

  function draw(canvas, kind, isDay) {
    if (!canvas) return;
    var ctx = ctxOf(canvas);
    var night = !isDay;
    switch (kind) {
      case 'clear':
        if (night) moon(ctx); else sun(ctx, 0, 0, 4);
        break;
      case 'partly':
        if (night) moon(ctx); else sun(ctx, 0, 0, 3);
        cloud(ctx, 2, 4, night);
        break;
      case 'cloudy':
        cloud(ctx, 2, 4, night);
        break;
      case 'rain':
        cloud(ctx, 2, 2, night);
        drops(ctx);
        break;
      case 'snow':
        cloud(ctx, 2, 2, night);
        flakes(ctx);
        break;
      case 'thunder':
        cloud(ctx, 2, 2, night);
        bolt(ctx);
        break;
      case 'fog':
        cloud(ctx, 2, 2, night);
        fog(ctx);
        break;
      default:
        cloud(ctx, 2, 4, night);
    }
  }

  return { draw: draw };
})();
