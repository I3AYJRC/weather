/* 页面逻辑：定位、城市搜索、天气渲染与像素场景联动 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var el = {
    city: $('#city'),
    time: $('#localtime'),
    temp: $('#temp'),
    desc: $('#desc'),
    feels: $('#feels'),
    humidity: $('#humidity'),
    wind: $('#wind'),
    pop: $('#pop'),
    nowIcon: $('#nowIcon'),
    hourly: $('#hourly'),
    daily: $('#daily'),
    overlay: $('#startOverlay'),
    startText: $('#startText'),
    loader: $('#loader'),
    btnAllow: $('#btnAllow'),
    btnPick: $('#btnPick'),
    search: $('#searchOverlay'),
    form: $('#searchForm'),
    input: $('#cityInput'),
    results: $('#results'),
    toast: $('#toast')
  };

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var clockTimer = null;
  var toastTimer = null;
  var current = null;

  var PREVIEW_TEXT = {
    clear: '晴', partly: '多云', cloudy: '阴', rain: '中雨',
    snow: '中雪', thunder: '雷阵雨', fog: '雾'
  };

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('show');
    }, 3200);
  }

  function showStart(msg) {
    el.startText.textContent = msg || '允许定位，查看你所在城市的像素天气';
    el.loader.hidden = true;
    el.btnAllow.hidden = false;
    el.btnPick.hidden = false;
    el.overlay.hidden = false;
  }

  function busy(msg) {
    el.startText.textContent = msg || '正在获取天气…';
    el.loader.hidden = false;
    el.btnAllow.hidden = true;
    el.btnPick.hidden = true;
    el.overlay.hidden = false;
  }

  function hideStart() {
    el.overlay.hidden = true;
  }

  function openSearch() {
    el.search.hidden = false;
    setTimeout(function () { el.input.focus(); }, 60);
  }

  function closeSearch() {
    el.search.hidden = true;
  }

  function weekOf(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return WEEK[d.getUTCDay()];
  }

  function makeIcon(kind, isDay, cls) {
    var cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    cv.className = cls;
    PixelIcon.draw(cv, kind, isDay);
    return cv;
  }

  function renderHourly(list) {
    el.hourly.innerHTML = '';
    list.forEach(function (h, i) {
      var card = document.createElement('div');
      card.className = 'hour-card' + (i === 0 ? ' is-now' : '');

      var time = document.createElement('div');
      time.className = 'h-time';
      time.textContent = i === 0 ? '现在' : h.hour + '时';

      var temp = document.createElement('div');
      temp.className = 'h-temp';
      temp.textContent = Math.round(h.temp) + '°';

      var pop = document.createElement('div');
      pop.className = 'h-pop';
      pop.textContent = h.pop >= 20 ? h.pop + '%' : '';

      card.appendChild(time);
      card.appendChild(makeIcon(h.kind, h.isDay, 'h-icon'));
      card.appendChild(temp);
      card.appendChild(pop);
      el.hourly.appendChild(card);
    });
  }

  function renderDaily(list) {
    el.daily.innerHTML = '';
    list.forEach(function (d, i) {
      var card = document.createElement('div');
      card.className = 'day-card';

      var day = document.createElement('div');
      day.className = 'd-day';
      day.textContent = i === 0 ? '今天' : i === 1 ? '明天' : weekOf(d.date);

      var temp = document.createElement('div');
      temp.className = 'd-temp';
      temp.innerHTML = Math.round(d.max) + '°<span>' + Math.round(d.min) + '°</span>';

      card.appendChild(day);
      card.appendChild(makeIcon(d.kind, true, 'd-icon'));
      card.appendChild(temp);
      el.daily.appendChild(card);
    });
  }

  function startClock(tz) {
    clearInterval(clockTimer);
    var tick = function () {
      try {
        var now = new Date();
        var time = new Intl.DateTimeFormat('zh-CN', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).format(now);
        var date = new Intl.DateTimeFormat('zh-CN', {
          timeZone: tz, month: '2-digit', day: '2-digit'
        }).format(now);
        el.time.textContent = date.replace('/', '.') + ' ' + time;
      } catch (e) {
        el.time.textContent = '';
      }
    };
    tick();
    clockTimer = setInterval(tick, 10000);
  }

  function render(data) {
    current = data;
    var c = data.current;

    el.city.textContent = data.place || '当前位置';
    el.temp.textContent = Math.round(c.temp);
    el.desc.textContent = c.text;
    el.feels.textContent = Math.round(c.feels) + '°';
    el.humidity.textContent = Math.round(c.humidity) + '%';
    el.wind.textContent = Math.round(c.wind) + ' km/h';
    el.pop.textContent = Math.round(c.pop) + '%';

    PixelIcon.draw(el.nowIcon, c.kind, c.isDay);
    renderHourly(data.hourly);
    renderDaily(data.daily);

    Scene.set({ kind: c.kind, isDay: c.isDay, wind: c.wind, intensity: c.intensity });
    startClock(data.timezone || 'Asia/Shanghai');
    document.title = (data.place || '当前位置') + ' · 像素天气';
  }

  function load(lat, lon, name) {
    busy('正在查询天气…');
    var placeTask = name ? Promise.resolve(name) : Weather.reverse(lat, lon);
    Promise.all([Weather.get(lat, lon), placeTask])
      .then(function (res) {
        var data = res[0];
        data.place = res[1];
        render(data);
        hideStart();
        closeSearch();
      })
      .catch(function (err) {
        console.error(err);
        showStart('天气获取失败，请检查网络后重试');
        toast('天气数据获取失败，请稍后重试');
      });
  }

  function locate() {
    if (!navigator.geolocation) {
      toast('当前浏览器不支持定位，请手动选择城市');
      openSearch();
      return;
    }
    busy('正在获取位置…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        load(pos.coords.latitude, pos.coords.longitude, '');
      },
      function (err) {
        if (err.code === 1) {
          showStart('定位权限被拒绝，可以手动选择城市');
          openSearch();
          toast('定位被拒绝，请手动选择城市');
        } else {
          showStart('定位超时，请重试或手动选择城市');
          toast('定位失败，请重试');
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  }

  function renderResults(list) {
    el.results.innerHTML = '';
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '没有找到这个城市，换个写法试试';
      el.results.appendChild(li);
      return;
    }
    list.forEach(function (item) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.name;
      if (item.region) {
        var small = document.createElement('small');
        small.textContent = item.region;
        btn.appendChild(small);
      }
      btn.addEventListener('click', function () {
        closeSearch();
        load(item.lat, item.lon, item.name);
      });
      li.appendChild(btn);
      el.results.appendChild(li);
    });
  }

  function searchAndLoad(query) {
    el.results.innerHTML = '<li class="empty">搜索中…</li>';
    Weather.searchCity(query)
      .then(function (list) {
        if (!list.length) {
          renderResults([]);
          return;
        }
        load(list[0].lat, list[0].lon, list[0].name);
      })
      .catch(function () {
        renderResults([]);
        toast('城市搜索失败，请稍后重试');
      });
  }

  function previewData(kind, isDay) {
    var base = kind === 'snow' ? (isDay ? -3 : -6) : (isDay ? 18 : 10);
    var now = new Date();
    var hourly = [];
    var i;
    for (i = 0; i < 24; i++) {
      var h = new Date(now.getTime() + i * 3600000);
      hourly.push({
        hour: String(h.getHours()).padStart(2, '0'),
        temp: base + Math.sin(i / 4) * 3,
        kind: kind,
        text: PREVIEW_TEXT[kind],
        pop: kind === 'rain' || kind === 'snow' ? 70 : 10,
        isDay: h.getHours() >= 7 && h.getHours() < 18
      });
    }
    var daily = [];
    for (i = 0; i < 7; i++) {
      var d = new Date(now.getTime() + i * 86400000);
      daily.push({
        date: d.toISOString().slice(0, 10),
        max: base + 4,
        min: base - 4,
        kind: kind,
        text: PREVIEW_TEXT[kind],
        pop: 30
      });
    }
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      place: '演示城市',
      current: {
        temp: base,
        feels: base - 2,
        humidity: kind === 'snow' ? 78 : 64,
        wind: 12,
        isDay: isDay,
        kind: kind,
        text: PREVIEW_TEXT[kind],
        intensity: 1,
        pop: 60
      },
      hourly: hourly,
      daily: daily
    };
  }

  function bindEvents() {
    el.btnAllow.addEventListener('click', locate);
    el.btnPick.addEventListener('click', openSearch);
    $('#btnLocate').addEventListener('click', locate);
    $('#btnSearch').addEventListener('click', openSearch);
    $('#btnCloseSearch').addEventListener('click', closeSearch);

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = el.input.value.trim();
      if (!q) return;
      el.results.innerHTML = '<li class="empty">搜索中…</li>';
      Weather.searchCity(q)
        .then(renderResults)
        .catch(function () {
          renderResults([]);
          toast('城市搜索失败，请稍后重试');
        });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
    });
  }

  function init() {
    var localHour = new Date().getHours();
    Scene.init();
    Scene.set({
      kind: 'clear',
      isDay: localHour >= 7 && localHour < 18,
      wind: 6,
      intensity: 1
    });
    bindEvents();
    showStart();

    var q = new URLSearchParams(location.search);
    if (q.has('preview')) {
      var kind = q.get('preview');
      if (!PREVIEW_TEXT[kind]) kind = 'snow';
      render(previewData(kind, q.get('day') === '1'));
      hideStart();
      return;
    }
    if (q.has('lat') && q.has('lon')) {
      load(Number(q.get('lat')), Number(q.get('lon')), q.get('name') || '');
      return;
    }
    if (q.has('city')) {
      searchAndLoad(q.get('city'));
      return;
    }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(function (p) {
          if (p.state === 'granted') locate();
        })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
