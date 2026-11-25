'use strict';
const VERSION = '1.2.1';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G = { get(k, d) { try { const v = JSON.parse(localStorage.getItem('pq.' + k)); return v ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('pq.' + k, JSON.stringify(v)); } catch {} } };
const uid = () => Math.random().toString(36).slice(2, 9);
const SYM = { VND: '₫', USD: '$', KZT: '₸' }, CURS = ['VND', 'KZT', 'USD'];

/* ---------- профиль (4 аккаунта, данные хранятся на телефоне) ---------- */
let who = G.get('who', null);
const nsOf = () => (TRIP.shared || []).includes(who) ? 'fam' : who;
const isFam = () => nsOf() === 'fam';
const P = { get: (k, d) => G.get(nsOf() + '.' + k, d), set: (k, v) => G.set(nsOf() + '.' + k, v) };
function pickWho(first) {
  sheet(`<h3>${first ? 'Кто вы?' : 'Сменить профиль'}</h3><p class="mut sm">У ${(TRIP.shared || []).join(' и ')} общий бюджет. У остальных — свой. Данные лежат в телефоне.</p>` +
    TRIP.people.map(p => `<button class="opt" data-p="${esc(p)}"><b>${esc(p)}</b>${p === who ? 'сейчас выбран' : ''}</button>`).join(''), !first);
  $$('#sheetIn [data-p]').forEach(b => b.onclick = () => { who = b.dataset.p; G.set('who', who); closeSheet(); loadProfile(); });
}
function loadProfile() {
  $('#whoBtn').textContent = who || 'Профиль';
  S = P.get('S', null) || { acc: [
    { id: 'cashvnd', name: 'Наличные донги', cur: 'VND', start: 0, fee: 0, u: 1 },
    { id: 'cashusd', name: 'Наличные доллары', cur: 'USD', start: 0, fee: 0, u: 1 },
    { id: 'card', name: 'Карта банка (тенге)', cur: 'KZT', start: 0, fee: 1, u: 1 }], cart: [], hist: [], del: {}, bank: null };
  bank = S.bank || bankDef();
  renderAll(); renderSync(); syncNow();
}

/* ---------- утилиты ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function sheet(html, closable = true) { $('#sheetIn').innerHTML = html; const s = $('#sheet'); s.hidden = false; s.onclick = e => { if (closable && e.target === s) closeSheet(); }; }
function closeSheet() { $('#sheet').hidden = true; }
function num(s) { if (typeof s === 'number') return s; s = String(s || '').replace(/\s/g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? v : 0; }
function fmt(v, cur) {
  if (!isFinite(v)) return '—';
  const d = cur === 'USD' ? 2 : 0;
  const s = v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
  return cur === 'USD' ? '$' + s : s + ' ' + (SYM[cur] || '');
}
function plain(v, cur) { if (!v) return ''; const d = cur === 'USD' ? 2 : 0; return (+v.toFixed(d)).toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/ | /g, ' '); }

/* ---------- курсы ---------- */
let rates = G.get('rates', { KZT: 449, VND: 25900, ts: 0 });
let my = G.get('myrate', { on: false, KZT: '', VND: '' });
function R() { const r = { USD: 1, KZT: rates.KZT, VND: rates.VND }; if (my.on) { if (num(my.KZT) > 0) r.KZT = num(my.KZT); if (num(my.VND) > 0) r.VND = num(my.VND); } return r; }
function conv(a, from, to) { const r = R(); return a / r[from] * r[to]; }
async function fetchRates(manual) {
  const tries = [
    async () => { const j = await (await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })).json(); return { KZT: j.rates.KZT, VND: j.rates.VND }; },
    async () => { const j = await (await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { cache: 'no-store' })).json(); return { KZT: j.usd.kzt, VND: j.usd.vnd }; }];
  for (const t of tries) {
    try { const r = await t(); if (r.KZT > 50 && r.VND > 1000) { rates = { ...r, ts: Date.now() }; G.set('rates', rates); renderRates(); renderAll(); if (manual) toast('Курс обновлён'); return true; } } catch {}
  }
  if (manual) toast('Нет интернета — работаю по сохранённому курсу');
  return false;
}
function ago(ts) { if (!ts) return 'запасной курс, ещё не обновлялся'; const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'обновлён только что'; if (m < 60) return `обновлён ${m} мин назад`; const h = Math.round(m / 60); if (h < 48) return `обновлён ${h} ч назад`; return `обновлён ${Math.round(h / 24)} дн назад`; }
function renderRates() {
  const r = R();
  $('#rateLine').textContent = `1 $ = ${plain(r.VND, 'VND')} ₫ = ${(+r.KZT.toFixed(2)).toLocaleString('ru-RU')} ₸`;
  $('#rateAge').textContent = (my.on ? 'ваш курс · ' : '') + `10 000 ₫ ≈ ${plain(conv(10000, 'VND', 'KZT'), 'KZT')} ₸ · ` + ago(rates.ts);
  $('#cheat').innerHTML = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000].map(v => `<tr><td>${plain(v, 'VND')} ₫</td><td>${fmt(conv(v, 'VND', 'KZT'), 'KZT')}</td><td>${fmt(conv(v, 'VND', 'USD'), 'USD')}</td></tr>`).join('');
}

