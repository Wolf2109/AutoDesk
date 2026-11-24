'use strict';
/*
 * Dokumenti za štampu / čuvanje kao PDF (otvaraju se u novoj kartici, dugme „Štampaj / Sačuvaj kao PDF").
 *  - Izveštaj o radnim nalozima (A4 položeno)
 *  - Radni nalog za klijenta (A4 uspravno, sa fotografijama i mestima za potpis)
 *  - Servisna istorija vozila (A4 uspravno)
 *  - Servisna knjižica ličnog vozila (A4 uspravno, bez podataka radionice)
 * Dokument za klijenta ne prikazuje interne iznose (potrošeno / razlika); oni su samo u izveštaju.
 */
window.AutoDeskPrint = (() => {
  const STATUS = { received: 'Primljeno', in_progress: 'U radu', waiting: 'Čeka deo', done: 'Završeno', delivered: 'Preuzeto' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thousands = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const money = (cents, cur) => {
    const n = Math.round(Number(cents) || 0), a = Math.abs(n);
    return (n < 0 ? '-' : '') + thousands(Math.floor(a / 100)) + ',' + String(a % 100).padStart(2, '0') + ' ' + cur;
  };
  const makeDate = style => v => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return '';
    return style === 'YYYY-MM-DD' ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}.${m[2]}.${m[1]}`;
  };
  const now = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const monthNames = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];

  const field = (label, value) => value === null || value === undefined || value === '' ? '' : `<div class="field"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const card = (title, html) => `<section class="info"><h3>${esc(title)}</h3>${html}</section>`;
  const metric = (label, value, kind = '') => `<div class="metric ${kind}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  const section = (title, html) => html ? `<h2>${esc(title)}</h2>${html}` : '';
  const paragraph = v => String(v || '').trim() ? `<p class="paragraph">${esc(v)}</p>` : '';
  const codes = v => String(v || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  const pills = v => codes(v).map(c => `<span class="pill">${esc(c)}</span>`).join('');
  const sign = n => n < 0 ? 'neg' : 'pos';

  const css = landscape => `
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm 0 14mm;@bottom-center{content:"Strana " counter(page) " od " counter(pages);font:9px Arial,sans-serif;color:#667085}}
@page:first{margin:0 0 14mm}
*{box-sizing:border-box}
body{margin:0;color:#1B2433;font:12px/1.45 Inter,Arial,sans-serif;background:#e8ebf0}
header{height:98px;background:#0F1B2D;border-bottom:4px solid #FFB81C;color:#fff;display:flex;align-items:center;padding:10px 38px;gap:20px}
header img{width:74px;height:74px;object-fit:contain;flex:none}
header .shop{flex:1;font-size:10px;line-height:1.6;color:#B9C4D6;white-space:pre-line}
header .shop b{display:block;font-size:14px;color:#fff;margin-bottom:3px}
header .doc{text-align:right;max-width:50%}
header h1{font-size:18px;margin:0 0 7px;letter-spacing:.3px}
header .doc .no{color:#FFB81C;font-weight:700;font-size:14px}
header .doc .meta{color:#B9C4D6;font-size:10px;margin-top:3px}
main{padding:22px 38px 40px;background:#fff;min-height:calc(100vh - 98px)}
h2{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9A6700;border-bottom:1px solid #DDE2EA;padding-bottom:8px;margin:22px 0 12px;break-after:avoid}
h2:first-child{margin-top:0}
.metrics{display:flex;gap:10px;margin-bottom:16px}
.metric{flex:1;min-width:0;border-radius:6px;background:#F3F5F9;padding:12px 10px 12px 14px;border-left:4px solid #FFB81C}
.metric small{display:block;color:#667085;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px}
.metric strong{font-size:14px;white-space:nowrap}
.metric.red{border-color:#C0392B}.metric.green{border-color:#17803D}.metric.navy{border-color:#0F1B2D}
.metric.pos strong,.pos{color:#17803D}.metric.neg strong,.neg{color:#C0392B}
.infoGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.info{background:#F3F5F9;border-radius:6px;padding:14px;break-inside:avoid}
.info h3{color:#9A6700;text-transform:uppercase;font-size:10px;letter-spacing:.8px;margin:0 0 10px;padding-left:8px;border-left:3px solid #FFB81C}
.field{display:flex;gap:8px;margin:6px 0;align-items:baseline}
.field span{color:#667085;min-width:84px;font-size:10.5px}
.field strong{overflow-wrap:anywhere}
.paragraph{white-space:pre-wrap;line-height:1.6;margin:0;font-size:12.5px}
.pill{display:inline-block;margin:0 6px 6px 0;padding:3px 11px;border-radius:999px;border:1px solid #FFB81C;background:#FFF4D6;font-weight:700;font-size:11px}
.total{display:flex;align-items:center;justify-content:space-between;background:#0F1B2D;color:#fff;border-radius:8px;padding:14px 20px;margin-top:22px;break-inside:avoid}
.total small{display:block;color:#B9C4D6;letter-spacing:.8px;font-size:10px;text-transform:uppercase}
.total strong{font-size:22px;color:#FFB81C}
.next{margin-top:14px;background:#FFF4D6;border:1px solid #FFB81C;border-radius:6px;padding:10px 14px;break-inside:avoid}
.next small{display:block;color:#9A6700;font-weight:700;letter-spacing:.6px;font-size:10px;text-transform:uppercase;margin-bottom:3px}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.photos div{background:#F3F5F9;border-radius:4px;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid}
.photos img{max-width:100%;max-height:100%}
.signs{display:flex;justify-content:space-between;gap:60px;margin-top:56px;break-inside:avoid}
.signs div{flex:1;border-top:1px solid #667085;padding-top:5px;text-align:center;color:#667085;font-size:10px}
.thanks{margin-top:26px;text-align:center;color:#667085;font-size:10px}
table{border-collapse:collapse;width:100%;font-size:10.5px;table-layout:fixed}
th{background:#0F1B2D;color:#fff;text-align:left;padding:9px 7px;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase}
td{padding:8px 7px;border-bottom:1px solid #DDE2EA;vertical-align:top;overflow-wrap:anywhere}
td small{display:block;color:#667085;font-size:9px;margin-top:2px}
.r{text-align:right}
tbody tr:nth-child(even){background:#F6F8FB}
tr.sum td{background:#E7ECF3;font-weight:700;border-bottom:0}
.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.pre{white-space:pre-line}
.dtc{color:#9A6700;font-weight:700;font-size:9px;display:block;margin-top:3px}
footer{border-top:1px solid #DDE2EA;margin-top:28px;padding-top:10px;color:#667085;font-size:9px}
.toolbar{position:sticky;top:0;z-index:5;background:#fff;padding:10px 20px;text-align:center;box-shadow:0 2px 8px #0002}
.toolbar button{background:#0F1B2D;color:#fff;border:0;border-radius:5px;padding:10px 20px;cursor:pointer;font-size:13px}
.page{max-width:${landscape ? 1122 : 794}px;margin:20px auto;background:#fff;box-shadow:0 3px 20px #0002}
@media print{
  body{background:#fff}.toolbar{display:none}.page{max-width:none;margin:0;box-shadow:none}
  header,th,.metric,.info,.total,.next,.pill,tr.sum td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group}tr{break-inside:avoid}main{min-height:0}
}`;

  function frame(ctx, { title, number, meta = [], body, landscape = false }) {
    const info = String(ctx.shop.workshop_info || '').trim();
    return `<!doctype html><html lang="sr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} ${esc(number)}</title><style>${css(landscape)}</style></head><body>
<div class="toolbar"><button onclick="window.print()">Štampaj / Sačuvaj kao PDF</button></div>
<div class="page"><header>${ctx.logo ? `<img src="${ctx.logo}" alt="">` : ''}
<div class="shop">${info ? esc(info) : `<b>${esc(ctx.name)}</b>`}</div>
<div class="doc"><h1>${esc(title)}</h1><div class="no">${esc(number)}</div>${meta.map(m => `<div class="meta">${esc(m)}</div>`).join('')}</div></header>
<main>${body}<footer>${esc(ctx.name)} · Generisano ${esc(now())}</footer></main></div></body></html>`;
  }

  /* ---------- dokumenti ---------- */

  let logoCache = null;
  async function logoData() {
    if (logoCache !== null) return logoCache;
    try {
      const blob = await (await fetch('./slike/logo.png')).blob();
      logoCache = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
    } catch { logoCache = ''; }
    return logoCache;
  }

  async function photosHtml(ids) {
    const imgs = [];
    for (const p of ids) {
      try { imgs.push(`<div><img src="${await LocalAPI.photoData(p.id)}" alt=""></div>`); } catch { /* preskače se */ }
    }
    return imgs.length ? `<div class="photos">${imgs.join('')}</div>` : '';
  }

  async function orderDoc(ctx, id) {
    const o = await LocalAPI.call('/orders/' + id), d = ctx.date;
    const vehicle = [o.vehicle_make, o.vehicle_model].filter(Boolean).join(' ');
    const engine = [o.vehicle_engine, o.vehicle_power, o.vehicle_fuel].filter(Boolean).join(' · ');
    const km = o.mileage ?? o.vehicle_mileage;
    const next = [o.next_service_date ? 'do ' + d(o.next_service_date) : '', o.next_service_km != null ? (o.next_service_date ? 'ili ' : '') + 'na ' + thousands(o.next_service_km) + ' km' : ''].filter(Boolean).join(' ');
    const body =
      `<div class="infoGrid">` +
      card('Klijent', field('Ime', o.client_name) + field('Telefon', o.client_phone) + field('Email', o.client_email)) +
      card('Vozilo', field('Vozilo', vehicle) + field('Registracija', o.vehicle_registration) + field('VIN', o.vehicle_vin) + field('Godište', o.vehicle_year) + field('Motor', engine) + field('Kilometraža', km != null ? thousands(km) + ' km' : '')) +
      `</div>` +
      section('Prijavljeni problem', paragraph(o.complaint)) +
      section('Dijagnostika – kodovi grešaka', pills(o.dtc_codes) + paragraph(o.dtc_details)) +
      section('Izvršeni radovi', paragraph(o.description)) +
      section('Napomena', paragraph(o.notes)) +
      `<div class="total"><div><small>Ukupno naplaćeno</small></div><strong>${esc(money(o.charged_amount, ctx.cur))}</strong></div>` +
      (next ? `<div class="next"><small>Preporučeni sledeći servis</small><b>${esc(next)}</b></div>` : '') +
      section('Fotografije', await photosHtml(o.photos)) +
      `<div class="signs"><div>Predao (radionica)</div><div>Preuzeo (klijent)</div></div>` +
      `<p class="thanks">Hvala na poverenju.</p>`;
    return frame(ctx, { title: 'RADNI NALOG', number: o.order_number, meta: ['Datum: ' + d(o.date), 'Status: ' + (STATUS[o.status] || '')], body });
  }

  async function historyDoc(ctx, id) {
    const [orders, vehicles, clients] = await Promise.all([LocalAPI.call('/orders?vehicle_id=' + id), LocalAPI.call('/vehicles'), LocalAPI.call('/clients')]);
    const v = vehicles.find(x => x.id === id) || {}, c = clients.find(x => x.id === v.client_id) || {}, d = ctx.date;
    const name = [v.make, v.model].filter(Boolean).join(' ');
    const total = orders.reduce((n, o) => n + (Number(o.charged_amount) || 0), 0);
    const rows = orders.map(o => `<tr><td><b>${esc(d(o.date))}</b></td><td>${esc(o.order_number)}</td><td class="r">${o.mileage != null ? esc(thousands(o.mileage)) : '–'}</td>` +
      `<td class="pre">${esc(o.description)}${o.dtc_codes ? `<span class="dtc">Kodovi: ${esc(o.dtc_codes)}</span>` : ''}</td><td class="r"><b>${esc(money(o.charged_amount, ctx.cur))}</b></td></tr>`).join('');
    const body =
      `<div class="infoGrid">` +
      card('Vozilo', field('Vozilo', name) + field('Registracija', v.registration) + field('VIN', v.vin) + field('Godište', v.year) + field('Motor', [v.engine, v.power, v.fuel].filter(Boolean).join(' · ')) + field('Kilometraža', v.mileage != null ? thousands(v.mileage) + ' km' : '')) +
      card('Vlasnik', field('Ime', c.name) + field('Telefon', c.phone) + field('Email', c.email)) +
      `</div><h2>Izvršeni servisi</h2>` +
      (orders.length
        ? `<table><colgroup><col width="12%"><col width="14%"><col width="11%"><col><col width="17%"></colgroup><thead><tr><th>Datum</th><th>Nalog</th><th class="r">Km</th><th>Izvršeni radovi</th><th class="r">Iznos</th></tr></thead><tbody>${rows}` +
          `<tr class="sum"><td colspan="3">UKUPNO</td><td>${orders.length} ${orders.length === 1 ? 'servis' : 'servisa'}</td><td class="r">${esc(money(total, ctx.cur))}</td></tr></tbody></table>`
        : '<p class="paragraph">Za ovo vozilo još nema radnih naloga.</p>');
    return frame(ctx, { title: 'SERVISNA ISTORIJA', number: name, meta: [v.registration || '', 'Servisa: ' + orders.length].filter(Boolean), body });
  }

  async function reportDoc(ctx, url) {
    const q = new URL(url, 'https://local.invalid').searchParams, from = q.get('from') || '2000-01-01', to = q.get('to') || '9999-12-31', d = ctx.date, cur = ctx.cur;
    const rows = await LocalAPI.call('/orders?from=' + from + '&to=' + to);
    const spent = rows.reduce((n, o) => n + (Number(o.spent_amount) || 0), 0), charged = rows.reduce((n, o) => n + (Number(o.charged_amount) || 0), 0), diff = charged - spent;
    const period = from <= '2000-01-01' && to >= '9999-12-31' ? 'Svi nalozi' : from <= '2000-01-01' ? 'do ' + d(to) : to >= '9999-12-31' ? 'od ' + d(from) : from === to ? d(from) : d(from) + ' – ' + d(to);

    const months = new Map();
    for (const o of rows) {
      const k = o.date.slice(0, 7), m = months.get(k) || { k, count: 0, spent: 0, charged: 0 };
      m.count++; m.spent += Number(o.spent_amount) || 0; m.charged += Number(o.charged_amount) || 0;
      months.set(k, m);
    }
    const monthly = months.size > 1
      ? `<h2>Pregled po mesecima</h2><table><colgroup><col><col width="12%"><col width="21%"><col width="21%"><col width="21%"></colgroup><thead><tr><th>Mesec</th><th class="r">Naloga</th><th class="r">Potrošeno</th><th class="r">Naplaćeno</th><th class="r">Razlika</th></tr></thead><tbody>` +
        [...months.values()].sort((a, b) => b.k.localeCompare(a.k)).slice(0, 24).map(m => `<tr><td>${esc(monthNames[+m.k.slice(5) - 1] + ' ' + m.k.slice(0, 4))}</td><td class="r">${m.count}</td><td class="r">${esc(money(m.spent, cur))}</td><td class="r">${esc(money(m.charged, cur))}</td><td class="r ${sign(m.charged - m.spent)}"><b>${esc(money(m.charged - m.spent, cur))}</b></td></tr>`).join('') +
        `<tr class="sum"><td>UKUPNO</td><td class="r">${rows.length}</td><td class="r">${esc(money(spent, cur))}</td><td class="r">${esc(money(charged, cur))}</td><td class="r">${esc(money(diff, cur))}</td></tr></tbody></table>`
      : '';

    const lines = rows.map(o => `<tr><td><b>${esc(o.order_number)}</b><small>${esc(STATUS[o.status] || '')}</small></td><td>${esc(d(o.date))}</td>` +
      `<td><b>${esc(o.client_name)}</b><small>${esc(o.vehicle_name)}</small></td><td><div class="clamp">${esc(o.description)}</div></td>` +
      `<td class="r">${esc(money(o.spent_amount, cur))}</td><td class="r">${esc(money(o.charged_amount, cur))}</td><td class="r ${sign(o.difference)}"><b>${esc(money(o.difference, cur))}</b></td></tr>`).join('');
    const body =
      `<div class="metrics">${metric('Broj naloga', rows.length, 'navy')}${metric('Naplaćeno', money(charged, cur))}${metric('Potrošeno', money(spent, cur), 'red')}${metric('Razlika', money(diff, cur), sign(diff) === 'neg' ? 'red neg' : 'green pos')}${metric('Prosek po nalogu', money(rows.length ? charged / rows.length : 0, cur), 'navy')}</div>` +
      monthly + `<h2>Pregled radnih naloga</h2>` +
      (rows.length
        ? `<table><colgroup><col width="9%"><col width="8%"><col width="20%"><col><col width="10%"><col width="10%"><col width="10%"></colgroup><thead><tr><th>Nalog</th><th>Datum</th><th>Klijent / Vozilo</th><th>Opis posla</th><th class="r">Potrošeno</th><th class="r">Naplaćeno</th><th class="r">Razlika</th></tr></thead><tbody>${lines}` +
          `<tr class="sum"><td colspan="4">UKUPNO (${rows.length})</td><td class="r">${esc(money(spent, cur))}</td><td class="r">${esc(money(charged, cur))}</td><td class="r">${esc(money(diff, cur))}</td></tr></tbody></table>`
        : '<p class="paragraph">Nema radnih naloga u izabranom periodu.</p>');
    return frame(ctx, { title: 'IZVEŠTAJ O RADNIM NALOZIMA', number: period, meta: ['Valuta: ' + cur], body, landscape: true });
  }

  async function render(url, w) {
    const settings = await LocalAPI.call('/settings');
    const ctx = { shop: settings, name: settings.workshop_name || 'Auto Dijagnostika Lazarević', cur: settings.currency || 'RSD', date: makeDate(settings.date_format), logo: await logoData() };
    const order = url.match(/^\/orders\/(\d+)\/pdf(?:\?|$)/), history = url.match(/^\/vehicles\/(\d+)\/history\.pdf(?:\?|$)/);
    let html;
    if (order) html = await orderDoc(ctx, Number(order[1]));
    else if (history) html = await historyDoc(ctx, Number(history[1]));
    else if (url.startsWith('/export.pdf')) html = await reportDoc(ctx, url);
    else throw Error('Nepoznat dokument.');
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ---------- lična vozila (zasebna celina, bez podataka radionice) ---------- */

  function privateDoc(ctx, v, entries) {
    const d = makeDate('DD.MM.YYYY');
    const list = entries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.km || 0) - (a.km || 0));
    const cents = e => Math.round((Number(e.amount) || 0) * 100), cur = e => e.currency || 'RSD';
    const totals = {};
    list.forEach(e => { totals[cur(e)] = (totals[cur(e)] || 0) + cents(e); });
    const currencies = Object.keys(totals).filter(c => totals[c] > 0);
    const lastKm = list.reduce((m, e) => Math.max(m, e.km || 0), 0);
    const from = list.length ? list[list.length - 1].date : '', to = list.length ? list[0].date : '';

    const rows = list.map(e => `<tr><td><b>${esc(d(e.date))}</b></td><td class="r">${e.km || e.km === 0 ? esc(thousands(e.km)) : '–'}</td><td>${esc(e.type)}</td>` +
      `<td><b>${esc(e.title)}</b>${e.notes ? `<small class="pre" style="font-size:10px">${esc(e.notes)}</small>` : ''}</td>` +
      `<td class="r"><b>${cents(e) ? esc(money(cents(e), cur(e))) : '–'}</b></td></tr>`).join('');
    const sums = currencies.map((c, i) => `<tr class="sum"><td colspan="4">UKUPNO (${esc(c)})${i === 0 ? ' · ' + list.length + (list.length === 1 ? ' unos' : ' unosa') : ''}</td><td class="r">${esc(money(totals[c], c))}</td></tr>`).join('');

    const years = new Map();
    list.forEach(e => {
      const y = String(e.date || '').slice(0, 4), r = years.get(y) || { y, count: 0, sums: {} };
      r.count++; r.sums[cur(e)] = (r.sums[cur(e)] || 0) + cents(e);
      years.set(y, r);
    });
    const yearly = years.size > 1
      ? `<h2>Pregled po godinama</h2><table><thead><tr><th>Godina</th><th class="r">Unosa</th>${currencies.map(c => `<th class="r">Ukupno (${esc(c)})</th>`).join('')}</tr></thead><tbody>` +
        [...years.values()].sort((a, b) => b.y.localeCompare(a.y)).map(r => `<tr><td><b>${esc(r.y)}</b></td><td class="r">${r.count}</td>${currencies.map(c => `<td class="r">${r.sums[c] ? esc(money(r.sums[c], c)) : '–'}</td>`).join('')}</tr>`).join('') +
        `</tbody></table>`
      : '';

    const body =
      `<div class="metrics">${metric('Broj unosa', list.length, 'navy')}${metric('Poslednja kilometraža', lastKm ? thousands(lastKm) + ' km' : '–')}${currencies.map(c => metric('Ukupno (' + c + ')', money(totals[c], c), 'green')).join('')}</div>` +
      `<div class="infoGrid">` +
      card('Vozilo', field('Vozilo', v.name) + field('Registracija', v.registration) + field('VIN', v.vin) + field('Godište', v.year)) +
      card('Evidencija', field('Prvi unos', d(from)) + field('Poslednji unos', d(to)) + field('Beleške', v.notes)) +
      `</div>` + yearly + `<h2>Servisi i troškovi</h2>` +
      (list.length
        ? `<table><colgroup><col width="12%"><col width="11%"><col width="15%"><col><col width="17%"></colgroup><thead><tr><th>Datum</th><th class="r">Km</th><th>Tip</th><th>Naslov i opis</th><th class="r">Iznos</th></tr></thead><tbody>${rows}${sums}</tbody></table>`
        : '<p class="paragraph">Za ovo vozilo još nema unosa.</p>');
    return frame(ctx, { title: 'SERVISNA KNJIŽICA', number: v.name || 'Vozilo', meta: [v.registration || '', 'Unosa: ' + list.length].filter(Boolean), body });
  }

  /** Pregledač: nova kartica. Android aplikacija: „prozor“ koji po završetku otvara sistemsku štampu / Sačuvaj kao PDF. */
  function openTarget() {
    if (window.NativeBridge && NativeBridge.isNative()) {
      let buf = '';
      return {
        document: {
          open() { buf = ''; },
          write(h) { buf += h; },
          close() {
            if (buf.includes('Priprema dokumenta')) return;
            const title = (buf.match(/<title>([^<]*)<\/title>/) || [])[1] || 'AutoDesk';
            NativeBridge.printHtml(buf, title).catch(e => toast(e.message));
          },
          get body() { return { set textContent(m) { toast(m); } }; }
        }
      };
    }
    const w = window.open('', '_blank');
    if (!w) throw Error('Dozvolite otvaranje novih kartica za pregled dokumenta.');
    return w;
  }

  /** Lična vozila: isti izgled dokumenta, ali bez zaglavlja i podataka radionice. Pozvati direktno iz klika. */
  function previewPrivate(vehicle, entries) {
    const w = openTarget();
    w.document.write('<!doctype html><meta charset="utf-8"><title>AutoDesk</title><body style="font:14px Arial;padding:30px;color:#444">Priprema dokumenta…</body>');
    w.document.close();
    logoData()
      .then(logo => {
        const html = privateDoc({ shop: {}, name: 'Evidencija ličnih vozila', logo }, vehicle, entries);
        w.document.open(); w.document.write(html); w.document.close();
      })
      .catch(e => { w.document.body.textContent = 'Greška: ' + e.message; });
  }

  /** Mora se pozvati direktno iz klika (inače pregledač blokira novu karticu). */
  function preview(url) {
    const w = openTarget();
    w.document.write('<!doctype html><meta charset="utf-8"><title>AutoDesk</title><body style="font:14px Arial;padding:30px;color:#444">Priprema dokumenta…</body>');
    w.document.close();
    render(url, w).catch(e => { w.document.body.textContent = 'Greška: ' + e.message; });
  }

  return { preview, previewPrivate };
})();
