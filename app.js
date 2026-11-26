'use strict';
const VERSION = '3.0.0';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('pq.' + k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pq.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('pq.' + k); } catch {} }
};
const uid = () => Math.random().toString(36).slice(2, 10);
const SYM = { VND: '₫', USD: '$', KZT: '₸' }, CURS = ['VND', 'KZT', 'USD'];
const ic = (n, cls = '') => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
const isPhone = () => matchMedia('(max-width: 759px)').matches;

/* ---------- шифрование ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю', EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
function normPw(s) { return [...String(s || '').toLowerCase()].map(ch => { const i = RU.indexOf(ch); return i >= 0 ? EN[i] : ch; }).join('').replace(/[^a-z]/g, ''); }
function head(u8) {
  if (dec.decode(u8.subarray(0, 4)) !== 'PQV2') throw new Error('format');
  return { iter: new DataView(u8.buffer, u8.byteOffset + 4, 4).getUint32(0), salt: u8.slice(8, 24), iv: u8.slice(24, 36), ct: u8.subarray(36) };
}
async function derive(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, 256));
}
let VB = null, RAW = null, KEY = null, TRIP = null, DOCS = [], BLOB = null, STARTED = false;
async function openVault(raw) {
  const h = head(VB), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.iv }, key, h.ct));
  const hl = new DataView(pt.buffer, pt.byteOffset, 4).getUint32(0), hd = JSON.parse(dec.decode(pt.subarray(4, 4 + hl)));
  RAW = raw; KEY = key; TRIP = hd.trip; DOCS = hd.docs; BLOB = pt.subarray(4 + hl);
}
async function loadVault() { const r = await fetch(window.VAULT); if (!r.ok) throw new Error('net'); VB = new Uint8Array(await r.arrayBuffer()); }

/* ---------- вход ---------- */
function lockMsg(t, wait) { const m = $('#lockMsg'); m.textContent = t || ''; m.classList.toggle('wait', !!wait); }
function showLock(t) { $('#app').hidden = true; $('#lock').hidden = false; lockMsg(t); setTimeout(() => $('#pw').focus(), 50); }
async function boot() {
  applyTheme();
  $('#pwShow').onchange = e => { $('#pw').type = e.target.checked ? 'text' : 'password'; };
  $('#lockForm').onsubmit = async e => {
    e.preventDefault();
    const pw = normPw($('#pw').value);
    if (!pw) return lockMsg('Введите пароль.');
    $('#pwGo').disabled = true; lockMsg('Проверяю пароль…', true);
    try {
      if (!VB) await loadVault();
      const h = head(VB), raw = await derive(pw, h.salt, h.iter);
      await openVault(raw); G.set('k', b64(raw)); $('#pw').value = ''; start();
    } catch (err) {
      lockMsg(err.message === 'net' || err instanceof TypeError ? 'Нет интернета, а файлы поездки ещё не скачаны. Подключитесь к интернету один раз.' : 'Пароль не подходит. Проверьте буквы и попробуйте ещё раз.');
    }
    $('#pwGo').disabled = false;
  };
  try { await loadVault(); } catch { return showLock(G.get('k', null) ? 'Нет интернета, а файлы поездки ещё не сохранены на телефоне.' : ''); }
  const k = G.get('k', null);
  if (k) { try { await openVault(unb64(k)); return start(); } catch { G.del('k'); } }
  showLock();
}

/* ---------- люди и профиль ---------- */
let who = null;
const person = id => TRIP.people.find(p => p.id === id) || { id, name: id };
const nameOf = id => person(id).name;
const shared = () => TRIP.shared || [];
const nsOf = () => shared().includes(who) ? 'fam' : who;
const isFam = () => nsOf() === 'fam';
const P = { get: (k, d) => G.get(nsOf() + '.' + k, d), set: (k, v) => G.set(nsOf() + '.' + k, v) };
function migrate() {
  let w = G.get('who', null);
  const old = w && !TRIP.people.some(p => p.id === w) && TRIP.people.find(p => p.name === w || p.name.slice(0, 5) === String(w).slice(0, 5));
  if (old) {
    const id = old.id;
    if (!shared().includes(id) && G.get(id + '.S', null) === null && G.get(w + '.S', null) !== null) G.set(id + '.S', G.get(w + '.S', null));
    w = id; G.set('who', w);
  }
  who = TRIP.people.some(p => p.id === w) ? w : null;
}
function setWho(id) {
  who = id; G.set('who', id); docWho = id;
  S = loadS(); bank = S.bank || bankDef(); SY.last = G.get(nsOf() + '.syncTs', 0);
  $$('.who span').forEach(s => s.textContent = nameOf(id));
  renderAll(); syncNow();
}

/* ---------- тема ---------- */
let theme = G.get('theme2', { t: 'auto', big: false });
function applyTheme() {
  const r = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = theme.t === 'auto' ? (dark ? 'night' : 'yellow') : theme.t;
  if (theme.big) r.dataset.big = '1'; else delete r.dataset.big;
  const g = getComputedStyle(r).getPropertyValue('--ground').trim();
  document.querySelector('meta[name=theme-color]').content = g || '#e9e9e4';
}
const THEMES = [
  { id: 'auto', n: 'Как в телефоне', d: 'Днём жёлтые указатели, ночью тёмный терминал', g: '#e9e9e4', s: '#ffcd00', si: '#000', t: '#000', ti: '#fff', ink: '#000', g2: '#141619' },
  { id: 'yellow', n: 'Жёлтые указатели', d: 'Как в аэропорту. Лучше всего видно на солнце', g: '#e9e9e4', s: '#ffcd00', si: '#000', t: '#000', ti: '#fff', ink: '#000' },
  { id: 'blue', n: 'Синие указатели', d: 'Спокойнее, как дорожные знаки на острове', g: '#e5e9ef', s: '#1a4fa3', si: '#fff', t: '#fff', ti: '#1a4fa3', ink: '#000' },
  { id: 'night', n: 'Ночной терминал', d: 'Тёмная — для самолёта и вечера', g: '#141619', s: '#ffcd00', si: '#000', t: '#000', ti: '#fff', ink: '#f3f3ef' }
];