/* ---------- конвертер ---------- */
let cActive = 'VND', cVal = 0;
function convFill(src) {
  CURS.forEach(c => { if (c !== src) $('#c' + c).value = cVal ? plain(conv(cVal, cActive, c), c) : ''; });
  const q = { VND: [10000, 20000, 50000, 100000, 200000, 500000, 1000000], KZT: [500, 1000, 2000, 5000, 10000, 50000], USD: [1, 5, 10, 20, 50, 100] }[cActive];
  $('#chips').innerHTML = q.map(v => `<button class="chip" data-v="${v}">${v >= 1e6 ? v / 1e6 + ' млн' : v >= 1000 && cActive !== 'USD' ? v / 1000 + ' тыс' : v}</button>`).join('');
  $$('#chips .chip').forEach(b => b.onclick = () => { cVal = +b.dataset.v; $('#c' + cActive).value = plain(cVal, cActive); convFill(cActive); });
}
function initConv() {
  CURS.forEach(c => {
    const i = $('#c' + c);
    i.oninput = () => { cActive = c; cVal = num(i.value); convFill(c); };
    i.onfocus = () => { cActive = c; i.select(); convFill(c); };
    i.onblur = () => { if (cActive === c && cVal) i.value = plain(cVal, c); };
  });
  $('#cClear').onclick = () => { cVal = 0; CURS.forEach(c => $('#c' + c).value = ''); };
  $('#cToCart').onclick = () => { if (!cVal) return toast('Сначала введите сумму'); addCart(cVal, cActive); };
  $('#rateUpd').onclick = () => fetchRates(true);
  $('#myVND').value = my.VND; $('#myKZT').value = my.KZT; $('#myOn').checked = my.on;
  const sv = () => { my = { on: $('#myOn').checked, VND: $('#myVND').value, KZT: $('#myKZT').value }; G.set('myrate', my); renderRates(); convFill(); renderAll(); };
  $('#myVND').oninput = $('#myKZT').oninput = $('#myOn').onchange = sv;
  convFill();
}

/* ---------- время, события, рейсы ---------- */
const TZ = { KZ: 'Asia/Almaty', VN: 'Asia/Ho_Chi_Minh' };
const tf = (d, tz, o) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, ...o }).format(d);
const hm = (d, tz) => tf(d, tz, { hour: '2-digit', minute: '2-digit' });
const dm = (d, tz) => tf(d, tz, { day: 'numeric', month: 'short' });
const tzOf = iso => iso.endsWith('+07:00') ? 'VN' : 'KZ';
let done = G.get('done', {}), myEv = G.get('events', []);
function allEvents() { return [...TRIP.events, ...myEv].map(e => ({ ...e, ts: Date.parse(e.t) })).sort((a, b) => a.ts - b.ts); }
function left(ms) { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return d ? `${d} д ${h} ч ${m} мин` : h ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m} мин ${String(ss).padStart(2, '0')} с`; }
function renderHome() {
  const now = Date.now(), evs = allEvents(), nx = evs.find(e => e.ts > now && !done[e.id]);
  $('#nextCard').innerHTML = nx ? `<small>Дальше по плану · ${dm(new Date(nx.ts), TZ[tzOf(nx.t)])}, ${hm(new Date(nx.ts), TZ[tzOf(nx.t)])} (${tzOf(nx.t) === 'VN' ? 'Фукуок' : 'Казахстан'})</small><div class="n" id="cd">${left(nx.ts - now)}</div><b>${esc(nx.title)}</b>` : `<small>Поездка</small><div class="n">Всё по плану</div><b>Событий впереди нет</b>`;
  $('#timeline').innerHTML = evs.map(e => {
    const z = tzOf(e.t), d = new Date(e.ts), cls = [done[e.id] ? 'done' : '', e.ts < now ? 'past' : '', nx && e.id === nx.id ? 'next' : ''].join(' ');
    return `<div class="ev ${cls}"><input type="checkbox" data-id="${esc(e.id)}" ${done[e.id] ? 'checked' : ''} aria-label="Сделано"><div class="w"><div class="t">${dm(d, TZ[z])}, ${hm(d, TZ[z])} · ${esc(e.title)}</div><div class="d">${z === 'VN' ? 'время Фукуока' : 'время Казахстана'}${e.d ? ' · ' + esc(e.d) : ''}</div></div>${e.mine ? `<button class="x" data-del="${esc(e.id)}" aria-label="Удалить">×</button>` : ''}</div>`;
  }).join('');
  $$('#timeline input').forEach(c => c.onchange = () => { done[c.dataset.id] = c.checked; G.set('done', done); renderHome(); });
  $$('#timeline [data-del]').forEach(b => b.onclick = () => { myEv = myEv.filter(e => e.id !== b.dataset.del); G.set('events', myEv); renderHome(); });
  $('#flights').innerHTML = TRIP.flights.map(f => {
    const d = new Date(f.dep), a = new Date(f.arr), z1 = TZ[tzOf(f.dep)], z2 = TZ[tzOf(f.arr)], st = now > +a ? 'завершён' : now > +d ? 'в полёте' : 'через ' + left(d - now);
    const seats = TRIP.people.map(p => `<div class="seat ${p === who ? 'me' : ''}">${esc(p)}<b>${esc(f.seats[p] || '—')}</b></div>`).join('');
    return `<div class="card fl"><div class="top"><b>${esc(f.no)}</b><span class="pill">${st}</span></div>
      <div class="rt"><div><b>${hm(d, z1)}</b><br><small>${esc(f.from)} ${f.fromCode}<br>${dm(d, z1)}</small></div><span>${esc(f.dur)}<br>→</span><div style="text-align:right"><b>${hm(a, z2)}</b><br><small>${esc(f.to)} ${f.toCode}<br>${dm(a, z2)}</small></div></div>
      <div class="seats">${seats}</div><p class="mut sm">${esc(f.note)}</p>
      <div class="row"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://sundayairlines.kz/ru/schedule/">Онлайн-табло рейса</a><a class="btn ghost sm" target="_blank" rel="noopener" href="https://sundayairlines.kz/ru/services/onlajn-registraciya/">Регистрация</a></div></div>`;
  }).join('');
}
function tick() {
  const n = new Date();
  $('#clkKZ').textContent = hm(n, TZ.KZ); $('#clkVN').textContent = hm(n, TZ.VN);
  $('#dateKZ').textContent = tf(n, TZ.KZ, { weekday: 'short', day: 'numeric', month: 'short' }); $('#dateVN').textContent = tf(n, TZ.VN, { weekday: 'short', day: 'numeric', month: 'short' });
  const nx = allEvents().find(e => e.ts > Date.now() && !done[e.id]), cd = $('#cd');
  if (cd && nx) cd.textContent = left(nx.ts - Date.now());
  $('#net').textContent = navigator.onLine ? 'онлайн' : 'офлайн'; $('#net').className = 'pill' + (navigator.onLine ? '' : ' off');
  checkNotif();
}
function initHome() {
  $('#evAdd').onclick = () => {
    const t = $('#evTitle').value.trim(), v = $('#evTime').value; if (!t || !v) return toast('Укажите название и время');
    myEv.push({ id: 'm' + uid(), t: v + ':00' + $('#evTz').value, title: t, d: '', mine: true }); G.set('events', myEv); $('#evTitle').value = ''; renderHome(); toast('Добавлено');
  };
  $('#icsBtn').onclick = () => {
    const z = d => new Date(d).toISOString().replace(/[-:]|\.\d+/g, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//phuquoc//ru', 'CALSCALE:GREGORIAN', ...allEvents().flatMap(e => ['BEGIN:VEVENT', 'UID:' + e.id + '@phuquoc', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(e.ts), 'DTEND:' + z(e.ts + 15 * 60000), 'SUMMARY:' + e.title.replace(/[,;]/g, ' '), 'DESCRIPTION:' + (e.d || '').replace(/[,;]/g, ' '), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + e.title.replace(/[,;]/g, ' '), 'TRIGGER:-PT60M', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + e.title.replace(/[,;]/g, ' '), 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'phuquoc.ics'; a.click(); toast('Откройте файл — события добавятся в календарь');
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
      navigator.serviceWorker?.ready.then(r => r.showNotification(e.title, { body, icon: 'icons/icon-192.png', tag: k })).catch(() => { try { new Notification(e.title, { body }); } catch {} });
    }
  }));
}

