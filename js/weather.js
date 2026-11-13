/* 天气数据：和风天气（QWeather），支持区县搜索、实时/24小时/7天预报 */
window.Weather = (function () {
  'use strict';

  var HOST = 'nq4eww6n9x.re.qweatherapi.com';
  var KEY = '7b9054ba5b204f53954cb6e789386fd3';
  var BASE = 'https://' + HOST;
  var TZ_DEFAULT = 'Asia/Shanghai';
  var CACHE_TTL = 10 * 60 * 1000;

  var ERRORS = {
    '204': '该地区暂无天气数据',
    '400': '请求参数有误',
    '401': '天气服务认证失败',
    '402': '今日查询额度已用完',
    '403': '天气接口没有访问权限',
    '404': '未找到该地区',
    '429': '请求过于频繁，请稍后再试'
  };

  /* 和风图标代码 → 像素场景类型 */
  function info(icon, text) {
    var n = Number(icon);
    var label = text || '';

    if (n === 100 || n === 150 || n === 900 || n === 901) {
      return { kind: 'clear', text: label || '晴', intensity: 1 };
    }
    if ([101, 102, 103, 151, 152, 153].indexOf(n) >= 0) {
      return { kind: 'partly', text: label || '多云', intensity: 1 };
    }
    if (n === 104 || n === 154) {
      return { kind: 'cloudy', text: label || '阴', intensity: 1 };
    }
    if (n >= 200 && n <= 213) {
      return { kind: 'fog', text: label || '沙尘', intensity: 1.1 };
    }
    if (n >= 300 && n < 400) {
      if (n === 302 || n === 303 || n === 304) {
        return { kind: 'thunder', text: label || '雷阵雨', intensity: 1.2 };
      }
      if (n === 300 || n === 305 || n === 309 || n === 399) {
        return { kind: 'rain', text: label || '小雨', intensity: 0.7 };
      }
      if (n === 306 || n === 314 || n === 315) {
        return { kind: 'rain', text: label || '中雨', intensity: 1 };
      }
      return { kind: 'rain', text: label || '大雨', intensity: 1.5 };
    }
    if (n >= 400 && n < 500) {
      if (n === 404 || n === 405 || n === 406) {
        return { kind: 'snow', text: label || '雨夹雪', intensity: 0.9 };
      }
      if (n === 400 || n === 408) {
        return { kind: 'snow', text: label || '小雪', intensity: 0.7 };
      }
      if (n === 401 || n === 407 || n === 409) {
        return { kind: 'snow', text: label || '中雪', intensity: 1 };
      }
      return { kind: 'snow', text: label || '大雪', intensity: 1.4 };
    }
    if (n >= 500 && n < 600) {
      return { kind: 'fog', text: label || '雾', intensity: 1 };
    }

    if (label.indexOf('雷') >= 0) return { kind: 'thunder', text: label, intensity: 1.2 };
    if (label.indexOf('雪') >= 0) return { kind: 'snow', text: label, intensity: 1 };
    if (label.indexOf('雨') >= 0) return { kind: 'rain', text: label, intensity: 1 };
    if (label.indexOf('雾') >= 0 || label.indexOf('霾') >= 0 ||
        label.indexOf('沙') >= 0 || label.indexOf('尘') >= 0) {
      return { kind: 'fog', text: label, intensity: 1 };
    }
    if (label.indexOf('阴') >= 0) return { kind: 'cloudy', text: label, intensity: 1 };
    if (label.indexOf('晴') >= 0) return { kind: 'clear', text: label, intensity: 1 };
    return { kind: 'partly', text: label || '多云', intensity: 1 };
  }

  function isNightIcon(icon) {
    var n = Number(icon);
    return n >= 150 && n < 200;
  }

  function getJSON(url, timeout, retried) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeout || 10000);
    return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (!retried) return getJSON(url, timeout, true);
        throw err;
      });
  }

  function api(path, params, timeout) {
    var qs = new URLSearchParams(params);
    return getJSON(BASE + path + '?' + qs.toString(), timeout).then(function (d) {
      if (String(d.code) !== '200') {
        var err = new Error(ERRORS[String(d.code)] || ('天气服务错误 ' + d.code));
        err.code = String(d.code);
        throw err;
      }
      return d;
    });
  }

  function geo(location, number) {
    return api('/geo/v2/city/lookup', {
      location: location,
      key: KEY,
      lang: 'zh',
      number: number || 8
    }, 8000).then(function (d) {
      return d.location || [];
    }).catch(function (err) {
      if (err.code === '404' || err.code === '204') return [];
      throw err;
    });
  }

  function reverse(lat, lon) {
    return geo(Number(lon).toFixed(4) + ',' + Number(lat).toFixed(4), 1)
      .then(function (list) {
        if (!list.length) return { name: '当前位置', tz: TZ_DEFAULT };
        var it = list[0];
        var parts = [it.name];
        if (it.adm2 && it.adm2 !== it.name) parts.push(it.adm2);
        if (!it.adm2 && it.adm1) parts.push(it.adm1);
        return { name: parts.join(' · '), tz: it.tz || TZ_DEFAULT };
      })
      .catch(function () {
        return { name: '当前位置', tz: TZ_DEFAULT };
      });
  }

  function searchCity(query) {
    return geo(query, 8).then(function (list) {
      return list.map(function (it) {
        var region = [];
        [it.adm2, it.adm1].forEach(function (v) {
          if (v && v !== it.name && region.indexOf(v) < 0) region.push(v);
        });
        return {
          name: it.name,
          lat: Number(it.lat),
          lon: Number(it.lon),
          tz: it.tz || TZ_DEFAULT,
          region: region.join(' · ')
        };
      });
    });
  }

  function cacheKey(lat, lon) {
    return 'wx:' + Number(lat).toFixed(2) + ',' + Number(lon).toFixed(2);
  }

  function readCache(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var item = JSON.parse(raw);
      if (Date.now() - item.t > CACHE_TTL) return null;
      return item.d;
    } catch (e) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) {}
  }

  function normalize(nowD, h24, d7) {
    var now = nowD.now || {};
    var hlist = h24.hourly || [];
    var dlist = d7.daily || [];
    var ci = info(now.icon, now.text);
    var nowHour = Number(String(now.obsTime || '').slice(11, 13));
    var first = hlist[0] || {};

    var hourly = hlist.map(function (h) {
      var hh = Number(String(h.fxTime).slice(11, 13));
      var hi = info(h.icon, h.text);
      return {
        hour: String(h.fxTime).slice(11, 13),
        temp: Number(h.temp),
        kind: hi.kind,
        text: h.text || hi.text,
        pop: Number(h.pop) || 0,
        isDay: !isNightIcon(h.icon) && hh >= 6 && hh < 18
      };
    });

    var daily = dlist.map(function (d) {
      var di = info(d.iconDay, d.textDay);
      return {
        date: d.fxDate,
        max: Number(d.tempMax),
        min: Number(d.tempMin),
        kind: di.kind,
        text: d.textDay || di.text,
        pop: Number(d.pop) || 0
      };
    });

    return {
      timezone: TZ_DEFAULT,
      current: {
        temp: Number(now.temp),
        feels: Number(now.feelsLike),
        humidity: Number(now.humidity),
        wind: Number(now.windSpeed),
        isDay: !isNightIcon(now.icon) && nowHour >= 6 && nowHour < 18,
        code: now.icon,
        kind: ci.kind,
        text: now.text || ci.text,
        intensity: ci.intensity,
        pop: Number(first.pop) || 0,
        time: now.obsTime
      },
      hourly: hourly,
      daily: daily
    };
  }

  function get(lat, lon) {
    var key = cacheKey(lat, lon);
    var hit = readCache(key);
    if (hit) return Promise.resolve(hit);

    var loc = Number(lon).toFixed(4) + ',' + Number(lat).toFixed(4);
    var params = { location: loc, key: KEY, lang: 'zh' };

    return api('/v7/weather/now', params, 10000).then(function (nowD) {
      return api('/v7/weather/24h', params, 10000).then(function (h24) {
        return api('/v7/weather/7d', params, 10000).then(function (d7) {
          var data = normalize(nowD, h24, d7);
          writeCache(key, data);
          return data;
        });
      });
    });
  }

  return {
    get: get,
    reverse: reverse,
    searchCity: searchCity,
    info: info
  };
})();