/* ---------- мелочи ---------- */
let toastT;
function toast(m, act) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(m)}</span>` + (act ? `<button>${esc(act.label)}</button>` : ''); t.hidden = false;
  if (act) t.querySelector('button').onclick = () => { t.hidden = true; act.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, act ? 5000 : 2600);
}
let sheetClose = null;
function sheet(html, closable = true, onClose) {
  $('#toast').hidden = true; $('#sheetIn').innerHTML = html; const s = $('#sheet'); s.hidden = false; sheetClose = onClose || null;
  s.onclick = e => { if (closable && e.target === s) closeSheet(); };
}
function closeSheet() { $('#sheet').hidden = true; const f = sheetClose; sheetClose = null; f?.(); }
function num(s) { if (typeof s === 'number') return s; s = String(s || '').replace(/[\s  ]/g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? v : 0; }
function grp(v, d) { return v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[   ]/g, ' '); }
function fmt(v, cur) { if (!isFinite(v)) return '—'; return cur === 'USD' ? '$' + grp(v, 2) : grp(Math.round(v), 0) + ' ' + SYM[cur]; }
function plain(v, cur) { if (!v) return ''; const d = cur === 'USD' ? 2 : 0; return (+v.toFixed(d)).toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/[  ]/g, ' '); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Скопировано: ' + t); } catch { toast('Не получилось скопировать'); } }

/* ---------- курс ---------- */
let rates = G.get('rates', { KZT: 460.04, VND: 25766, ts: 0 });
let my = G.get('myrate', { on: false, KZT: '', VND: '' });
function R() { const r = { USD: 1, KZT: rates.KZT, VND: rates.VND }; if (my.on) { if (num(my.KZT) > 0) r.KZT = num(my.KZT); if (num(my.VND) > 0) r.VND = num(my.VND); } return r; }
function conv(a, from, to) { const r = R(); return a / r[from] * r[to]; }
function ago(ts) { if (!ts) return 'ещё не обновлялся'; const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'только что'; if (m < 60) return m + ' мин назад'; const h = Math.round(m / 60); if (h < 48) return h + ' ч назад'; return Math.round(h / 24) + ' дн назад'; }
async function fetchRates(manual) {
  const tries = [
    async () => { const j = await (await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })).json(); return { KZT: j.rates.KZT, VND: j.rates.VND }; },
    async () => { const j = await (await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { cache: 'no-store' })).json(); return { KZT: j.usd.kzt, VND: j.usd.vnd }; }];
  for (const t of tries) {
    try { const r = await t(); if (r.KZT > 50 && r.VND > 1000) { rates = { ...r, ts: Date.now() }; G.set('rates', rates); renderRateBits(); if (manual) toast('Курс обновлён'); return; } } catch {}
  }
  if (manual) toast('Нет интернета — считаю по сохранённому курсу');
}
function rateLine() { const r = R(); return `1 $ = ${grp(r.VND, 0)} ₫ = ${grp(r.KZT, 2)} ₸`; }
function renderRateBits() {
  renderCalc(); renderMoney(); renderCash();
}

/* ---------- время и план ---------- */
const TZ = { KZ: 'Etc/GMT-5', VN: 'Etc/GMT-7' };
const tf = (d, tz, o) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, ...o }).format(d);
const hm = (d, tz) => tf(d, tz, { hour: '2-digit', minute: '2-digit' });
const dm = (d, tz) => tf(d, tz, { day: 'numeric', month: 'long' });
const tzOf = iso => iso.endsWith('+07:00') ? 'VN' : 'KZ';
const where = z => z === 'VN' ? 'по Фукуоку' : 'по Казахстану';
let done = G.get('done', {}), myEv = G.get('events', []);
const EVI = { card: 'docs', apt: 'gate', bag: 'bag', brd: 'pass', dep: 'trip', arr: 'land', inn: 'bed', chk: 'pass', trf: 'clock', out: 'bed', apt2: 'gate', dep2: 'trip', arr2: 'land' };
function allEvents() { return [...TRIP.events, ...myEv].map(e => ({ ...e, ts: Date.parse(e.t) })).sort((a, b) => a.ts - b.ts); }
function left(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d) return `${d} д ${h} ч`; if (h) return `${h} ч ${m} мин`; if (m) return `${m} мин`; return 'меньше минуты';
}
const nextEv = () => allEvents().find(e => e.ts > Date.now() && !done[e.id]);
let bandId = null;
function renderBand() {
  const e = nextEv(), b = $('#nextBand');
  if (!e) { b.innerHTML = `<span class="tile">${ic('check')}</span><span class="band-t"><b>Все шаги пройдены</b><small>Хорошего отдыха!</small></span><span></span>`; $('#soon').innerHTML = ''; return; }
  const z = tzOf(e.t), d = new Date(e.ts), today = tf(new Date(), TZ[z], { day: 'numeric', month: 'numeric' }) === tf(d, TZ[z], { day: 'numeric', month: 'numeric' });
  b.innerHTML = `<span class="tile">${ic(EVI[e.id] || 'clock')}</span><span class="band-t"><b>${esc(e.title)}</b><small>через <span id="cd">${left(e.ts - Date.now())}</span></small></span><span class="big">${hm(d, TZ[z])}<small>${today ? '' : dm(d, TZ[z]) + ', '}${where(z)}</small></span>`;
  if (bandId !== null && bandId !== e.id) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
  bandId = e.id;
  const evs = allEvents().filter(x => x.ts > e.ts && !done[x.id]).slice(0, 3);
  $('#soon').innerHTML = evs.length ? '<span>Потом:</span>' + evs.map((x, i) => `${i ? ic('arrow') : ''}<span><b>${hm(new Date(x.ts), TZ[tzOf(x.t)])}</b> ${esc(x.title)}</span>`).join('') : '';
}
function myBoarding() {
  const now = Date.now();
  return DOCS.find(d => d.group === 'boarding' && d.who.includes(who) && TRIP.flights.some(f => f.id === d.flight && Date.parse(f.arr) > now));
}
function renderHome() {
  renderBand();
  const bp = myBoarding(), f0 = bp && TRIP.flights.find(f => f.id === bp.flight);
  $('#myPass').innerHTML = bp ? `<button class="plate pass" id="myPassBtn"><span class="tile">${ic('pass')}</span><span class="t"><b>Мой посадочный</b><small>${esc(f0.no)}, рег. № ${esc(f0.seq?.[who] ?? '')}, посадка до ${hm(new Date(Date.parse(f0.dep) - 20 * 60000), TZ[tzOf(f0.dep)])}</small></span><span class="code">${esc(bp.code || '')}</span></button>` : '';
  if (bp) $('#myPassBtn').onclick = () => openDoc(bp);
  const now = Date.now();
  $('#flights').innerHTML = TRIP.flights.map(f => {
    const d = new Date(f.dep), a = new Date(f.arr), z1 = TZ[tzOf(f.dep)], z2 = TZ[tzOf(f.arr)];
    const open = Date.parse(f.dep) - 25 * 3600e3, close = Date.parse(f.dep) - 4 * 3600e3;
    const st = now > +a ? ['Рейс завершён', ''] : now > +d ? ['В полёте', 'ok'] : f.checkedIn ? ['Регистрация пройдена', 'ok'] : now < open ? ['Регистрация с ' + dm(new Date(open), TZ[tzOf(f.dep)]) + ', ' + hm(new Date(open), TZ[tzOf(f.dep)]), ''] : now < close ? ['Регистрация открыта', 'ok'] : ['Регистрация в аэропорту', ''];
    const ids = TRIP.people.map(p => p.id), hasSeats = Object.keys(f.seats || {}).length;
    const occ = {}; ids.forEach(id => { if (f.seats[id]) occ[f.seats[id].slice(-1)] = id; });
    const row = hasSeats ? (Object.values(f.seats)[0] || '').slice(0, -1) : '';
    const seat = L => `<span class="seat ${occ[L] ? (occ[L] === who ? 'me' : 'ours') : ''}">${L}</span>`;
    return `<div class="plate flight"><div class="fh"><b class="fno">${esc(f.no)}</b><span class="tag ${st[1]}">${st[1] ? ic('check') : ''}${esc(st[0])}</span></div>
      <div class="route"><div><b class="ft">${hm(d, z1)}</b><span>${esc(f.from)}</span><small>${f.fromCode}, ${dm(d, z1)}</small></div><div class="mid">${ic('arrow')}${esc(f.dur)}</div><div class="r"><b class="ft">${hm(a, z2)}</b><span>${esc(f.to)}</span><small>${f.toCode}, ${dm(a, z2)}</small></div></div>
      ${hasSeats ? `<div class="seatmap" aria-label="Ряд ${row}">${'ABC'.split('').map(seat).join('')}<span class="aisle">${row}</span>${'DEF'.split('').map(seat).join('')}</div>
      <div class="seatnames">${ids.filter(id => f.seats[id]).sort((x, y) => f.seats[x] < f.seats[y] ? -1 : 1).map(id => `<div class="${id === who ? 'me' : ''}"><b>${f.seats[id]}</b><span>${esc(nameOf(id))}</span></div>`).join('')}</div>` : ''}
      <p class="mut sm">${esc(f.note)}</p>
      <div class="btnrow"><a class="btn sec sm" target="_blank" rel="noopener" href="https://sundayairlines.kz/ru/schedule/">Онлайн-табло</a><a class="btn sec sm" target="_blank" rel="noopener" href="https://sundayairlines.kz/ru/services/onlajn-registraciya/">Регистрация</a></div></div>`;
  }).join('');
  const h = TRIP.hotel;
  $('#hotel').innerHTML = `<div class="hotel"><h3>${esc(h.name)}</h3><p class="mut">${esc(h.addr)}</p>
    <dl class="kv"><dt>Заезд</dt><dd>${esc(h.in)}</dd><dt>Выезд</dt><dd>${esc(h.out)}</dd><dt>Номер</dt><dd>${esc(h.room)}</dd><dt>Трансфер</dt><dd>${esc(h.transfer)}</dd><dt>Ваучер</dt><dd>${esc(h.voucher)}</dd></dl>
    <p class="mut sm">${esc(h.note)}</p>
    <div class="btnrow"><a class="btn sec sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name)}">${ic('map')}На карте</a><a class="btn sec sm" href="tel:${h.phone}">${ic('phone')}Гид FUN&amp;SUN</a></div></div>`;
  renderTimeline(); renderNow();
}
function renderTimeline() {
  const now = Date.now(), evs = allEvents(), nx = nextEv();
  $('#timeline').innerHTML = evs.map((e, i) => {
    const z = tzOf(e.t), d = new Date(e.ts), cls = [done[e.id] ? 'done' : '', e.ts < now ? 'past' : '', nx && e.id === nx.id ? 'next' : ''].join(' ');
    return `<li class="${cls}"><button class="ctl" data-id="${esc(e.id)}" aria-label="${done[e.id] ? 'Отметить невыполненным' : 'Отметить выполненным'}">${done[e.id] ? ic('check') : i + 1}</button><div><div class="w">${dm(d, TZ[z])}, ${hm(d, TZ[z])} ${where(z)}</div><div class="t">${esc(e.title)}</div>${e.d ? `<div class="d">${esc(e.d)}</div>` : ''}</div>${e.mine ? `<button class="x" data-del="${esc(e.id)}" aria-label="Удалить">${ic('x')}</button>` : '<span></span>'}</li>`;
  }).join('');
  $$('#timeline .ctl').forEach(c => c.onclick = () => { done[c.dataset.id] = !done[c.dataset.id]; G.set('done', done); renderHome(); });
  $$('#timeline [data-del]').forEach(b => b.onclick = () => { myEv = myEv.filter(e => e.id !== b.dataset.del); G.set('events', myEv); renderHome(); });
}
function renderNow() {
  const n = new Date();
  $('#now').innerHTML = `<div class="clocks"><div><small>Казахстан</small><b id="clkKZ">${hm(n, TZ.KZ)}</b><span>${tf(n, TZ.KZ, { weekday: 'short', day: 'numeric', month: 'long' })}</span></div><div><small>Фукуок</small><b id="clkVN">${hm(n, TZ.VN)}</b><span>${tf(n, TZ.VN, { weekday: 'short', day: 'numeric', month: 'long' })}</span></div></div><div class="wx" id="wx">${wxHtml()}</div>`;
}
function tick() {
  const n = new Date(), k = $('#clkKZ'), v = $('#clkVN');
  if (k) k.textContent = hm(n, TZ.KZ); if (v) v.textContent = hm(n, TZ.VN);
  const e = nextEv(), cd = $('#cd');
  if (e && e.id !== bandId) renderHome(); else if (cd && e) cd.textContent = left(e.ts - Date.now());
  const off = !navigator.onLine; $('#net').textContent = off ? 'офлайн' : ''; $('#navNet').textContent = off ? 'нет интернета' : '';
  checkNotif();
}
function initHome() {
  $('#evAdd').onclick = () => {
    const t = $('#evTitle').value.trim(), v = $('#evTime').value; if (!t || !v) return toast('Укажите название и время');
    myEv.push({ id: 'm' + uid(), t: v + ':00' + $('#evTz').value, title: t, d: '', mine: true }); G.set('events', myEv); $('#evTitle').value = ''; renderHome(); toast('Добавлено в план');
  };
  $('#icsBtn').onclick = () => {
    const z = d => new Date(d).toISOString().replace(/[-:]|\.\d+/g, ''), c = s => String(s || '').replace(/[,;\\]/g, ' ').replace(/\n/g, ' ');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//phuquoc//ru', 'CALSCALE:GREGORIAN', ...allEvents().flatMap(e => ['BEGIN:VEVENT', 'UID:' + e.id + '@phuquoc', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(e.ts), 'DTEND:' + z(e.ts + 15 * 60000), 'SUMMARY:' + c(e.title), 'DESCRIPTION:' + c(e.d), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + c(e.title), 'TRIGGER:-PT60M', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + c(e.title), 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'fukuok.ics'; a.click(); toast('Откройте файл — события добавятся в календарь');
  };
  $('#notifBtn').onclick = async () => {
    if (!('Notification' in window)) return toast('На iPhone сначала добавьте сайт на экран «Домой»');
    const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Уведомления включены' : 'Уведомления не разрешены');
  };
}
let notified = G.get('notified', {});
function checkNotif() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  allEvents().forEach(e => [60, 15].forEach(m => {
    const k = e.id + '_' + m, at = e.ts - m * 60000;
    if (!done[e.id] && !notified[k] && now >= at && now < e.ts) {
      notified[k] = 1; G.set('notified', notified);
      const body = `Через ${Math.max(1, Math.round((e.ts - now) / 60000))} мин`;
      navigator.serviceWorker?.ready.then(r => r.showNotification(e.title, { body, icon: 'icon-192.png', tag: k })).catch(() => { try { new Notification(e.title, { body }); } catch {} });
    }
  }));
}

/* ---------- погода ---------- */
const WMO = { 0: 'ясно', 1: 'почти ясно', 2: 'переменная облачность', 3: 'пасмурно', 45: 'туман', 48: 'туман', 51: 'морось', 53: 'морось', 55: 'морось', 61: 'небольшой дождь', 63: 'дождь', 65: 'сильный дождь', 80: 'ливень местами', 81: 'ливни', 82: 'сильные ливни', 95: 'гроза', 96: 'гроза', 99: 'гроза' };
async function fetchWx() {
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=10.33&longitude=103.86&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia%2FHo_Chi_Minh&forecast_days=7';
    const j = await (await fetch(u, { cache: 'no-store' })).json(); if (!j.current) throw 0;
    G.set('wx', { j, ts: Date.now() }); const w = $('#wx'); if (w) w.innerHTML = wxHtml();
  } catch {}
}
function wxHtml() {
  const w = G.get('wx', null); if (!w) return '<p class="mut sm">Погода на Фукуоке появится, когда будет интернет.</p>';
  const c = w.j.current, d = w.j.daily;
  return `<div class="wxnow">${ic('sun')}<b>${Math.round(c.temperature_2m)}°</b><span><strong>Фукуок: ${WMO[c.weather_code] || ''}</strong><br><span class="mut sm">ощущается ${Math.round(c.apparent_temperature)}°, влажность ${c.relative_humidity_2m}%, ветер ${Math.round(c.wind_speed_10m)} км/ч</span></span></div>
  <div class="wxdays">${d.time.map((t, i) => `<div>${new Date(t + 'T12:00:00+07:00').toLocaleDateString('ru-RU', { weekday: 'short' })}<b>${Math.round(d.temperature_2m_max[i])}°</b>${d.precipitation_probability_max[i] ?? 0}%</div>`).join('')}</div>
  <p class="mut sm">Под температурой — вероятность дождя. Ультрафиолет сегодня ${Math.round(d.uv_index_max[0])}${d.uv_index_max[0] >= 8 ? ': очень высокий, нужен крем' : ''}. Обновлено ${ago(w.ts)}.</p>`;
}

/* ---------- документы ---------- */
const DT = { boarding: ['Посадочный талон', 'pass'], passport: ['Паспорт', 'docs'], ticket: ['Билет', 'ticket'], hotel: ['Ваучер на отель', 'bed'], insurance: ['Страховка', 'shield'], memo: ['Памятка', 'file'], other: ['Файл', 'file'] };
const ORDER = ['boarding', 'passport', 'ticket', 'hotel', 'insurance'];
let docWho = null, local = [];
const urlCache = {};
const part = p => new Blob([BLOB.subarray(p.o, p.o + p.l)], { type: p.t });
function pageUrl(id, i, p) { const k = id + ':' + i; return urlCache[k] || (urlCache[k] = URL.createObjectURL(part(p))); }
function docRow(d) {
  const [t, i] = DT[d.group] || DT.other;
  return `<button class="row" data-doc="${esc(d.id)}"><span class="tile">${ic(i)}</span><span class="t"><b>${esc(d.title || t)}</b><small>${esc(d.sub || '')}</small></span><span class="end">${d.code ? `<span class="code">${esc(d.code)}</span>` : ''}${ic('chev')}</span></button>`;
}
function localRow(l, withWho) {
  return `<div class="row"><span class="tile">${ic(DT[l.type]?.[1] || 'file')}</span><button class="t" data-local="${esc(l.id)}" style="border:0;background:none;padding:0;text-align:left;color:inherit"><b>${esc(DT[l.type]?.[0] || 'Файл')}${withWho ? ', ' + esc(nameOf(l.who)) : ''}</b><small>${esc(l.name)}</small></button><span class="end"><button class="iconbtn" data-ldel="${esc(l.id)}" aria-label="Удалить файл">${ic('x')}</button></span></div>`;
}
function renderDocs() {
  if (!docWho) docWho = who;
  $('#docWho').innerHTML = TRIP.people.map(p => `<button role="tab" data-p="${p.id}" class="${p.id === docWho ? 'on' : ''}" aria-selected="${p.id === docWho}">${esc(p.name)}</button>`).join('');
  $$('#docWho button').forEach(b => b.onclick = () => { docWho = b.dataset.p; renderDocs(); });
  const rows = ORDER.map(type => {
    const ds = DOCS.filter(d => d.group === type && d.who.includes(docWho)), ls = local.filter(l => l.who === docWho && l.type === type);
    if (ds.length || ls.length) return ds.map(docRow).join('') + ls.map(l => localRow(l)).join('');
    return `<div class="row missing"><span class="tile ghost">${ic(DT[type][1])}</span><span class="t"><b>${DT[type][0]}</b><small>Не загружен</small></span><span class="end"><label class="btn sec sm">${ic('plus')}Добавить<input type="file" accept="application/pdf,image/*" data-type="${type}" hidden></label></span></div>`;
  }).join('');
  const miss = ORDER.some(type => !DOCS.some(d => d.group === type && d.who.includes(docWho)) && !local.some(l => l.who === docWho && l.type === type));
  $('#docList').innerHTML = `<h3>Документы: ${esc(nameOf(docWho))}</h3>` + rows + (miss ? '<p class="mut sm">Что добавите сами, хранится только на этом телефоне и на сайт не попадает.</p>' : '');
  const p = TRIP.pax[docWho], h = TRIP.hotel;
  const F = p ? [['Фамилия', p.sur], ['Имя', p.given], ['Номер паспорта', p.passport], ['Дата рождения', p.dob], ['Пол', p.sex], ['Гражданство', 'Kazakhstan'], ['Паспорт выдан', p.issued], ['Действителен до', p.expires], ['Рейс прибытия', 'DV5356, 27.11.2026'], ['Адрес во Вьетнаме', h.name + ', ' + h.addr]] : [];
  $('#paxCard').innerHTML = `<div class="pax"><h3>Для карты прибытия</h3><p class="mut sm">Нажмите на поле, чтобы скопировать.</p>${F.map(([k, v]) => `<div class="f"><div><small>${k}</small><b>${esc(v)}</b></div><button class="iconbtn" data-copy="${esc(v)}" aria-label="Скопировать: ${k}">${ic('copy')}</button></div>`).join('')}</div>`;
  $$('#paxCard [data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
  $('#docCommon').innerHTML = DOCS.filter(d => !d.who.length).map(docRow).join('');
  const others = local.filter(l => l.type === 'other' || !ORDER.includes(l.type));
  $('#docLocal').innerHTML = others.length ? others.map(l => localRow(l, true)).join('') : `<p class="mut sm">Здесь будут файлы, которые вы добавите сами. На сайт они не попадают.${(() => { const m = TRIP.people.filter(p => ORDER.slice(2).some(t => !DOCS.some(d => d.group === t && d.who.includes(p.id)) && !local.some(l => l.who === p.id && l.type === t))).map(p => p.name); return m.length ? ' Не хватает билета, ваучера или страховки: ' + esc(m.join(', ')) + '.' : ''; })()}</p>`;
  $$('#t-docs [data-doc]').forEach(b => b.onclick = () => openDoc(DOCS.find(d => d.id === b.dataset.doc)));
  $$('#t-docs [data-local]').forEach(b => b.onclick = () => openLocal(local.find(l => l.id === b.dataset.local)));
  $$('#t-docs [data-ldel]').forEach(b => b.onclick = async () => { if (!confirm('Удалить этот файл с телефона?')) return; await tx('readwrite', s => s.delete(b.dataset.ldel)); await loadLocal(); renderDocs(); });
  $$('#docList input[type=file]').forEach(i => i.onchange = e => addLocal([...e.target.files], docWho, e.target.dataset.type));
}
let vDoc = null;
function openViewer(title, sub, html, doc) {
  vDoc = doc; $('#vTitle').textContent = title; $('#vSub').textContent = sub || '';
  const v = $('#vPages'); v.className = 'vpages'; v.innerHTML = html; v.scrollTop = 0; $('#vZoom').classList.remove('on');
  $('#viewer').hidden = false; history.pushState({ v: 1 }, '');
}
function closeViewer() { if ($('#viewer').hidden) return; $('#viewer').hidden = true; vDoc = null; }
function openDoc(d) {
  if (!d) return;
  const pages = d.pages.map((p, i) => `<img src="${pageUrl(d.id, i, p)}" alt="${esc(d.title)}, страница ${i + 1}">`).join('');
  const who2 = d.who.length === 1 ? nameOf(d.who[0]) : d.who.map(nameOf).join(' и ');
  openViewer(d.title + (who2 ? ': ' + who2 : ''), d.sub, pages, d);
}
function openLocal(l) {
  if (!l) return;
  const u = URL.createObjectURL(l.blob);
  const html = /^image\//.test(l.blob.type) ? `<img src="${u}" alt="${esc(l.name)}">` : `<p style="padding:24px;text-align:center"><a class="btn signbtn" href="${u}" target="_blank" rel="noopener">${ic('file')}Открыть ${esc(l.name)}</a></p>`;
  openViewer(DT[l.type]?.[0] || 'Файл', l.name, html, { local: l });
}
async function shareDoc() {
  const d = vDoc; if (!d) return;
  const base = (d.title || 'документ').replace(/[^\p{L}\p{N}]+/gu, '-') + (d.who?.length ? '-' + d.who.map(nameOf).join('-') : '');
  let files;
  if (d.local) files = [new File([d.local.blob], d.local.name, { type: d.local.blob.type })];
  else if (d.pdf) files = [new File([part(d.pdf)], base + '.pdf', { type: 'application/pdf' })];
  else files = d.pages.map((p, i) => new File([part(p)], base + (d.pages.length > 1 ? '-' + (i + 1) : '') + (p.t === 'image/png' ? '.png' : '.jpg'), { type: p.t }));
  if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: d.title || 'Документ' }); } catch {} return; }
  files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); });
  toast('Файл сохранён в «Загрузки»');
}
function initDocs() {
  $('#docFile').onchange = e => { addLocal([...e.target.files], docWho || who, 'other'); e.target.value = ''; };
}
function initViewer() {
  $('#vClose').onclick = () => history.back();
  window.addEventListener('popstate', () => { closeViewer(); if (!$('#sheet').hidden) closeSheet(); });
  $('#vZoom').onclick = () => { const v = $('#vPages'), z = v.classList.contains('z2') ? 'z3' : v.classList.contains('z3') ? '' : 'z2'; v.className = 'vpages ' + z; $('#vZoom').classList.toggle('on', !!z); };
  $('#vPages').ondblclick = () => $('#vZoom').click();
  $('#vShare').onclick = shareDoc;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#viewer').hidden) history.back(); else if (!$('#sheet').hidden) closeSheet(); } });
}
const DB = () => new Promise((res, rej) => { const r = indexedDB.open('pq-docs', 2); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('f')) r.result.createObjectStore('f', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await DB(); return new Promise((res, rej) => { const t = db.transaction('f', mode), q = fn(t.objectStore('f')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
async function loadLocal() { try { local = ((await tx('readonly', s => s.getAll())) || []).map(l => ({ ...l, who: l.who || who, type: l.type || 'other' })); } catch { local = []; } }
async function addLocal(files, w, type) {
  for (const f of files) { try { await tx('readwrite', s => s.put({ id: uid(), name: f.name, blob: f, who: w, type, ts: Date.now() })); } catch { toast('Не удалось сохранить ' + f.name); } }
  navigator.storage?.persist?.(); await loadLocal(); renderDocs(); toast('Сохранено на этом телефоне');
}

/* ---------- деньги ---------- */
const now = () => Date.now();
let S = { acc: [], cart: [], hist: [], del: {}, bank: null };
function loadS() {
  return P.get('S', null) || { acc: [
    { id: 'cashvnd', name: 'Наличные донги', cur: 'VND', start: 0, fee: 0, u: 1 },
    { id: 'cashusd', name: 'Наличные доллары', cur: 'USD', start: 0, fee: 0, u: 1 },
    { id: 'card', name: 'Карта банка', cur: 'KZT', start: 0, fee: 1, u: 1 }], cart: [], hist: [], del: {}, bank: null };
}
const save = () => { P.set('S', S); G.set(nsOf() + '.dirty', 1); clearTimeout(save.t); save.t = setTimeout(syncNow, 1200); };
const kill = id => { S.del[id] = now(); };
const spent = a => S.hist.filter(h => h.accId === a.id).reduce((s, h) => s + h.charge, 0);
const bal = a => num(a.start) - spent(a);
const cartTotal = cur => S.cart.reduce((s, i) => s + conv(i.price * i.qty, i.cur, cur), 0);
const ownTotal = cur => S.acc.reduce((s, a) => s + conv(bal(a), a.cur, cur), 0);
const cartN = () => S.cart.reduce((s, i) => s + i.qty, 0);
function addCart(price, cur, name) {
  const it = { id: uid(), name: name || 'Покупка ' + (S.cart.length + 1), price: +price, cur, qty: 1, u: now() };
  S.cart.push(it); save(); renderMoney();
  toast(`В корзине ${fmt(price, cur)} — всего ${fmt(cartTotal('VND'), 'VND')}`, { label: 'Отменить', fn: () => { kill(it.id); S.cart = S.cart.filter(x => x !== it); save(); renderMoney(); } });
}
function renderMoney() {
  if (!TRIP) return;
  const n = cartN(), b = $('#cartBadge'); b.hidden = !n; b.textContent = n;
  const own = ownTotal('KZT'), ct = cartTotal('KZT'), daysLeft = Math.max(1, Math.ceil((Date.parse(TRIP.flights[TRIP.flights.length - 1].dep) - Date.now()) / 864e5));
  $('#moneyTotal').innerHTML = `<small>${isFam() ? 'Общий бюджет: ' + esc(shared().map(nameOf).join(' и ')) : 'Мои деньги: ' + esc(nameOf(who))}</small><div class="n">${fmt(own, 'KZT')}</div><div class="n2">${fmt(ownTotal('VND'), 'VND')}</div><div class="n3">${fmt(ownTotal('USD'), 'USD')}</div>` +
    ((ct || own > 0) ? `<div class="after">${ct ? `<span>В корзине ${fmt(cartTotal('VND'), 'VND')}: после оплаты останется <b class="${own - ct < 0 ? 'neg' : ''}">${fmt(own - ct, 'KZT')}</b></span>` : ''}${own > 0 ? `<span class="mut">До отлёта примерно ${fmt((own - ct) / daysLeft, 'KZT')} в день, это ${fmt(conv((own - ct) / daysLeft, 'KZT', 'VND'), 'VND')}</span>` : ''}</div>` : '<div class="after"><span class="mut">Впишите ниже, сколько денег наличными и на картах.</span></div>');
  const ae = document.activeElement;
  if (!(ae && ae.closest && ae.closest('#accounts') && renderMoney.soft)) {
    $('#accounts').innerHTML = S.acc.map(a => `<div class="plate acc" data-id="${a.id}">
      <div class="ah"><span class="tile cur">${SYM[a.cur]}</span><input class="nm" data-f="name" value="${esc(a.name)}" aria-label="Название кошелька"><button class="iconbtn" data-rm aria-label="Удалить кошелёк">${ic('x')}</button></div>
      <div class="frow"><input class="amt" data-f="amt" inputmode="decimal" value="${bal(a) ? plain(bal(a), a.cur) : ''}" placeholder="0" aria-label="Сколько денег в кошельке"><select data-f="cur" aria-label="Валюта">${CURS.map(c => `<option value="${c}" ${c === a.cur ? 'selected' : ''}>${SYM[c]} ${c}</option>`).join('')}</select></div>
      <div class="eq">${CURS.filter(c => c !== a.cur).map(c => '≈ ' + fmt(conv(bal(a), a.cur, c), c)).join(', ')}</div>
      <label class="fee">Потери при оплате, %<input data-f="fee" inputmode="decimal" value="${a.fee || ''}" placeholder="0"></label></div>`).join('');
    $$('#accounts .acc').forEach(el => {
      const a = S.acc.find(x => x.id === el.dataset.id);
      el.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { const f = i.dataset.f; if (f === 'amt') a.start = num(i.value) + spent(a); else a[f] = f === 'fee' ? num(i.value) : i.value; a.u = now(); save(); renderMoney(); });
      el.querySelector('[data-rm]').onclick = () => { if (confirm('Удалить «' + a.name + '»?')) { kill(a.id); S.acc = S.acc.filter(x => x !== a); save(); renderMoney(); } };
    });
  }
  renderCart(); renderCartBar();
  const hs = [...S.hist].sort((a, b) => b.ts - a.ts);
  $('#history').innerHTML = hs.length ? hs.slice(0, 50).map(h => `<div class="res"><span><b>${esc(h.acc)}</b><br><small class="mut">${new Date(h.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, ${h.n} шт.${h.by ? ', ' + esc(nameOf(h.by) || h.by) : ''}</small></span><span><b>−${fmt(h.charge, h.cur)}</b><br><small class="mut">${fmt(h.vnd, 'VND')}</small></span></div>`).join('') +
    `<div class="btnrow"><button class="btn sec sm" id="undo">Отменить последнюю покупку</button></div><p class="mut sm">Всего потрачено ${fmt(hs.reduce((s, h) => s + conv(h.charge, h.cur, 'KZT'), 0), 'KZT')}.</p>` : '<p class="mut">Покупок пока нет. Нажмите «Оплатили» в корзине — сумма спишется с выбранного кошелька.</p>';
  if (hs.length) $('#undo').onclick = () => { kill(hs[0].id); S.hist = S.hist.filter(h => h.id !== hs[0].id); save(); renderMoney(); toast('Покупка отменена, деньги вернулись в кошелёк'); };
  renderSyncLine();
}
function renderCart() {
  const own = ownTotal('KZT'), ct = cartTotal('KZT');
  const html = S.cart.length ? S.cart.map(i => `<div class="ci" data-id="${i.id}"><div><input class="nm" value="${esc(i.name)}" aria-label="Название покупки"><div class="pr">${fmt(i.price, i.cur)} = ${fmt(conv(i.price, i.cur, i.cur === 'KZT' ? 'VND' : 'KZT'), i.cur === 'KZT' ? 'VND' : 'KZT')}</div></div><div class="qty"><button data-q="-1" aria-label="Меньше">${ic('minus')}</button><span>${i.qty}</span><button data-q="1" aria-label="Больше">${ic('plus')}</button></div></div>`).join('') +
    `<div class="tot"><span>Итого</span><b>${fmt(cartTotal('VND'), 'VND')}</b></div><div class="tot2">${fmt(ct, 'KZT')} или ${fmt(cartTotal('USD'), 'USD')}${own > 0 ? `<br><span class="${own - ct < 0 ? 'neg' : ''}">После оплаты останется ${fmt(own - ct, 'KZT')}</span>` : ''}</div>
     <div class="btnrow"><button class="btn sec" data-clr>Очистить</button><button class="btn" data-pay>Оплатили</button></div>` : '<p class="mut">Корзина пуста. Сканируйте ценники или вводите цены в калькуляторе — здесь будет видно, на сколько набрали.</p>';
  $$('.cartbox').forEach(box => {
    if (renderMoney.soft && document.activeElement && box.contains(document.activeElement)) return;
    box.innerHTML = html;
    box.querySelectorAll('.ci').forEach(el => {
      const it = S.cart.find(x => x.id === el.dataset.id);
      el.querySelector('.nm').onchange = e => { it.name = e.target.value; it.u = now(); save(); };
      el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { it.qty += +b.dataset.q; it.u = now(); if (it.qty <= 0) { kill(it.id); S.cart = S.cart.filter(x => x !== it); } save(); renderMoney(); });
    });
    const c = box.querySelector('[data-clr]');
    if (c) { c.onclick = () => { if (!confirm('Очистить корзину?')) return; S.cart.forEach(i => kill(i.id)); S.cart = []; save(); renderMoney(); }; box.querySelector('[data-pay]').onclick = paySheet; }
  });
}
function renderCartBar() {
  const n = cartN(), own = ownTotal('KZT'), ct = cartTotal('KZT');
  $('#cartBar').innerHTML = `<span class="q">${n}</span><span class="m"><b>${n ? fmt(cartTotal('VND'), 'VND') : 'Корзина пуста'}</b><small>${n ? fmt(ct, 'KZT') + (own > 0 ? ', останется ' + fmt(own - ct, 'KZT') : '') : 'Сумма покупок будет здесь'}</small></span>${ic('chev')}`;
}
function openCart() { sheet('<h3>Корзина</h3><div class="plate cartbox"></div><button class="btn sec wide" id="cartX">Закрыть</button>'); $('#cartX').onclick = closeSheet; renderCart(); }
function paySheet() {
  if (!S.acc.length) return toast('Сначала добавьте кошелёк во вкладке «Деньги»');
  sheet('<h3>С какого кошелька списать?</h3>' + S.acc.map(a => {
    const need = conv(cartTotal('USD'), 'USD', a.cur) * (1 + num(a.fee) / 100), rest = bal(a) - need;
    return `<button class="opt" data-id="${a.id}"><span><b>${esc(a.name)}</b><small>Спишется ${fmt(need, a.cur)}${num(a.fee) ? `, с учётом ${num(a.fee)}%` : ''}</small><small class="${rest < 0 ? 'neg' : ''}">${rest < 0 ? 'Не хватает ' + fmt(-rest, a.cur) : 'Останется ' + fmt(rest, a.cur)}</small></span><span class="tile cur">${SYM[a.cur]}</span></button>`;
  }).join('') + '<button class="btn sec wide" id="payX">Отмена</button>');
  $('#payX').onclick = closeSheet;
  $$('#sheetIn .opt').forEach(b => b.onclick = () => {
    const a = S.acc.find(x => x.id === b.dataset.id), need = +(conv(cartTotal('USD'), 'USD', a.cur) * (1 + num(a.fee) / 100)).toFixed(a.cur === 'USD' ? 2 : 0);
    S.hist.push({ id: uid(), ts: now(), acc: a.name, accId: a.id, cur: a.cur, charge: need, vnd: cartTotal('VND'), n: cartN(), by: who, u: now() });
    S.cart.forEach(i => kill(i.id)); S.cart = []; save(); closeSheet(); renderMoney(); toast('Списано с «' + a.name + '»');
  });
}
function initMoney() {
  $('#accAdd').onclick = () => { S.acc.push({ id: uid(), name: 'Новый кошелёк', cur: 'KZT', start: 0, fee: 0, u: now() }); save(); renderMoney(); };
  $('#mAdd').onclick = () => { const p = num($('#mPrice').value); if (!p) return toast('Введите цену'); addCart(p, $('#mCur').value, $('#mName').value.trim()); $('#mPrice').value = $('#mName').value = ''; };
  $('#cartBar').onclick = openCart;
}

/* ---------- синхронизация (зашифрованно) ---------- */
function merge(a, b) {
  const del = { ...(a.del || {}) }; for (const k in (b.del || {})) del[k] = Math.max(del[k] || 0, b.del[k]);
  const mix = (x, y) => { const m = new Map(); [...(x || []), ...(y || [])].forEach(i => { const o = m.get(i.id); if (!o || (i.u || 0) > (o.u || 0)) m.set(i.id, i); }); return [...m.values()].filter(i => !(del[i.id] >= (i.u || i.ts || 0))); };
  const bk = !a.bank ? b.bank : !b.bank ? a.bank : (b.bank.u || 0) > (a.bank.u || 0) ? b.bank : a.bank;
  return { acc: mix(a.acc, b.acc), cart: mix(a.cart, b.cart), hist: mix(a.hist, b.hist), del, bank: bk };
}
const SY = { busy: false, last: 0, err: '' };
async function codeFor(ns) { const m = new Uint8Array(RAW.length + 64); m.set(RAW); const t = enc.encode('|pq-sync|' + ns); m.set(t, RAW.length); const h = new Uint8Array(await crypto.subtle.digest('SHA-256', m.subarray(0, RAW.length + t.length))); return [...h].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function seal(o) { const iv = crypto.getRandomValues(new Uint8Array(12)); const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, KEY, enc.encode(JSON.stringify(o)))); return { v: 2, iv: b64(iv), c: b64(c) }; }
async function unseal(o) { if (!o || !o.c) return null; try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, KEY, unb64(o.c)))); } catch { return null; } }
async function rpc(fn, body) {
  const r = await fetch(SYNC.url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SYNC.key, Authorization: 'Bearer ' + SYNC.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('HTTP ' + r.status); const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function syncNow() {
  if (!who || !RAW || !window.SYNC?.url || SY.busy || !navigator.onLine) return renderSyncLine();
  SY.busy = true; const ns = nsOf();
  try {
    const code = await codeFor(ns), remote = await unseal(await rpc('pq_get', { p_code: code }));
    const before = JSON.stringify(S); if (remote) S = merge(S, remote);
    if (JSON.stringify(S) !== before) { P.set('S', S); bank = S.bank || bank; renderMoney.soft = 1; renderMoney(); renderMoney.soft = 0; if (!document.activeElement?.closest?.('#bank')) renderBank(); }
    if (!remote || G.get(ns + '.dirty', 0) || JSON.stringify(S) !== JSON.stringify(merge(remote, {}))) { await rpc('pq_put', { p_code: code, p_data: await seal(S) }); G.set(ns + '.dirty', 0); }
    SY.last = now(); G.set(ns + '.syncTs', SY.last); SY.err = '';
  } catch (e) { SY.err = String(e.message || e); }
  SY.busy = false; renderSyncLine();
}
function syncText() {
  const with2 = isFam() ? 'Общий бюджет с ' + esc(nameOf(shared().find(x => x !== who) || '')) + '. ' : 'Ваши деньги видны на всех ваших телефонах. ';
  if (!navigator.onLine) return with2 + 'Сейчас нет интернета — изменения сохранятся и отправятся позже.';
  if (SY.err) return with2 + 'Связи с сервером нет, попробую ещё раз.';
  return with2 + (SY.last ? 'Сверено ' + ago(SY.last) + '.' : 'Сверяю…');
}
function renderSyncLine() { const el = $('#syncLine'); if (el && who) el.innerHTML = ic('sync') + '<span>' + syncText() + '</span>'; }

/* ---------- калькулятор ---------- */
const CA = { cur: G.get('calcCur', 'VND'), s: '' };
const calcVal = () => num(CA.s.replace(',', '.'));
function renderCalc() {
  if (!TRIP) return;
  const v = calcVal();
  $$('#curRows .currow').forEach(b => {
    const c = b.dataset.c, on = c === CA.cur; b.classList.toggle('on', on);
    b.querySelector('b').textContent = on ? (CA.s ? (c === 'USD' ? CA.s.replace(/^(\d+)/, m => grp(+m, 0)) : grp(v, 0)) : '0') : (v ? fmt(conv(v, CA.cur, c), c).replace(/ [₫₸]$/, '').replace(/^\$/, '') : '0');
  });
  const q = { VND: [10000, 20000, 50000, 100000, 200000, 500000], KZT: [500, 1000, 2000, 5000, 10000, 20000], USD: [1, 5, 10, 20, 50, 100] }[CA.cur];
  $('#calcChips').innerHTML = q.map(x => `<button class="chip" data-v="${x}">${x >= 1000 ? grp(x / 1000, 0) + ' тыс' : x}</button>`).join('');
  $$('#calcChips .chip').forEach(b => b.onclick = () => { CA.s = b.dataset.v; renderCalc(); });
  $('#kDec').textContent = CA.cur === 'USD' ? ',' : '00';
  $('#calcRate').innerHTML = `${rateLine()}<br>${my.on ? 'Курс обменника. ' : ''}Обновлён ${ago(rates.ts)}`;
}
function calcKey(k) {
  if (/^\d$/.test(k)) { if (CA.s === '0') CA.s = ''; if (CA.s.replace(/\D/g, '').length < 12 && !/,\d\d$/.test(CA.s)) CA.s += k; }
  else if (k === '000' || k === '00') { if (CA.s && CA.s !== '0' && !CA.s.includes(',') && CA.s.length < 10) CA.s += k; }
  else if (k === 'dec') { if (CA.cur === 'USD') { if (!CA.s.includes(',')) CA.s = (CA.s || '0') + ','; } else calcKey('00'); }
  else if (k === 'bs') CA.s = CA.s.slice(0, -1);
  else if (k === 'c') CA.s = '';
  else if (k === 'add') { const v = calcVal(); if (!v) return toast('Наберите цену'); addCart(v, CA.cur); CA.s = ''; }
  renderCalc();
}
function initCalc() {
  $$('#keys button').forEach(b => b.onclick = () => { calcKey(b.dataset.k); navigator.vibrate?.(8); });
  $$('#curRows .currow').forEach(b => b.onclick = () => {
    const c = b.dataset.c; if (c === CA.cur) return; const v = calcVal();
    CA.s = v ? (c === 'USD' ? String(+conv(v, CA.cur, c).toFixed(2)).replace('.', ',') : String(Math.round(conv(v, CA.cur, c)))) : '';
    CA.cur = c; G.set('calcCur', c); renderCalc();
  });
  document.addEventListener('keydown', e => {
    if (!$('#t-scan').classList.contains('on') || $('#tool').dataset.mode !== 'calc' || !$('#sheet').hidden || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const m = { Backspace: 'bs', Delete: 'c', Escape: 'c', Enter: 'add', ',': 'dec', '.': 'dec' }[e.key] || (/^\d$/.test(e.key) ? e.key : null);
    if (m) { e.preventDefault(); calcKey(m); }
  });
}

/* ---------- сканер ---------- */
function parsePrice(raw, cur, kMode) {
  let s = ' ' + String(raw || '') + ' ';
  s = s.replace(/(\d)[oO](?=[\d.,\s])/g, (m, a) => a + '0').replace(/(\d)[lI|](?=\d)/g, (m, a) => a + '1');
  s = s.replace(/(\d)\s*([.,])\s*(?=\d{3}(?!\d))/g, (m, a, b) => a + b);
  const re = /\d[\d.,]*\d|\d/g; let m, best = null;
  while ((m = re.exec(s))) {
    const tok = m[0], digits = tok.replace(/\D/g, '').length, k = /^\s?[kK](?![a-zA-Z])/.test(s.slice(m.index + tok.length, m.index + tok.length + 3));
    const parts = tok.split(/[.,]/); let v;
    if (parts.length > 1 && parts.slice(1).every(p => p.length === 3)) v = +parts.join('');
    else if (parts.length > 1) v = parseFloat(parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);
    else v = +tok;
    if (!isFinite(v) || v <= 0) continue;
    if (k) v *= 1000;
    let score = digits;
    if (cur === 'VND') { if (kMode && v < 1000) v *= 1000; v = Math.round(v); if (digits > 9 || v < 1000 || v > 5e8 || v % 100) continue; if (v % 500 === 0) score += 2; }
    else if (digits > 8 || v > 1e7) continue;
    if (!best || score > best.score) best = { v, score };
  }
  return best ? best.v : null;
}
function readPrice(data, cur, kMode) {
  let top = null;
  for (const l of (data.lines || [])) {
    const v = parsePrice(l.text, cur, kMode); if (!v) continue;
    const ws = (l.words || []).filter(w => /\d/.test(w.text)), h = ws.length ? Math.max(...ws.map(w => w.bbox.y1 - w.bbox.y0)) : 0;
    if (!top || h > top.h) top = { h, v };
  }
  return top ? top.v : parsePrice(data.text, cur, kMode);
}
const SC = { stream: null, worker: null, busy: false, on: false, last: [], val: null, frozen: false, ignore: null, miss: 0, loading: false, cur: G.get('scCur', 'VND'), zoom: 1, wake: null };
const scOpt = () => ({ stop: G.get('scStop', true), k: G.get('scK', false), vib: G.get('scVib', true) });
function scIdle(big, sub) { const r = $('#scRead'); r.classList.add('wait'); $('#scBig').textContent = big; $('#scSub').textContent = sub || ''; $('#scActs').hidden = true; $('#roi').classList.remove('ok'); }
async function ocrWorker() {
  if (SC.worker) return SC.worker; if (SC.loading) return null; SC.loading = true;
  try {
    const w = await Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract', gzip: true, workerBlobURL: false });
    await w.setParameters({ tessedit_pageseg_mode: '6' }); SC.worker = w;
  } catch { scIdle('Сканер не загрузился', 'Откройте приложение один раз с интернетом'); }
  SC.loading = false; return SC.worker;
}
async function camStart() {
  if (SC.on) return;
  $('#camMsg').textContent = 'Запрашиваю камеру…';
  try { SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }); }
  catch { $('#camMsg').textContent = 'Камера недоступна. Разрешите её для этого сайта в настройках браузера — или считайте в калькуляторе.'; return; }
  if (!$('#t-scan').classList.contains('on') || $('#tool').dataset.mode !== 'cam') { SC.stream.getTracks().forEach(t => t.stop()); SC.stream = null; return; }
  const v = $('#vid'); v.srcObject = SC.stream; await v.play().catch(() => {});
  $('#camStart').hidden = true; SC.on = true; SC.frozen = false; SC.last = []; G.set('camOk', 1);
  const tr = SC.stream.getVideoTracks()[0], caps = tr.getCapabilities?.() || {};
  if (caps.torch) { const b = $('#torch'); b.hidden = false; b.onclick = () => { const on = !b.classList.contains('on'); tr.applyConstraints({ advanced: [{ torch: on }] }).then(() => b.classList.toggle('on', on)).catch(() => {}); }; }
  navigator.wakeLock?.request('screen').then(w => SC.wake = w).catch(() => {});
  scIdle('Готовлю сканер…', 'Пара секунд при первом запуске'); await ocrWorker();
  if (SC.on && SC.worker) { scIdle('Наведите на цену', 'Цифры должны быть внутри рамки'); scanLoop(); }
}
function camStop() { SC.on = false; SC.stream?.getTracks().forEach(t => t.stop()); SC.stream = null; SC.wake?.release?.().catch(() => {}); SC.wake = null; $('#camStart').hidden = false; $('#camMsg').textContent = ''; $('#torch').hidden = true; $('#torch').classList.remove('on'); }
const cv = document.createElement('canvas');
function grab() {
  const v = $('#vid'), box = $('#cam').getBoundingClientRect(), r = $('#roi').getBoundingClientRect();
  if (!v.videoWidth || !box.width) return null;
  const sc = Math.max(box.width / v.videoWidth, box.height / v.videoHeight) * SC.zoom, ox = (v.videoWidth * sc - box.width) / 2, oy = (v.videoHeight * sc - box.height) / 2;
  const sx = (r.left - box.left + ox) / sc, sy = (r.top - box.top + oy) / sc, sw = r.width / sc, sh = r.height / sc;
  const W = 900, H = Math.round(W * sh / sw); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
  const im = c.getImageData(0, 0, W, H), p = im.data; let mn = 255, mx = 0, sum = 0;
  for (let i = 0; i < p.length; i += 4) { const g = p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11; p[i] = g; sum += g; if (g < mn) mn = g; if (g > mx) mx = g; }
  const k = 255 / Math.max(40, mx - mn), inv = sum / (p.length / 4) < 105;
  for (let i = 0; i < p.length; i += 4) { let g = Math.max(0, Math.min(255, (p[i] - mn) * k)); if (inv) g = 255 - g; p[i] = p[i + 1] = p[i + 2] = g; }
  c.putImageData(im, 0, 0); return cv;
}
async function scanLoop() {
  if (!SC.on) return;
  if (!SC.frozen && !SC.busy && SC.worker && !document.hidden && $('#sheet').hidden) {
    SC.busy = true;
    try { const img = grab(); if (img) { const { data } = await SC.worker.recognize(img); if (!SC.frozen && SC.on) onRead(readPrice(data, SC.cur, scOpt().k)); } } catch {}
    SC.busy = false;
  }
  setTimeout(scanLoop, 180);
}
function onRead(v) {
  SC.last.push(v); if (SC.last.length > 3) SC.last.shift();
  const cnt = {}; SC.last.forEach(x => { if (x) cnt[x] = (cnt[x] || 0) + 1; });
  const st = Object.keys(cnt).find(x => cnt[x] >= 2);
  if (SC.ignore !== null && v !== SC.ignore && ++SC.miss >= 2) SC.ignore = null;
  if (st && +st !== SC.ignore) lockPrice(+st);
  else if (!scOpt().stop && SC.last.every(x => !x)) { SC.val = null; scIdle('Наведите на цену', 'Цифры должны быть внутри рамки'); }
}
function showPrice(v) {
  const cur = SC.cur, bigC = cur === 'KZT' ? 'VND' : 'KZT', third = CURS.find(c => c !== cur && c !== bigC);
  $('#scRead').classList.remove('wait'); $('#scBig').textContent = fmt(conv(v, cur, bigC), bigC);
  $('#scSub').textContent = `${fmt(v, cur)} на ценнике, это ${fmt(conv(v, cur, third), third)}`;
}
function lockPrice(v) {
  const o = scOpt(), fresh = SC.val !== v; SC.val = v; showPrice(v);
  $('#roi').classList.add('ok'); $('#scActs').hidden = false; $('#buyNo').hidden = !o.stop; $('#scActs').classList.toggle('solo', !o.stop);
  if (o.stop) { SC.frozen = true; $('#vid').pause(); }
  if (fresh && o.vib) navigator.vibrate?.(30);
}
function resume(skip) {
  SC.ignore = skip ? SC.val : null; SC.miss = 0;
  SC.val = null; SC.last = []; SC.frozen = false; if (SC.on) $('#vid').play().catch(() => {});
  scIdle('Наведите на цену', 'Цифры должны быть внутри рамки');
}
function scanSettings() {
  const o = scOpt();
  sheet(`<h3>Сканер</h3>
    <label class="chk"><input type="checkbox" id="oStop" ${o.stop ? 'checked' : ''}> Останавливаться на цене и спрашивать «В корзину?»</label>
    <label class="chk"><input type="checkbox" id="oK" ${o.k ? 'checked' : ''}> Цены в тысячах: 125 на ценнике значит 125 000 ₫</label>
    <label class="chk"><input type="checkbox" id="oVib" ${o.vib ? 'checked' : ''}> Вибрация, когда цена поймана</label>
    <p class="mut sm">Если плохо читает: нажмите «1×», чтобы приблизить, включите свет и держите ценник ровно. Цена должна занимать примерно треть рамки.</p>
    <button class="btn wide" id="oOk">Готово</button>`);
  $('#oStop').onchange = e => G.set('scStop', e.target.checked); $('#oK').onchange = e => G.set('scK', e.target.checked); $('#oVib').onchange = e => G.set('scVib', e.target.checked);
  $('#oOk').onclick = () => { closeSheet(); resume(false); };
}
function setMode(m) {
  $('#tool').dataset.mode = m; G.set('toolMode', m);
  if (m === 'cam') { if ($('#t-scan').classList.contains('on') && G.get('camOk', 0)) camStart(); }
  else { camStop(); renderCalc(); }
}
function initScan() {
  $('#camBtn').onclick = camStart; $('#camCalc').onclick = () => setMode('calc'); $('#toCalc').onclick = () => setMode('calc'); $('#toCam').onclick = () => setMode('cam'); $('#scSet').onclick = scanSettings;
  const cur = () => $$('#scCur button').forEach(b => { b.classList.toggle('on', b.dataset.c === SC.cur); b.setAttribute('aria-pressed', b.dataset.c === SC.cur); }); cur();
  $$('#scCur button').forEach(b => b.onclick = () => { SC.cur = b.dataset.c; G.set('scCur', SC.cur); cur(); resume(false); });
  $('#zoomBtn').onclick = () => { SC.zoom = SC.zoom >= 3 ? 1 : SC.zoom + 1; $('#zoomBtn').textContent = SC.zoom + '×'; $('#zoomBtn').classList.toggle('on', SC.zoom > 1); $('#vid').style.transform = `scale(${SC.zoom})`; SC.last = []; };
  $('#buyYes').onclick = () => { if (SC.val) addCart(SC.val, SC.cur); resume(true); };
  $('#buyNo').onclick = () => resume(true);
  $('#tool').dataset.mode = G.get('toolMode', isPhone() ? 'cam' : 'calc');
  scIdle('Наведите на цену', 'Цифры должны быть внутри рамки');
}

/* ---------- гид ---------- */
let map, cat = 'Все';
const km = (a, b) => { const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const gdir = q => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
function renderPlaces() {
  const cats = ['Все', ...new Set(PLACES.map(p => p.c))];
  $('#placeCats').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}">${c}</button>`).join('');
  $$('#placeCats .chip').forEach(b => b.onclick = () => { cat = b.textContent; renderPlaces(); });
  $('#places').innerHTML = PLACES.filter(p => cat === 'Все' || p.c === cat).map(p => {
    const k = km(TRIP.hotel, p);
    return `<div class="row pl"><span class="tile">${ic('pin')}</span><span class="t"><b>${esc(p.n)}</b><small>${esc(p.d)}${p.tip ? ' ' + esc(p.tip) : ''}</small><small>${k < 1.2 ? 'Рядом с отелем' : 'Около ' + Math.round(k * 1.3) + ' км от отеля'}</small></span><span class="end"><button class="iconbtn" data-go="${esc(p.n)}" aria-label="Показать на карте: ${esc(p.n)}">${ic('map')}</button><a class="iconbtn" target="_blank" rel="noopener" href="${gdir(p.q)}" aria-label="Маршрут: ${esc(p.n)}">${ic('route')}</a></span></div>`;
  }).join('');
  $$('#places [data-go]').forEach(b => b.onclick = () => { const p = PLACES.find(x => x.n === b.dataset.go); if (map) { map.setView([p.lat, p.lon], 13); p._m?.openPopup(); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } else toast('Карта откроется, когда появится интернет'); });
  $('#routes').innerHTML = ROUTES.map(r => `<div class="plate route-card"><b>${esc(r.n)}</b><ol>${r.s.map(n => `<li>${esc(n)}</li>`).join('')}</ol><p class="mut sm">${esc(r.d)}</p><a class="btn sec sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${TRIP.hotel.lat},${TRIP.hotel.lon}&destination=${encodeURIComponent(PLACES.find(p => p.n === r.s[r.s.length - 1]).q)}&waypoints=${encodeURIComponent(r.s.slice(0, -1).map(n => PLACES.find(p => p.n === n).q).join('|'))}">${ic('route')}Открыть маршрут</a></div>`).join('');
}
function initMap() {
  if (map) { map.invalidateSize(); return; }
  if (!window.L) return;
  try {
    map = L.map('map', { zoomControl: true }).setView([10.2, 103.96], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' }).addTo(map);
    const dot = (c, r) => ({ radius: r, color: '#fff', weight: 2.5, fillColor: c, fillOpacity: 1 });
    L.circleMarker([TRIP.hotel.lat, TRIP.hotel.lon], dot('#000', 10)).addTo(map).bindPopup('<b>Наш отель</b><br>' + esc(TRIP.hotel.name));
    PLACES.forEach(p => { p._m = L.circleMarker([p.lat, p.lon], dot('#e0a800', 8)).addTo(map).bindPopup(`<b>${esc(p.n)}</b><br>${esc(p.d)}<br><a target="_blank" rel="noopener" href="${gdir(p.q)}">Маршрут</a>`); });
    if (navigator.geolocation) map.on('locationfound', e => L.circleMarker(e.latlng, dot('#1a4fa3', 8)).addTo(map).bindPopup('Вы здесь')).locate({ setView: false });
  } catch { map = null; }
}
function renderRules() { $('#rules').innerHTML = RULES.map((r, i) => `<details class="plate" ${i === 0 ? 'open' : ''}><summary>${esc(r.h)}</summary><ul>${r.li.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>`).join(''); }
const NOTES = [[500000, '#1f9cc4'], [200000, '#c75a3a'], [100000, '#4f9a5c'], [50000, '#c0567f'], [20000, '#3d6fb8'], [10000, '#b38b39'], [5000, '#4b57a8'], [2000, '#8a7a67'], [1000, '#7c8a4a']];
function renderCash() {
  if (!TRIP) return;
  $('#rateCard').innerHTML = `<b style="font-size:1.2rem">${rateLine()}</b><p class="mut sm">10 000 ₫ ≈ ${fmt(conv(10000, 'VND', 'KZT'), 'KZT')}. ${my.on ? 'Считается по вашему курсу обменника.' : 'Рыночный курс, обновлён ' + ago(rates.ts) + '.'}</p>
    <div class="btnrow"><button class="btn sec sm" id="rateUpd">${ic('sync')}Обновить курс</button></div>
    <details style="margin-top:12px"><summary>Считать по курсу обменника</summary><div class="form">
      <label class="frow" style="align-items:center">1 $ =<input id="myVND" inputmode="decimal" value="${esc(my.VND)}" placeholder="донгов"> ₫</label>
      <label class="frow" style="align-items:center">1 $ =<input id="myKZT" inputmode="decimal" value="${esc(my.KZT)}" placeholder="тенге"> ₸</label>
      <label class="chk"><input type="checkbox" id="myOn" ${my.on ? 'checked' : ''}> Считать везде по этому курсу</label></div></details>`;
  $('#rateUpd').onclick = () => fetchRates(true);
  const sv = () => { my = { on: $('#myOn').checked, VND: $('#myVND').value, KZT: $('#myKZT').value }; G.set('myrate', my); renderCalc(); renderMoney(); renderCheat(); };
  $('#myVND').oninput = $('#myKZT').oninput = $('#myOn').onchange = sv;
  renderCheat(); renderBank();
}
function renderCheat() { $('#cheat').innerHTML = NOTES.map(([v, c]) => `<tr><td><i class="note" style="background:${c}"></i>${grp(v, 0)}&nbsp;₫</td><td>${fmt(conv(v, 'VND', 'KZT'), 'KZT')}</td><td>${fmt(conv(v, 'VND', 'USD'), 'USD')}</td></tr>`).join(''); }
function renderContacts() {
  $('#contacts').innerHTML = TRIP.contacts.map(c => `<a class="row" href="tel:${c[1]}"><span class="tile">${ic('phone')}</span><span class="t"><b>${esc(c[0])}</b><small>${esc(c[1])}</small></span><span class="end">${ic('chev')}</span></a>`).join('') +
    `<div class="row"><span class="tile">${ic('file')}</span><span class="t"><b>Бронь</b><small>${esc(TRIP.booking)}</small></span><span></span></div>`;
  $('#ver').textContent = 'Версия ' + VERSION + '. Работает без интернета после первого открытия.';
}
function guide(g) {
  if (!['places', 'rules', 'cash', 'contacts'].includes(g)) g = 'places';
  $$('#gSeg button').forEach(b => { b.classList.toggle('on', b.dataset.g === g); b.setAttribute('aria-selected', b.dataset.g === g); });
  $$('.gp').forEach(p => p.hidden = p.dataset.g !== g); G.set('gseg', g);
  if (g === 'places') setTimeout(initMap, 60);
}

/* ---------- банк ---------- */
const BANKS0 = { Kaspi: { m: 1, f: 0 }, Halyk: { m: 1, f: 0 }, Freedom: { m: 1, f: 0 }, 'БЦК': { m: 1, f: 0 } };
const bankDef = () => ({ amt: 1000000, cashKZ: '', cashVN: '', upd: '', u: 0, b: Object.keys(BANKS0).map(n => ({ n, ...BANKS0[n], src: 'оценка' })) });
let bank = bankDef();
const saveBank = () => { bank.u = Date.now(); S.bank = bank; save(); };
async function fetchBanks() {
  try {
    const j = await (await fetch('banks.json', { cache: 'no-store' })).json(), was = JSON.stringify(bank);
    bank.b.forEach(x => { const d = j.banks?.[x.n]; if (d && x.src !== 'по вашей оплате' && x.src !== 'введено вручную') { x.m = d.m; x.f = d.f; x.src = d.src || 'оценка'; } });
    bank.upd = j.updated || ''; if (JSON.stringify(bank) !== was) { S.bank = bank; P.set('S', S); renderBank(); }
  } catch {}
}
function bankRows() {
  const r = R(), fair = bank.amt / r.VND * r.KZT;
  const rows = bank.b.map(x => ({ n: x.n, src: x.src, cost: fair * (1 + num(x.m) / 100) * (1 + num(x.f) / 100) }));
  const cKZ = num(bank.cashKZ), cVN = num(bank.cashVN); if (cKZ > 0 && cVN > 0) rows.push({ n: 'Наличные: $ из Казахстана', src: 'ваш курс', cost: bank.amt / cVN * cKZ });
  const best = Math.min(...rows.map(x => x.cost));
  return `<div class="bres"><span>По рыночному курсу, без потерь</span><span><b>${fmt(fair, 'KZT')}</b></span></div>` + rows.map(x => `<div class="bres ${x.cost === best ? 'best' : ''}"><span><b>${esc(x.n)}</b>${x.cost === best ? ' — выгоднее' : ''}<br><small class="mut">${esc(x.src)}</small></span><span><b>${fmt(x.cost, 'KZT')}</b><br><small class="${x.cost > fair ? 'neg' : 'pos'}">${x.cost > fair ? 'потеря' : 'выгода'} ${fmt(Math.abs(x.cost - fair), 'KZT')}, ${(Math.abs(x.cost / fair - 1) * 100).toFixed(1)}%</small></span></div>`).join('');
}
function renderBank(full = true) {
  if (!TRIP) return;
  if (!full) return $('#bankOut').innerHTML = bankRows();
  const r = R();
  $('#bank').innerHTML = `<p class="sm">Картой в донгах: сумма идёт через доллар, а банк списывает тенге по своему курсу. Наценка банка сначала стоит примерная — после первой оплаты впишите две суммы ниже, и приложение запомнит настоящую.</p>
    <div class="form"><label class="frow" style="align-items:center">Сумма<input id="bAmt" inputmode="decimal" value="${plain(bank.amt, 'VND')}">₫</label></div>
    <div id="bankOut" style="margin-top:10px">${bankRows()}</div>
    <details open style="margin-top:12px"><summary>Уточнить по реальной оплате</summary><div class="form">
      <select id="kBank">${bank.b.map(x => `<option>${esc(x.n)}</option>`).join('')}</select>
      <input id="kV" inputmode="decimal" placeholder="Заплатил в донгах, как в чеке">
      <input id="kT" inputmode="decimal" placeholder="Списали в тенге, как в приложении банка">
      <button class="btn" id="kGo">Запомнить наценку банка</button></div></details>
    <details style="margin-top:12px"><summary>Наценки вручную, %</summary><div class="form">${bank.b.map((x, i) => `<div class="frow" style="align-items:center"><b style="flex:0 0 80px">${esc(x.n)}</b><input data-b="${i}" data-k="m" inputmode="decimal" value="${x.m}" aria-label="${esc(x.n)}: наценка курса, %"><input data-b="${i}" data-k="f" inputmode="decimal" value="${x.f || ''}" placeholder="комиссия" aria-label="${esc(x.n)}: комиссия, %"></div>`).join('')}</div></details>
    <details style="margin-top:12px"><summary>Сравнить с наличными</summary><div class="form"><input id="bKZ" inputmode="decimal" value="${esc(bank.cashKZ)}" placeholder="Купил 1 $ в Казахстане за … ₸"><input id="bVN" inputmode="decimal" value="${esc(bank.cashVN)}" placeholder="Обменник во Вьетнаме даёт за 1 $ … ₫"></div></details>
    <p class="mut sm">«Оценка» — примерная цифра, не тариф банка. Kaspi и Freedom пишут, что отдельной комиссии за конвертацию нет: потери прячутся в их курсе. Снятие в банкомате считается отдельно.</p>`;
  const sv = () => { bank.amt = num($('#bAmt').value); bank.cashKZ = $('#bKZ').value; bank.cashVN = $('#bVN').value; $$('#bank [data-b]').forEach(i => { const x = bank.b[i.dataset.b], v = num(i.value); if (x[i.dataset.k] !== v) { x[i.dataset.k] = v; x.src = 'введено вручную'; } }); saveBank(); renderBank(false); };
  $$('#bank input:not(#kV):not(#kT)').forEach(i => i.oninput = sv);
  $('#kGo').onclick = () => {
    const v = num($('#kV').value), t = num($('#kT').value); if (!v || !t) return toast('Впишите обе суммы');
    const m = (t / (v / r.VND * r.KZT) - 1) * 100; if (m < -5 || m > 15) return toast('Суммы не сходятся — проверьте цифры');
    const x = bank.b.find(y => y.n === $('#kBank').value); x.m = +m.toFixed(2); x.f = 0; x.src = 'по вашей оплате';
    saveBank(); renderBank(); toast(`${x.n}: наценка ${x.m}% сохранена`);
  };
}

/* ---------- профиль и оформление ---------- */
function settings(first) {
  const p = TRIP.people.map(x => `<button class="opt ${x.id === who && !first ? 'on' : ''}" data-p="${x.id}"><span><b>${esc(x.name)}</b><small>${shared().includes(x.id) ? 'Общий бюджет: ' + shared().map(nameOf).join(' и ') : 'Свой кошелёк'}</small></span><span class="ck">${x.id === who && !first ? ic('check') : ''}</span></button>`).join('');
  const th = THEMES.map(t => `<button class="th ${theme.t === t.id ? 'on' : ''}" data-t="${t.id}"><span class="pv" style="background:${t.id === 'auto' ? `linear-gradient(90deg,${t.g} 50%,${t.g2} 50%)` : t.g}"><i style="background:${t.s};color:${t.si}"><u style="background:${t.t}"></u>22:35</i><em style="color:${t.id === 'auto' ? '#000' : t.ink}">125 000 ₫</em></span><span class="lb"><b>${t.n}</b><small>${t.d}</small></span></button>`).join('');
  sheet(first ? `<h3>Кто вы?</h3><p class="mut">От этого зависят ваш посадочный, документы и кошелёк. Сменить можно потом.</p>${p}` :
    `<h3>Профиль и оформление</h3><h2>Кто вы</h2>${p}<h2>Тема</h2><div class="themes">${th}</div>
     <label class="chk"><input type="checkbox" id="bigTxt" ${theme.big ? 'checked' : ''}> Крупный текст</label>
     <h2>Синхронизация</h2><p class="sm">${syncText()}</p><div class="btnrow"><button class="btn sec sm" id="syncGo">${ic('sync')}Сверить сейчас</button></div>
     <h2>Этот телефон</h2><div class="btnrow"><button class="btn sec" id="logout">${ic('logout')}Выйти</button><button class="btn" id="setOk">Готово</button></div>
     <p class="mut sm">После выхода понадобится пароль поездки.</p>`, !first);
  $$('#sheetIn [data-p]').forEach(b => b.onclick = () => { closeSheet(); setWho(b.dataset.p); });
  if (first) return;
  $$('#sheetIn [data-t]').forEach(b => b.onclick = () => { theme.t = b.dataset.t; G.set('theme2', theme); applyTheme(); settings(false); });
  $('#bigTxt').onchange = e => { theme.big = e.target.checked; G.set('theme2', theme); applyTheme(); };
  $('#syncGo').onclick = () => syncNow().then(() => { toast(SY.err ? 'Нет связи с сервером' : 'Сверено'); settings(false); });
  $('#logout').onclick = () => { if (!confirm('Выйти на этом телефоне? Для входа нужен будет пароль поездки.')) return; G.del('k'); location.reload(); };
  $('#setOk').onclick = closeSheet;
}

/* ---------- навигация и запуск ---------- */
function show(t) {
  if (!document.getElementById('t-' + t)) t = 'home';
  $$('.tab').forEach(s => s.classList.toggle('on', s.id === 't-' + t)); $$('#nav>button[data-t]').forEach(b => { b.classList.toggle('on', b.dataset.t === t); if (b.dataset.t === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.body.classList.toggle('scanning', t === 'scan'); window.scrollTo(0, 0); G.set('tab', t);
  if (t !== 'scan' && SC.on) camStop();
  if (t === 'scan') { if ($('#tool').dataset.mode === 'cam' && G.get('camOk', 0)) camStart(); else renderCalc(); }
  if (t === 'guide') guide(G.get('gseg', 'places'));
}
function renderAll() { if (!TRIP) return; renderHome(); renderDocs(); renderMoney(); renderCalc(); renderCash(); renderPlaces(); renderRules(); renderContacts(); }
async function start() {
  $('#lock').hidden = true; $('#app').hidden = false;
  if (STARTED) return; STARTED = true;
  migrate();
  if (!who) who = TRIP.people[0].id;
  S = loadS(); bank = S.bank || bankDef(); SY.last = G.get(nsOf() + '.syncTs', 0); docWho = who;
  $$('.who span').forEach(s => s.textContent = nameOf(who));
  $$('#nav>button[data-t]').forEach(b => b.onclick = () => show(b.dataset.t));
  $$('.who').forEach(b => b.onclick = () => settings(false));
  $$('#gSeg button').forEach(b => b.onclick = () => guide(b.dataset.g));
  initHome(); initDocs(); initViewer(); initMoney(); initCalc(); initScan();
  await loadLocal(); renderAll();
  show(G.get('tab', 'home'));
  if (!G.get('who', null)) settings(true);
  tick(); setInterval(tick, 1000); setInterval(() => { renderHome(); renderSyncLine(); }, 60000);
  fetchRates(false); fetchWx(); fetchBanks(); syncNow();
  setInterval(() => { fetchRates(false); fetchWx(); }, 30 * 60000);
  setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
  window.addEventListener('online', () => { fetchRates(false); fetchWx(); syncNow(); });
  window.addEventListener('offline', () => { renderSyncLine(); tick(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && SC.on) camStop(); else if (!document.hidden) { tick(); syncNow(); if ($('#t-scan').classList.contains('on') && $('#tool').dataset.mode === 'cam' && G.get('camOk', 0)) camStart(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
}
window.__t = { parsePrice, readPrice, normPw, merge };
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
});
