(function () {
  'use strict';

  var STORAGE_KEY = 'riji.data.v1';
  var APP_VERSION = '1.4.0';
  var storageMigrated = false;
  var TYPES = {
    item: {
      label: '高价物品', short: '物品', action: '按天分摊',
      icon: 'i-box', color: '#2e7d63', soft: '#e2ede7',
      desc: '按购买价 ÷ 天数'
    },
    bill: {
      label: '周期账单', short: '账单', action: '逐笔记录',
      icon: 'i-drop', color: '#b9613d', soft: '#f7e7de',
      desc: '水电燃气逐笔记'
    },
    fixed: {
      label: '固定支出', short: '固定', action: '按期记录',
      icon: 'i-calendar', color: '#6b5b95', soft: '#ece8f5',
      desc: '房租保险等'
    },
    income: {
      label: '收入', short: '收入', action: '按期记录',
      icon: 'i-wallet', color: '#a27616', soft: '#f4ecd5',
      desc: '工资等稳定收入'
    }
  };
  var CYCLES = {
    week: { label: '每周', short: '周', months: 0, days: 7 },
    month: { label: '每月', short: '月', months: 1, days: 0 },
    quarter: { label: '每季度', short: '季', months: 3, days: 0 },
    year: { label: '每年', short: '年', months: 12, days: 0 }
  };
  var BILL_CYCLES = {
    month: '每月',
    quarter: '每季度',
    year: '每年',
    irregular: '不定期'
  };
  var FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'item', label: '物品' },
    { key: 'bill', label: '账单' },
    { key: 'fixed', label: '固定' },
    { key: 'income', label: '收入' }
  ];

  var data = loadData();
  var ui = {
    tab: 'home',
    filter: 'all',
    analysisMode: '6m',
    analysisDay: '',
    analysisMonth: '',
    analysisEndMonth: '',
    analysisYear: new Date().getFullYear(),
    analysisSeries: 'expense',
    analysisChartType: 'line',
    breakdownScope: 'all',
    billChartMode: 'entry',
    recurringChartMode: 'cumulative',
    overlays: [],
    detailId: null,
    formProjectId: null,
    formType: 'item',
    formDraft: {},
    entryProjectId: null,
    entryId: null,
    dialogEl: null,
    pendingConfirm: null,
    toastTimer: null
  };

  /* ------------------------------------------------------------------ */
  /* 基础工具                                                            */
  /* ------------------------------------------------------------------ */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function isoFromDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseISO(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var parts = s.split('-');
    var y = +parts[0], m = +parts[1], d = +parts[2];
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function validISO(s) { return !!parseISO(s); }
  function dayDiff(a, b) {
    var A = parseISO(a), B = parseISO(b);
    if (!A || !B) return 0;
    return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
  }
  function addDaysISO(s, n) {
    var d = parseISO(s);
    if (!d) return s;
    d.setDate(d.getDate() + n);
    return isoFromDate(d);
  }
  function addMonthsISO(s, n) {
    var d = parseISO(s);
    if (!d) return s;
    var day = d.getDate();
    var target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, maxDay));
    return isoFromDate(target);
  }
  function addYearsISO(s, n) {
    var d = parseISO(s);
    if (!d) return s;
    var target = new Date(d.getFullYear() + n, d.getMonth(), 1);
    var maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), maxDay));
    return isoFromDate(target);
  }
  function addCycleISO(s, cycle, n) {
    if (cycle === 'week') return addDaysISO(s, n * 7);
    if (cycle === 'month') return addMonthsISO(s, n);
    if (cycle === 'quarter') return addMonthsISO(s, n * 3);
    if (cycle === 'year') return addYearsISO(s, n);
    return s;
  }
  function monthKey(s) { return s ? s.slice(0, 7) : ''; }
  function currentMonthKey() { return todayISO().slice(0, 7); }
  function monthOffsetKey(offset, base) {
    var d = parseISO((base || todayISO()).slice(0, 7) + '-01');
    d.setMonth(d.getMonth() + offset);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function monthText(key, withYear) {
    if (!key) return '';
    var p = key.split('-');
    return (withYear === false ? '' : p[0] + ' 年 ') + (+p[1]) + ' 月';
  }
  function monthEndISO(key) {
    var d = parseISO(key + '-01');
    if (!d) return '';
    return isoFromDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  function fullDateText(s) {
    var d = parseISO(s);
    return d ? (d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日') : s;
  }
  function monthShort(key) {
    var p = key.split('-');
    return (+p[1]) + '月';
  }
  function shortDate(s) {
    var d = parseISO(s);
    return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
  }
  function shortDateTime(s) {
    var d = parseISO(s);
    return d ? (d.getMonth() + 1) + '/' + d.getDate() : '';
  }
  function chartDateLabel(s, spanDays) {
    var d = parseISO(s);
    if (!d) return '';
    if (spanDays > 180) return String(d.getFullYear()).slice(2) + '/' + (d.getMonth() + 1);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function weekday(s) {
    var d = parseISO(s);
    return d ? '日一二三四五六'.charAt(d.getDay()) : '';
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) {
    var n = Number(String(v == null ? '' : v).replace(/,/g, '').trim());
    return isFinite(n) ? n : NaN;
  }
  function money(n, opts) {
    opts = opts || {};
    n = Number(n) || 0;
    var digits = opts.digits;
    if (digits == null) digits = Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2;
    var abs = Math.abs(n).toLocaleString('zh-CN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    return (n < 0 ? '-¥' : '¥') + abs;
  }
  function analysisMoney(n) {
    n = Number(n) || 0;
    var abs = Math.abs(n);
    var sign = n < 0 ? '-¥' : '¥';
    if (abs >= 100000000) return sign + (abs / 100000000).toFixed(2).replace(/\.?0+$/, '') + '亿';
    if (abs >= 1000000) return sign + (abs / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return money(n);
  }
  function axisMoney(n, digits) {
    if (digits != null) {
      return n.toLocaleString('zh-CN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
    }
    var abs = Math.abs(n);
    if (abs >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (abs >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (abs >= 1000) return Math.round(n).toLocaleString('zh-CN');
    return String(Math.round(n * 10) / 10);
  }
  function niceMax(n) {
    if (!isFinite(n) || n <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(n) / Math.LN10));
    var norm = n / mag;
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) {
      if (norm <= steps[i]) return steps[i] * mag;
    }
    return 10 * mag;
  }
  function niceStep(span) {
    if (!isFinite(span) || span <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(span) / Math.LN10));
    var norm = span / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }
  function chartRange(values, opts) {
    opts = opts || {};
    var clean = (values || []).filter(function (v) { return isFinite(v); });
    if (opts.ignoreZeros) {
      var positives = clean.filter(function (v) { return v > 0; });
      if (positives.length) clean = positives;
    }
    if (!clean.length) clean = [0, 1];
    var dataMin = Math.min.apply(null, clean);
    var dataMax = Math.max.apply(null, clean);
    if (opts.zeroBaseline !== false) {
      var top = niceMax(dataMax);
      if (top <= 0) top = 1;
      var zeroTicks = [];
      for (var z = 0; z <= 5; z++) zeroTicks.push(top * z / 5);
      return { min: 0, max: top, ticks: zeroTicks, decimals: Math.abs(top - Math.round(top)) < 1e-9 ? 0 : 1, compact: true };
    }
    if (dataMax === dataMin) {
      var flatPad = Math.max(Math.abs(dataMax) * 0.05, 0.1);
      dataMin -= flatPad;
      dataMax += flatPad;
    }
    var span = dataMax - dataMin;
    var pad = Math.max(span * 0.14, Math.abs(dataMax) * 0.008, 0.001);
    var step = niceStep((span + pad * 2) / 4);
    var lo = Math.floor((dataMin - pad) / step) * step;
    var hi = Math.ceil((dataMax + pad) / step) * step;
    if (lo < 0) lo = 0;
    if (hi <= lo) hi = lo + step;
    var ticks = [];
    for (var v = lo; v <= hi + step * 0.25; v += step) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    if (ticks.length < 3) {
      step = step / 2;
      ticks = [];
      for (var t2 = lo; t2 <= hi + step * 0.25; t2 += step) {
        ticks.push(Math.round(t2 * 1e6) / 1e6);
      }
    }
    var wholeStep = Math.abs(step - Math.round(step)) < 1e-9;
    var decimals = wholeStep && step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return { min: lo, max: hi, ticks: ticks, decimals: decimals };
  }
  function elapsedText(start, end) {
    var s = parseISO(start), e = parseISO(end || todayISO());
    if (!s || !e || e < s) return '尚未开始';
    var months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    var anchor = parseISO(addMonthsISO(start, months));
    if (anchor > e) {
      months -= 1;
      anchor = parseISO(addMonthsISO(start, months));
    }
    var days = dayDiff(isoFromDate(anchor), isoFromDate(e));
    var y = Math.floor(months / 12);
    var m = months % 12;
    var parts = [];
    if (y > 0) parts.push(y + ' 年');
    if (m > 0) parts.push(m + ' 个月');
    if (days > 0) parts.push(days + ' 天');
    if (!parts.length) return '今天';
    return parts.join(' ');
  }
  function cycleText(cycle) { return (CYCLES[cycle] || CYCLES.month).label; }
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#' + name + '"/></svg>';
  }
  function typeVars(type) {
    var t = TYPES[type] || TYPES.item;
    return '--type-color:' + t.color + ';--type-soft:' + t.soft;
  }

  /* ------------------------------------------------------------------ */
  /* 数据存取与结构清洗                                                   */
  /* ------------------------------------------------------------------ */

  function defaultData() { return { version: 1, projects: [] }; }

  function readLocalRaw() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
  }
  function parseStored(raw) {
    if (!raw) return null;
    try { return normalizeData(JSON.parse(raw)); } catch (e) { return null; }
  }
  function loadData() {
    var dbRaw = '';
    try {
      if (window.Android && typeof window.Android.storageLoad === 'function') {
        dbRaw = window.Android.storageLoad() || '';
      }
    } catch (e) {
      dbRaw = '';
    }
    if (dbRaw) {
      var dbData = parseStored(dbRaw);
      if (dbData) {
        try { localStorage.setItem(STORAGE_KEY, dbRaw); } catch (e) {}
        return dbData;
      }
    }
    var localRaw = readLocalRaw();
    if (!localRaw) return defaultData();
    var localData = parseStored(localRaw);
    if (!localData) return defaultData();
    if (window.Android && typeof window.Android.storageSave === 'function') {
      try {
        if (window.Android.storageSave(localRaw) !== false) storageMigrated = true;
      } catch (e) {}
    }
    return localData;
  }
  function saveData() {
    var json;
    try { json = JSON.stringify(data); } catch (e) { json = ''; }
    if (!json) {
      toast('保存失败：数据格式异常');
      return false;
    }
    var dbOk = true;
    var hasDb = window.Android && typeof window.Android.storageSave === 'function';
    if (hasDb) {
      try { dbOk = window.Android.storageSave(json) !== false; } catch (e) { dbOk = false; }
    }
    var cacheOk = true;
    try { localStorage.setItem(STORAGE_KEY, json); } catch (e) { cacheOk = false; }
    if (!dbOk && !cacheOk) {
      toast('保存失败：本地存储空间可能已满');
      return false;
    }
    if (hasDb && !dbOk) toast('数据库写入失败，已暂存到 WebView 缓存');
    return true;
  }
  function cleanText(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 200);
  }
  function safeAmount(v) {
    var n = num(v);
    if (!isFinite(n) || n < 0) return 0;
    return round2(Math.min(n, 999999999));
  }
  function normalizeEntries(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    var seen = {};
    list.slice(0, 2000).forEach(function (e) {
      if (!e || !validISO(e.date)) return;
      var amount = safeAmount(e.amount);
      if (amount <= 0) return;
      var id = cleanText(e.id, 80) || uid('e');
      if (seen[id]) id = uid('e');
      seen[id] = true;
      out.push({
        id: id,
        date: e.date,
        amount: amount,
        note: cleanText(e.note, 80)
      });
    });
    out.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return out;
  }
  function normalizeData(raw) {
    var out = defaultData();
    if (!raw || !Array.isArray(raw.projects)) return out;
    var seen = {};
    raw.projects.slice(0, 300).forEach(function (p) {
      if (!p || !TYPES[p.type]) return;
      var id = cleanText(p.id, 80) || uid('p');
      if (seen[id]) id = uid('p');
      seen[id] = true;
      var base = {
        id: id,
        type: p.type,
        name: cleanText(p.name, 40) || TYPES[p.type].label,
        note: cleanText(p.note, 120),
        createdAt: Number(p.createdAt) || Date.now(),
        updatedAt: Number(p.updatedAt) || Date.now()
      };
      if (p.type === 'item') {
        base.price = safeAmount(p.price);
        base.purchaseDate = validISO(p.purchaseDate) ? p.purchaseDate : todayISO();
        if (base.price <= 0) return;
      } else if (p.type === 'bill') {
        base.cycle = BILL_CYCLES[p.cycle] ? p.cycle : 'month';
        base.entries = normalizeEntries(p.entries);
      } else {
        base.amount = safeAmount(p.amount);
        base.startDate = validISO(p.startDate) ? p.startDate : todayISO();
        base.cycle = CYCLES[p.cycle] ? p.cycle : 'month';
        base.entries = normalizeEntries(p.entries);
        if (p.type === 'income') base.incomeKind = p.incomeKind === 'other' ? 'other' : 'salary';
        if (base.amount <= 0) return;
      }
      out.projects.push(base);
    });
    return out;
  }

  function getProject(id) {
    for (var i = 0; i < data.projects.length; i++) {
      if (data.projects[i].id === id) return data.projects[i];
    }
    return null;
  }
  function allEntries() {
    var rows = [];
    data.projects.forEach(function (p) {
      (p.entries || []).forEach(function (e) { rows.push({ p: p, e: e }); });
    });
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* 业务计算                                                            */
  /* ------------------------------------------------------------------ */

  function dueDates(p, limit) {
    var today = todayISO();
    if (!p || !p.startDate || p.startDate > today) return [];
    var max = limit || 500;
    var dates = [];
    var step = p.cycle === 'week' ? 1 : p.cycle === 'quarter' ? 3 : p.cycle === 'year' ? 12 : 1;
    for (var i = 0; i < max; i++) {
      var d = p.cycle === 'week'
        ? addDaysISO(p.startDate, i * 7)
        : addMonthsISO(p.startDate, i * step);
      if (d > today) break;
      dates.push(d);
    }
    return dates;
  }
  function periodsElapsed(p) {
    if (!p || !p.startDate || p.startDate > todayISO()) return 0;
    var n = 0;
    var step = p.cycle === 'week' ? 1 : p.cycle === 'quarter' ? 3 : p.cycle === 'year' ? 12 : 1;
    for (var i = 0; i < 1000; i++) {
      var d = p.cycle === 'week'
        ? addDaysISO(p.startDate, i * 7)
        : addMonthsISO(p.startDate, i * step);
      if (d > todayISO()) break;
      n++;
    }
    return n;
  }
  function nextDueDate(p) {
    if (!p || !p.startDate) return '';
    var n = periodsElapsed(p);
    var step = p.cycle === 'week' ? 1 : p.cycle === 'quarter' ? 3 : p.cycle === 'year' ? 12 : 1;
    return p.cycle === 'week' ? addDaysISO(p.startDate, n * 7) : addMonthsISO(p.startDate, n * step);
  }
  function sumEntries(p) {
    return round2((p.entries || []).reduce(function (s, e) { return s + e.amount; }, 0));
  }
  function latestEntry(p) {
    var list = (p.entries || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    return list[0] || null;
  }
  function projectStats(p) {
    if (p.type === 'item') {
      var days = Math.max(0, dayDiff(p.purchaseDate, todayISO()) + 1);
      var used = Math.max(1, days);
      var daily = p.price / used;
      return {
        kind: 'item', price: p.price, days: days, usedDays: used,
        daily: daily, elapsed: days > 0 ? elapsedText(p.purchaseDate) : '尚未开始'
      };
    }
    var entries = (p.entries || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var total = round2(entries.reduce(function (s, e) { return s + e.amount; }, 0));
    var latest = entries.length ? entries[entries.length - 1] : null;
    if (p.type === 'bill') {
      var months = {};
      entries.forEach(function (e) { months[e.date.slice(0, 7)] = true; });
      var monthCount = Object.keys(months).length;
      var monthlyAvg = total / Math.max(1, monthCount);
      return {
        kind: 'bill', total: total, count: entries.length, latest: latest,
        months: monthCount, monthlyAvg: monthlyAvg,
        dailyAvg: monthlyAvg / 30.44
      };
    }
    var periods = periodsElapsed(p);
    var expected = round2(periods * p.amount);
    var coverage = Math.min(periods, entries.length);
    return {
      kind: p.type,
      total: total, count: entries.length, latest: latest,
      periods: periods, expected: expected, actual: total,
      coverage: coverage, missing: Math.max(0, periods - entries.length),
      elapsed: elapsedText(p.startDate),
      nextDue: periods ? nextDueDate(p) : p.startDate
    };
  }
  function monthStats(key) {
    var out = { income: 0, expense: 0, itemExpense: 0, billExpense: 0, fixedExpense: 0, incomeCount: 0, expenseCount: 0 };
    data.projects.forEach(function (p) {
      if (p.type === 'item') {
        if (monthKey(p.purchaseDate) === key) {
          out.expense += p.price;
          out.itemExpense += p.price;
          out.expenseCount += 1;
        }
        return;
      }
      (p.entries || []).forEach(function (e) {
        if (monthKey(e.date) !== key) return;
        if (p.type === 'income') {
          out.income += e.amount;
          out.incomeCount += 1;
        } else {
          out.expense += e.amount;
          out.expenseCount += 1;
          if (p.type === 'bill') out.billExpense += e.amount;
          else out.fixedExpense += e.amount;
        }
      });
    });
    Object.keys(out).forEach(function (k) { if (k !== 'incomeCount' && k !== 'expenseCount') out[k] = round2(out[k]); });
    return out;
  }
  function todayItemDaily() {
    var total = 0;
    data.projects.forEach(function (p) {
      if (p.type !== 'item') return;
      var st = projectStats(p);
      if (st.days > 0) total += st.daily;
    });
    return round2(total);
  }
  function totalEntryCount() {
    return data.projects.reduce(function (n, p) { return n + (p.entries ? p.entries.length : 0); }, 0);
  }
  function sortedProjects() {
    return data.projects.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }

  /* ------------------------------------------------------------------ */
  /* 小图表                                                              */
  /* ------------------------------------------------------------------ */

  function sparkline(values, color) {
    values = (values || []).filter(function (v) { return isFinite(v); });
    if (!values.length) values = [0, 0];
    if (values.length === 1) values = [values[0], values[0]];
    var w = 61, h = 29, pad = 2;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (max === min) { max = min + 1; min = min - 0.5; }
    var pts = values.map(function (v, i) {
      var x = pad + (w - pad * 2) * (i / (values.length - 1));
      var y = pad + (h - pad * 2) * (1 - (v - min) / (max - min));
      return [x, y];
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
    var area = line + ' L' + pts[pts.length - 1][0].toFixed(2) + ' ' + (h - 1) + ' L' + pts[0][0].toFixed(2) + ' ' + (h - 1) + ' Z';
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<path d="' + area + '" fill="' + color + '" opacity=".09"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="2.2" fill="' + color + '"/></svg>';
  }

  function chartBase() {
    return '<svg viewBox="0 0 640 250" role="img" aria-label="收支趋势图" preserveAspectRatio="xMidYMid meet">';
  }
  function lineChartSVG(series, opts) {
    opts = opts || {};
    var W = 640, H = 250, L = 48, R = 14, T = 16, B = 32;
    var all = [];
    series.forEach(function (s) {
      (s.points || []).forEach(function (p) { all.push(p); });
    });
    if (!all.length) return '';
    var range = chartRange(all.map(function (p) { return p.value; }), {
      zeroBaseline: !opts.autoRange,
      ignoreZeros: !!opts.ignoreZeros
    });
    var minT = Math.min.apply(null, all.map(function (p) { return Date.parse(p.date + 'T00:00:00'); }));
    var maxT = Math.max.apply(null, all.map(function (p) { return Date.parse(p.date + 'T00:00:00'); }));
    var spanDays = Math.round((maxT - minT) / 86400000);
    var x = function (d) {
      var t = Date.parse(d + 'T00:00:00');
      if (maxT === minT) return L + (W - L - R) / 2;
      return L + (t - minT) / (maxT - minT) * (W - L - R);
    };
    var y = function (v) {
      var pct = (v - range.min) / (range.max - range.min);
      return T + (H - T - B) * (1 - Math.max(0, Math.min(1, pct)));
    };
    var grid = '';
    range.ticks.forEach(function (gv) {
      var gy = y(gv);
      grid += '<line class="chart-grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text class="chart-axis" x="' + (L - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' + axisMoney(gv, range.decimals) + '</text>';
    });
    var labels = '';
    if (maxT === minT) {
      var onlyDate = new Date(minT);
      labels = '<text class="chart-axis" x="' + ((L + W - R) / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + (onlyDate.getFullYear() + '/' + (onlyDate.getMonth() + 1) + '/' + onlyDate.getDate()) + '</text>';
    } else {
      var labelCount = 4;
      for (var j = 0; j < labelCount; j++) {
        var tt = minT + (maxT - minT) * (j / (labelCount - 1));
        var dd = new Date(tt);
        var lx = L + (W - L - R) * (j / (labelCount - 1));
        var label = chartDateLabel(dd.getFullYear() + '-' + pad2(dd.getMonth() + 1) + '-' + pad2(dd.getDate()), spanDays);
        labels += '<text class="chart-axis" x="' + lx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + label + '</text>';
      }
    }
    var paths = '';
    series.forEach(function (s) {
      var pts = (s.points || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (!pts.length) return;
      var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
      if (s.fill) {
        var area = line + ' L' + x(pts[pts.length - 1].date).toFixed(1) + ' ' + (H - B) + ' L' + x(pts[0].date).toFixed(1) + ' ' + (H - B) + ' Z';
        paths += '<path d="' + area + '" fill="' + s.color + '" opacity=".10"/>';
      }
      paths += '<path class="chart-line" d="' + line + '" stroke="' + s.color + '"' + (s.dashed ? ' stroke-dasharray="5 5" opacity=".72"' : '') + '/>';
      if (s.dots) {
        pts.forEach(function (p) {
          paths += '<circle cx="' + x(p.date).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="2.3" fill="' + s.color + '" stroke="#fffdf8" stroke-width="1.2"/>';
        });
      }
      var lastP = pts[pts.length - 1];
      if (!s.dashed && !s.dots) {
        paths += '<circle class="chart-dot" cx="' + x(lastP.date).toFixed(1) + '" cy="' + y(lastP.value).toFixed(1) + '" r="3.4" fill="' + s.color + '"/>';
      }
    });
    var nowLine = '';
    if (opts.markToday) {
      var tx = x(todayISO());
      if (tx > L && tx < W - R) {
        nowLine = '<line class="chart-now" x1="' + tx.toFixed(1) + '" y1="' + T + '" x2="' + tx.toFixed(1) + '" y2="' + (H - B) + '"/>' +
          '<text class="chart-axis" x="' + (tx + 4).toFixed(1) + '" y="' + (T + 10) + '">今天</text>';
      }
    }
    return chartBase() + grid + labels + paths + nowLine + '</svg>';
  }

  function barChartSVG(categories, opts) {
    opts = opts || {};
    var W = 640, H = 250, L = 48, R = 14, T = 16, B = 36;
    var colors = opts.colors || ['#2e7d63', '#c26a45'];
    var values = [];
    categories.forEach(function (c) { (c.values || []).forEach(function (v) { values.push(v); }); });
    var range = chartRange(values, { zeroBaseline: !opts.autoRange, ignoreZeros: !!opts.ignoreZeros });
    var y = function (v) {
      var pct = (v - range.min) / (range.max - range.min);
      return T + (H - T - B) * (1 - Math.max(0, Math.min(1, pct)));
    };
    var grid = '';
    range.ticks.forEach(function (gv) {
      var gy = y(gv);
      grid += '<line class="chart-grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text class="chart-axis" x="' + (L - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' + axisMoney(gv, range.decimals) + '</text>';
    });
    var n = categories.length;
    var slot = (W - L - R) / Math.max(1, n);
    var seriesCount = Math.max(1, (categories[0] && categories[0].values ? categories[0].values.length : 1));
    var groupW = Math.min(slot * 0.62, seriesCount * 18 + (seriesCount - 1) * 4);
    var barW = Math.max(3, (groupW - (seriesCount - 1) * 4) / seriesCount);
    var bars = '';
    var labels = '';
    categories.forEach(function (c, ci) {
      var cx = L + slot * (ci + 0.5);
      var startX = cx - groupW / 2;
      (c.values || []).forEach(function (v, vi) {
        if (opts.hideZeroBars && v <= 0) return;
        var bh = Math.max(1, (H - B) - y(v));
        var bx = startX + vi * (barW + 4);
        var by = H - B - bh;
        bars += '<rect class="chart-bar" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + colors[vi % colors.length] + '" opacity="' + (v > 0 ? '.9' : '.25') + '"/>';
      });
      var skip = n > 8 ? Math.ceil(n / 6) : 1;
      if (ci % skip === 0 || ci === n - 1) {
        labels += '<text class="chart-axis" x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(c.label) + '</text>';
      }
    });
    return chartBase() + grid + bars + labels + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* 首页                                                                */
  /* ------------------------------------------------------------------ */

  function sparkValues(p, st) {
    if (p.type === 'item') {
      var days = Math.max(1, st.days);
      var count = Math.min(9, days);
      var vals = [];
      for (var i = 0; i < count; i++) {
        var day = Math.max(1, Math.round(1 + (days - 1) * (i / Math.max(1, count - 1))));
        vals.push(p.price / day);
      }
      return vals;
    }
    var entries = (p.entries || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (entries.length) {
      var points = entries.slice(-9);
      if (p.type === 'income' || p.type === 'fixed') {
        var sum = 0;
        return points.map(function (e) { sum += e.amount; return sum; });
      }
      return points.map(function (e) { return e.amount; });
    }
    if (p.type === 'income' || p.type === 'fixed') {
      var due = dueDates(p, 9);
      return due.map(function (d, i) { return (i + 1) * p.amount; });
    }
    return [0, 0];
  }

  function projectCardHTML(p) {
    var t = TYPES[p.type];
    var st = projectStats(p);
    var value = '', unit = '', sub = '', badge = '', spark = '';
    if (p.type === 'item') {
      value = money(st.daily, { digits: 2 });
      unit = '/ 天';
      sub = '已使用 <b>' + st.days + ' 天</b> · 购入 ' + money(p.price);
      badge = '月均约 ' + money(st.daily * 30);
      spark = sparkValues(p, st);
    } else if (p.type === 'bill') {
      value = money(st.latest ? st.latest.amount : 0);
      unit = '最近一笔';
      sub = st.latest
        ? ('最近 ' + shortDate(st.latest.date) + ' · 累计 ' + money(st.total))
        : '还没有记录';
      badge = '日均 ' + money(st.dailyAvg);
      spark = sparkValues(p, st);
    } else {
      value = money(st.actual);
      unit = p.type === 'income' ? '累计收入' : '已投入';
      sub = '已进行 <b>' + st.periods + ' 期</b> · ' + (st.periods ? '已持续 ' + st.elapsed : '尚未开始');
      if (!st.count && st.periods) {
        badge = '应' + (p.type === 'income' ? '收' : '投入') + ' ' + money(st.expected);
      } else if (st.missing) {
        badge = '待记 ' + st.missing + ' 期';
      } else {
        badge = '每期 ' + money(p.amount);
      }
      spark = sparkValues(p, st);
    }
    var meta = '<span class="type-label">' + t.label + '</span>' +
      '<span class="meta-dot"></span><span>' + (p.type === 'item' ? '按天分摊' : p.type === 'bill' ? BILL_CYCLES[p.cycle] : cycleText(p.cycle)) + '</span>';
    return '<button class="project-card" type="button" data-action="open-detail" data-id="' + esc(p.id) + '" style="' + typeVars(p.type) + '">' +
      '<div class="project-top">' +
        '<span class="type-icon">' + icon(t.icon) + '</span>' +
        '<div class="project-title-wrap">' +
          '<div class="project-name">' + esc(p.name) + '</div>' +
          '<div class="project-meta">' + meta + '</div>' +
        '</div>' +
        '<div class="project-side">' + sparkline(spark, t.color) + '<span class="chev">' + icon('i-chevron') + '</span></div>' +
      '</div>' +
      '<div class="project-main">' +
        '<div style="min-width:0">' +
          '<div class="project-value"><strong>' + value + '</strong><span class="unit">' + unit + '</span></div>' +
          '<div class="project-sub">' + sub + '</div>' +
        '</div>' +
        '<span class="project-badge">' + badge + '</span>' +
      '</div>' +
    '</button>';
  }

  function renderHome() {
    var key = currentMonthKey();
    var ms = monthStats(key);
    var balance = ms.income - ms.expense;
    var projects = sortedProjects();
    var counts = { all: projects.length, item: 0, bill: 0, fixed: 0, income: 0 };
    projects.forEach(function (p) { counts[p.type] += 1; });
    var visible = projects.filter(function (p) { return ui.filter === 'all' || p.type === ui.filter; });
    var today = todayISO();
    var d = parseISO(today);
    var sign = balance < 0 ? '-' : '';
    var balanceText = Math.abs(balance).toLocaleString('zh-CN', {
      minimumFractionDigits: Math.abs(balance - Math.round(balance)) < 0.005 ? 0 : 2,
      maximumFractionDigits: 2
    });
    var todayDaily = todayItemDaily();
    var activeCount = projects.length;

    var filters = FILTERS.map(function (f) {
      return '<button class="chip ' + (ui.filter === f.key ? 'active' : '') + '" type="button" data-action="set-filter" data-filter="' + f.key + '">' +
        f.label + (f.key === 'all' ? '' : ' <span class="chip-n">' + counts[f.key] + '</span>') + '</button>';
    }).join('');

    var listHtml;
    if (!projects.length) {
      listHtml = '<div class="empty-card">' +
        '<div class="empty-art">' + icon('i-spark') + '</div>' +
        '<div class="empty-title">从第一笔开始</div>' +
        '<div class="empty-text">把大件物品、每月房租、水电账单和工资<br>都放进同一个地方，慢慢看清钱的去向。</div>' +
        '<div class="empty-actions">' +
          '<button class="btn btn-primary" type="button" data-action="open-project-form">' + icon('i-plus') + '新增第一个项目</button>' +
          '<button class="btn btn-soft" type="button" data-action="load-demo">先看示例</button>' +
        '</div></div>';
    } else if (!visible.length) {
      listHtml = '<div class="empty-inline"><div class="et">这个分类还没有项目</div><div class="ed">换个分类看看，或新增一个。</div>' +
        '<button class="btn btn-soft btn-sm" type="button" data-action="open-project-form">新增项目</button></div>';
    } else {
      listHtml = '<div class="project-list">' + visible.map(projectCardHTML).join('') + '</div>';
    }

    var monthlyNetText = balance > 0 ? '本月有结余' : balance < 0 ? '本月支出偏多' : '本月尚无收支';
    document.getElementById('home-content').innerHTML =
      '<div class="topbar">' +
        '<div><div class="eyebrow">PERSONAL LEDGER</div><h1 class="brand">日计<span class="dot">.</span></h1></div>' +
        '<div class="topbar-note"><strong>' + monthText(key) + '</strong>' + (d ? (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + weekday(today) : '') + '</div>' +
      '</div>' +
      '<section class="hero">' +
        '<div class="hero-label"><span>本月结余</span><span class="pill">' + monthlyNetText + '</span></div>' +
        '<div class="hero-amount"><span class="currency">¥</span>' + sign + balanceText + '</div>' +
        '<div class="hero-sub">收入 ' + money(ms.income) + ' &nbsp;·&nbsp; 支出 ' + money(ms.expense) + '</div>' +
        '<div class="hero-meta">' +
          '<div class="hero-meta-item"><span class="hero-meta-icon">' + icon('i-box') + '</span><div class="hero-meta-text">今日分摊<strong>' + money(todayDaily, { digits: 2 }) + '</strong></div></div>' +
          '<div class="hero-sep"></div>' +
          '<div class="hero-meta-item"><span class="hero-meta-icon">' + icon('i-repeat') + '</span><div class="hero-meta-text">进行中<strong>' + activeCount + ' 项</strong></div></div>' +
          '<div class="hero-sep"></div>' +
          '<div class="hero-meta-item"><span class="hero-meta-icon">' + icon('i-calendar') + '</span><div class="hero-meta-text">本月记录<strong>' + (ms.expenseCount + ms.incomeCount) + ' 笔</strong></div></div>' +
        '</div>' +
        '<div class="hero-foot"><span class="mini-pill">' + icon('i-spark') + '日均成本每天自动更新</span></div>' +
      '</section>' +
      '<div class="section-head"><div class="section-title">我的项目<small>' + projects.length + ' 个</small></div>' +
        '<button class="btn btn-primary btn-sm" type="button" data-action="open-project-form">' + icon('i-plus') + '新增</button></div>' +
      '<div class="filters">' + filters + '</div>' +
      listHtml +
      (projects.length ? '<div class="tip-card">' + icon('i-info') + '<div><b>小提示：</b>点“新增”可以随时添加物品、账单、固定支出或收入。数据只保存在这台手机上。</div></div>' : '');

    updateChrome();
  }

  /* ------------------------------------------------------------------ */
  /* 分析                                                                */
  /* ------------------------------------------------------------------ */

  function inAnalysisRange(date, start, end) {
    return !!date && date >= start && date <= end;
  }

  function analysisRange() {
    var today = todayISO();
    var mode = ui.analysisMode || '6m';
    if (mode === 'day') {
      if (!ui.analysisDay || ui.analysisDay > today) ui.analysisDay = today;
      var day = ui.analysisDay;
      return {
        mode: 'day', start: day, end: day, granularity: 'day',
        label: fullDateText(day), navLabel: fullDateText(day),
        navSub: '周' + weekday(day) + (day === today ? ' · 今天' : ''),
        scopeText: '当天', chartHint: '当天合计',
        categories: [{ key: day, label: shortDateTime(day), date: day }]
      };
    }
    if (mode === 'month') {
      var cm = currentMonthKey();
      if (!ui.analysisMonth || ui.analysisMonth > cm) ui.analysisMonth = cm;
      var m = ui.analysisMonth;
      var start = m + '-01';
      var end = m === cm ? today : monthEndISO(m);
      var lastDay = parseISO(end).getDate();
      var cats = [];
      for (var d = 1; d <= lastDay; d++) {
        var ds = m + '-' + pad2(d);
        cats.push({ key: ds, label: String(d), date: ds });
      }
      return {
        mode: 'month', start: start, end: end, granularity: 'day',
        label: monthText(m, true), navLabel: monthText(m, true),
        navSub: m === cm ? '本月 · 截至今天' : '',
        scopeText: m === cm ? '本月' : monthText(m, true), chartHint: '按天',
        categories: cats
      };
    }
    if (mode === 'year') {
      var nowYear = new Date().getFullYear();
      if (!ui.analysisYear || ui.analysisYear > nowYear) ui.analysisYear = nowYear;
      var y = ui.analysisYear;
      var yearStart = y + '-01-01';
      var yearEnd = y === nowYear ? today : y + '-12-31';
      var lastMonth = y === nowYear ? (new Date().getMonth() + 1) : 12;
      var yearCats = [];
      for (var mm = 1; mm <= lastMonth; mm++) {
        var mk = y + '-' + pad2(mm);
        yearCats.push({ key: mk, label: mm + '月', date: mk + '-01' });
      }
      return {
        mode: 'year', start: yearStart, end: yearEnd, granularity: 'month',
        label: y + ' 年', navLabel: y + ' 年',
        navSub: y === nowYear ? '截至 ' + lastMonth + ' 月' : '全年',
        scopeText: y + ' 年', chartHint: '按月',
        categories: yearCats
      };
    }
    var count = mode === '12m' ? 12 : 6;
    if (!ui.analysisEndMonth || ui.analysisEndMonth > currentMonthKey()) ui.analysisEndMonth = currentMonthKey();
    var endM = ui.analysisEndMonth;
    var startM = monthOffsetKey(-(count - 1), endM + '-01');
    var rangeStart = startM + '-01';
    var rangeEnd = endM === currentMonthKey() ? today : monthEndISO(endM);
    var monthCats = [];
    var cursor = startM;
    while (cursor <= endM) {
      monthCats.push({ key: cursor, label: (+cursor.slice(5)) + '月', date: cursor + '-01' });
      cursor = monthOffsetKey(1, cursor + '-01');
    }
    var sameYear = startM.slice(0, 4) === endM.slice(0, 4);
    var rangeLabel = sameYear
      ? startM.slice(0, 4) + ' 年 ' + (+startM.slice(5)) + ' 月 – ' + (+endM.slice(5)) + ' 月'
      : startM.slice(0, 4) + ' 年 ' + (+startM.slice(5)) + ' 月 – ' + endM.slice(0, 4) + ' 年 ' + (+endM.slice(5)) + ' 月';
    return {
      mode: mode, start: rangeStart, end: rangeEnd, granularity: 'month',
      label: rangeLabel, navLabel: rangeLabel,
      navSub: endM === currentMonthKey() ? '截至今天' : '',
      scopeText: '近 ' + count + ' 个月', chartHint: '按月',
      categories: monthCats
    };
  }

  function addAnalysisBucket(map, key, direction, amount) {
    if (!key) return;
    var bucket = map[key];
    if (!bucket) {
      bucket = { income: 0, expense: 0 };
      map[key] = bucket;
    }
    bucket[direction] += amount;
  }

  function periodTotals(range) {
    var out = {
      income: 0, expense: 0, item: 0, bill: 0, fixed: 0,
      salary: 0, other: 0, incomeCount: 0, expenseCount: 0,
      incomeProjects: [], expenseProjects: [], records: [],
      byDate: {}, byMonth: {}
    };
    data.projects.forEach(function (p) {
      if (p.type === 'item') {
        if (!inAnalysisRange(p.purchaseDate, range.start, range.end)) return;
        out.expense += p.price;
        out.item += p.price;
        out.expenseCount += 1;
        addAnalysisBucket(out.byDate, p.purchaseDate, 'expense', p.price);
        addAnalysisBucket(out.byMonth, monthKey(p.purchaseDate), 'expense', p.price);
        out.expenseProjects.push({ p: p, amount: p.price, count: 1 });
        out.records.push({ p: p, date: p.purchaseDate, amount: p.price, direction: 'expense', note: '购入' });
        return;
      }
      var sum = 0;
      var count = 0;
      (p.entries || []).forEach(function (e) {
        if (!inAnalysisRange(e.date, range.start, range.end)) return;
        var dir = p.type === 'income' ? 'income' : 'expense';
        if (dir === 'income') {
          out.income += e.amount;
          out.incomeCount += 1;
          if (p.incomeKind === 'other') out.other += e.amount;
          else out.salary += e.amount;
        } else {
          out.expense += e.amount;
          out.expenseCount += 1;
          if (p.type === 'bill') out.bill += e.amount;
          else out.fixed += e.amount;
        }
        addAnalysisBucket(out.byDate, e.date, dir, e.amount);
        addAnalysisBucket(out.byMonth, monthKey(e.date), dir, e.amount);
        out.records.push({
          p: p, date: e.date, amount: e.amount, direction: dir,
          note: e.note || (p.type === 'income' ? '收入记录' : p.type === 'bill' ? '账单记录' : '按期记录')
        });
        sum += e.amount;
        count += 1;
      });
      if (sum > 0) {
        if (p.type === 'income') out.incomeProjects.push({ p: p, amount: round2(sum), count: count });
        else out.expenseProjects.push({ p: p, amount: round2(sum), count: count });
      }
    });
    ['income', 'expense', 'item', 'bill', 'fixed', 'salary', 'other'].forEach(function (k) {
      out[k] = round2(out[k]);
    });
    out.records.sort(function (a, b) {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.amount - a.amount;
    });
    return out;
  }

  function allTimeBreakdown() {
    var out = { item: 0, bill: 0, fixed: 0 };
    data.projects.forEach(function (p) {
      if (p.type === 'item') {
        out.item += p.price;
      } else if (p.type === 'bill' || p.type === 'fixed') {
        out[p.type] += (p.entries || []).reduce(function (sum, e) { return sum + e.amount; }, 0);
      }
    });
    out.item = round2(out.item);
    out.bill = round2(out.bill);
    out.fixed = round2(out.fixed);
    return out;
  }

  function analysisYears() {
    var current = new Date().getFullYear();
    var min = current;
    var hasData = false;
    data.projects.forEach(function (p) {
      [p.purchaseDate, p.startDate].concat((p.entries || []).map(function (e) { return e.date; })).forEach(function (d) {
        if (!d) return;
        hasData = true;
        min = Math.min(min, parseInt(d.slice(0, 4), 10));
      });
    });
    if (!hasData) min = current - 5;
    else min = min - 1;
    min = Math.max(2000, min);
    var years = [];
    for (var y = current; y >= min; y--) years.push(y);
    return years;
  }

  function analysisCanNext(range) {
    var today = todayISO();
    var currentYear = new Date().getFullYear();
    if (range.mode === 'day') return ui.analysisDay < today;
    if (range.mode === 'month') return ui.analysisMonth < currentMonthKey();
    if (range.mode === 'year') return ui.analysisYear < currentYear;
    return ui.analysisEndMonth < currentMonthKey();
  }

  function setAnalysisMode(mode) {
    ui.analysisMode = mode;
    var today = todayISO();
    if (mode === 'day' && (!ui.analysisDay || ui.analysisDay > today)) ui.analysisDay = today;
    if (mode === 'month' && (!ui.analysisMonth || ui.analysisMonth > currentMonthKey())) ui.analysisMonth = currentMonthKey();
    if ((mode === '6m' || mode === '12m') && (!ui.analysisEndMonth || ui.analysisEndMonth > currentMonthKey())) ui.analysisEndMonth = currentMonthKey();
    if (mode === 'year' && (!ui.analysisYear || ui.analysisYear > new Date().getFullYear())) ui.analysisYear = new Date().getFullYear();
    renderAnalysis();
  }

  function shiftAnalysis(delta) {
    var mode = ui.analysisMode || '6m';
    var today = todayISO();
    if (mode === 'day') {
      var nextDay = addDaysISO(ui.analysisDay || today, delta);
      if (nextDay > today) nextDay = today;
      ui.analysisDay = nextDay;
    } else if (mode === 'month') {
      var nextMonth = monthOffsetKey(delta, (ui.analysisMonth || currentMonthKey()) + '-01');
      if (nextMonth > currentMonthKey()) nextMonth = currentMonthKey();
      ui.analysisMonth = nextMonth;
    } else if (mode === 'year') {
      var nextYear = (ui.analysisYear || new Date().getFullYear()) + delta;
      if (nextYear > new Date().getFullYear()) nextYear = new Date().getFullYear();
      if (nextYear < 2000) nextYear = 2000;
      ui.analysisYear = nextYear;
    } else {
      var nextEnd = monthOffsetKey(delta, (ui.analysisEndMonth || currentMonthKey()) + '-01');
      if (nextEnd > currentMonthKey()) nextEnd = currentMonthKey();
      ui.analysisEndMonth = nextEnd;
    }
    renderAnalysis();
  }

  function renderAnalysis() {
    var range = analysisRange();
    var t = periodTotals(range);
    var totalIncome = round2(t.income);
    var totalExpense = round2(t.expense);
    var net = round2(totalIncome - totalExpense);
    var rangeCount = t.expenseCount + t.incomeCount;
    var selected = ui.analysisSeries === 'income' ? 'income' : 'expense';
    var seriesColor = selected === 'income' ? TYPES.income.color : TYPES.bill.color;
    var seriesLabel = selected === 'income' ? '收入' : '支出';
    var values = range.categories.map(function (c) {
      var bucket = range.granularity === 'month' ? t.byMonth[c.key] : t.byDate[c.key];
      return bucket ? round2(bucket[selected]) : 0;
    });
    var hasSeriesData = values.some(function (v) { return v > 0; });
    var hasZeros = values.some(function (v) { return v === 0; });
    var chartType = ui.analysisChartType === 'bar' ? 'bar' : 'line';
    var chartCats = range.categories.map(function (c, i) {
      return { label: c.label, values: [values[i]] };
    });
    var linePoints = range.categories.map(function (c, i) {
      return { date: c.date, value: values[i] };
    }).filter(function (p) { return p.value > 0; });
    var chartHtml;
    if (!hasSeriesData) {
      chartHtml = '<div class="chart-empty">本时间段没有' + seriesLabel + '记录<br>换个时间段或先记一笔</div>';
    } else if (chartType === 'bar') {
      chartHtml = barChartSVG(chartCats, { colors: [seriesColor], autoRange: true, ignoreZeros: true, hideZeroBars: true });
    } else {
      chartHtml = lineChartSVG([{ points: linePoints, color: seriesColor, fill: true, dots: true }], { autoRange: true, ignoreZeros: true });
    }
    var chartNote = hasSeriesData
      ? (range.mode === 'day'
        ? '当天合计；切换到“月”或更长周期可以看走势。'
        : (hasZeros
          ? '本时间段有未记录的' + (range.granularity === 'month' ? '月份' : '日期') + '，未记录的点 / 柱子不显示；纵轴仍从非零数据附近开始。'
          : '纵轴从非零数据附近开始，方便观察' + seriesLabel + '的波动。' + (chartType === 'line' ? '每个点代表一个时间段。' : (range.granularity === 'month' ? '每月一个柱子。' : '每天一个柱子。'))))
      : '';

    var modeDefs = [
      { mode: 'day', label: '天' },
      { mode: 'month', label: '月' },
      { mode: '6m', label: '6个月' },
      { mode: '12m', label: '12个月' },
      { mode: 'year', label: '自然年' }
    ];
    var tabsHtml = modeDefs.map(function (m) {
      return '<button type="button" data-action="set-analysis-mode" data-mode="' + m.mode + '" class="' + (range.mode === m.mode ? 'active' : '') + '">' + m.label + '</button>';
    }).join('');
    var yearOptions = analysisYears().map(function (y) {
      return '<option value="' + y + '" ' + (ui.analysisYear === y ? 'selected' : '') + '>' + y + ' 年</option>';
    }).join('');
    var currentHtml = range.mode === 'year'
      ? '<span class="year-wrap"><select class="year-select" data-analysis-year aria-label="选择年份">' + yearOptions + '</select></span>'
      : '<span>' + range.navLabel + '</span>' + (range.navSub ? '<small>' + range.navSub + '</small>' : '');
    var periodNav = '<div class="period-nav">' +
      '<button class="period-arrow prev" type="button" data-action="analysis-prev" aria-label="上一时间段">' + icon('i-chevron') + '</button>' +
      '<div class="period-current">' + currentHtml + '</div>' +
      '<button class="period-arrow" type="button" data-action="analysis-next" aria-label="下一时间段" ' + (analysisCanNext(range) ? '' : 'disabled') + '>' + icon('i-chevron') + '</button>' +
    '</div>';

    var analysisColors = [
      { key: 'salary', label: '工资', color: TYPES.income.color },
      { key: 'other', label: '其他收入', color: '#b48a2e' }
    ];
    var salaryTotal = t.salary;
    var otherTotal = t.other;
    var incomeRows = analysisColors.map(function (item) {
      var value = item.key === 'salary' ? salaryTotal : otherTotal;
      var pct = totalIncome > 0 ? Math.round(value / totalIncome * 100) : 0;
      return '<div class="breakdown-row" style="--c:' + item.color + '">' +
        '<div class="breakdown-name"><i></i>' + item.label + '</div>' +
        '<div class="breakdown-track"><div class="breakdown-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="breakdown-value">' + money(value) + '</div></div>';
    }).join('');
    var incomeProjects = t.incomeProjects.slice().sort(function (a, b) { return b.amount - a.amount; });
    var incomeProjectRows = incomeProjects.map(function (x) {
      var kindLabel = x.p.incomeKind === 'other' ? '其他收入' : '工资';
      return '<button class="rank-row" type="button" data-action="open-detail" data-id="' + esc(x.p.id) + '">' +
        '<span class="type-icon" style="width:30px;height:30px;border-radius:9px;' + typeVars('income') + '">' + icon('i-wallet') + '</span>' +
        '<span class="rank-body"><span class="rank-name">' + esc(x.p.name) + '</span><span class="rank-meta">' + kindLabel + ' · ' + x.count + ' 笔</span></span>' +
        '<span class="rank-amount">' + money(x.amount) + '</span></button>';
    }).join('');
    var incomeCard = '<section class="card section-card">' +
      '<div class="section-card-head"><div class="section-card-title">收入统计<small>工资 / 其他收入</small></div><div class="section-card-sub">共 ' + t.incomeCount + ' 笔</div></div>' +
      '<div class="breakdown">' + incomeRows + '</div>' +
      '<div class="divider"></div>' +
      '<div class="section-card-title" style="font-size:13px">收入项目</div>' +
      (incomeProjectRows ? '<div class="rank-list">' + incomeProjectRows + '</div>' : '<div class="chart-empty" style="padding:12px 0 18px">本时间段没有收入记录</div>') +
      '<div class="mini-note">' + icon('i-info') + '<span>工资和其他收入都按所选时间段内实际录入的记录统计。</span></div>' +
    '</section>';

    var points = ui.breakdownScope === 'period'
      ? { item: t.item, bill: t.bill, fixed: t.fixed }
      : allTimeBreakdown();
    var breakdownTotal = points.item + points.bill + points.fixed;
    var breakdownDefs = [
      { key: 'item', label: '高价物品', color: TYPES.item.color },
      { key: 'bill', label: '周期账单', color: TYPES.bill.color },
      { key: 'fixed', label: '固定支出', color: TYPES.fixed.color }
    ];
    var breakdownHtml = breakdownDefs.map(function (b) {
      var pct = breakdownTotal > 0 ? Math.round(points[b.key] / breakdownTotal * 100) : 0;
      return '<div class="breakdown-row" style="--c:' + b.color + '">' +
        '<div class="breakdown-name"><i></i>' + b.label + '</div>' +
        '<div class="breakdown-track"><div class="breakdown-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="breakdown-value">' + money(points[b.key]) + '</div></div>';
    }).join('');
    var scopeLabel = ui.breakdownScope === 'period' ? '本期' : '全部累计';
    var scopeToggle = '<div class="segmented"><button type="button" data-action="set-breakdown-scope" data-scope="all" class="' + (ui.breakdownScope !== 'period' ? 'active' : '') + '">累计</button><button type="button" data-action="set-breakdown-scope" data-scope="period" class="' + (ui.breakdownScope === 'period' ? 'active' : '') + '">本期</button></div>';

    var ranked = t.expenseProjects.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5);
    var rankHtml = ranked.map(function (x, i) {
      var meta = x.p.type === 'item'
        ? '购入 · ' + shortDate(x.p.purchaseDate)
        : (x.count + ' 笔' + (x.p.type === 'bill' ? '账单' : '记录'));
      return '<button class="rank-row" type="button" data-action="open-detail" data-id="' + esc(x.p.id) + '">' +
        '<span class="rank-num">' + (i + 1) + '</span>' +
        '<span class="type-icon" style="width:30px;height:30px;border-radius:9px;' + typeVars(x.p.type) + '">' + icon(TYPES[x.p.type].icon) + '</span>' +
        '<span class="rank-body"><span class="rank-name">' + esc(x.p.name) + '</span><span class="rank-meta">' + meta + '</span></span>' +
        '<span class="rank-amount">' + money(x.amount) + '</span></button>';
    }).join('');

    var dayRecords = '';
    if (range.mode === 'day') {
      var dayRows = t.records.slice(0, 30).map(function (r) {
        var isIncome = r.direction === 'income';
        return '<button class="record-row" type="button" data-action="open-detail" data-id="' + esc(r.p.id) + '">' +
          '<span class="type-icon" style="width:34px;height:34px;border-radius:10px;' + typeVars(r.p.type) + '">' + icon(TYPES[r.p.type].icon) + '</span>' +
          '<span class="record-main"><span class="record-note">' + esc(r.p.name) + '</span><span class="record-sub">' + esc(r.note) + '</span></span>' +
          '<span class="record-amount ' + (isIncome ? 'income' : '') + '">' + (isIncome ? '+' : '-') + money(r.amount) + '</span></button>';
      }).join('');
      dayRecords = '<section class="card section-card"><div class="section-card-head"><div class="section-card-title">当日记录<small>' + t.records.length + ' 条</small></div><div class="section-card-sub">' + range.navLabel + '</div></div>' +
        (dayRows ? '<div class="record-list">' + dayRows + '</div>' : '<div class="chart-empty" style="padding:12px 0 18px">当天没有记录</div>') + '</section>';
    }

    document.getElementById('analysis-content').innerHTML =
      '<div class="topbar"><div><div class="eyebrow">CASHFLOW VIEW</div><h1 class="brand">收支分析<span class="dot">.</span></h1></div>' +
      '<div class="topbar-note"><strong>' + range.scopeText + '</strong>实际发生</div></div>' +
      '<section class="analysis-hero">' +
        '<div class="analysis-head"><div style="min-width:0"><div class="eyebrow">TOTAL BALANCE</div><div class="analysis-title" style="' + (net < 0 ? 'color:var(--orange-2)' : '') + '">' + analysisMoney(net) + '</div>' +
          '<div class="analysis-period-hint">' + range.scopeText + ' · ' + rangeCount + ' 笔记录</div></div></div>' +
        '<div class="analysis-totals">' +
          '<div class="a-total income"><div class="a-total-label"><i></i>总收入</div><div class="a-total-value">' + analysisMoney(totalIncome) + '</div></div>' +
          '<div class="a-total expense"><div class="a-total-label"><i></i>总支出</div><div class="a-total-value">' + analysisMoney(totalExpense) + '</div></div>' +
          '<div class="a-total"><div class="a-total-label"><i style="background:#9aa19b"></i>结余</div><div class="a-total-value" style="color:' + (net < 0 ? 'var(--orange-2)' : 'var(--ink)') + '">' + analysisMoney(net) + '</div></div>' +
        '</div>' +
      '</section>' +
      '<section class="period-card"><div class="period-tabs">' + tabsHtml + '</div>' + periodNav + '</section>' +
      '<section class="card section-card analysis-trend"><div class="section-card-head"><div><div class="section-card-title">' + seriesLabel + '走势<small>' + range.chartHint + '</small></div><div class="section-card-sub">' + range.navLabel + '</div></div></div>' +
        '<div class="chart-toolbar">' +
          '<div class="segmented"><button type="button" data-action="set-analysis-series" data-series="expense" class="' + (selected === 'expense' ? 'active' : '') + '">支出</button><button type="button" data-action="set-analysis-series" data-series="income" class="' + (selected === 'income' ? 'active' : '') + '">收入</button></div>' +
          '<div class="segmented"><button type="button" data-action="set-analysis-chart-type" data-type="bar" class="' + (chartType === 'bar' ? 'active' : '') + '">柱状</button><button type="button" data-action="set-analysis-chart-type" data-type="line" class="' + (chartType === 'line' ? 'active' : '') + '">折线</button></div>' +
        '</div>' +
        '<div class="analysis-chart">' + chartHtml + '</div>' +
        (chartNote ? '<div class="mini-note">' + icon('i-info') + '<span>' + chartNote + '</span></div>' : '') +
      '</section>' +
      incomeCard +
      '<section class="card section-card"><div class="section-card-head"><div class="section-card-title">支出结构<small>' + scopeLabel + '</small></div>' + scopeToggle + '</div>' +
        '<div class="breakdown">' + breakdownHtml + '</div>' +
        '<div class="mini-note">' + icon('i-info') + '<span>' + (ui.breakdownScope === 'period' ? '本期口径：只统计所选时间段内录入的记录。' : '累计口径：所有物品按购买价全额计入；账单和固定支出按全部记录合计，不受时间筛选影响。') + '</span></div>' +
      '</section>' +
      '<section class="card section-card"><div class="section-card-head"><div class="section-card-title">本期支出项目 TOP 5</div><div class="section-card-sub">' + range.scopeText + '</div></div>' +
        (rankHtml ? '<div class="rank-list">' + rankHtml + '</div>' : '<div class="chart-empty" style="padding:12px 0 18px">本时间段没有支出项目</div>') + '</section>' +
      dayRecords +
      '<div class="tip-card">' + icon('i-info') + '<div><b>统计口径：</b>上方汇总、走势、收入统计和项目排行都按所选时间段内录入的记录统计；支出结构可切换“累计 / 本期”。</div></div>';

    updateChrome();
  }

  /* ------------------------------------------------------------------ */
  /* 我的 / 设置                                                         */
  /* ------------------------------------------------------------------ */

  function settingRow(action, iconName, title, sub, danger) {
    return '<button class="setting-row" type="button" data-action="' + action + '">' +
      '<span class="setting-icon" style="' + (danger ? 'background:var(--red-soft);color:var(--red)' : '') + '">' + icon(iconName) + '</span>' +
      '<span class="setting-body"><span class="setting-title" style="' + (danger ? 'color:var(--red)' : '') + '">' + title + '</span>' +
      (sub ? '<span class="setting-sub">' + sub + '</span>' : '') + '</span>' +
      '<span class="chev">' + icon('i-chevron') + '</span></button>';
  }

  function renderSettings() {
    var entries = totalEntryCount();
    document.getElementById('settings-content').innerHTML =
      '<div class="settings-head"><div class="eyebrow">YOUR DATA</div><h1>我的</h1><p>数据留在本机，随时可以带走。</p></div>' +
      '<div class="stat-strip"><div><b>' + data.projects.length + '</b><span>个项目</span></div><div><b>' + entries + '</b><span>条记录</span></div><div><b>' + money(todayItemDaily(), { digits: 2 }) + '</b><span>今日分摊</span></div></div>' +
      '<div class="settings-group" style="margin-top:22px"><div class="settings-label">数据管理</div><div class="settings-card">' +
        settingRow('open-backup', 'i-download', '导出备份', '复制一份 JSON 数据，换手机时用') +
        settingRow('open-import', 'i-upload', '导入备份', '粘贴之前导出的 JSON 覆盖当前数据') +
      '</div></div>' +
      '<div class="settings-group"><div class="settings-label">更多</div><div class="settings-card">' +
        settingRow('load-demo', 'i-spark', '载入示例数据', '追加几个示例项目，方便先看看效果') +
        settingRow('show-help', 'i-info', '计算口径说明', '了解日均、应投入和实际记录的区别') +
        settingRow('clear-data', 'i-trash', '清空全部数据', '删除所有项目和记录，无法恢复', true) +
      '</div></div>' +
      '<div class="settings-about"><div class="settings-mark">日计<span>.</span></div>' +
        '版本 ' + APP_VERSION + ' · 完全离线<br>数据保存在本机 SQLite 数据库<br>同时保留一份 WebView 缓存作为兜底<br>覆盖安装升级不会清除记录，请勿卸载旧版<br>建议定期导出备份</div>';

    updateChrome();
  }

  function updateChrome() {
    var fab = document.getElementById('fab');
    if (!fab) return;
    fab.classList.toggle('hidden', ui.tab !== 'home' || ui.overlays.length > 0 || !data.projects.length);
  }

  /* ------------------------------------------------------------------ */
  /* 项目详情                                                            */
  /* ------------------------------------------------------------------ */

  function itemChartHTML(p) {
    var st = projectStats(p);
    var days = Math.max(1, st.days);
    var today = todayISO();
    var actual = [];
    var seen = {};
    function pushPoint(date) {
      if (!date || date < p.purchaseDate || date > today || seen[date]) return;
      seen[date] = true;
      actual.push({ date: date, value: p.price / Math.max(1, dayDiff(p.purchaseDate, date) + 1) });
    }
    if (days <= 75) {
      var count = Math.min(60, days);
      for (var i = 0; i < count; i++) {
        var day = Math.max(1, Math.round(1 + (days - 1) * (i / Math.max(1, count - 1))));
        pushPoint(addDaysISO(p.purchaseDate, day - 1));
      }
    } else {
      var windowStart = addMonthsISO(today.slice(0, 7) + '-01', -11);
      if (p.purchaseDate >= windowStart) pushPoint(p.purchaseDate);
      for (var m = 0; m < 12; m++) {
        var key = monthOffsetKey(m - 11);
        var first = parseISO(key + '-01');
        var monthEndDate = new Date(first.getFullYear(), first.getMonth() + 1, 0);
        var monthEnd = isoFromDate(monthEndDate);
        pushPoint(monthEnd > today ? today : monthEnd);
      }
    }
    pushPoint(today);
    if (!actual.length) actual.push({ date: p.purchaseDate, value: p.price });
    var proj = [];
    [30, 90, 180].forEach(function (offset) {
      proj.push({ date: addDaysISO(today, offset), value: p.price / (days + offset) });
    });
    return lineChartSVG([
      { points: actual, color: TYPES.item.color, fill: true },
      { points: proj, color: '#b48a2e', dashed: true }
    ], { markToday: true, autoRange: true });
  }

  function billChartHTML(p, mode) {
    var entries = (p.entries || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!entries.length) {
      return '<div class="chart-empty">还没有账单记录<br>记下第一笔后，这里会出现金额走势</div>';
    }
    if (mode === 'month') {
      var map = {};
      entries.forEach(function (e) {
        var k = monthKey(e.date);
        map[k] = (map[k] || 0) + e.amount;
      });
      var cats = Object.keys(map).sort().map(function (k) {
        return { label: k.slice(2).replace('-', '/'), values: [round2(map[k])] };
      });
      return barChartSVG(cats, { colors: [TYPES.bill.color], autoRange: true });
    }
    var points = entries.map(function (e) { return { date: e.date, value: e.amount }; });
    return lineChartSVG([{ points: points, color: TYPES.bill.color, fill: true }], { autoRange: true });
  }

  function recurringChartHTML(p, mode) {
    var entries = (p.entries || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var st = projectStats(p);
    if (mode === 'period') {
      if (!entries.length) {
        return '<div class="chart-empty">还没有记录<br>按计划已有 ' + st.periods + ' 期，可点下方补记</div>';
      }
      var spanDays = dayDiff(entries[0].date, entries[entries.length - 1].date);
      var cats = entries.map(function (e) {
        return { label: chartDateLabel(e.date, spanDays), values: [e.amount] };
      });
      return barChartSVG(cats, { colors: [TYPES[p.type].color] });
    }
    var dates = dueDates(p);
    var expected = dates.map(function (d, i) {
      return { date: d, value: round2((i + 1) * p.amount) };
    });
    var actual = [];
    var sum = 0;
    entries.forEach(function (e) {
      sum += e.amount;
      actual.push({ date: e.date, value: round2(sum) });
    });
    if (!expected.length && !actual.length) {
      return '<div class="chart-empty">项目开始后，这里会显示累计走势</div>';
    }
    var series = [];
    if (expected.length) series.push({ points: expected, color: TYPES[p.type].color, dashed: true });
    if (actual.length) series.push({ points: actual, color: TYPES[p.type].color, fill: !expected.length });
    return lineChartSVG(series);
  }

  function progressCardHTML(p, st) {
    var isIncome = p.type === 'income';
    var pct = st.periods > 0 ? clamp(st.coverage / st.periods * 100, 0, 100) : 0;
    var missing = st.missing;
    var title = st.periods ? ('已记录 ' + st.coverage + ' / ' + st.periods + ' 期') : '尚未到第一期';
    return '<div class="progress-card">' +
      '<div class="progress-top"><span class="label">计划进度</span><span class="val">' + title + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill ' + (st.actual > st.expected ? 'over' : '') + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="progress-legend"><span>已记录 <b>' + money(st.actual) + '</b></span><span>' + (isIncome ? '应收' : '应投入') + ' <b>' + money(st.expected) + '</b></span></div>' +
      '<div class="progress-actions">' +
        (missing > 0 ? '<button class="btn btn-soft btn-sm" type="button" data-action="backfill" data-id="' + esc(p.id) + '">' + icon('i-repeat') + '补记到期 ' + missing + ' 期</button>' : '') +
        '<button class="btn btn-soft btn-sm" type="button" data-action="open-entry-form" data-project="' + esc(p.id) + '">' + icon('i-plus') + '记本期</button>' +
      '</div>' +
      '<div class="field-hint" style="margin-top:9px">按开始日期和周期计算应进行期数；实际收支以记录为准。</div>' +
    '</div>';
  }

  function itemMilestonesHTML(p, st) {
    var days = Math.max(1, st.days);
    var items = [];
    if (days > 1) items.push({ label: '第 1 天', value: p.price });
    [30, 90, 180, 365].forEach(function (d) {
      if (d < days && d !== 1) items.push({ label: '第 ' + d + ' 天', value: p.price / d });
    });
    items.push({ label: '今天 · 第 ' + days + ' 天', value: st.daily, today: true });
    var drop = p.price > 0 ? Math.max(0, Math.min(100, (1 - st.daily / p.price) * 100)) : 0;
    var future365 = p.price / (days + 365);
    return '<div class="progress-card">' +
      '<div class="progress-top"><span class="label">日均里程碑</span><span class="val">今天 ' + money(st.daily, { digits: 2 }) + '/天</span></div>' +
      '<div class="milestone-grid">' +
        items.map(function (it) {
          return '<div class="milestone ' + (it.today ? 'today' : '') + '"><span>' + it.label + '</span><b>' + money(it.value, { digits: 2 }) + '</b></div>';
        }).join('') +
      '</div>' +
      '<div class="progress-legend" style="margin-top:12px"><span>比刚买时下降 <b>' + drop.toFixed(1) + '%</b></span><span>再用 365 天约 <b>' + money(future365, { digits: 2 }) + '/天</b></span></div>' +
      '<div class="field-hint" style="margin-top:9px">历史里程碑按实际使用天数计算；继续使用为预估。</div>' +
    '</div>';
  }

  function groupEntries(entries) {
    var groups = {};
    entries.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).forEach(function (e) {
      var k = monthKey(e.date);
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    });
    return groups;
  }

  function recordListHTML(p) {
    var entries = p.entries || [];
    var isIncome = p.type === 'income';
    if (!entries.length) {
      var isRecurring = p.type === 'fixed' || p.type === 'income';
      var st = projectStats(p);
      var text = isRecurring && st.periods
        ? '按计划已进行 ' + st.periods + ' 期，' + (isIncome ? '应收' : '应投入') + ' ' + money(st.expected) + '。'
        : '还没有记录，点下方按钮记下第一笔。';
      return '<div class="empty-inline"><div class="et">还没有明细</div><div class="ed">' + text + '</div>' +
        '<button class="btn btn-soft btn-sm" type="button" data-action="open-entry-form" data-project="' + esc(p.id) + '">' + icon('i-plus') + (isIncome ? '记第一笔收入' : '记第一笔支出') + '</button></div>';
    }
    var groups = groupEntries(entries);
    return Object.keys(groups).sort().reverse().map(function (k) {
      var rows = groups[k].sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (e) {
        var d = parseISO(e.date);
        var note = e.note || (isIncome ? '收入记录' : p.type === 'bill' ? '账单记录' : '按期记录');
        return '<button class="record-row" type="button" data-action="open-entry-form" data-project="' + esc(p.id) + '" data-entry="' + esc(e.id) + '">' +
          '<span class="record-date"><b>' + d.getDate() + '</b><span>' + (d.getMonth() + 1) + '月 · 周' + weekday(e.date) + '</span></span>' +
          '<span class="record-main"><span class="record-note">' + esc(note) + '</span><span class="record-sub">' + shortDate(e.date) + ' · ' + d.getFullYear() + '</span></span>' +
          '<span class="record-amount ' + (isIncome ? 'income' : '') + '">' + (isIncome ? '+' : '-') + money(e.amount).replace('¥', '¥') + '</span>' +
          '<span class="record-chev">' + icon('i-chevron') + '</span></button>';
      }).join('');
      return '<div class="record-group"><div class="record-month">' + monthText(k, true) + '<span>合计 ' + money(groups[k].reduce(function (s, e) { return s + e.amount; }, 0)) + '</span></div>' +
        '<div class="record-list">' + rows + '</div></div>';
    }).join('');
  }

  function detailBodyHTML(p) {
    var t = TYPES[p.type];
    var st = projectStats(p);
    var isIncome = p.type === 'income';
    var heroBig, heroUnit, heroFoot, statsHtml, chartTitle, chartSub, chartHtml, chartNote, toggleHtml = '';

    if (p.type === 'item') {
      heroBig = money(st.daily, { digits: 2 });
      heroUnit = '/ 天';
      heroFoot = '<span>已使用 <b>' + st.days + ' 天</b></span><span>购入价 <b>' + money(p.price) + '</b></span>';
    } else if (p.type === 'bill') {
      heroBig = money(st.total);
      heroUnit = '累计支出';
      heroFoot = '<span><b>' + st.count + '</b> 笔记录</span><span>最近 <b>' + (st.latest ? shortDate(st.latest.date) : '暂无') + '</b></span>';
    } else if (p.type === 'fixed') {
      heroBig = String(st.periods);
      heroUnit = '期';
      heroFoot = '<span>已投入 <b>' + money(st.actual) + '</b></span><span>应投入 <b>' + money(st.expected) + '</b></span>';
    } else {
      heroBig = money(st.actual);
      heroUnit = '累计收入';
      heroFoot = '<span><b>' + st.count + '</b> 笔记录</span><span>应收 <b>' + money(st.expected) + '</b></span>';
    }

    if (p.type === 'item') {
      statsHtml =
        '<div class="detail-stat"><div class="k">购买价格</div><div class="v">' + money(p.price) + '</div></div>' +
        '<div class="detail-stat"><div class="k">购买日期</div><div class="v" style="font-size:14px">' + shortDate(p.purchaseDate) + '</div></div>' +
        '<div class="detail-stat"><div class="k">已使用</div><div class="v">' + st.days + ' <small>天</small></div></div>' +
        '<div class="detail-stat"><div class="k">日均成本</div><div class="v">' + money(st.daily, { digits: 2 }) + ' <small>/天</small></div></div>';
      chartTitle = st.days < 365 ? '购买以来日均' : '近 12 个月日均';
      chartSub = '纵轴从数据附近开始';
      chartHtml = itemChartHTML(p);
      chartNote = '<div class="mini-note">' + icon('i-info') + '<span>' + (st.days <= 75 ? '短期按日采样' : '每个点是当月最后一天的日均') + '；虚线为继续使用 30/90/180 天的预估。纵轴不从 0 开始，便于观察后期的小幅变化。</span></div>';
    } else if (p.type === 'bill') {
      statsHtml =
        '<div class="detail-stat"><div class="k">累计支出</div><div class="v">' + money(st.total) + '</div></div>' +
        '<div class="detail-stat"><div class="k">记录笔数</div><div class="v">' + st.count + ' <small>笔</small></div></div>' +
        '<div class="detail-stat"><div class="k">最近一次</div><div class="v" style="font-size:14px">' + (st.latest ? shortDate(st.latest.date) : '暂无') + '</div></div>' +
        '<div class="detail-stat"><div class="k">月均支出</div><div class="v">' + money(st.monthlyAvg) + '</div></div>';
      chartTitle = '金额走势';
      chartSub = '看钱和时间的关系';
      chartHtml = billChartHTML(p, ui.billChartMode);
      chartNote = '<div class="mini-note">' + icon('i-info') + '<span>逐笔看每次波动，按月看整体趋势。纵轴从最近整数起，不从 0 开始，方便看出金额波动。</span></div>';
      toggleHtml = '<div class="segmented"><button type="button" data-action="bill-chart-mode" data-mode="entry" class="' + (ui.billChartMode === 'entry' ? 'active' : '') + '">逐笔</button><button type="button" data-action="bill-chart-mode" data-mode="month" class="' + (ui.billChartMode === 'month' ? 'active' : '') + '">按月</button></div>';
    } else {
      statsHtml =
        '<div class="detail-stat"><div class="k">每期金额</div><div class="v">' + money(p.amount) + '</div></div>' +
        '<div class="detail-stat"><div class="k">' + (isIncome ? '应收' : '应投入') + '</div><div class="v">' + money(st.expected) + '</div></div>' +
        '<div class="detail-stat"><div class="k">' + (isIncome ? '已收入' : '已记录') + '</div><div class="v">' + money(st.actual) + '</div></div>' +
        '<div class="detail-stat"><div class="k">已持续</div><div class="v" style="font-size:14px">' + (st.periods ? st.elapsed : '未开始') + '</div></div>';
      chartTitle = '累计记录';
      chartSub = '虚线为计划，实线为实际';
      chartHtml = recurringChartHTML(p, ui.recurringChartMode);
      chartNote = '<div class="mini-note">' + icon('i-info') + '<span>' + (isIncome ? '收入' : '支出') + '按实际记录累计；虚线按每期金额生成，只作对照。' + (st.missing ? '仍有 ' + st.missing + ' 期未记录。' : '') + '</span></div>';
      toggleHtml = '<div class="segmented"><button type="button" data-action="recurring-chart-mode" data-mode="cumulative" class="' + (ui.recurringChartMode === 'cumulative' ? 'active' : '') + '">累计</button><button type="button" data-action="recurring-chart-mode" data-mode="period" class="' + (ui.recurringChartMode === 'period' ? 'active' : '') + '">每期</button></div>';
    }

    var progress = (p.type === 'fixed' || p.type === 'income') ? progressCardHTML(p, st) : (p.type === 'item' ? itemMilestonesHTML(p, st) : '');
    var recordsTitle = p.type === 'item' ? '分摊信息' : (p.type === 'bill' ? '账单明细' : (isIncome ? '收入明细' : '支出明细'));
    var recordsSub = p.type === 'item' ? '按使用天数实时计算' : ((p.entries || []).length + ' 条记录');
    var noteHtml = p.note ? '<div class="mini-note">' + icon('i-edit') + '<span>' + esc(p.note) + '</span></div>' : '';

    return '<section class="detail-hero type-' + p.type + '">' +
        '<div class="detail-kicker">' + icon(t.icon) + '<span>' + t.label + '</span><span class="type-dot"></span><span>' + (p.type === 'item' ? '按天分摊' : p.type === 'bill' ? BILL_CYCLES[p.cycle] : cycleText(p.cycle) + ' · ' + (p.type === 'income' ? (p.incomeKind === 'other' ? '其他收入' : '工资') : '固定金额')) + '</span></div>' +
        '<div class="detail-name">' + esc(p.name) + '</div>' +
        (p.note ? '<div class="detail-note">' + esc(p.note) + '</div>' : '') +
        '<div class="detail-big"><strong>' + heroBig + '</strong><span class="big-unit">' + heroUnit + '</span></div>' +
        '<div class="detail-hero-foot">' + heroFoot + '</div>' +
      '</section>' +
      '<div class="detail-stats">' + statsHtml + '</div>' +
      '<div class="detail-section"><div class="detail-section-head"><div class="detail-section-title">' + chartTitle + '<small>' + chartSub + '</small></div>' + toggleHtml + '</div>' +
        '<div class="chart-card"><div class="chart-wrap">' + chartHtml + '</div>' + chartNote + '</div></div>' +
      (progress ? '<div class="detail-section">' + progress + '</div>' : '') +
      '<div class="detail-section"><div class="detail-section-head"><div class="detail-section-title">' + recordsTitle + '<small>' + recordsSub + '</small></div>' +
        (p.type === 'item' ? '' : '<button class="text-btn" type="button" data-action="open-entry-form" data-project="' + esc(p.id) + '">+ 添加</button>') + '</div>' +
        (p.type === 'item' ? '<div class="progress-card"><div class="progress-top"><span class="label">当前日均</span><span class="val">' + money(st.daily, { digits: 2 }) + ' / 天</span></div>' +
          '<div class="progress-legend" style="margin-top:9px"><span>按已使用 <b>' + st.days + ' 天</b> 计算</span><span>再用 1 天 <b>' + money(p.price / Math.max(1, st.days + 1), { digits: 2 }) + '/天</b></span></div></div>' : recordListHTML(p)) +
        noteHtml + '</div>';
  }

  function detailFooterHTML(p) {
    if (p.type === 'item') {
      return '<button class="btn btn-primary" type="button" data-action="open-project-form" data-id="' + esc(p.id) + '">' + icon('i-edit') + '编辑物品信息</button>';
    }
    var label = p.type === 'income' ? '记一笔收入' : '记一笔支出';
    return '<button class="btn btn-primary ' + (p.type === 'income' ? 'income' : '') + '" type="button" data-action="open-entry-form" data-project="' + esc(p.id) + '">' + icon('i-plus') + label + '</button>';
  }

  function refreshDetail() {
    var p = ui.detailId ? getProject(ui.detailId) : null;
    var overlay = document.querySelector('[data-overlay="detail"]');
    if (!p || !overlay) return;
    var body = overlay.querySelector('#detail-body');
    var foot = overlay.querySelector('#detail-footer');
    if (body) body.innerHTML = detailBodyHTML(p);
    if (foot) foot.innerHTML = detailFooterHTML(p);
    updateChrome();
  }

  function openDetail(id) {
    var p = getProject(id);
    if (!p) return;
    closeAllOverlays();
    ui.detailId = id;
    var el = pushOverlay(
      '<div class="overlay full" data-overlay="detail">' +
        '<div class="overlay-backdrop"></div>' +
        '<div class="overlay-panel detail-screen">' +
          '<div class="detail-top">' +
            '<button class="icon-btn" type="button" data-action="close-overlay" aria-label="返回">' + icon('i-back') + '</button>' +
            '<div class="head-title">项目详情</div>' +
            '<button class="icon-btn" type="button" data-action="open-project-form" data-id="' + esc(p.id) + '" aria-label="编辑">' + icon('i-edit') + '</button>' +
          '</div>' +
          '<div class="overlay-body detail-body" id="detail-body"></div>' +
          '<div class="detail-footer" id="detail-footer"></div>' +
        '</div>' +
      '</div>'
    );
    refreshDetail();
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* 新增 / 编辑项目                                                     */
  /* ------------------------------------------------------------------ */

  function defaultProjectDraft() {
    return {
      name: '', note: '', price: '', purchaseDate: todayISO(),
      cycle: 'month', amount: '', startDate: todayISO(), incomeKind: 'salary'
    };
  }

  function draftFromProject(p) {
    var d = defaultProjectDraft();
    d.name = p.name || '';
    d.note = p.note || '';
    if (p.type === 'item') {
      d.price = String(p.price);
      d.purchaseDate = p.purchaseDate;
    } else if (p.type === 'bill') {
      d.cycle = p.cycle || 'month';
    } else {
      d.amount = String(p.amount);
      d.startDate = p.startDate;
      d.cycle = p.cycle;
      d.incomeKind = p.incomeKind || 'salary';
    }
    return d;
  }

  function typeOptionsHTML(selected) {
    return Object.keys(TYPES).map(function (key) {
      var t = TYPES[key];
      return '<button class="type-option ' + (selected === key ? 'selected' : '') + '" type="button" data-action="select-project-type" data-type="' + key + '" style="--c:' + t.color + ';--s:' + t.soft + '">' +
        '<span class="to-icon">' + icon(t.icon) + '</span>' +
        '<span class="to-body"><span class="to-name">' + t.label + '</span><span class="to-desc">' + t.desc + '</span></span>' +
        '<span class="to-check">' + icon('i-check') + '</span></button>';
    }).join('');
  }

  function formField(label, name, value, opts) {
    opts = opts || {};
    var input = opts.textarea
      ? '<textarea id="field-' + name + '" data-field="' + name + '" maxlength="' + (opts.maxlength || 120) + '" placeholder="' + esc(opts.placeholder || '') + '">' + esc(value || '') + '</textarea>'
      : '<input id="field-' + name + '" data-field="' + name + '" value="' + esc(value || '') + '" ' +
        (opts.type === 'number' ? 'type="number" inputmode="decimal" step="0.01" min="0"' : 'type="' + (opts.type || 'text') + '"') +
        (opts.max ? ' max="' + opts.max + '"' : '') +
        ' maxlength="' + (opts.maxlength || 40) + '" placeholder="' + esc(opts.placeholder || '') + '">';
    return '<div class="form-section"><label class="form-label" for="field-' + name + '">' + label +
      (opts.optional ? '<span class="optional">' + opts.optional + '</span>' : '') + '</label>' +
      '<div class="field">' + (opts.prefix ? '<span class="prefix">' + opts.prefix + '</span>' : '') + input + '</div>' +
      (opts.hint ? '<div class="field-hint">' + opts.hint + '</div>' : '') + '</div>';
  }

  function selectField(label, name, value, options) {
    return '<div class="form-section"><label class="form-label" for="field-' + name + '">' + label + '</label>' +
      '<div class="field"><span class="select-wrap"><select id="field-' + name + '" data-field="' + name + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '" ' + (String(value) === String(o.value) ? 'selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select></span></div></div>';
  }

  function paintProjectForm() {
    var overlay = document.querySelector('[data-overlay="project-form"]');
    if (!overlay) return;
    var isEdit = !!ui.formProjectId;
    var type = ui.formType;
    var t = TYPES[type];
    var d = ui.formDraft;
    var title = isEdit ? '编辑' + t.label : '新增项目';
    overlay.querySelector('.head-title').textContent = title;
    var body = overlay.querySelector('#project-form-body');
    var typeSection = '';
    if (isEdit) {
      typeSection = '<div class="form-section"><div class="form-label">项目类型</div><div class="pill-note" style="' + typeVars(type) + ';color:' + t.color + ';background:' + t.soft + ';border-color:' + t.soft + '">' + icon(t.icon) + t.label + '</div><div class="field-hint">项目类型创建后不可更改。</div></div>';
    } else {
      typeSection = '<div class="form-section"><div class="form-label">项目类型</div><div class="type-grid">' + typeOptionsHTML(type) + '</div></div>';
    }

    var fields = '';
    if (type === 'item') {
      fields += formField('价格', 'price', d.price, { type: 'number', prefix: '¥', placeholder: '例如 4999', hint: '日分摊 = 价格 ÷ 已使用天数，每天自动更新。' });
      fields += formField('购买日期', 'purchaseDate', d.purchaseDate, { type: 'date', max: todayISO() });
    } else if (type === 'bill') {
      fields += selectField('计费周期', 'cycle', d.cycle, Object.keys(BILL_CYCLES).map(function (k) { return { value: k, label: BILL_CYCLES[k] }; }));
      fields += '<div class="field-hint" style="margin-top:6px">周期只用于统计均值和展示，账单仍按每笔实际日期记录。</div>';
    } else {
      fields += formField(type === 'income' ? '每期收入' : '每期支出', 'amount', d.amount, { type: 'number', prefix: '¥', placeholder: '例如 ' + (type === 'income' ? '18000' : '4200'), hint: '按固定周期记录，首页会显示已进行期数和累计金额。' });
      fields += formField('开始日期', 'startDate', d.startDate, { type: 'date' });
      fields += selectField('周期', 'cycle', d.cycle, Object.keys(CYCLES).map(function (k) { return { value: k, label: CYCLES[k].label }; }));
      if (type === 'income') {
        fields += selectField('收入性质', 'incomeKind', d.incomeKind, [{ value: 'salary', label: '工资' }, { value: 'other', label: '其他收入' }]);
      }
    }
    fields += formField('备注', 'note', d.note, { textarea: true, optional: '可选', placeholder: '写点说明，例如：公司配的电脑 / 房租押一付三', maxlength: 120, hint: '' });

    body.innerHTML =
      '<form id="project-form" autocomplete="off" novalidate>' +
        typeSection +
        formField('名称', 'name', d.name, { placeholder: type === 'item' ? '例如 MacBook Pro' : type === 'bill' ? '例如 电费' : type === 'fixed' ? '例如 房租' : '例如 工资', maxlength: 40 }) +
        fields +
        '<div id="project-error" class="form-error"></div>' +
        '<div class="form-actions"><button class="btn btn-soft" type="button" data-action="close-overlay">取消</button>' +
          '<button class="btn btn-primary" type="submit">' + (isEdit ? '保存修改' : '创建项目') + '</button></div>' +
        (isEdit ? '<div class="form-delete"><button type="button" data-action="delete-project" data-id="' + esc(ui.formProjectId) + '">' + icon('i-trash') + ' 删除这个项目</button></div>' : '') +
      '</form>';
    body.querySelector('#project-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitProject();
    });
    bindDraftInputs();
  }

  function bindDraftInputs() {
    var form = document.getElementById('project-form');
    if (!form) return;
    form.querySelectorAll('[data-field]').forEach(function (el) {
      el.addEventListener('input', function () {
        ui.formDraft[el.dataset.field] = el.value;
      });
      el.addEventListener('change', function () {
        ui.formDraft[el.dataset.field] = el.value;
      });
    });
  }

  function collectProjectDraft() {
    var form = document.getElementById('project-form');
    if (!form) return;
    form.querySelectorAll('[data-field]').forEach(function (el) {
      ui.formDraft[el.dataset.field] = el.value;
    });
  }

  function showProjectError(msg) {
    var el = document.getElementById('project-error');
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.classList.add('show');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function openProjectForm(type, id) {
    var p = id ? getProject(id) : null;
    if (id && !p) return;
    ui.formProjectId = p ? p.id : null;
    ui.formType = p ? p.type : (type || 'item');
    ui.formDraft = p ? draftFromProject(p) : defaultProjectDraft();
    var el = pushOverlay(
      '<div class="overlay full" data-overlay="project-form">' +
        '<div class="overlay-backdrop"></div>' +
        '<div class="overlay-panel detail-screen">' +
          '<div class="overlay-head">' +
            '<button class="icon-btn" type="button" data-action="close-overlay" aria-label="关闭">' + icon('i-close') + '</button>' +
            '<div class="head-title">新增项目</div>' +
            '<button class="text-btn" type="button" data-action="submit-project">保存</button>' +
          '</div>' +
          '<div class="overlay-body form-body" id="project-form-body"></div>' +
        '</div>' +
      '</div>'
    );
    paintProjectForm();
    return el;
  }

  function submitProject() {
    collectProjectDraft();
    var d = ui.formDraft;
    var name = cleanText(d.name, 40);
    if (!name) { showProjectError('给项目起一个名字吧'); return; }
    var type = ui.formType;
    var existing = ui.formProjectId ? getProject(ui.formProjectId) : null;
    var p;
    if (existing) {
      p = existing;
    } else {
      p = {
        id: uid('p'), type: type, name: name, note: cleanText(d.note, 120),
        createdAt: Date.now(), updatedAt: Date.now()
      };
    }
    p.name = name;
    p.note = cleanText(d.note, 120);
    if (type === 'item') {
      var price = num(d.price);
      if (!isFinite(price) || price <= 0) { showProjectError('请输入大于 0 的价格'); return; }
      if (!validISO(d.purchaseDate)) { showProjectError('请选择购买日期'); return; }
      if (d.purchaseDate > todayISO()) { showProjectError('购买日期不能晚于今天'); return; }
      p.price = round2(price);
      p.purchaseDate = d.purchaseDate;
    } else if (type === 'bill') {
      if (!BILL_CYCLES[d.cycle]) { showProjectError('请选择计费周期'); return; }
      p.cycle = d.cycle;
      if (!p.entries) p.entries = [];
    } else {
      var amount = num(d.amount);
      if (!isFinite(amount) || amount <= 0) { showProjectError('请输入大于 0 的每期金额'); return; }
      if (!validISO(d.startDate)) { showProjectError('请选择开始日期'); return; }
      if (!CYCLES[d.cycle]) { showProjectError('请选择周期'); return; }
      p.amount = round2(amount);
      p.startDate = d.startDate;
      p.cycle = d.cycle;
      if (type === 'income') p.incomeKind = d.incomeKind === 'other' ? 'other' : 'salary';
      if (!p.entries) p.entries = [];
    }
    if (!existing) {
      data.projects.push(p);
      ui.filter = 'all';
    }
    p.updatedAt = Date.now();
    if (!saveData()) return;
    var wasEdit = !!existing;
    var id = p.id;
    closeTopOverlay();
    refreshAll();
    if (wasEdit) {
      if (ui.detailId === id) refreshDetail();
      toast('已保存修改');
    } else {
      openDetail(id);
      toast(type === 'item' ? '物品已添加，日均开始计算' : '项目已创建，可以开始记录了');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 记一笔 / 编辑记录                                                   */
  /* ------------------------------------------------------------------ */

  function defaultEntryDate(p) {
    if (p.type === 'fixed' || p.type === 'income') {
      var due = dueDates(p);
      if (due.length) return due[due.length - 1];
    }
    return todayISO();
  }

  function openEntryForm(projectId, entryId) {
    var p = getProject(projectId);
    if (!p || p.type === 'item') return;
    var entry = null;
    if (entryId) {
      (p.entries || []).forEach(function (e) { if (e.id === entryId) entry = e; });
    }
    ui.entryProjectId = p.id;
    ui.entryId = entry ? entry.id : null;
    var isEdit = !!entry;
    var st = projectStats(p);
    var amount = entry ? String(entry.amount) : (p.type === 'bill' ? '' : String(p.amount));
    var date = entry ? entry.date : defaultEntryDate(p);
    var note = entry ? entry.note : '';
    var isIncome = p.type === 'income';
    var quick = p.type === 'bill'
      ? [50, 100, 200, 500]
      : [p.amount, p.amount * 2, p.amount * 3, p.amount * 6];
    var quickHtml = quick.filter(function (v, i, arr) { return arr.indexOf(v) === i && v > 0; }).map(function (v) {
      return '<button type="button" data-action="set-entry-amount" data-amount="' + v + '">' + money(v) + '</button>';
    }).join('');
    var planHint = '';
    if (p.type === 'fixed' || p.type === 'income') {
      planHint = '<div class="field-hint">计划每期 ' + money(p.amount) + ' · ' + cycleText(p.cycle) + ' · 已进行 ' + st.periods + ' 期' + (st.missing ? ' · 待记 ' + st.missing + ' 期' : '') + '</div>';
    }
    var el = pushOverlay(
      '<div class="overlay" data-overlay="entry">' +
        '<div class="overlay-backdrop" data-action="close-overlay"></div>' +
        '<div class="overlay-panel sheet-panel">' +
          '<div class="sheet-grab"></div>' +
          '<div class="sheet-head"><h2>' + (isEdit ? '编辑记录' : (isIncome ? '记一笔收入' : '记一笔支出')) + '</h2>' +
            '<button class="icon-btn" type="button" data-action="close-overlay" aria-label="关闭">' + icon('i-close') + '</button></div>' +
          '<div class="overlay-body">' +
            '<form id="entry-form" autocomplete="off" novalidate>' +
              '<div class="form-section"><label class="form-label" for="entry-amount">金额</label>' +
                '<div class="field"><span class="prefix">¥</span><input id="entry-amount" data-entry-field="amount" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(amount) + '" placeholder="0.00"></div>' +
                '<div class="quick-amounts">' + quickHtml + '</div>' + planHint +
              '</div>' +
              '<div class="form-section"><label class="form-label" for="entry-date">日期</label>' +
                '<div class="field"><input id="entry-date" data-entry-field="date" type="date" value="' + esc(date) + '" max="' + todayISO() + '"></div></div>' +
              '<div class="form-section"><label class="form-label" for="entry-note">备注 <span class="optional">可选</span></label>' +
                '<div class="field"><input id="entry-note" data-entry-field="note" value="' + esc(note) + '" maxlength="80" placeholder="例如：11 月电费 / 补发"></div></div>' +
              '<div id="entry-error" class="form-error"></div>' +
              '<div class="form-actions"><button class="btn btn-soft" type="button" data-action="close-overlay">取消</button>' +
                '<button class="btn btn-primary" type="submit">' + (isEdit ? '保存修改' : '保存记录') + '</button></div>' +
              (isEdit ? '<div class="form-delete"><button type="button" data-action="delete-entry" data-project="' + esc(p.id) + '" data-entry="' + esc(entry.id) + '">' + icon('i-trash') + ' 删除这条记录</button></div>' : '') +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    el.querySelector('#entry-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitEntry();
    });
    setTimeout(function () {
      var input = el.querySelector('#entry-amount');
      if (input) input.focus();
    }, 260);
    return el;
  }

  function showEntryError(msg) {
    var el = document.getElementById('entry-error');
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.classList.add('show');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submitEntry() {
    var p = getProject(ui.entryProjectId);
    if (!p) return;
    var amountEl = document.querySelector('[data-entry-field="amount"]');
    var dateEl = document.querySelector('[data-entry-field="date"]');
    var noteEl = document.querySelector('[data-entry-field="note"]');
    var amount = num(amountEl ? amountEl.value : '');
    var date = dateEl ? dateEl.value : '';
    if (!isFinite(amount) || amount <= 0) { showEntryError('请输入大于 0 的金额'); return; }
    if (!validISO(date)) { showEntryError('请选择记录日期'); return; }
    if (date > todayISO()) { showEntryError('日期不能晚于今天'); return; }
    var note = cleanText(noteEl ? noteEl.value : '', 80);
    var wasEdit = !!ui.entryId;
    if (wasEdit) {
      var entry = null;
      (p.entries || []).forEach(function (e) { if (e.id === ui.entryId) entry = e; });
      if (entry) { entry.amount = round2(amount); entry.date = date; entry.note = note; }
    } else {
      p.entries = p.entries || [];
      p.entries.push({ id: uid('e'), date: date, amount: round2(amount), note: note });
      p.entries.sort(function (a, b) { return a.date.localeCompare(b.date); });
    }
    p.updatedAt = Date.now();
    if (!saveData()) return;
    closeTopOverlay();
    refreshAll();
    refreshDetail();
    toast(wasEdit ? '记录已更新' : '已记下这笔');
  }

  function backfillDue(projectId) {
    var p = getProject(projectId);
    if (!p) return;
    var st = projectStats(p);
    if (!st.missing || st.missing <= 0) { toast('没有需要补记的期数'); return; }
    var missing = st.missing;
    var total = round2(missing * p.amount);
    var isIncome = p.type === 'income';
    showConfirm(
      '补记到期记录',
      '将按计划日期补记 ' + missing + ' 期，共 ' + money(total) + '。补记后可以逐笔修改日期、金额或备注。',
      '补记 ' + missing + ' 期',
      false,
      function () {
        var due = dueDates(p);
        var existing = (p.entries || []).length;
        var todo = due.slice(existing);
        todo.forEach(function (d, i) {
          p.entries.push({
            id: uid('e'), date: d, amount: round2(p.amount),
            note: '第 ' + (existing + i + 1) + ' 期'
          });
        });
        p.entries.sort(function (a, b) { return a.date.localeCompare(b.date); });
        p.updatedAt = Date.now();
        saveData();
        refreshAll();
        refreshDetail();
        toast('已补记 ' + todo.length + ' 期' + (isIncome ? '收入' : '支出'));
      }
    );
  }

  /* ------------------------------------------------------------------ */
  /* 通用弹层 / 对话框 / toast                                           */
  /* ------------------------------------------------------------------ */

  function pushOverlay(html) {
    var root = document.getElementById('overlay-root');
    var temp = document.createElement('div');
    temp.innerHTML = html.trim();
    var el = temp.firstElementChild;
    root.appendChild(el);
    ui.overlays.push(el);
    document.body.classList.add('locked');
    updateChrome();
    return el;
  }

  function closeTopOverlay() {
    var el = ui.overlays.pop();
    if (!el) return false;
    var kind = el.getAttribute('data-overlay');
    el.remove();
    if (kind === 'detail') ui.detailId = null;
    if (kind === 'project-form') { ui.formProjectId = null; ui.formDraft = {}; }
    if (kind === 'entry') { ui.entryProjectId = null; ui.entryId = null; }
    if (!ui.overlays.length) document.body.classList.remove('locked');
    updateChrome();
    return true;
  }

  function closeAllOverlays() {
    while (ui.overlays.length) {
      var el = ui.overlays.pop();
      el.remove();
    }
    ui.detailId = null;
    ui.formProjectId = null;
    ui.formDraft = {};
    ui.entryProjectId = null;
    ui.entryId = null;
    document.body.classList.remove('locked');
    updateChrome();
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function showConfirm(title, message, confirmText, danger, onConfirm) {
    closeDialog();
    ui.pendingConfirm = onConfirm || null;
    var root = document.getElementById('overlay-root');
    var wrap = document.createElement('div');
    wrap.className = 'dialog-overlay';
    wrap.innerHTML = '<div class="dialog-backdrop" data-action="dialog-cancel"></div>' +
      '<div class="dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p>' +
      '<div class="dialog-actions"><button class="btn btn-soft" type="button" data-action="dialog-cancel">取消</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-action="dialog-confirm">' + esc(confirmText || '确定') + '</button></div></div>';
    root.appendChild(wrap);
    ui.dialogEl = wrap;
  }

  function showInfo(title, message) {
    closeDialog();
    var root = document.getElementById('overlay-root');
    var wrap = document.createElement('div');
    wrap.className = 'dialog-overlay';
    wrap.innerHTML = '<div class="dialog-backdrop" data-action="dialog-cancel"></div>' +
      '<div class="dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + message + '</p>' +
      '<div class="dialog-actions"><button class="btn btn-primary" type="button" data-action="dialog-cancel">知道了</button></div></div>';
    root.appendChild(wrap);
    ui.dialogEl = wrap;
  }

  function closeDialog() {
    if (ui.dialogEl) { ui.dialogEl.remove(); ui.dialogEl = null; }
    ui.pendingConfirm = null;
  }

  function confirmDialog() {
    var fn = ui.pendingConfirm;
    closeDialog();
    if (fn) fn();
  }

  function deleteEntry(projectId, entryId) {
    showConfirm('删除这条记录', '删除后，统计数据会立即更新，且无法恢复。', '删除记录', true, function () {
      var p = getProject(projectId);
      if (!p) return;
      p.entries = (p.entries || []).filter(function (e) { return e.id !== entryId; });
      p.updatedAt = Date.now();
      saveData();
      closeAllOverlays();
      refreshAll();
      openDetail(projectId);
      toast('记录已删除');
    });
  }

  function deleteProject(projectId) {
    var p = getProject(projectId);
    if (!p) return;
    var count = (p.entries || []).length;
    showConfirm('删除这个项目', '将删除「' + p.name + '」' + (count ? '及 ' + count + ' 条记录' : '') + '，操作无法恢复。', '删除项目', true, function () {
      data.projects = data.projects.filter(function (x) { return x.id !== projectId; });
      saveData();
      closeAllOverlays();
      refreshAll();
      toast('项目已删除');
    });
  }

  /* ------------------------------------------------------------------ */
  /* 备份 / 示例 / 清空                                                  */
  /* ------------------------------------------------------------------ */

  function copyText(text, callback) {
    function done() { if (callback) callback(); }
    if (window.Android && typeof window.Android.copy === 'function') {
      try { window.Android.copy(text); toast('已复制到剪贴板'); done(); return; } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); done(); }).catch(function () { fallbackCopy(text); done(); });
      return;
    }
    fallbackCopy(text);
    done();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请长按选择'); }
    ta.remove();
  }

  function openBackup() {
    var text = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: data.projects
    }, null, 2);
    pushOverlay(
      '<div class="overlay" data-overlay="backup">' +
        '<div class="overlay-backdrop" data-action="close-overlay"></div>' +
        '<div class="overlay-panel sheet-panel">' +
          '<div class="sheet-grab"></div>' +
          '<div class="sheet-head"><h2>导出备份</h2><button class="icon-btn" type="button" data-action="close-overlay" aria-label="关闭">' + icon('i-close') + '</button></div>' +
          '<div class="overlay-body">' +
            '<div class="field-hint" style="margin:0 2px 9px">复制下面全部内容，粘贴到备忘录、聊天窗口或电脑上保存。换手机时再用「导入备份」恢复。</div>' +
            '<textarea class="backup-area" id="backup-text" readonly>' + esc(text) + '</textarea>' +
            '<div class="backup-actions"><button class="btn btn-soft" type="button" data-action="close-overlay">关闭</button><button class="btn btn-primary" type="button" data-action="copy-backup">复制 JSON</button></div>' +
            '<div class="mini-note">' + icon('i-info') + '<span>备份包含所有项目和记录，不包含手机上的其他信息。</span></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function openImport() {
    pushOverlay(
      '<div class="overlay full" data-overlay="import">' +
        '<div class="overlay-backdrop"></div>' +
        '<div class="overlay-panel detail-screen">' +
          '<div class="overlay-head"><button class="icon-btn" type="button" data-action="close-overlay" aria-label="关闭">' + icon('i-close') + '</button>' +
            '<div class="head-title">导入备份</div><button class="text-btn" type="button" data-action="do-import">导入</button></div>' +
          '<div class="overlay-body" style="padding:8px 18px calc(26px + var(--safe-bottom))">' +
            '<div class="field-hint" style="margin:0 2px 9px">粘贴之前导出的 JSON。导入会覆盖当前所有项目和记录，请先导出一份当前数据。</div>' +
            '<textarea class="backup-area" id="import-text" placeholder="在这里粘贴备份 JSON…"></textarea>' +
            '<div id="import-error" class="form-error"></div>' +
            '<div class="backup-actions"><button class="btn btn-soft" type="button" data-action="close-overlay">取消</button><button class="btn btn-primary" type="button" data-action="do-import">导入并覆盖</button></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function doImport() {
    var ta = document.getElementById('import-text');
    var err = document.getElementById('import-error');
    if (!ta) return;
    var raw;
    try { raw = JSON.parse(ta.value); } catch (e) {
      err.textContent = 'JSON 格式不正确，请检查是否复制完整';
      err.classList.add('show');
      return;
    }
    var normalized = normalizeData(raw);
    if (!normalized.projects.length && raw && raw.projects && raw.projects.length) {
      err.textContent = '没有识别到有效项目，请确认这是「日计」导出的备份';
      err.classList.add('show');
      return;
    }
    showConfirm('覆盖当前数据', '将用备份中的 ' + normalized.projects.length + ' 个项目替换当前 ' + data.projects.length + ' 个项目。此操作无法撤销。', '确认覆盖', true, function () {
      data = normalized;
      saveData();
      closeAllOverlays();
      refreshAll();
      toast('备份已导入');
    });
  }

  function showHelp() {
    showInfo('计算口径',
      '• 高价物品：日均 = 购买价 ÷ 已使用天数（含购买当天）。<br><br>' +
      '• 周期账单：每笔按实际日期和金额记录，图表可看逐笔或按月趋势。<br><br>' +
      '• 固定支出 / 收入：按开始日期和周期算出「应进行期数」；「已记录」只统计你实际添加的明细。补记会按计划日期生成记录，可再修改。<br><br>' +
      '• 首页本月收支只统计实际记录；物品在购买当月一次性计入支出。'
    );
  }

  function buildDemoProjects() {
    var now = new Date();
    var today = todayISO();
    var projects = [];
    var base = Date.now() - 10000;

    var mac = {
      id: uid('p'), type: 'item', name: 'MacBook Pro', note: '每天办公的主力机',
      price: 14999, purchaseDate: addDaysISO(today, -412),
      createdAt: base, updatedAt: base
    };
    var headphones = {
      id: uid('p'), type: 'item', name: '降噪耳机', note: '通勤和专注时用',
      price: 1999, purchaseDate: addDaysISO(today, -126),
      createdAt: base + 1, updatedAt: base + 1
    };
    projects.push(mac, headphones);

    var electricity = {
      id: uid('p'), type: 'bill', name: '电费', note: '国家电网 · 每月出账',
      cycle: 'month', entries: [], createdAt: base + 2, updatedAt: base + 2
    };
    for (var i = 7; i >= 0; i--) {
      var d = addMonthsISO(today.slice(0, 7) + '-12', -i);
      if (d > today) continue;
      electricity.entries.push({ id: uid('e'), date: d, amount: round2(168 + (i % 4) * 27 + (i % 3) * 11), note: '第 ' + (8 - i) + ' 期电费' });
    }
    projects.push(electricity);

    var water = {
      id: uid('p'), type: 'bill', name: '水费', note: '两个月抄一次表',
      cycle: 'quarter', entries: [], createdAt: base + 3, updatedAt: base + 3
    };
    for (var w = 3; w >= 0; w--) {
      var wd = addMonthsISO(today.slice(0, 7) + '-08', -w * 2);
      if (wd > today) continue;
      water.entries.push({ id: uid('e'), date: wd, amount: round2(52 + (w % 2) * 13), note: '水费' });
    }
    projects.push(water);

    var rent = {
      id: uid('p'), type: 'fixed', name: '房租', note: '押一付三 · 每月 1 号',
      amount: 4200, startDate: addMonthsISO(today.slice(0, 7) + '-01', -19), cycle: 'month',
      entries: [], createdAt: base + 4, updatedAt: base + 4
    };
    var rentDue = dueDates(rent);
    rentDue.forEach(function (d, idx) {
      rent.entries.push({ id: uid('e'), date: d, amount: 4200, note: '第 ' + (idx + 1) + ' 期房租' });
    });
    projects.push(rent);

    var insurance = {
      id: uid('p'), type: 'fixed', name: '重疾险', note: '每年 6 月扣款',
      amount: 6800, startDate: addYearsISO(today, -2).slice(0, 4) + '-06-15', cycle: 'year',
      entries: [], createdAt: base + 5, updatedAt: base + 5
    };
    var insDue = dueDates(insurance);
    insDue.forEach(function (d, idx) {
      insurance.entries.push({ id: uid('e'), date: d, amount: 6800, note: '第 ' + (idx + 1) + ' 年保费' });
    });
    projects.push(insurance);

    var salary = {
      id: uid('p'), type: 'income', name: '工资', note: '税后月薪',
      amount: 18000, startDate: addMonthsISO(today.slice(0, 7) + '-10', -19), cycle: 'month',
      incomeKind: 'salary', entries: [], createdAt: base + 6, updatedAt: base + 6
    };
    var salDue = dueDates(salary);
    salDue.forEach(function (d, idx) {
      salary.entries.push({ id: uid('e'), date: d, amount: 18000, note: '第 ' + (idx + 1) + ' 个月工资' });
    });
    projects.push(salary);

    var side = {
      id: uid('p'), type: 'income', name: '设计外包', note: '不固定，但按月记录',
      amount: 3200, startDate: addMonthsISO(today.slice(0, 7) + '-18', -10), cycle: 'month',
      incomeKind: 'other', entries: [], createdAt: base + 7, updatedAt: base + 7
    };
    for (var s = 9; s >= 0; s--) {
      var sd = addMonthsISO(side.startDate, s);
      if (sd > today) continue;
      side.entries.push({ id: uid('e'), date: sd, amount: round2(1800 + s * 180), note: '外包结算' });
    }
    projects.push(side);
    return projects;
  }

  function loadDemo() {
    showConfirm('载入示例数据', '会追加 8 个示例项目（物品、账单、房租、保险、工资等），不会删除你已有的数据。示例可以随时删除。', '载入示例', false, function () {
      var demo = buildDemoProjects();
      data.projects = data.projects.concat(demo);
      saveData();
      closeAllOverlays();
      refreshAll();
      toast('示例数据已载入');
    });
  }

  function clearData() {
    showConfirm('清空全部数据', '将删除 ' + data.projects.length + ' 个项目和 ' + totalEntryCount() + ' 条记录，无法恢复。建议先导出备份。', '全部删除', true, function () {
      data = defaultData();
      saveData();
      closeAllOverlays();
      refreshAll();
      toast('数据已清空');
    });
  }

  /* ------------------------------------------------------------------ */
  /* 视图切换与事件                                                      */
  /* ------------------------------------------------------------------ */

  function refreshAll() {
    renderHome();
    renderAnalysis();
    renderSettings();
  }

  function switchTab(tab) {
    ui.tab = tab;
    ['home', 'analysis', 'settings'].forEach(function (k) {
      var screen = document.getElementById('screen-' + k);
      if (screen) screen.classList.toggle('active', k === tab);
    });
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    if (tab === 'home') renderHome();
    else if (tab === 'analysis') renderAnalysis();
    else renderSettings();
    window.scrollTo(0, 0);
    updateChrome();
  }

  function handleAction(el) {
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    switch (action) {
      case 'open-project-form':
        openProjectForm(el.getAttribute('data-type') || 'item', id || null);
        break;
      case 'select-project-type':
        collectProjectDraft();
        ui.formType = el.getAttribute('data-type');
        paintProjectForm();
        break;
      case 'submit-project':
        submitProject();
        break;
      case 'open-detail':
        if (id) openDetail(id);
        break;
      case 'open-entry-form':
        var pid = el.getAttribute('data-project') || id;
        if (pid) openEntryForm(pid, el.getAttribute('data-entry') || null);
        break;
      case 'submit-entry':
        submitEntry();
        break;
      case 'set-entry-amount':
        var amountInput = document.querySelector('[data-entry-field="amount"]');
        if (amountInput) {
          amountInput.value = el.getAttribute('data-amount');
          amountInput.focus();
        }
        break;
      case 'set-filter':
        ui.filter = el.getAttribute('data-filter');
        renderHome();
        break;
      case 'set-analysis-mode':
        setAnalysisMode(el.getAttribute('data-mode'));
        break;
      case 'analysis-prev':
        shiftAnalysis(-1);
        break;
      case 'analysis-next':
        shiftAnalysis(1);
        break;
      case 'set-analysis-series':
        ui.analysisSeries = el.getAttribute('data-series') === 'income' ? 'income' : 'expense';
        renderAnalysis();
        break;
      case 'set-analysis-chart-type':
        ui.analysisChartType = el.getAttribute('data-type') === 'bar' ? 'bar' : 'line';
        renderAnalysis();
        break;
      case 'set-breakdown-scope':
        ui.breakdownScope = el.getAttribute('data-scope') === 'period' ? 'period' : 'all';
        renderAnalysis();
        break;
      case 'bill-chart-mode':
        ui.billChartMode = el.getAttribute('data-mode') === 'month' ? 'month' : 'entry';
        refreshDetail();
        break;
      case 'recurring-chart-mode':
        ui.recurringChartMode = el.getAttribute('data-mode') === 'period' ? 'period' : 'cumulative';
        refreshDetail();
        break;
      case 'backfill':
        backfillDue(id);
        break;
      case 'delete-project':
        deleteProject(id);
        break;
      case 'delete-entry':
        deleteEntry(el.getAttribute('data-project'), el.getAttribute('data-entry'));
        break;
      case 'close-overlay':
        closeTopOverlay();
        break;
      case 'dialog-cancel':
        closeDialog();
        break;
      case 'dialog-confirm':
        confirmDialog();
        break;
      case 'open-backup':
        openBackup();
        break;
      case 'open-import':
        openImport();
        break;
      case 'copy-backup':
        var backupText = document.getElementById('backup-text');
        if (backupText) copyText(backupText.value);
        break;
      case 'do-import':
        doImport();
        break;
      case 'load-demo':
        loadDemo();
        break;
      case 'clear-data':
        clearData();
        break;
      case 'show-help':
        showHelp();
        break;
      default:
        break;
    }
  }

  document.addEventListener('click', function (e) {
    var tabEl = e.target.closest('[data-tab]');
    if (tabEl) {
      e.preventDefault();
      switchTab(tabEl.getAttribute('data-tab'));
      return;
    }
    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    e.preventDefault();
    handleAction(actionEl);
  });

  document.addEventListener('change', function (e) {
    var yearSelect = e.target.closest('[data-analysis-year]');
    if (yearSelect) {
      ui.analysisYear = parseInt(yearSelect.value, 10) || new Date().getFullYear();
      renderAnalysis();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (ui.dialogEl) closeDialog();
      else if (ui.overlays.length) closeTopOverlay();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var p = ui.detailId ? getProject(ui.detailId) : null;
      refreshAll();
      if (p) refreshDetail();
    }
  });

  window.handleAndroidBack = function () {
    if (ui.dialogEl) { closeDialog(); return true; }
    if (ui.overlays.length) { closeTopOverlay(); return true; }
    return false;
  };

  window.appResume = function () {
    refreshAll();
    if (ui.detailId) refreshDetail();
  };

  window.addEventListener('resize', function () {
    if (!ui.overlays.length) updateChrome();
  });

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    refreshAll();
    switchTab('home');
    var lastVersion = '';
    try { lastVersion = localStorage.getItem('riji.appVersion') || ''; } catch (e) {}
    if (storageMigrated) {
      toast('已自动迁移 ' + data.projects.length + ' 个项目到 SQLite，原有记录未丢失');
    } else if (data.projects.length && lastVersion !== APP_VERSION) {
      toast('已升级到 ' + APP_VERSION + '，原有记录已保留');
    }
    try { localStorage.setItem('riji.appVersion', APP_VERSION); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



