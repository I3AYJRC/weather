/* 天气数据：Open-Meteo（无需 API Key），含反向地理编码与城市搜索 */
window.Weather = (function () {
  'use strict';

  var FORECAST = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  var REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

  function info(code) {
    code = Number(code);
    if (code === 0) return { kind: 'clear', text: '晴', intensity: 1 };
    if (code === 1) return { kind: 'partly', text: '晴间多云', intensity: 1 };
    if (code === 2) return { kind: 'partly', text: '多云', intensity: 1 };
    if (code === 3) return { kind: 'cloudy', text: '阴', intensity: 1 };
    if (code === 45 || code === 48) return { kind: 'fog', text: '雾', intensity: 1 };
    if (code >= 51 && code <= 57) return { kind: 'rain', text: '毛毛雨', intensity: 0.55 };
    if (code === 61) return { kind: 'rain', text: '小雨', intensity: 0.7 };
    if (code === 63) return { kind: 'rain', text: '中雨', intensity: 1 };
    if (code === 65) return { kind: 'rain', text: '大雨', intensity: 1.5 };
    if (code === 66 || code === 67) return { kind: 'rain', text: '冻雨', intensity: 1.1 };
    if (code === 71) return { kind: 'snow', text: '小雪', intensity: 0.7 };
    if (code === 73) return { kind: 'snow', text: '中雪', intensity: 1 };
    if (code === 75) return { kind: 'snow', text: '大雪', intensity: 1.5 };
    if (code === 77) return { kind: 'snow', text: '米雪', intensity: 0.6 };
    if (code >= 80 && code <= 82) return { kind: 'rain', text: '阵雨', intensity: 1.1 };
    if (code === 85) return { kind: 'snow', text: '阵雪', intensity: 0.9 };
    if (code === 86) return { kind: 'snow', text: '强阵雪', intensity: 1.4 };
    if (code >= 95) return { kind: 'thunder', text: '雷阵雨', intensity: 1.2 };
    return { kind: 'cloudy', text: '多云', intensity: 1 };
  }

  function getJSON(url, timeout) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeout || 12000);
    return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        return data;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function reverse(lat, lon) {
    var url = REVERSE + '?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=zh';
    return getJSON(url, 8000)
      .then(function (d) {
        var city = d.city || d.locality || d.principalSubdivision || '';
        var region = d.principalSubdivision || '';
        var parts = [];
        if (city) parts.push(city);
        if (region && region !== city) parts.push(region);
        return parts.join(' · ') || '当前位置';
      })
      .catch(function () {
        return '当前位置';
      });
  }

  function searchCity(query) {
    var url = GEOCODE + '?name=' + encodeURIComponent(query) + '&count=6&language=zh&format=json';
    return getJSON(url, 10000).then(function (d) {
      return (d.results || []).map(function (r) {
        return {
          name: r.name,
          lat: r.latitude,
          lon: r.longitude,
          region: [r.admin1, r.country].filter(Boolean).join(' · ')
        };
      });
    });
  }

  function normalize(d) {
    var cur = d.current;
    var ci = info(cur.weather_code);
    var hourlyTimes = d.hourly.time;
    var key = String(cur.time).slice(0, 13);
    var idx = hourlyTimes.findIndex(function (v) { return v.slice(0, 13) === key; });
    if (idx < 0) idx = 0;

    var popArr = d.hourly.precipitation_probability || [];
    var hourly = [];
    var end = Math.min(idx + 24, hourlyTimes.length);
    for (var i = idx; i < end; i++) {
      var hi = info(d.hourly.weather_code[i]);
      hourly.push({
        hour: hourlyTimes[i].slice(11, 13),
        temp: d.hourly.temperature_2m[i],
        kind: hi.kind,
        text: hi.text,
        pop: typeof popArr[i] === 'number' ? popArr[i] : 0,
        isDay: d.hourly.is_day[i] === 1
      });
    }

    var dailyPop = d.daily.precipitation_probability_max || [];
    var daily = d.daily.time.map(function (date, i) {
      var di = info(d.daily.weather_code[i]);
      return {
        date: date,
        max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i],
        kind: di.kind,
        text: di.text,
        pop: typeof dailyPop[i] === 'number' ? dailyPop[i] : 0
      };
    });

    return {
      timezone: d.timezone,
      current: {
        temp: cur.temperature_2m,
        feels: cur.apparent_temperature,
        humidity: cur.relative_humidity_2m,
        wind: cur.wind_speed_10m,
        isDay: cur.is_day === 1,
        code: cur.weather_code,
        kind: ci.kind,
        text: ci.text,
        intensity: ci.intensity,
        pop: typeof popArr[idx] === 'number' ? popArr[idx] : 0,
        time: cur.time
      },
      hourly: hourly,
      daily: daily
    };
  }

  function get(lat, lon) {
    var params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '7',
      wind_speed_unit: 'kmh'
    });
    return getJSON(FORECAST + '?' + params.toString(), 15000).then(normalize);
  }

  return {
    get: get,
    reverse: reverse,
    searchCity: searchCity,
    info: info
  };
})();