/* ---------- погода ---------- */
const WMO = { 0: 'ясно', 1: 'почти ясно', 2: 'переменная облачность', 3: 'пасмурно', 45: 'туман', 48: 'туман', 51: 'морось', 53: 'морось', 55: 'морось', 61: 'небольшой дождь', 63: 'дождь', 65: 'сильный дождь', 80: 'ливень местами', 81: 'ливни', 82: 'сильные ливни', 95: 'гроза', 96: 'гроза', 99: 'гроза' };
async function fetchWx() {
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=10.33&longitude=103.86&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia%2FHo_Chi_Minh&forecast_days=7';
    const j = await (await fetch(u, { cache: 'no-store' })).json(); if (!j.current) throw 0;
    G.set('wx', { j, ts: Date.now() });
  } catch {}
  renderWx();
}
function renderWx() {
  const w = G.get('wx', null); if (!w) return $('#wx').innerHTML = '<h3>Погода на Фукуоке</h3><p class="mut">Появится при первом подключении к интернету.</p>';
  const c = w.j.current, d = w.j.daily;
  $('#wx').innerHTML = `<h3>Погода на Фукуоке</h3><div class="wxnow"><b>${Math.round(c.temperature_2m)}°</b><span>${WMO[c.weather_code] || ''}<br><small class="mut">ощущается ${Math.round(c.apparent_temperature)}°, влажность ${c.relative_humidity_2m}%, ветер ${Math.round(c.wind_speed_10m)} км/ч</small></span></div>
  <div class="wxdays">${d.time.map((t, i) => `<div>${new Date(t + 'T12:00:00+07:00').toLocaleDateString('ru-RU', { weekday: 'short' })}<b>${Math.round(d.temperature_2m_max[i])}°</b>${Math.round(d.temperature_2m_min[i])}°<br>${d.precipitation_probability_max[i] ?? 0}%</div>`).join('')}</div>
  <p class="mut sm">Под температурой — шанс дождя. УФ сегодня: ${Math.round(d.uv_index_max[0])}${d.uv_index_max[0] >= 8 ? ' (очень высокий — крем обязателен)' : ''}. Данные ${ago(w.ts).replace('обновлён', 'обновлены')}.</p>`;
}

