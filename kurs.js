/* Движок тренажёров курса «Управление мультимедиа проектами».
   Без внешних библиотек и без хранилищ браузера: состояние живёт, пока открыта страница.
   Персональные данные никуда не уходят, пока студент сам не нажмёт «Отправить» в Яндекс Форме. */
(function () {
  'use strict';
  const K = window.Kurs = window.Kurs || {};
  K.data = K.data || {};
  const CFG = Object.assign({ formUrl: '', fields: {} }, window.KURS_CONFIG || {});
  K.config = CFG;

  // ---------- утилиты ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = $;
  K.esc = esc;

  K.TRAINERS = {
    P: { file: 'trainer-project-or-process.html', title: 'Проект или процесс', topic: 'Тема 1' },
    T: { file: 'trainer-requirements.html', title: 'Проверяемые требования', topic: 'Тема 2' },
    S: { file: 'critical-path.html', title: 'Сетевой график и критический путь', topic: 'Тема 2' },
    Z: { file: 'trainer-defects.html', title: 'Классификация замечаний', topic: 'Дополнительно' }
  };
  K.letterByTitle = t => Object.keys(K.TRAINERS).find(k => K.TRAINERS[k].title === t) || '';

  function randInt(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  K.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------- тема ----------
  K.initTheme = function () {
    const root = document.documentElement;
    if (new URLSearchParams(location.search).get('theme') === 'light') root.dataset.theme = 'light';
    const btn = $('.theme-btn');
    const sync = () => { if (btn) btn.textContent = root.dataset.theme === 'light' ? 'Тёмная тема' : 'Светлая тема'; };
    sync();
    if (btn) btn.addEventListener('click', () => {
      if (root.dataset.theme === 'light') delete root.dataset.theme; else root.dataset.theme = 'light';
      sync();
    });
    // светлая тема переносится по ссылкам внутри сайта
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || root.dataset.theme !== 'light') return;
      const href = a.getAttribute('href');
      if (!/\.html(\?|#|$)/.test(href) || /^[a-z]+:/i.test(href)) return;
      const u = new URL(href, location.href);
      u.searchParams.set('theme', 'light');
      a.href = u.toString();
    });
  };

  // ---------- коды комнат ----------
  // 5 знаков: буква тренажёра, 3 случайных знака, проверочный знак. Без похожих I, L, O, 0, 1.
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CYR = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'Р': 'P', 'С': 'C', 'Т': 'T',
                'Х': 'X', 'У': 'Y', 'З': '3' };
  const checkChar = body => {
    let s = 0;
    for (let i = 0; i < body.length; i++) s += ALPH.indexOf(body[i]) * (i + 3);
    return ALPH[s % ALPH.length];
  };
  K.makeRoom = function (letter) {
    let body = letter;
    for (let i = 0; i < 3; i++) body += ALPH[randInt(ALPH.length)];
    return body + checkChar(body);
  };
  // студенты набирают код с телефона на русской раскладке: А, В, Е, К… приводим к латинице
  K.normCode = s => String(s || '').toUpperCase().split('').map(c => CYR[c] || c).join('').replace(/[^A-Z0-9]/g, '');
  K.parseRoom = function (s) {
    const c = K.normCode(s);
    if (!c) return { ok: false, msg: 'Введите код комнаты' };
    if (c.length !== 5) return { ok: false, msg: 'Код состоит из 5 знаков' };
    if (![...c].every(ch => ALPH.includes(ch)) || checkChar(c.slice(0, 4)) !== c[4])
      return { ok: false, msg: 'В коде опечатка — сверьте знаки с экраном преподавателя' };
    const t = K.TRAINERS[c[0]];
    if (!t) return { ok: false, msg: 'Такой комнаты нет' };
    return { ok: true, code: c, letter: c[0], trainer: t };
  };

  // ---------- результат ----------
  // Контрольный код: FNV-1a от всех полей результата. Показывает, что числа в выгрузке не правили
  // вручную. От студента, который прочитает этот файл, он не защищает — сервера нет.
  K.hash = function (str) {
    let h = 0x811c9dc5;
    const bytes = new TextEncoder().encode(str);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'K-' + h.toString(36).toUpperCase().padStart(7, '0');
  };
  K.normName = s => String(s || '').replace(/\s+/g, ' ').trim();
  K.normGroup = s => K.normName(s).toUpperCase();
  K.payload = r => ['1', r.trainer, r.room, r.fio, r.group, r.score, r.total, r.mistakes, r.seconds].map(String).join('|');
  K.sign = r => { r.check = K.hash(K.payload(r)); return r; };

  K.FIELDS = ['room', 'fio', 'group', 'trainer', 'score', 'total', 'mistakes', 'seconds', 'check', 'consent'];
  K.FIELD_TITLES = {
    room: 'Комната', fio: 'ФИО', group: 'Группа', trainer: 'Тренажёр', score: 'Баллы', total: 'Всего заданий',
    mistakes: 'Ошибки', seconds: 'Длительность, с', check: 'Контроль', consent: 'Согласие'
  };
  K.fieldIds = () => Object.assign({}, ...K.FIELDS.map(f => ({ [f]: f })), CFG.fields || {});
  K.formLink = function (r) {
    if (!CFG.formUrl) return '';
    let u;
    try { u = new URL(CFG.formUrl.trim()); } catch (e) { return ''; }
    if (!u.pathname.endsWith('/')) u.pathname += '/';   // без слеша Яндекс делает лишнюю переадресацию
    const F = K.fieldIds();
    K.FIELDS.forEach(k => { if (r[k] != null && r[k] !== '') u.searchParams.set(F[k], String(r[k])); });
    return u.toString();
  };

  const b64e = str => {
    let bin = '';
    new TextEncoder().encode(str).forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64d = s => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  };
  // запасной канал: код результата, который студент присылает сам, если форма недоступна
  K.resultCode = r => 'UMP1.' + b64e(K.payload(r)) + '.' + r.check.slice(2);
  K.readResultCode = function (code) {
    const m = String(code).trim().match(/^UMP1\.([A-Za-z0-9_-]+)\.([0-9A-Z]+)$/);
    if (!m) return null;
    let p;
    try { p = b64d(m[1]).split('|'); } catch (e) { return null; }
    if (p.length !== 9) return null;
    const r = { trainer: p[1], room: p[2], fio: p[3], group: p[4], score: p[5], total: p[6], mistakes: p[7], seconds: p[8] };
    r.check = 'K-' + m[2];
    r.valid = K.hash(K.payload(r)) === r.check;
    return r;
  };

  K.level = function (pct) {
    if (pct >= 90) return { cls: 'hi', text: 'высокий уровень' };
    if (pct >= 75) return { cls: 'mid', text: 'средний уровень' };
    if (pct >= 61) return { cls: 'mid', text: 'низкий уровень' };
    return { cls: 'lo', text: 'пока не зачтено' };
  };

  K.copy = function (text, btn) {
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(() => { btn.textContent = t; }, 1600); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
    else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* выделенный текст можно скопировать вручную */ }
      ta.remove();
      done();
    }
  };

  // ---------- сетевой график (метод критического пути) ----------
  K.cpm = function (tasks) {
    const by = {};
    tasks.forEach(t => { by[t.id] = t; });
    const lvl = {};
    const level = id => (lvl[id] !== undefined ? lvl[id] : (lvl[id] = by[id].pre.length ? Math.max(...by[id].pre.map(level)) + 1 : 0));
    tasks.forEach(t => level(t.id));
    const order = tasks.map(t => t.id).sort((a, b) => lvl[a] - lvl[b]);
    const ES = {}, EF = {}, LS = {}, LF = {}, slack = {}, succ = {};
    order.forEach(id => {
      ES[id] = by[id].pre.length ? Math.max(...by[id].pre.map(p => EF[p])) : 0;
      EF[id] = ES[id] + by[id].dur;
    });
    const total = Math.max(...tasks.map(t => EF[t.id]));
    tasks.forEach(t => { succ[t.id] = []; });
    tasks.forEach(t => t.pre.forEach(p => succ[p].push(t.id)));
    order.slice().reverse().forEach(id => {
      LF[id] = succ[id].length ? Math.min(...succ[id].map(s => LS[s])) : total;
      LS[id] = LF[id] - by[id].dur;
    });
    tasks.forEach(t => { slack[t.id] = LS[t.id] - ES[t.id]; });
    const critical = order.filter(id => slack[id] === 0);
    return { lvl, ES, EF, LS, LF, slack, total, critical, by };
  };

  // ---------- тренажёр ----------
  /* o = {
       letter, mount,
       items      — задания зачётного прохода (их id уходят в выгрузку),
       selfItems  — отдельный набор для самопроверки,
       goals: [...], facts: [...],
       layout: 'two' | 'four' | 'list',
       shuffleItems, shuffleOptions,
       prompt(item) -> html,
       options(item) -> [{ v, html }]          для заданий с выбором
       isRight(item, v) -> bool
       rightText(item) -> строка правильного ответа
       explain(item, v, ok) -> html разбора
       ref(item) -> «Лекция 1, табл. 1»
       short(item) -> короткая подпись задания для списка «Что повторить»
       finalNote(pct) -> строка
     }
     Задание с числовым ответом: item.type === 'number', item.answer — число, item.unit — единица. */
  K.quiz = function (o) {
    const T = K.TRAINERS[o.letter];
    const mount = o.mount;
    const st = {};
    const params = new URLSearchParams(location.search);

    // в самопроверке — свой набор заданий, чтобы она не была репетицией зачёта
    function reset(mode, reg) {
      st.mode = mode;
      st.reg = reg || null;
      st.i = 0;
      st.right = 0;
      st.answers = {};
      st.answered = false;
      st.pool = (mode === 'self' && o.selfItems) ? o.selfItems : o.items;
      st.items = o.shuffleItems ? K.shuffle(st.pool) : st.pool.slice();
      st.t0 = Date.now();
    }

    function intro() {
      const facts = (o.facts || [o.items.length + ' заданий', 'разбор после каждого ответа'])
        .map(f => '<span class="fact">' + esc(f) + '</span>').join('');
      mount.innerHTML =
        '<h2>Чему вы научитесь</h2>' +
        '<ul class="goals">' + o.goals.map(g => '<li>' + g + '</li>').join('') + '</ul>' +
        '<div class="facts">' + facts + '</div>' +
        (o.selfItems ? '<p class="hint" style="margin:-8px 0 16px">В самопроверке и в зачётном проходе — разные задания.</p>' : '') +
        '<div class="modes">' +
        '<button class="mode" data-mode="self"><b>Самопроверка</b><small>Без регистрации. Результат видите только вы.</small></button>' +
        '<button class="mode" data-mode="graded"><b>Зачётный проход</b><small>Нужен код комнаты от преподавателя. Результат уйдёт преподавателю.</small></button>' +
        '</div>';
      mount.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.mode === 'self') { reset('self'); card(); } else register('');
      }));
    }

    function register(prefill) {
      mount.innerHTML =
        '<h2>Зачётный проход</h2>' +
        '<p class="hint" style="margin:0 0 16px">Код комнаты, фамилия, имя и группа уйдут преподавателю вместе с результатом.</p>' +
        '<label class="field"><span>Код комнаты</span><input class="code" id="k-room" maxlength="9" autocomplete="off" ' +
        'autocapitalize="characters" spellcheck="false" value="' + esc(prefill) + '"></label>' +
        '<p class="err" id="k-room-err" role="alert"></p>' +
        '<label class="field"><span>Фамилия и имя</span><input id="k-fio" autocomplete="name" placeholder="Иванова Анна"></label>' +
        '<label class="field"><span>Группа</span><input id="k-group" autocomplete="off" placeholder="ТТМ-33"></label>' +
        '<label class="consent"><input type="checkbox" id="k-consent"><span>Я прочитал(а) ' +
        '<a href="consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и даю его.</span></label>' +
        '<p class="err" id="k-err" role="alert"></p>' +
        '<div class="btn-row"><button class="btn" id="k-go">Начать</button><button class="btn ghost" id="k-back">Назад</button></div>' +
        '<p class="hint">Не хотите давать согласие — выберите самопроверку: в ней ничего не отправляется.</p>';
      const room = $('#k-room', mount);
      const checkRoom = () => {
        const r = K.parseRoom(room.value);
        const err = $('#k-room-err', mount);
        if (!room.value.trim()) { err.textContent = ''; return null; }
        if (!r.ok) { err.textContent = r.msg; return null; }
        if (r.letter !== o.letter) {
          err.innerHTML = 'Этот код — для тренажёра «' + esc(r.trainer.title) + '». <a href="' +
            esc(r.trainer.file) + '?room=' + r.code + '">Перейти к нему</a>';
          return null;
        }
        err.innerHTML = '<span class="okmsg">Комната ' + r.code + ' найдена</span>';
        return r;
      };
      room.addEventListener('input', checkRoom);
      if (prefill) checkRoom();
      $('#k-back', mount).addEventListener('click', intro);
      $('#k-go', mount).addEventListener('click', () => {
        const r = checkRoom();
        const fio = K.normName($('#k-fio', mount).value);
        const group = K.normGroup($('#k-group', mount).value);
        const err = $('#k-err', mount);
        if (!r) { if (!room.value.trim()) $('#k-room-err', mount).textContent = 'Введите код комнаты'; room.focus(); return; }
        if (fio.split(' ').length < 2) { err.textContent = 'Укажите фамилию и имя'; $('#k-fio', mount).focus(); return; }
        if (group.length < 2) { err.textContent = 'Укажите группу'; $('#k-group', mount).focus(); return; }
        if (!$('#k-consent', mount).checked) { err.textContent = 'Без согласия результат не может быть отправлен — отметьте его или выберите самопроверку'; return; }
        reset('graded', { room: r.code, fio, group, consent: 'да, ' + new Date().toLocaleString('ru-RU') });
        card();
      });
      (prefill ? $('#k-fio', mount) : room).focus();
    }

    function card() {
      st.answered = false;
      const item = st.items[st.i];
      const n = st.items.length;
      let body;
      if (item.type === 'number') {
        body = '<div class="numrow"><input id="k-num" inputmode="decimal" autocomplete="off" aria-label="Ответ">' +
          (item.unit ? '<span>' + esc(item.unit) + '</span>' : '') +
          '<button class="btn" id="k-check">Проверить</button></div>';
      } else {
        const opts = o.options(item);
        const list = o.shuffleOptions ? K.shuffle(opts) : opts;
        body = '<div class="opts ' + (o.layout || 'list') + '" role="group" aria-label="Варианты ответа">' +
          list.map((op, k) => '<button class="opt" data-v="' + esc(op.v) + '"><span class="k">' + (k + 1) + '</span>' + op.html + '</button>').join('') +
          '</div>';
      }
      mount.innerHTML =
        '<div class="progress"><span>Задание ' + (st.i + 1) + ' из ' + n + '</span>' +
        '<span class="track"><i style="width:' + (st.i / n * 100) + '%"></i></span>' +
        '<span class="badge' + (st.mode === 'graded' ? ' graded' : '') + '">' + (st.mode === 'graded' ? 'зачёт' : 'самопроверка') + '</span></div>' +
        o.prompt(item) + body +
        '<div class="verdict hidden" id="k-verdict" aria-live="polite"></div>' +
        '<div class="btn-row hidden" id="k-nav"><button class="btn" id="k-next">' + (st.i === n - 1 ? 'К итогам' : 'Дальше') + '</button></div>';
      if (item.type === 'number') {
        const inp = $('#k-num', mount);
        const go = () => {
          const v = parseFloat(String(inp.value).replace(',', '.'));
          if (isNaN(v)) { inp.focus(); return; }
          answer(item, v);
        };
        $('#k-check', mount).addEventListener('click', go);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        inp.focus();
      } else {
        mount.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(item, b.dataset.v, b)));
      }
      $('#k-next', mount).addEventListener('click', () => {
        if (st.i === n - 1) finish(); else { st.i++; card(); mount.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      });
    }

    function answer(item, v, btn) {
      if (st.answered) return;
      st.answered = true;
      const ok = item.type === 'number' ? Math.abs(v - item.answer) < 1e-9 : o.isRight(item, v);
      st.answers[item.id] = { v, ok };
      if (ok) st.right++;
      if (item.type === 'number') {
        const inp = $('#k-num', mount);
        inp.classList.add(ok ? 'right' : 'wrong');
        inp.disabled = true;
        $('#k-check', mount).disabled = true;
      } else {
        mount.querySelectorAll('.opt').forEach(b => {
          b.disabled = true;
          if (o.isRight(item, b.dataset.v)) b.dataset.state = 'right';
        });
        if (!ok && btn) btn.dataset.state = 'wrong';
      }
      const ver = $('#k-verdict', mount);
      ver.dataset.kind = ok ? 'right' : 'wrong';
      const right = item.type === 'number' ? item.answer + (item.unit ? ' ' + item.unit : '') : o.rightText(item);
      const ref = o.ref(item);
      ver.innerHTML = '<h3>' + (ok ? 'Верно.' : 'Неверно.') + '</h3>' +
        (ok ? '' : '<p class="right-ans">Правильный ответ: <b>' + esc(right) + '</b></p>') +
        o.explain(item, v, ok) + (ref ? '<p class="ref">Повторить: ' + esc(ref) + '</p>' : '');
      ver.classList.remove('hidden');
      $('#k-nav', mount).classList.remove('hidden');
      $('#k-next', mount).focus({ preventScroll: true });
      ver.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function finish() {
      const n = st.items.length;
      const pct = Math.round(st.right / n * 100);
      const lv = K.level(pct);
      const wrong = st.pool.filter(it => st.answers[it.id] && !st.answers[it.id].ok);
      let send = '';
      if (st.mode === 'graded') {
        const r = K.sign(Object.assign({
          trainer: T.title, score: st.right, total: n,
          mistakes: wrong.length ? wrong.map(it => it.id).join('; ') : 'нет',
          seconds: Math.round((Date.now() - st.t0) / 1000)
        }, st.reg));
        const link = K.formLink(r);
        const code = K.resultCode(r);
        send = '<div class="send"><h3>Отправьте результат преподавателю</h3>' +
          (link
            ? '<p>Откроется Яндекс Форма с вашими данными и результатом. Нажмите в ней «Отправить» — пока форма не отправлена, преподаватель результата не видит.</p>' +
              '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">Открыть форму и отправить</a>' +
              '<details style="margin-top:12px"><summary>Форма не открывается?</summary><p>Скопируйте код результата и отправьте его преподавателю любым способом.</p>' +
              '<div class="rescode">' + esc(code) + '</div><button class="btn ghost" id="k-copy">Скопировать код</button></details>'
            : '<p>Скопируйте код результата и отправьте его преподавателю — например, сообщением в ЭИОС. По коду преподаватель увидит ваш результат.</p>' +
              '<div class="rescode">' + esc(code) + '</div><button class="btn ghost" id="k-copy">Скопировать код</button>') +
          '</div>';
        st.code = code;
      }
      const review = wrong.length
        ? '<h3 style="margin-top:22px">Что повторить</h3><ul class="review">' + wrong.map(it =>
          '<li><div class="q">' + esc(o.short(it)) + '</div><div class="a">Правильно: ' +
          esc(it.type === 'number' ? it.answer + (it.unit ? ' ' + it.unit : '') : o.rightText(it)) +
          (o.ref(it) ? ' · ' + esc(o.ref(it)) : '') + '</div></li>').join('') + '</ul>'
        : '<p class="note">Ошибок нет.</p>';
      mount.innerHTML =
        '<div class="score"><b>' + st.right + ' из ' + n + '</b><span class="pct">' + pct + ' % верных ответов</span><br>' +
        '<span class="level ' + lv.cls + '">' + lv.text + '</span></div>' +
        '<p class="note">' + esc(o.finalNote(pct)) + '</p>' + send + review +
        '<div class="btn-row"><button class="btn ghost" id="k-again">Пройти заново</button>' +
        '<a class="btn ghost" href="index.html">Все тренажёры</a></div>';
      const cp = $('#k-copy', mount);
      if (cp) cp.addEventListener('click', () => K.copy(st.code, cp));
      $('#k-again', mount).addEventListener('click', () => { reset(st.mode, st.reg); card(); });
      mount.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // клавиши 1–9 выбирают вариант, Enter — дальше
    document.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const opts = mount.querySelectorAll('.opt:not(:disabled)');
      const k = parseInt(e.key, 10);
      if (!st.answered && opts.length && k >= 1 && k <= opts.length) { e.preventDefault(); opts[k - 1].click(); }
    });

    const room = params.get('room');
    if (room) register(room); else intro();
  };
})();
