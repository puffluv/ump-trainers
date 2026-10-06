/* Генератор QR-кода по ISO/IEC 18004: байтовый режим, уровень коррекции M, версии 1–10
   (ссылки до 213 байт). Без внешних библиотек. Используется в кабинете преподавателя. */
(function () {
  'use strict';
  const K = window.Kurs = window.Kurs || {};

  // уровень M: [слов коррекции на блок, [[число блоков, слов данных в блоке], …]]
  const EC_M = [null,
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCodewords = v => EC_M[v][1].reduce((s, g) => s + g[0] * g[1], 0);

  // арифметика поля GF(256) с порождающим многочленом 0x11D
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function rsGenerator(deg) {           // коэффициенты от старшей степени, g[0] = 1
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }
  function rsRemainder(data, gen) {
    const deg = gen.length - 1;
    const res = new Array(deg).fill(0);
    data.forEach(b => {
      const f = b ^ res.shift();
      res.push(0);
      for (let j = 0; j < deg; j++) res[j] ^= mul(gen[j + 1], f);
    });
    return res;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
  ];

  function penalty(m) {
    const n = m.length;
    let p = 0;
    // правило 1: пять и более модулей одного цвета подряд
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b < n; b++) {
          const cur = pass ? m[b][a] : m[a][b];
          const prev = pass ? m[b - 1][a] : m[a][b - 1];
          if (cur === prev) { run++; if (b === n - 1 && run >= 5) p += run - 2; }
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
    }
    // правило 2: блоки 2×2 одного цвета
    for (let y = 0; y < n - 1; y++)
      for (let x = 0; x < n - 1; x++)
        if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    // правило 3: узор, похожий на искатель, 1:1:3:1:1 с четырьмя светлыми модулями сбоку
    const A = [true, false, true, true, true, false, true, false, false, false, false];
    const B = A.slice().reverse();
    for (let pass = 0; pass < 2; pass++)
      for (let a = 0; a < n; a++)
        for (let b = 0; b + 11 <= n; b++) {
          let ma = true, mb = true;
          for (let k = 0; k < 11; k++) {
            const v = pass ? m[b + k][a] : m[a][b + k];
            if (v !== A[k]) ma = false;
            if (v !== B[k]) mb = false;
          }
          if (ma) p += 40;
          if (mb) p += 40;
        }
    // правило 4: баланс тёмных и светлых модулей
    let dark = 0;
    m.forEach(row => row.forEach(v => { if (v) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  // forceMask — только для проверки генератора
  K.qr = function (text, forceMask) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    while (ver <= 10 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
    if (ver > 10) throw new Error('Ссылка слишком длинная для QR-кода');
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    const capBits = dataCodewords(ver) * 8;
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xEC; data.length < dataCodewords(ver); pad = pad === 0xEC ? 0x11 : 0xEC) data.push(pad);

    const ecLen = EC_M[ver][0];
    const gen = rsGenerator(ecLen);
    const blocks = [];
    let off = 0;
    EC_M[ver][1].forEach(g => {
      for (let i = 0; i < g[0]; i++) {
        const d = data.slice(off, off + g[1]);
        off += g[1];
        blocks.push({ d, e: rsRemainder(d, gen) });
      }
    });
    const words = [];
    const maxK = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxK; i++) blocks.forEach(b => { if (i < b.d.length) words.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach(b => words.push(b.e[i]));

    const size = ver * 4 + 17;
    const m = [], fn = [];
    for (let i = 0; i < size; i++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (r, c, v) => { m[r][c] = v; fn[r][c] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [3, size - 4], [size - 4, 3]].forEach(([r0, c0]) => {
      for (let dr = -4; dr <= 4; dr++)
        for (let dc = -4; dc <= 4; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || c < 0 || r >= size || c >= size) continue;
          const d = Math.max(Math.abs(dr), Math.abs(dc));
          set(r, c, d !== 2 && d !== 4);
        }
    });
    const al = ALIGN[ver];
    for (let i = 0; i < al.length; i++)
      for (let j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++) set(al[i] + dr, al[j] + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }

    function drawFormat(mask) {
      const d = mask;                                   // биты уровня M — 00
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((d << 10) | rem) ^ 0x5412;
      const bit = i => ((f >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
      set(7, 8, bit(6));
      set(8, 8, bit(7));
      set(8, 7, bit(8));
      for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
      for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
      for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
      set(size - 8, 8, true);                           // тёмный модуль
    }
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const v = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const c = ((v >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(b, a, c);
        set(a, b, c);
      }
    }

    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && k < words.length * 8) {
            m[y][x] = ((words[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
            k++;
          }
        }
    }

    const apply = mask => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    };
    let best = forceMask;
    if (best === undefined) {
      let bestP = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        apply(mask);
        drawFormat(mask);
        const p = penalty(m);
        if (p < bestP) { bestP = p; best = mask; }
        apply(mask);                                    // маска снимается повторным наложением
      }
    }
    apply(best);
    drawFormat(best);
    return { size, version: ver, mask: best, modules: m };
  };

  // рисует QR в canvas с полем 4 модуля, с учётом плотности пикселей экрана
  K.drawQR = function (canvas, text, cssSize) {
    const q = K.qr(text);
    const n = q.size + 8;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(cssSize * dpr / n);
    canvas.width = canvas.height = px * n;
    canvas.style.width = canvas.style.height = (px * n / dpr) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';                          // QR читается только тёмным по светлому
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let y = 0; y < q.size; y++)
      for (let x = 0; x < q.size; x++) if (q.modules[y][x]) ctx.fillRect((x + 4) * px, (y + 4) * px, px, px);
    return q;
  };
})();