/* ---------- корзина и кошелёк (общие для семьи, синхронизация) ---------- */
let S = { acc: [], cart: [], hist: [], del: {}, bank: null };
const now = () => Date.now();
const save = () => { P.set('S', S); if (isFam()) { G.set('dirty', 1); clearTimeout(save.t); save.t = setTimeout(syncNow, 1500); } };
const kill = id => { S.del[id] = now(); };
const spent = a => S.hist.filter(h => h.accId === a.id).reduce((s, h) => s + h.charge, 0);
const bal = a => num(a.start) - spent(a);
function addCart(price, cur, name) {
  S.cart.push({ id: uid(), name: name || 'Товар ' + (S.cart.length + 1), price: +price, cur, qty: 1, u: now() }); save(); renderMoney();
  toast(`В корзине: ${fmt(price, cur)} · всего ${fmt(cartTotal('VND'), 'VND')}`);
}
const cartTotal = cur => S.cart.reduce((s, i) => s + conv(i.price * i.qty, i.cur, cur), 0);
const ownTotal = cur => S.acc.reduce((s, a) => s + conv(bal(a), a.cur, cur), 0);
function renderMoney() {
  const ae = document.activeElement; if (ae && ae.closest && ae.closest('#accounts,#cart') && renderMoney.soft) return;
  const n = S.cart.reduce((s, i) => s + i.qty, 0), b = $('#cartBadge'); b.hidden = !n; b.textContent = n;
  const own = ownTotal('KZT'), ct = cartTotal('KZT'), daysLeft = Math.max(1, Math.ceil((Date.parse('2026-12-03T16:00:00+07:00') - Date.now()) / 864e5));
  $('#moneyTotal').innerHTML = `<small>${isFam() ? 'Общий бюджет: ' + esc(TRIP.shared.join(' + ')) : 'Всего у меня (' + esc(who || '') + ')'}</small><div class="n">${fmt(own, 'KZT')}</div><b>${fmt(ownTotal('VND'), 'VND')} · ${fmt(ownTotal('USD'), 'USD')}</b>` +
    (ct ? `<br><small>После корзины останется ${fmt(own - ct, 'KZT')}</small>` : '') + (own > 0 ? `<br><small>Это примерно ${fmt((own - ct) / daysLeft, 'KZT')} (${fmt(conv((own - ct) / daysLeft, 'KZT', 'VND'), 'VND')}) в день до отлёта</small>` : '');
  $('#accounts').innerHTML = S.acc.map(a => `<div class="card acc" data-id="${a.id}">
    <input class="nm" data-f="name" value="${esc(a.name)}" aria-label="Название">
    <div class="row"><input data-f="amt" inputmode="decimal" value="${bal(a) ? plain(bal(a), a.cur) : ''}" placeholder="Сколько есть">
    <select data-f="cur" style="flex:0 0 96px">${CURS.map(c => `<option ${c === a.cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="eq">${CURS.filter(c => c !== a.cur).map(c => '≈ ' + fmt(conv(bal(a), a.cur, c), c)).join(' · ')}</div>
    <div class="row sp"><label class="mut sm" style="display:flex;align-items:center;gap:6px">потери при оплате, % <input data-f="fee" inputmode="decimal" value="${a.fee || ''}" placeholder="0" style="width:70px;min-height:36px"></label><button class="btn ghost sm" data-rm>Удалить</button></div></div>`).join('');
  $$('#accounts .acc').forEach(el => {
    const a = S.acc.find(x => x.id === el.dataset.id);
    el.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { const f = i.dataset.f; if (f === 'amt') a.start = num(i.value) + spent(a); else a[f] = f === 'fee' ? num(i.value) : i.value; a.u = now(); save(); renderMoney(); });
    el.querySelector('[data-rm]').onclick = () => { if (confirmDel()) { kill(a.id); S.acc = S.acc.filter(x => x !== a); save(); renderMoney(); } };
  });
  $('#cart').innerHTML = S.cart.length ? S.cart.map(i => `<div class="ci" data-id="${i.id}"><div class="w"><input class="nm" value="${esc(i.name)}" aria-label="Название"><div class="pr">${fmt(i.price, i.cur)}${i.cur !== 'KZT' ? ' ≈ ' + fmt(conv(i.price, i.cur, 'KZT'), 'KZT') : ' ≈ ' + fmt(conv(i.price, i.cur, 'VND'), 'VND')}</div></div><div class="qty"><button data-q="-1" aria-label="Меньше">−</button><span>${i.qty}</span><button data-q="1" aria-label="Больше">+</button></div></div>`).join('') +
    `<div class="tot"><span>Итого</span><b>${fmt(cartTotal('VND'), 'VND')}</b></div><div class="tot" style="border:0;padding:0"><span class="mut">это</span><span>${fmt(ct, 'KZT')} · ${fmt(cartTotal('USD'), 'USD')}</span></div>
     <div class="row"><button class="btn ghost" id="cartClr">Очистить</button><button class="btn" id="cartPay">Оплатил — списать</button></div>` : '<p class="mut">Пусто. Добавляйте цены из сканера, конвертера или вручную — увидите, на сколько набрали.</p>';
  $$('#cart .ci').forEach(el => {
    const it = S.cart.find(x => x.id === el.dataset.id);
    el.querySelector('.nm').onchange = e => { it.name = e.target.value; it.u = now(); save(); };
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { it.qty += +b.dataset.q; it.u = now(); if (it.qty <= 0) { kill(it.id); S.cart = S.cart.filter(x => x !== it); } save(); renderMoney(); });
  });
  if (S.cart.length) { $('#cartClr').onclick = () => { S.cart.forEach(i => kill(i.id)); S.cart = []; save(); renderMoney(); }; $('#cartPay').onclick = paySheet; }
  const hs = [...S.hist].sort((a, b) => b.ts - a.ts);
  $('#history').innerHTML = hs.length ? hs.slice(0, 40).map(h => `<div class="res"><span><b>${esc(h.acc)}</b><br><small class="mut">${new Date(h.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${h.n} шт.${h.by ? ' · ' + esc(h.by) : ''}</small></span><span>−${fmt(h.charge, h.cur)}<br><small class="mut">${fmt(h.vnd, 'VND')}</small></span></div>`).join('') +
    `<div class="row"><button class="btn ghost sm" id="undo">Отменить последнюю</button></div><p class="mut sm">Всего потрачено: ${fmt(hs.reduce((s, h) => s + conv(h.charge, h.cur, 'KZT'), 0), 'KZT')}</p>` : '<p class="mut">Покупок пока нет.</p>';
  if (hs.length) $('#undo').onclick = () => { kill(hs[0].id); S.hist = S.hist.filter(h => h.id !== hs[0].id); save(); renderMoney(); toast('Покупка отменена, деньги возвращены'); };
  $('#scCartInfo').textContent = S.cart.length ? `В корзине ${n} шт. на ${fmt(cartTotal('VND'), 'VND')} (${fmt(ct, 'KZT')})` : '';
}
const confirmDel = () => window.confirm('Удалить?');
function paySheet() {
  sheet('<h3>С какого счёта списать?</h3>' + S.acc.map(a => {
    const need = conv(cartTotal('USD'), 'USD', a.cur) * (1 + num(a.fee) / 100), rest = bal(a) - need;
    return `<button class="opt" data-id="${a.id}"><b>${esc(a.name)}</b>спишется ${fmt(need, a.cur)}${num(a.fee) ? ` (с учётом ${num(a.fee)}%)` : ''}<br><span class="${rest < 0 ? 'neg' : 'pos'}">${rest < 0 ? 'не хватает ' + fmt(-rest, a.cur) : 'останется ' + fmt(rest, a.cur)}</span></button>`;
  }).join('') + '<button class="btn ghost" style="width:100%" id="payX">Отмена</button>');
  $('#payX').onclick = closeSheet;
  $$('#sheetIn .opt').forEach(b => b.onclick = () => {
    const a = S.acc.find(x => x.id === b.dataset.id), need = +(conv(cartTotal('USD'), 'USD', a.cur) * (1 + num(a.fee) / 100)).toFixed(a.cur === 'USD' ? 2 : 0);
    S.hist.push({ id: uid(), ts: now(), acc: a.name, accId: a.id, cur: a.cur, charge: need, vnd: cartTotal('VND'), n: S.cart.reduce((s, i) => s + i.qty, 0), by: who });
    S.cart.forEach(i => kill(i.id)); S.cart = []; save(); closeSheet(); renderMoney(); toast('Списано с «' + a.name + '»');
  });
}
function initMoney() {
  $('#accAdd').onclick = () => { S.acc.push({ id: uid(), name: 'Новый счёт', cur: 'KZT', start: 0, fee: 0, u: now() }); save(); renderMoney(); };
  $('#mAdd').onclick = () => { const p = num($('#mPrice').value); if (!p) return toast('Введите цену'); addCart(p, $('#mCur').value, $('#mName').value.trim()); $('#mPrice').value = $('#mName').value = ''; };
}

/* ---------- синхронизация общего бюджета ---------- */
function merge(a, b) {
  const del = { ...a.del }; for (const k in (b.del || {})) del[k] = Math.max(del[k] || 0, b.del[k]);
  const mix = (x, y) => { const m = new Map(); [...(x || []), ...(y || [])].forEach(i => { const o = m.get(i.id); if (!o || (i.u || 0) > (o.u || 0)) m.set(i.id, i); }); return [...m.values()].filter(i => !(del[i.id] >= (i.u || i.ts || 0))); };
  const bk = !a.bank ? b.bank : !b.bank ? a.bank : (b.bank.u || 0) > (a.bank.u || 0) ? b.bank : a.bank;
  return { acc: mix(a.acc, b.acc), cart: mix(a.cart, b.cart), hist: mix(a.hist, b.hist), del, bank: bk };
}
const SY = { busy: false, last: G.get('syncTs', 0), err: '' };
const syncOn = () => isFam() && window.SYNC && SYNC.url && SYNC.key && G.get('famcode', '');
async function rpc(fn, body) {
  const r = await fetch(SYNC.url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SYNC.key, Authorization: 'Bearer ' + SYNC.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('HTTP ' + r.status); const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function syncNow() {
  if (!syncOn() || SY.busy || !navigator.onLine) return renderSync(); SY.busy = true;
  try {
    const code = G.get('famcode', ''), remote = await rpc('pq_get', { p_code: code });
    const before = JSON.stringify(S); if (remote) S = merge(S, remote);
    const changed = JSON.stringify(S) !== before;
    if (changed) { P.set('S', S); bank = S.bank || bank; renderMoney.soft = 1; renderMoney(); renderMoney.soft = 0; if (!document.activeElement?.closest?.('#bank')) renderBank(); }
    if (!remote || G.get('dirty', 0) || JSON.stringify(S) !== JSON.stringify(remote)) { await rpc('pq_put', { p_code: code, p_data: S }); G.set('dirty', 0); }
    SY.last = now(); G.set('syncTs', SY.last); SY.err = '';
  } catch (e) { SY.err = String(e.message || e); }
  SY.busy = false; renderSync();
}
function renderSync() {
  const el = $('#syncCard'); if (!el) return;
  if (!isFam()) return el.innerHTML = `<p class="mut">Общий бюджет включён только для: ${esc((TRIP.shared || []).join(' и '))}. У вас свой кошелёк в этом телефоне.</p>`;
  if (!(window.SYNC && SYNC.url && SYNC.key)) return el.innerHTML = '<p class="mut">Синхронизация ещё не подключена (нет адреса базы в data.js). Пока бюджет хранится только в этом телефоне.</p>';
  const code = G.get('famcode', '');
  el.innerHTML = `<p class="sm">Впишите один и тот же семейный код на обоих телефонах. Без интернета всё работает, а при появлении сети телефоны сверяются сами.</p>
    <div class="row"><input id="famCode" value="${esc(code)}" placeholder="Семейный код (от 12 знаков)" autocomplete="off"><button class="btn" id="famSave" style="flex:0 0 auto">Сохранить</button></div>
    <p class="sm ${SY.err ? 'neg' : 'mut'}">${!code ? 'Код не задан — синхронизации нет.' : SY.err ? 'Ошибка связи: ' + esc(SY.err) + '. Попробую снова.' : SY.last ? 'Сверено ' + ago(SY.last).replace('обновлён ', '') + (G.get('dirty', 0) ? ' · есть неотправленные изменения' : '') : 'Ещё не сверялось.'}</p>
    <div class="row"><button class="btn ghost sm" id="famGen">Придумать код</button><button class="btn ghost sm" id="famNow">Сверить сейчас</button></div>`;
  $('#famSave').onclick = () => { const v = $('#famCode').value.trim(); if (v && v.length < 12) return toast('Код должен быть от 12 знаков'); G.set('famcode', v); G.set('dirty', 1); toast(v ? 'Код сохранён' : 'Синхронизация выключена'); syncNow(); };
  $('#famGen').onclick = () => { $('#famCode').value = [...crypto.getRandomValues(new Uint8Array(12))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };
  $('#famNow').onclick = () => { syncNow().then(() => toast(SY.err ? 'Не получилось' : 'Сверено')); };
}

/* ---------- сканер ---------- */
function parsePrice(raw, cur, kMode) {
  let s = String(raw || '').replace(/\s+/g, '').replace(/[oO]/g, '0');
  const m = s.match(/\d[\d.,]*\d|\d/g); if (!m) return null;
  let best = null;
  for (let tok of m) {
    const after = s.slice(s.indexOf(tok) + tok.length, s.indexOf(tok) + tok.length + 1), k = /k/i.test(after);
    let v;
    const parts = tok.split(/[.,]/);
    if (parts.length > 1 && parts.slice(1).every(p => p.length === 3)) v = +parts.join('');
    else if (parts.length > 1) v = parseFloat(parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);
    else v = +tok;
    if (k) v *= 1000;
    if (!isFinite(v) || v <= 0) continue;
    if (cur === 'VND') { if (kMode && v < 1000) v *= 1000; v = Math.round(v); if (v < 500 || v > 5e8) continue; }
    else if (v > 1e7) continue;
    if (best === null || String(tok).length > best.len) best = { v, len: String(tok).length };
  }
  return best ? best.v : null;
}
function pickLine(data) {
  const lines = data.lines || []; let top = null;
  for (const l of lines) {
    const ws = (l.words || []).filter(w => /\d/.test(w.text)); if (!ws.length) continue;
    const h = Math.max(...ws.map(w => w.bbox.y1 - w.bbox.y0));
    if (!top || h > top.h) top = { h, text: ws.map(w => w.text).join('') };
  }
  return top ? top.text : (data.text || '');
}
const SC = { stream: null, worker: null, busy: false, on: false, last: [], val: null, frozen: false, ignore: null, ignoreUntil: 0, loading: false };
async function ocrWorker() {
  if (SC.worker) return SC.worker; if (SC.loading) return null; SC.loading = true;
  try {
    const w = await Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract', gzip: true, workerBlobURL: false });
    await w.setParameters({ tessedit_char_whitelist: '0123456789.,kK', tessedit_pageseg_mode: '6' });
    SC.worker = w;
  } catch (e) { $('#scSub').textContent = 'Не удалось загрузить распознавание. Откройте один раз с интернетом.'; }
  SC.loading = false; return SC.worker;
}
async function camStart() {
  $('#camMsg').textContent = 'Запрашиваю камеру…';
  try {
    SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (e) { $('#camMsg').textContent = 'Нет доступа к камере. Разрешите её для сайта в настройках браузера. Цену можно ввести вручную ниже.'; return; }
  const v = $('#vid'); v.srcObject = SC.stream; await v.play().catch(() => {});
  $('#camStart').hidden = true; SC.on = true; G.set('camOk', 1);
  const tr = SC.stream.getVideoTracks()[0], caps = tr.getCapabilities?.() || {};
  if (caps.torch) { const b = $('#torch'); b.hidden = false; b.onclick = () => { const on = !b.classList.contains('on'); tr.applyConstraints({ advanced: [{ torch: on }] }).then(() => b.classList.toggle('on', on)).catch(() => {}); }; }
  $('#scBig').textContent = 'Готовлю распознавание…'; await ocrWorker(); if (SC.on) { $('#scBig').textContent = 'Наведите на цену'; scanLoop(); }
}
function camStop() { SC.on = false; SC.stream?.getTracks().forEach(t => t.stop()); SC.stream = null; $('#camStart').hidden = false; $('#camMsg').textContent = ''; $('#torch').hidden = true; $('#torch').classList.remove('on'); }
const cv = document.createElement('canvas');
function grab() {
  const v = $('#vid'), box = $('#cam').getBoundingClientRect(), r = $('#roi').getBoundingClientRect();
  if (!v.videoWidth) return null;
  const sc = Math.max(box.width / v.videoWidth, box.height / v.videoHeight), ox = (v.videoWidth * sc - box.width) / 2, oy = (v.videoHeight * sc - box.height) / 2;
  const sx = (r.left - box.left + ox) / sc, sy = (r.top - box.top + oy) / sc, sw = r.width / sc, sh = r.height / sc;
  const W = 720, H = Math.round(W * sh / sw); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
  const im = c.getImageData(0, 0, W, H), p = im.data; let mn = 255, mx = 0;
  for (let i = 0; i < p.length; i += 4) { const g = p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11; p[i] = g; if (g < mn) mn = g; if (g > mx) mx = g; }
  const k = 255 / Math.max(40, mx - mn);
  for (let i = 0; i < p.length; i += 4) { const g = Math.max(0, Math.min(255, (p[i] - mn) * k)); p[i] = p[i + 1] = p[i + 2] = g; }
  c.putImageData(im, 0, 0); return cv;
}
async function scanLoop() {
  if (!SC.on) return;
  if (!SC.frozen && !SC.busy && SC.worker && !document.hidden) {
    SC.busy = true;
    try {
      const img = grab();
      if (img) { const { data } = await SC.worker.recognize(img); onRead(parsePrice(pickLine(data), $('#scCur').value, $('#scK').checked)); }
    } catch {}
    SC.busy = false;
  }
  setTimeout(scanLoop, 220);
}
function onRead(v) {
  SC.last.push(v); if (SC.last.length > 3) SC.last.shift();
  const cnt = {}; SC.last.forEach(x => { if (x) cnt[x] = (cnt[x] || 0) + 1; });
  const st = Object.keys(cnt).find(x => cnt[x] >= 2);
  if (st) showScan(+st, true); else { $('#roi').classList.remove('ok'); $('#scanres').classList.add('dim'); if (!SC.val) $('#scBig').textContent = 'Наведите на цену'; }
}
function showScan(v, live) {
  const cur = $('#scCur').value; SC.val = v;
  $('#roi').classList.toggle('ok', !!live); $('#scanres').classList.remove('dim');
  const bigC = cur === 'KZT' ? 'VND' : 'KZT', third = CURS.find(c => c !== cur && c !== bigC);
  $('#scBig').textContent = fmt(conv(v, cur, bigC), bigC);
  $('#scSub').textContent = `${fmt(v, cur)} = ${fmt(conv(v, cur, third), third)}`;
  if ($('#scCart').checked && !(SC.ignore === v && Date.now() < SC.ignoreUntil)) { $('#buyBar').hidden = false; $('#buyBar b').textContent = `Покупаете за ${fmt(v, cur)}?`; SC.frozen = true; }
}
function initScan() {
  $('#camBtn').onclick = camStart;
  $('#cam').onclick = e => { if (e.target.closest('.camtop,.camstart') || !SC.on) return; SC.frozen = !SC.frozen; toast(SC.frozen ? 'Заморожено. Нажмите ещё раз, чтобы продолжить' : 'Сканирую'); };
  const answer = yes => { if (yes && SC.val) addCart(SC.val, $('#scCur').value); SC.ignore = SC.val; SC.ignoreUntil = Date.now() + 6000; SC.last = []; SC.frozen = false; $('#buyBar').hidden = true; };
  $('#buyYes').onclick = () => answer(true); $('#buyNo').onclick = () => answer(false);
  $('#scCart').checked = G.get('scCart', true); $('#scK').checked = G.get('scK', false);
  $('#scCart').onchange = e => { G.set('scCart', e.target.checked); if (!e.target.checked) { $('#buyBar').hidden = true; SC.frozen = false; } };
  $('#scK').onchange = e => G.set('scK', e.target.checked);
  $('#scCur').onchange = () => { SC.last = []; SC.val = null; };
  $('#scManAdd').onclick = () => { const v = parsePrice($('#scManual').value, $('#scCur').value, $('#scK').checked) || num($('#scManual').value); if (!v) return toast('Введите цену'); showScanManual(v); $('#scManual').value = ''; };
}
function showScanManual(v) { addCart(v, $('#scCur').value); }

/* ---------- места ---------- */
let map, cat = 'Все';
const km = (a, b) => { const r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const gdir = q => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
function renderPlaces() {
  const cats = ['Все', ...new Set(PLACES.map(p => p.c))];
  $('#placeCats').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}">${c}</button>`).join('');
  $$('#placeCats .chip').forEach(b => b.onclick = () => { cat = b.textContent; renderPlaces(); });
  $('#places').innerHTML = PLACES.filter(p => cat === 'Все' || p.c === cat).map(p => `<div class="card pl"><span class="tag">${p.c} · ${km(TRIP.hotel, p) < 1 ? 'у отеля' : '≈' + Math.round(km(TRIP.hotel, p) * 1.3) + ' км от отеля'}</span><br><b>${esc(p.n)}</b><p>${esc(p.d)}</p>${p.tip ? `<p class="mut sm">${esc(p.tip)}</p>` : ''}<div class="row"><button class="btn ghost sm" data-go="${esc(p.n)}">На карте</button><a class="btn sm" target="_blank" rel="noopener" href="${gdir(p.q)}">Маршрут</a></div></div>`).join('');
  $$('#places [data-go]').forEach(b => b.onclick = () => { const p = PLACES.find(x => x.n === b.dataset.go); if (map) { map.setView([p.lat, p.lon], 13); p._m?.openPopup(); $('main').scrollTo({ top: 0, behavior: 'smooth' }); } else toast('Карта недоступна без интернета'); });
  $('#routes').innerHTML = ROUTES.map(r => `<div class="card"><b>${esc(r.n)}</b><p class="mut sm">${r.s.map(esc).join(' → ')}</p><p>${esc(r.d)}</p><a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${TRIP.hotel.lat},${TRIP.hotel.lon}&destination=${encodeURIComponent(PLACES.find(p => p.n === r.s[r.s.length - 1]).q)}&waypoints=${encodeURIComponent(r.s.slice(0, -1).map(n => PLACES.find(p => p.n === n).q).join('|'))}">Открыть маршрут в Google Maps</a></div>`).join('');
}
function initMap() {
  if (map || !window.L) { map?.invalidateSize(); return; }
  try {
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([10.2, 103.96], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' }).addTo(map);
    const dot = (c, r) => ({ radius: r, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 });
    L.circleMarker([TRIP.hotel.lat, TRIP.hotel.lon], dot('#dc2626', 9)).addTo(map).bindPopup('<b>Наш отель</b>');
    PLACES.forEach(p => { p._m = L.circleMarker([p.lat, p.lon], dot('#0d9488', 7)).addTo(map).bindPopup(`<b>${esc(p.n)}</b><br>${esc(p.d)}<br><a target="_blank" rel="noopener" href="${gdir(p.q)}">Маршрут</a>`); });
    if (navigator.geolocation) map.on('locationfound', e => L.circleMarker(e.latlng, dot('#2563eb', 7)).addTo(map).bindPopup('Вы здесь')).locate({ setView: false });
  } catch { map = null; }
}

/* ---------- банк ---------- */
const BANKS0 = { Kaspi: { m: 1, f: 0 }, Halyk: { m: 1, f: 0 }, Freedom: { m: 1, f: 0 }, 'БЦК': { m: 1, f: 0 } };
const bankDef = () => ({ amt: 1000000, cashKZ: '', cashVN: '', upd: '', u: 0, b: Object.keys(BANKS0).map(n => ({ n, ...BANKS0[n], src: 'оценка' })) });
let bank = bankDef();
const saveBank = () => { bank.u = Date.now(); S.bank = bank; save(); };
async function fetchBanks() {
  try {
    const j = await (await fetch('banks.json', { cache: 'no-store' })).json();
    bank.b.forEach(x => { const d = j.banks?.[x.n]; if (d && x.src !== 'по вашей оплате') { x.m = d.m; x.f = d.f; x.src = d.src || 'оценка'; } });
    const was = JSON.stringify(bank); bank.upd = j.updated || ''; if (JSON.stringify(bank) !== was) { S.bank = bank; P.set('S', S); renderBank(); }
  } catch {}
}
function renderBank(full = true) {
  const r = R(), fair = bank.amt / r.VND * r.KZT;
  const rows = bank.b.map(x => ({ n: x.n, src: x.src, cost: fair * (1 + num(x.m) / 100) * (1 + num(x.f) / 100) }));
  const cKZ = num(bank.cashKZ), cVN = num(bank.cashVN); if (cKZ > 0 && cVN > 0) rows.push({ n: 'Наличные $ → ₫', src: 'ваш курс', cost: bank.amt / cVN * cKZ });
  const best = Math.min(...rows.map(x => x.cost));
  const out = `<div class="res"><span>По рыночному курсу (без потерь)</span><span><b>${fmt(fair, 'KZT')}</b></span></div>` + rows.map(x => `<div class="res"><span>${esc(x.n)}${x.cost === best ? ' <span class="pos">— выгоднее</span>' : ''}<br><small class="mut">${esc(x.src)}</small></span><span><b>${fmt(x.cost, 'KZT')}</b><br><small class="${x.cost > fair ? 'neg' : 'pos'}">${x.cost > fair ? 'теряете' : 'выгода'} ${fmt(Math.abs(x.cost - fair), 'KZT')} (${(Math.abs(x.cost / fair - 1) * 100).toFixed(1)}%)</small></span></div>`).join('');
  if (!full) return $('#bankOut').innerHTML = out;
  $('#bank').innerHTML = `<p class="sm">Картой в донгах: сумма идёт через доллар, банк списывает тенге по своему курсу. Рыночный курс приложение обновляет само и хранит без интернета. Наценка банка сначала стоит как оценка — после первой оплаты впишите её ниже, и приложение запомнит настоящую.</p>
  <div class="form"><label>Покупка, ₫ <input id="bAmt" inputmode="decimal" value="${plain(bank.amt, 'VND')}"></label></div>
  <div id="bankOut" style="margin-top:10px">${out}</div>
  <details open><summary>Уточнить по реальной оплате</summary><div class="form">
    <select id="kBank">${bank.b.map(x => `<option>${esc(x.n)}</option>`).join('')}</select>
    <label>Заплатил, ₫ <input id="kV" inputmode="decimal" placeholder="как в чеке"></label>
    <label>Списали, ₸ <input id="kT" inputmode="decimal" placeholder="как в приложении банка"></label>
    <button class="btn" id="kGo">Запомнить наценку банка</button></div></details>
  <details><summary>Наценки вручную, %</summary><div class="form">${bank.b.map((x, i) => `<label><span style="width:74px">${esc(x.n)}</span><input data-b="${i}" data-k="m" inputmode="decimal" value="${x.m}" placeholder="курс, %"><input data-b="${i}" data-k="f" inputmode="decimal" value="${x.f || ''}" placeholder="комиссия, %"></label>`).join('')}</div></details>
  <details><summary>Сравнить с наличными</summary><div class="form"><label>Купил $ в Казахстане по <input id="bKZ" inputmode="decimal" value="${esc(bank.cashKZ)}" placeholder="₸ за 1 $"></label><label>Обменник во Вьетнаме даёт <input id="bVN" inputmode="decimal" value="${esc(bank.cashVN)}" placeholder="₫ за 1 $"></label></div></details>
  <p class="mut sm">«Оценка» — примерная цифра, не тариф банка. Kaspi и Freedom заявляют конвертацию без отдельной комиссии, по своему курсу. Снятие в банкомате считается отдельно.${bank.upd ? ' Наценки обновлены ' + esc(bank.upd) + '.' : ''}</p>`;
  const sv = () => { bank.amt = num($('#bAmt').value); bank.cashKZ = $('#bKZ').value; bank.cashVN = $('#bVN').value; $$('#bank [data-b]').forEach(i => { const x = bank.b[i.dataset.b], v = num(i.value); if (x[i.dataset.k] !== v) { x[i.dataset.k] = v; x.src = 'введено вручную'; } }); saveBank(); renderBank(false); };
  $$('#bank input:not(#kV):not(#kT)').forEach(i => i.oninput = sv);
  $('#kGo').onclick = () => {
    const v = num($('#kV').value), t = num($('#kT').value); if (!v || !t) return toast('Впишите обе суммы');
    const m = (t / (v / r.VND * r.KZT) - 1) * 100; if (m < -5 || m > 15) return toast('Суммы не сходятся — проверьте цифры');
    const x = bank.b.find(y => y.n === $('#kBank').value); x.m = +m.toFixed(2); x.f = 0; x.src = 'по вашей оплате';
    saveBank(); renderBank(); toast(`${x.n}: наценка ${x.m}% сохранена`);
  };
}

/* ---------- правила, контакты, документы ---------- */
function renderInfo() {
  $('#rules').innerHTML = RULES.map((r, i) => `<details class="card" ${i === 0 ? 'open' : ''}><summary>${esc(r.h)}</summary><ul>${r.li.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>`).join('');
  $('#contacts').innerHTML = TRIP.contacts.map(c => `<div class="res"><span>${esc(c[0])}</span><span><a href="tel:${c[1]}">${c[1]}</a></span></div>`).join('');
  $('#ver').textContent = 'Версия ' + VERSION + '. Работает без интернета после первого открытия.';
}
const DB = () => new Promise((res, rej) => { const r = indexedDB.open('pq-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('f', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await DB(); return new Promise((res, rej) => { const t = db.transaction('f', mode), q = fn(t.objectStore('f')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
async function renderDocs() {
  let list = []; try { list = await tx('readonly', s => s.getAll()) || []; } catch {}
  $('#docs').innerHTML = list.length ? list.map(d => `<div class="doc"><a href="#" data-open="${d.id}">${esc(d.name)}</a><button class="btn ghost sm" data-del="${d.id}">Удалить</button></div>`).join('') : '<p class="mut">Пока ничего нет.</p>';
  $$('#docs [data-open]').forEach(a => a.onclick = e => { e.preventDefault(); const d = list.find(x => x.id === a.dataset.open), u = URL.createObjectURL(d.blob); const l = document.createElement('a'); l.href = u; l.target = '_blank'; l.rel = 'noopener'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 60000); });
  $$('#docs [data-del]').forEach(b => b.onclick = async () => { if (confirmDel()) { await tx('readwrite', s => s.delete(b.dataset.del)); renderDocs(); } });
}
function initDocs() {
  $('#docFile').onchange = async e => {
    for (const f of e.target.files) { try { await tx('readwrite', s => s.put({ id: uid(), name: f.name, blob: f })); } catch { toast('Не удалось сохранить ' + f.name); } }
    e.target.value = ''; renderDocs(); toast('Сохранено в телефоне'); navigator.storage?.persist?.();
  };
}

/* ---------- навигация и запуск ---------- */
function show(t) {
  $$('.tab').forEach(s => s.classList.toggle('on', s.id === 't-' + t)); $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('main').scrollTop = 0; G.set('tab', t);
  if (t !== 'scan' && SC.on) camStop();
  if (t === 'scan' && !SC.on && G.get('camOk', 0)) camStart();
  if (t === 'map') setTimeout(initMap, 50);
}
function renderAll() { renderRates(); convFill(); renderHome(); renderMoney(); renderBank(); }
function boot() {
  $$('#nav button').forEach(b => b.onclick = () => show(b.dataset.t));
  $('#whoBtn').onclick = () => pickWho(false);
  initConv(); initHome(); initMoney(); initScan(); initDocs(); renderInfo(); renderPlaces(); renderDocs(); renderWx();
  window.__m = { merge }; if (who && TRIP.people.includes(who)) loadProfile(); else { who = TRIP.people[0]; loadProfile(); pickWho(true); }
  tick(); setInterval(tick, 1000); setInterval(renderHome, 60000);
  fetchRates(false); fetchWx(); fetchBanks(); setInterval(() => { fetchRates(false); fetchWx(); }, 30 * 60000);
  window.addEventListener('online', () => { fetchRates(false); fetchWx(); syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && SC.on) camStop(); else if (!document.hidden && G.get('tab', 'home') === 'scan' && G.get('camOk', 0)) camStart(); });
  const t = G.get('tab', 'home'); if (t !== 'home' && t !== 'scan') show(t);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__t = { parsePrice, pickLine };
document.addEventListener('DOMContentLoaded', boot);
