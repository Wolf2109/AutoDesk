'use strict';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

const formatVehicle = v => {
    if (!v) return '';
    if (typeof v === 'string') {
        // Uklanja višak tačaka, crtica i razmaka na kraju ukoliko su ostali upisani
        return v.replace(/\s*[·.\-]\s*$/, '').trim();
    }
    const base = [v.make, v.model].filter(Boolean).join(' ').trim();
    const reg = (v.registration || '').trim();
    return reg ? `${base} · ${reg}` : base;
};

const state = {
    page: 'dashboard',
    clients: [],
    vehicles: [],
    orders: [],
    services: [],
    token: '',
    stats: null,
    filters: {},
    period: 'month',
    statsMonth: '',
    currency: 'RSD',
    dateFormat: 'DD.MM.YYYY',
    ordersParams: {},
    firstDate: '',
    renderedPage: null
};

/* ---------- Učitavanje (splash i indikatori) ---------- */
const loaderHtml = (text = 'Učitavam podatke…') =>
    `<div class="loader" role="status"><div class="spinner" aria-hidden="true"></div><p>${text}</p></div>`;

function setBoot(text) {
    const t = $('#bootText');
    if (t) t.textContent = text;
}

function clearBootTimers() {
    (window.__bootTimers || []).forEach(clearTimeout);
    window.__bootTimers = [];
}

function hideBoot() {
    clearBootTimers();
    const b = $('#boot');
    if (!b) return;
    b.classList.add('done');
    setTimeout(() => b.remove(), 350);
}

function bootFail(e) {
    console.error(e);
    clearBootTimers();
    const b = $('#boot');
    if (!b) return;
    b.querySelector('.spinner')?.classList.add('hidden');
    setBoot('Aplikacija nije mogla da se pokrene.');
    const hint = $('#bootHint');
    if (hint) hint.textContent = e?.message || '';
    $('#bootRetry')?.classList.remove('hidden');
}

/* ---------- Dugme „nazad“ (istorija pregledača) ----------
 * Svaka stranica, otvoren prozor (modal) i otvoren meni dobijaju svoj unos u istoriji,
 * pa „nazad“ na telefonu zatvara prozor/meni ili vraća na prethodnu stranicu umesto da izađe iz aplikacije.
 */
const ui = { menu: false, modal: false, ignorePop: 0, backDone: null, backResolve: null };

function historyBack() {
    ui.ignorePop++;
    ui.backDone = new Promise(resolve => {
        const finish = timedOut => {
            clearTimeout(timer);
            if (timedOut && ui.ignorePop > 0) ui.ignorePop--;
            ui.backDone = null;
            ui.backResolve = null;
            resolve();
        };
        const timer = setTimeout(() => finish(true), 500);
        ui.backResolve = () => finish(false);
    });
    history.back();
}

function pushPage(page) {
    const cur = history.state || {};
    if (cur.menu) history.replaceState({ page }, '');       // izbor u meniju zamenjuje unos menija
    else if (cur.page !== page) history.pushState({ page }, '');
}

function setMenuOpen(open, fromPop = false) {
    $('#sidebar')?.classList.toggle('open', open);
    $('#menuBackdrop')?.classList.toggle('visible', open);
    const btn = $('#menuBtn');
    btn?.setAttribute('aria-expanded', String(open));
    btn?.setAttribute('aria-label', open ? 'Sakrij meni' : 'Prikaži meni');
    if (open && !ui.menu) {
        history.pushState({ ...(history.state || {}), menu: true }, '');
        ui.menu = true;
    } else if (!open && ui.menu) {
        ui.menu = false;
        if (!fromPop) historyBack();
    }
}

function onPopState(e) {
    if (ui.ignorePop > 0) { ui.ignorePop--; ui.backResolve?.(); return; }
    if (ui.modal) { closeModal(true); return; }
    if (ui.menu) { setMenuOpen(false, true); return; }
    const page = e.state?.page;
    if (page && page !== state.page) navigate(page, true, true);
}

const navItems = [
    ['dashboard', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>', 'Dashboard'],
    ['orders', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"/><path d="M8 5.5H6a2 2 0 00-2 2V19a2 2 0 002 2h12a2 2 0 002-2V7.5a2 2 0 00-2-2h-2"/><path d="M8 12h8M8 16h5"/></svg>', 'Radni nalozi'],
    ['clients', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>', 'Klijenti'],
    ['vehicles', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16l1.5-5.5A2 2 0 018.4 9h7.2a2 2 0 011.9 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/></svg>', 'Vozila'],
    ['services', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>', 'Cenovnik'],
    ['stats', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>', 'Statistika'],
    ['private', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5.5A2 2 0 016.9 6h10.2A2 2 0 0119 7.5L21 13"/><path d="M3 13h18v5a1 1 0 01-1 1h-2v-2H6v2H4a1 1 0 01-1-1z"/><circle cx="7.5" cy="15.5" r=".6"/><circle cx="16.5" cy="15.5" r=".6"/></svg>', 'Lična vozila'],
    ['fuel', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M4 21h12M7 8h6M15 10h2a2 2 0 012 2v4a1.5 1.5 0 003 0V9l-3-3"/></svg>', 'Gorivo'],
    ['settings', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>', 'Podešavanja']
];

const today = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const currencies = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM', 'HRK', 'MKD'];

const fmt = n => new Intl.NumberFormat('sr-Latn-RS', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
}).format((Number(n) || 0) / 100) + ' ' + state.currency;

const moneyLabel = label => label + ' (' + state.currency + ')';
const dec = n => (Number(n || 0) / 100).toFixed(2);
const nf = n => new Intl.NumberFormat('sr-Latn-RS').format(Number(n) || 0);

const fd = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    return state.dateFormat === 'YYYY-MM-DD' ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}.${m[2]}.${m[1]}`;
};

const STATUS = {
    received: ['Primljeno', 'info'],
    in_progress: ['U radu', 'warn'],
    waiting: ['Čeka deo', 'warn'],
    done: ['Završeno', 'ok'],
    delivered: ['Preuzeto', 'muted']
};
const telLink = p => `<a class="telLink" href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${esc(p)}</a>`;
const badge = s => `<span class="badge ${STATUS[s]?.[1] || 'muted'}">${STATUS[s]?.[0] || ''}</span>`;

const friendlyError = m => /insufficient permissions|permission-denied/i.test(String(m))
    ? 'Firestore pravila ne dozvoljavaju pristup ovoj kolekciji. U Firebase konzoli (Firestore Database → Rules) objavite pravila iz fajla firestore.rules.'
    : m;
const toast = m => {
    let el = $('#toast');
    el.textContent = friendlyError(m);
    el.style.display = 'block';
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => el.style.display = 'none', 4200);
};

async function api(url,opt={}) {
    try { return await LocalAPI.call(url,opt); }
    catch(e) { throw Error(e.message || 'Greška pri sinhronizaciji.'); }
}

const send = (url, method, body) => api(url, { method, body: JSON.stringify(body) });

function renderNav() {
    let n = $('#nav');
    if (!n) return;
    n.innerHTML = navItems.map(([id, icon, label]) => 
        `<button class="${state.page === id ? 'active' : ''}" data-nav="${id}">${icon}<span>${label}</span></button>`
    ).join('');
    n.querySelectorAll('button').forEach(b => b.onclick = () => navigate(b.dataset.nav));
}

async function loadBase() {
    [state.clients, state.vehicles, state.services] = await Promise.all(
        ['/clients', '/vehicles', '/services'].map(api)
    );
}

const refresh = () => navigate(state.page, true);

function syncStatus() {
    const st = LocalAPI.status(), dot = $('#serverDot'), txt = $('#syncText'), banner = $('#banner');
    if (dot) dot.style.color = st.offline ? '#E34B4B' : '#35C879';
    if (txt) txt.textContent = st.offline ? 'Bez veze' : 'Sinhronizovano';
    if (banner) {
        banner.style.display = st.offline ? 'block' : 'none';
        banner.textContent = 'Nema veze sa oblakom — prikazani su poslednji sačuvani podaci. Izmene nisu moguće dok se veza ne vrati.';
    }
}

let navSeq = 0;

async function navigate(page, keep = false, fromPop = false) {
    const seq = ++navSeq;
    if (ui.backDone) await ui.backDone;            // sačekaj da se završi „nazad“ koji je zatvorio prozor
    if (!fromPop && !keep) pushPage(page);
    state.page = page;
    ui.menu = false;
    $('#sidebar')?.classList.remove('open');
    $('#menuBackdrop')?.classList.remove('visible');
    $('#menuBtn')?.setAttribute('aria-expanded', 'false');
    $('#menuBtn')?.setAttribute('aria-label', 'Prikaži meni');
    renderNav();
    $('#pageTitle').textContent = navItems.find(x => x[0] === page)?.[2] || 'AutoDesk';
    const headSmall = document.querySelector('header small');
    if (headSmall) headSmall.textContent = (page === 'private' || page === 'fuel') ? 'Privatno' : 'Radionica';
    $('#quickOrder')?.classList.toggle('hidden', page === 'private' || page === 'fuel');

    // Prazna ili druga stranica: prikaži učitavanje; ista stranica ostaje vidljiva uz traku na vrhu.
    const content = $('#content');
    if (state.renderedPage !== page || !content.firstElementChild) content.innerHTML = loaderHtml();
    document.body.classList.add('busy');

    try {
        // Lična vozila su zasebna celina: ne učitavaju podatke radionice i ne zavise od njih.
        if (page === 'private' || page === 'fuel') {
            await (page === 'fuel' ? FuelTracker : PrivateVehicles).render();
            if (seq === navSeq) state.renderedPage = page;
            return;
        }
        let settings = await api('/settings');
        state.currency = currencies.includes(settings.currency) ? settings.currency : 'RSD';
        state.dateFormat = settings.date_format === 'YYYY-MM-DD' ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
        const brand = document.querySelector('#sidebar .brand strong');
        if (brand && settings.workshop_name) brand.textContent = settings.workshop_name;
        await loadBase();
        if (seq !== navSeq) return;                 // u međuvremenu je otvorena druga stranica
        setBoot('Priprema prikaza…');

        if (page === 'dashboard') await dashboard();
        else if (page === 'orders') await listPage('orders', keep ? state.ordersParams : {});
        else if (['clients', 'vehicles', 'services'].includes(page)) await listPage(page);
        else if (page === 'stats') await statsPage();
        else if (page === 'settings') await settingsPage();
        if (seq === navSeq) state.renderedPage = page;
    } catch (e) {
        if (seq !== navSeq) return;
        state.renderedPage = null;
        toast(e.message);
        $('#content').innerHTML = `<section class="panel"><h3>Podaci nisu dostupni</h3><p class="subtle">${esc(e.message)}</p><button class="primary" id="retryLoad">Pokušaj ponovo</button></section>`;
        $('#retryLoad').onclick = () => navigate(page, keep);
    } finally {
        if (seq === navSeq) document.body.classList.remove('busy');
    }
    syncStatus();
}

function periodRange(p) {
    let d = new Date(),
        iso = x => [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-'),
        start = new Date(d),
        end = new Date(d);
        
    if (p === 'yesterday') {
        start.setDate(d.getDate() - 1);
        end = new Date(start);
    }
    if (p === 'week') start.setDate(d.getDate() - 6);
    if (p === 'month') start = new Date(d.getFullYear(), d.getMonth(), 1);
    if (p === 'prevmonth') {
        start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        end = new Date(d.getFullYear(), d.getMonth(), 0);
    }
    if (p === 'year') start = new Date(d.getFullYear(), 0, 1);
    if (p === 'all') {
        return { from: '2000-01-01', to: '9999-12-31' };
    }
    return { from: iso(start), to: iso(end) };
}

function dateControls(handler, initial = 'month') {
    let options = [
        ['today', 'Danas'],
        ['yesterday', 'Juče'],
        ['week', '7 dana'],
        ['month', 'Ovaj mesec'],
        ['prevmonth', 'Prošli mesec'],
        ['year', 'Ova godina'],
        ['all', 'Sve'],
        ['custom', 'Period']
    ];
    
    let current = new Date();
    let monthOptions = [];
    let monthFormatter = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long' });
    const minYear = Math.min(current.getFullYear(), Number((state.firstDate || '').slice(0, 4)) || current.getFullYear());
    for (let y = current.getFullYear(); y >= minYear; y--) {
        let lastMonth = y === current.getFullYear() ? current.getMonth() : 11;
        for (let m = lastMonth; m >= 0; m--) {
            let value = `${y}-${String(m + 1).padStart(2, '0')}`;
            let label = monthFormatter.format(new Date(y, m, 1));
            monthOptions.push(`<option value="${value}" ${state.statsMonth === value ? 'selected' : ''}>${label.charAt(0).toLocaleUpperCase('sr-Latn-RS') + label.slice(1)} ${y}</option>`);
        }
    }

    return `<div class="filters" style="margin-bottom:12px">` +
    `<select id="statsMonthSelect" aria-label="Izaberite mesec"><option value="">Izaberite mesec i godinu</option>${monthOptions.join('')}</select>` +
    `</div>` +
    `<div class="chips" id="periodChips">${options.map(([v, l]) => 
        `<button class="chip ${initial === v ? 'active' : ''}" data-period="${v}">${l}</button>`
    ).join('')}</div>` +
    `<div id="customDates" style="display:${initial === 'custom' ? 'flex' : 'none'};gap:8px;margin-top:12px">` +
    `<input type="date" id="fromDate" value="${today()}">` +
    `<input type="date" id="toDate" value="${today()}">` +
    `<button class="secondary" id="applyDates">Primeni</button></div>`;
}

function wirePeriod(callback) {
    const monthSelect = $('#statsMonthSelect');
    if (monthSelect) monthSelect.onchange = () => {
        if (!monthSelect.value) return;
        state.statsMonth = monthSelect.value;
        state.period = 'monthSelect';
        let [year, month] = state.statsMonth.split('-').map(Number);
        let from = `${year}-${String(month).padStart(2, '0')}-01`;
        let lastDay = new Date(year, month, 0).getDate();
        let to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        callback({ from, to });
    };

    document.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
        state.period = b.dataset.period;
        if (state.period === 'custom') {
            state.statsMonth = '';
            if (monthSelect) monthSelect.value = '';
            $('#customDates').style.display = 'flex';
            document.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === b));
        } else {
            state.statsMonth = '';
            if (monthSelect) monthSelect.value = '';
            callback(periodRange(state.period));
        }
    });
    $('#applyDates').onclick = () => {
        state.statsMonth = '';
        if (monthSelect) monthSelect.value = '';
        callback({ from: $('#fromDate').value, to: $('#toDate').value });
    };
}

function statCard(label, value, cls = '', sub = '') {
    return `<div class="stat ${cls}"><label>${label}</label><div class="bigNumber">${value}</div><small>${sub}</small></div>`;
}

function chart(data) {
    if (!data.length) return '<div class="empty">Nema podataka za grafikon.</div>';
    let W = 800, H = 240, px = 12, py = 24, base = H - py, n = data.length,
        max = Math.max(1, ...data.flatMap(x => [x.spent, x.charged])),
        X = i => px + i * (W - 2 * px) / Math.max(1, n - 1),
        Y = v => base - (v / max) * (H - 2 * py),
        xy = key => data.map((x, i) => [X(i), Y(x[key])]),
        line = key => xy(key).map(p => p.join(',')).join(' '),
        c = xy('charged'),
        area = `${c[0][0]},${base} ${line('charged')} ${c[c.length - 1][0]},${base}`,
        grid = [0, .33, .66, 1].map(f => `<line x1="${px}" x2="${W - px}" y1="${py + f * (H - 2 * py)}" y2="${py + f * (H - 2 * py)}"/>`).join('');

    // Cifre na grafikonu: iznosi (bez decimala) iznad/ispod tačaka, datumi ispod ose i skala sa leve strane.
    const short = v => nf(Math.round((Number(v) || 0) / 100));
    const step = Math.max(1, Math.ceil(n / 8));
    const labeled = i => i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
    let labels = '';
    data.forEach((d, i) => {
        if (!labeled(i)) return;
        const left = (X(i) / W * 100).toFixed(2), edge = n > 1 ? (i === 0 ? 'first' : i === n - 1 ? 'last' : '') : '';
        labels += `<span class="cv gold ${edge}" style="left:${left}%;top:${(Y(d.charged) / H * 100).toFixed(2)}%">${short(d.charged)}</span>`;
        if (d.spent > 0) labels += `<span class="cv red ${edge}" style="left:${left}%;top:${(Y(d.spent) / H * 100).toFixed(2)}%">${short(d.spent)}</span>`;
        labels += `<span class="cx ${edge}" style="left:${left}%">${esc(d.date.slice(8, 10) + '.' + d.date.slice(5, 7) + '.')}</span>`;
    });
    const scale = [0, .33, .66, 1].map(f => `<span class="cy" style="top:${((py + f * (H - 2 * py)) / H * 100).toFixed(2)}%">${short(max * (1 - f))}</span>`).join('');

    return `<div class="chartBox"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafikon naplaćenog i potrošenog">` +
        `<defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB81C" stop-opacity=".38"/><stop offset="1" stop-color="#FFB81C" stop-opacity="0"/></linearGradient></defs>` +
        grid + `<polygon points="${area}" fill="url(#gArea)" stroke="none"/>` +
        `<polyline points="${line('charged')}" fill="none" stroke="#FFB81C"/>` +
        `<polyline points="${line('spent')}" fill="none" stroke="#FF6B6B" stroke-dasharray="6 6"/>` +
        `</svg>${scale}${labels}</div><div class="legend"><span><i class="dot gold"></i>Naplaćeno</span><span><i class="dot red"></i>Potrošeno</span><em>${esc(fd(data[0].date))} — ${esc(fd(data[data.length - 1].date))} · iznosi u ${esc(state.currency)}</em></div>`;
}

function ordersTable(rows) {
    return `<div class="tableWrap cards"><table class="ordersTbl"><thead><tr>` +
        `<th>Nalog</th><th>Klijent / Vozilo</th><th>Opis</th><th>Potrošeno</th><th>Naplaćeno</th><th>Razlika</th><th></th>` +
        `</tr></thead><tbody>${rows.map(o => `<tr>` +
        `<td class="cNum"><strong>${esc(o.order_number)}</strong><small>${esc(fd(o.date))}</small>${badge(o.status)}</td>` +
        `<td class="cWho">${esc(o.client_name)}<small>${esc(formatVehicle(o.vehicle_name))}</small></td>` +
        `<td class="cDesc">${esc(o.description.length > 85 ? o.description.slice(0, 85) + '…' : o.description)}${o.dtc_codes ? `<small>${esc(o.dtc_codes)}</small>` : ''}</td>` +
        `<td class="cSpent" data-label="Potrošeno">${fmt(o.spent_amount)}</td>` +
        `<td class="cCharged" data-label="Naplaćeno">${fmt(o.charged_amount)}</td>` +
        `<td class="cDiff ${o.difference < 0 ? 'negativeText' : 'positiveText'}" data-label="Razlika">${fmt(o.difference)}</td>` +
        `<td class="cAct"><button class="linkBtn" data-view="${o.id}">Detalji</button></td>` +
        `</tr>`).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">Nema radnih naloga.</div>'}</div>`;
}

function wireOrderViews() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewOrder(+b.dataset.view));
}

function reminderRow(x, todayIso) {
    let parts = [], overdue = false;
    if (x.next_service_date) {
        const days = Math.round((new Date(x.next_service_date + 'T12:00:00') - new Date(todayIso + 'T12:00:00')) / 86400000);
        overdue = days < 0;
        parts.push((days < 0 ? `kasni ${-days} d` : days === 0 ? 'danas' : `za ${days} d`) + ` (${fd(x.next_service_date)})`);
    }
    if (x.next_service_km != null) {
        const reached = x.vehicle_mileage != null && x.vehicle_mileage >= x.next_service_km;
        if (reached) overdue = true;
        parts.push((reached ? 'dostignuto ' : 'na ') + nf(x.next_service_km) + ' km');
    }
    return `<div class="remRow"><div><strong>${esc(formatVehicle(x.vehicle_name))}</strong><small>${esc([x.registration, x.client_name].filter(Boolean).join(' · '))}${x.phone ? ' · ' + telLink(x.phone) : ''}</small></div>` +
        `<span class="badge ${overdue ? 'bad' : 'warn'}">${esc(parts.join(' · '))}</span><button class="linkBtn" data-view="${x.id}">Nalog</button></div>`;
}

async function dashboard() {
    let d = today(), month = d.slice(0, 7) + '-01';
    let [day, mon, rem, active] = await Promise.all([
        api('/stats?from=' + d + '&to=' + d),
        api('/stats?from=' + month + '&to=' + d),
        api('/reminders'),
        api('/orders?status=active')
    ]);
    let dd = day.totals.difference ?? (day.totals.charged - day.totals.spent);

    $('#content').innerHTML =
        `<section class="hero">` +
        `<div class="heroMain"><div class="heroTop"><span>Danas</span><button class="heroBtn" id="refreshDash" title="Osveži">↻</button></div>` +
        `<div class="heroNum">${fmt(day.totals.charged)}</div><p>naplaćeno u ${day.totals.count} ${day.totals.count === 1 ? 'nalogu' : 'naloga'}</p>` +
        `<div class="heroSplit"><div><label>Potrošeno</label><b>${fmt(day.totals.spent)}</b></div><div><label>Razlika</label><b>${fmt(dd)}</b></div></div>` +
        `<button class="heroNew" id="dashboardNew">+ Novi radni nalog</button></div>` +
        `<div class="panel heroChart"><h3>Kretanje ovog meseca</h3>${chart(mon.trend)}</div>` +
        `</section>` +
        `<div class="kpis">` +
        statCard('Naplaćeno ovog meseca', fmt(mon.totals.charged), 'accent') +
        statCard('Potrošeno ovog meseca', fmt(mon.totals.spent), 'negative') +
        statCard('Razlika ovog meseca', fmt(mon.totals.difference), mon.totals.difference < 0 ? 'negative' : 'positive', 'Naplaćeno − potrošeno') +
        statCard('Vozila', mon.vehicles, '', 'u evidenciji') +
        statCard('Klijenata', mon.clients, '', 'u evidenciji') +
        `</div>` +
        (active.length ? `<section class="panel"><h3>Nalozi u toku (${active.length})</h3>${ordersTable(active.slice(0, 10))}</section>` : '') +
        (rem.rows.length ? `<section class="panel"><h3>Podsetnik za servis (${rem.rows.length})</h3><div class="remList">${rem.rows.map(x => reminderRow(x, rem.today)).join('')}</div></section>` : '') +
        `<section class="panel"><h3>Poslednji radni nalozi</h3>${ordersTable(mon.recent)}</section>`;

    $('#refreshDash').onclick = refresh;
    $('#dashboardNew').onclick = () => orderForm();
    wireOrderViews();
}

const tableColumns = {
    clients: ['Ime i prezime', 'Telefon', 'Email', ''],
    vehicles: ['Vozilo', 'Klijent', 'Registracija', 'VIN', 'Km', ''],
    services: ['Usluga', 'Cena', '']
};

function entityRows(type, rows) {
    const cols = tableColumns[type];
    return rows.map(x => {
        let vals = type === 'clients' ? [esc(x.name), x.phone ? telLink(x.phone) : '', esc(x.email)] :
                   type === 'vehicles' ? [esc([x.make, x.model].filter(Boolean).join(' ')), esc(state.clients.find(c => c.id === x.client_id)?.name || ''), esc(x.registration), esc(x.vin), x.mileage != null && x.mileage !== '' ? nf(x.mileage) : ''] :
                   [esc(x.name), esc(fmt(x.price_amount))];

        return `<tr>${vals.map((v, i) => `<td${i === 0 ? ' class="cMain"' : ''} data-label="${cols[i]}">${v}</td>`).join('')}` +
            `<td class="cAct"><button class="linkBtn" data-edit="${x.id}">Izmeni</button> ` +
            `<button class="linkBtn" data-delete="${x.id}" style="color:var(--red)">Obriši</button>` +
            `${type === 'clients' || type === 'vehicles' ? ` <button class="linkBtn" data-history="${x.id}">Istorija</button>` : ''}` +
            `${type === 'vehicles' ? ` <button class="linkBtn" data-vpdf="${x.id}">PDF</button>` : ''}</td></tr>`;
    }).join('');
}

async function listPage(type, params = {}) {
    let isOrder = type === 'orders',
        name = type === 'clients' ? 'klijenta' : type === 'vehicles' ? 'vozilo' : type === 'services' ? 'uslugu' : 'radni nalog';
    
    let url = '/' + type, query = new URLSearchParams();
    for (let [k, v] of Object.entries(params)) if (v && k !== 'search') query.set(k, v);
    
    const qs = query.toString();
    let rows = await api(url + (qs ? '?' + qs : ''));
    state[type] = rows;
    if (isOrder) state.ordersParams = params;

    let hasActiveFilters = isOrder && (params.from || params.to || params.client_id || params.vehicle_id || params.status);
    
    let clientsOptions = state.clients.map(c => `<option value="${c.id}" ${String(params.client_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    let vehiclesOptions = state.vehicles.map(v => `<option value="${v.id}" ${String(params.vehicle_id) === String(v.id) ? 'selected' : ''}>${esc(formatVehicle(v))}</option>`).join('');

    let filtersHtml = isOrder ? `
        <div class="panel" id="filtersPanel" style="display: ${hasActiveFilters ? 'block' : 'none'}; margin-bottom: 16px;">
            <div class="filters">
                <input type="date" id="orderFrom" value="${esc(params.from || '')}">
                <input type="date" id="orderTo" value="${esc(params.to || '')}">
                <select id="orderClient"><option value="">Svi klijenti</option>${clientsOptions}</select>
                <select id="orderVehicle"><option value="">Sva vozila</option>${vehiclesOptions}</select>
                <select id="orderStatus"><option value="">Svi statusi</option><option value="active" ${params.status === 'active' ? 'selected' : ''}>Nalozi u toku</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${params.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                <button class="secondary" id="filterOrders">Filtriraj</button>
                <button class="ghost" id="resetOrders">Poništi</button>
            </div>
        </div>` : '';

    let searchValue = params.search || '';

    let contentHtml = `
        <div class="toolbar">
            <div class="search-wrapper">
                <input class="search" id="searchInput" placeholder="Pretraži ${isOrder ? 'naloge, klijente, vozila, kodove grešaka' : ''}…" value="${esc(searchValue)}">
            </div>
            <div style="display:flex; gap:8px;">
                ${isOrder ? `<button class="secondary" id="toggleFiltersBtn">⚙️ Filteri ${hasActiveFilters ? '(aktivni)' : ''}</button><button class="secondary" id="finishAllOrders">✓ Završi sve otvorene</button>` : ''}
                <button class="primary" id="addEntity">+ Dodaj ${name}</button>
            </div>
        </div>
        ${filtersHtml}
        <section class="panel" id="tableContainer">
            <!-- Dinamički prikaz tabele u realnom vremenu -->
        </section>
    `;

    $('#content').innerHTML = contentHtml;
    if (isOrder) {
        $('#finishAllOrders').onclick = async () => {
            const btn = $('#finishAllOrders');
            const open = await api('/orders?status=active');
            if (!open.length) { toast('Nema otvorenih naloga.'); return; }
            if (!confirm(`Označiti ${open.length} otvorenih naloga (primljeno, u radu, čeka deo) kao „Završeno“?`)) return;
            btn.disabled = true;
            try {
                const result = await send('/orders/finish-all', 'POST', {});
                toast(`Završeno: ${result.updated} naloga.`);
                await listPage('orders', params);
            } catch (e) { toast(e.message); btn.disabled = false; }
        };
    }

    let shown = 100, currentQ = searchValue;
    const renderTable = (searchQuery, reset = true) => {
        if (reset) shown = 100;
        currentQ = searchQuery;
        let q = searchQuery.toLowerCase().trim();
        let filtered = rows;

        if (q) {
            filtered = rows.filter(item => {
                if (isOrder) {
                    return (item.order_number && item.order_number.toLowerCase().includes(q)) ||
                           (item.client_name && item.client_name.toLowerCase().includes(q)) ||
                           (item.vehicle_name && item.vehicle_name.toLowerCase().includes(q)) ||
                           (item.description && item.description.toLowerCase().includes(q)) ||
                           (item.notes && item.notes.toLowerCase().includes(q)) ||
                           (item.complaint && item.complaint.toLowerCase().includes(q)) ||
                           (item.dtc_codes && item.dtc_codes.toLowerCase().includes(q));
                } else if (type === 'clients') {
                    return (item.name && item.name.toLowerCase().includes(q)) ||
                           (item.phone && item.phone.toLowerCase().includes(q)) ||
                           (item.email && item.email.toLowerCase().includes(q));
                } else if (type === 'vehicles') {
                    let client = state.clients.find(c => c.id === item.client_id)?.name || '';
                    return (item.make && item.make.toLowerCase().includes(q)) ||
                           (item.model && item.model.toLowerCase().includes(q)) ||
                           (item.registration && item.registration.toLowerCase().includes(q)) ||
                           (item.vin && item.vin.toLowerCase().includes(q)) ||
                           (client.toLowerCase().includes(q));
                } else if (type === 'services') {
                    return (item.name && item.name.toLowerCase().includes(q));
                }
                return true;
            });
        }

        const visible = filtered.slice(0, shown);
        $('#tableContainer').innerHTML = (isOrder ?
            ordersTable(visible) :
            `<div class="tableWrap cards"><table class="entTbl"><thead><tr>${tableColumns[type].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${entityRows(type, visible)}</tbody></table>${filtered.length ? '' : '<div class="empty">Nema unetih podataka.</div>'}</div>`) +
            (filtered.length > shown ? `<div class="loadMore"><button class="secondary" id="showMore">Prikaži još (${filtered.length - shown})</button></div>` : '');
        const more = $('#showMore');
        if (more) more.onclick = () => { shown += 100; renderTable(currentQ, false); };

        if (isOrder) {
            wireOrderViews();
        } else {
            document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => entityForm(type, rows.find(x => x.id === +b.dataset.edit)));
            document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => removeEntity(type, +b.dataset.delete));
            document.querySelectorAll('[data-history]').forEach(b => b.onclick = () => {
                navigate('orders').then(() => listPage('orders', { [type === 'clients' ? 'client_id' : 'vehicle_id']: b.dataset.history }));
            });
            document.querySelectorAll('[data-vpdf]').forEach(b => b.onclick = () => download('/vehicles/' + b.dataset.vpdf + '/history.pdf', 'servisna-istorija.pdf'));
        }
    };

    renderTable(searchValue);

    $('#addEntity').onclick = () => isOrder ? orderForm() : entityForm(type);

    const searchInput = $('#searchInput');

    searchInput.oninput = e => {
        renderTable(e.target.value);
    };

    if (isOrder) {
        $('#toggleFiltersBtn').onclick = () => {
            let panel = $('#filtersPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };

        wireOrderViews();
        
        $('#filterOrders').onclick = () => listPage(type, {
            ...params,
            from: $('#orderFrom').value,
            to: $('#orderTo').value,
            client_id: $('#orderClient').value,
            vehicle_id: $('#orderVehicle').value,
            status: $('#orderStatus').value,
            search: searchInput.value
        });
        
        $('#resetOrders').onclick = () => listPage(type);
    }
}

function modal(title, body) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modal').classList.remove('hidden');
    document.body.classList.add('modalOpen');
    if (!ui.modal) {
        history.pushState({ ...(history.state || {}), modal: true }, '');
        ui.modal = true;
    }
}

function closeModal(fromPop) {
    $('#modal').classList.add('hidden');
    document.body.classList.remove('modalOpen');
    if (ui.modal) {
        ui.modal = false;
        if (fromPop !== true) historyBack();       // ukloni unos prozora iz istorije
    }
}

$('#closeModal').onclick = closeModal;

function field(label, name, value = '', type = 'text', required = false, extra = '') {
    return `<div class="field ${extra}"><label for="f_${name}">${label}</label>` +
        `<input id="f_${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="any"' : ''}></div>`;
}

function selectField(label, name, items, value = '', placeholder = 'Izaberite') {
    return `<div class="field"><label for="f_${name}">${label}</label>` +
        `<select name="${name}" id="f_${name}" required><option value="">${placeholder}</option>` +
        `${items.map(x => `<option value="${x.id}" ${String(value) === String(x.id) ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>`;
}

function textArea(label, name, value = '') {
    return `<div class="field full"><label>${label}</label><textarea name="${name}">${esc(value)}</textarea></div>`;
}

function formShell(body, callback) {
    $('#modalBody').innerHTML = `<form id="editForm"><div class="formGrid">${body}</div>` +
        `<div class="formActions"><button type="button" class="secondary" id="cancelForm">Otkaži</button><button class="primary" type="submit">Sačuvaj</button></div></form>`;
    $('#cancelForm').onclick = closeModal;
    $('#editForm').onsubmit = async e => {
        e.preventDefault();
        let b = Object.fromEntries(new FormData(e.target).entries());
        try {
            await callback(b);
            closeModal();
            toast('Uspešno sačuvano.');
            await refresh();
        } catch (err) {
            toast(err.message);
        }
    };
}

function entityForm(type, item = {}) {
    modal(item.id ? 'Izmena podataka' : 'Novi unos', '');
    let fields = '';
    
    if (type === 'clients') {
        fields = field('Ime i prezime', 'name', item.name, 'text', true) +
                 field('Telefon', 'phone', item.phone) +
                 field('Email', 'email', item.email, 'email') +
                 textArea('Napomena', 'notes', item.notes);
    }
    if (type === 'vehicles') {
        fields = selectField('Klijent', 'client_id', state.clients.map(x => ({ id: x.id, label: x.name })), item.client_id ?? (state.clients.length === 1 ? state.clients[0].id : '')) +
                 field('Marka', 'make', item.make, 'text', true) +
                 field('Model', 'model', item.model, 'text', true) +
                 field('Godište', 'year', item.year, 'number') +
                 field('Motor', 'engine', item.engine) +
                 field('Snaga', 'power', item.power) +
                 field('Gorivo', 'fuel', item.fuel) +
                 field('Registracija', 'registration', item.registration) +
                 field('VIN', 'vin', item.vin) +
                 field('Kilometraža', 'mileage', item.mileage, 'number') +
                 textArea('Napomena', 'notes', item.notes);
    }
    if (type === 'services') {
        fields = field('Naziv usluge', 'name', item.name, 'text', true) +
                 field(moneyLabel('Cena'), 'price_amount', dec(item.price_amount), 'number');
    }
    
    formShell(fields, b => {
        if (type === 'services') b.price_amount = Math.round(Number(b.price_amount || 0) * 100);
        return send('/' + type + (item.id ? '/' + item.id : ''), item.id ? 'PUT' : 'POST', b);
    });
}

async function removeEntity(type, id) {
    if (!confirm('Da li sigurno želite da obrišete ovaj zapis?')) return;
    try {
        await api('/' + type + '/' + id, { method: 'DELETE' });
        toast('Zapis je obrisan.');
        navigate(type);
    } catch (e) {
        toast(e.message);
    }
}

function orderForm(item = {}) {
    modal(item.id ? 'Izmeni radni nalog' : 'Novi radni nalog', '');
    if (!item.client_id && state.clients.length === 1) item = { ...item, client_id: state.clients[0].id };
    let clients = state.clients.map(x => ({ id: x.id, label: x.name }));
    let vehicles = state.vehicles.filter(x => !item.client_id || x.client_id === item.client_id)
        .map(x => ({ id: x.id, label: formatVehicle(x) }));
    let statuses = Object.entries(STATUS).map(([k, [l]]) => ({ id: k, label: l }));

    let fields = field('Datum', 'date', item.date || today(), 'date', true) +
        selectField('Status', 'status', statuses, item.status || 'done') +
        selectField('Klijent', 'client_id', clients, item.client_id) +
        `<div class="field"><label for="vehFilter">Pronađi vozilo</label><input id="vehFilter" type="search" placeholder="Registracija ili marka…" autocomplete="off"></div>` +
        selectField('Vozilo', 'vehicle_id', vehicles, item.vehicle_id) +
        field('Kilometraža pri prijemu (km)', 'mileage', item.mileage, 'number') +
        field('Kodovi grešaka (odvojite zarezom)', 'dtc_codes', item.dtc_codes) +
        textArea('Prijavljeni problem', 'complaint', item.complaint) +
        `<div class="field full"><label for="svcPick">Dodaj uslugu iz cenovnika (upisuje naziv u opis i dodaje cenu u „Naplaćeno“)</label><select id="svcPick"><option value="">— izaberite uslugu —</option>${state.services.slice().sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn')).map(x => `<option value="${x.id}">${esc(x.name)} — ${esc(fmt(x.price_amount))}</option>`).join('')}</select></div>` +
        textArea('Opis izvršenog posla *', 'description', item.description) +
        textArea('Napomena', 'notes', item.notes) +
        `<div class="full moneyFields"><h3>Podsetnik za sledeći servis</h3><div class="formGrid">` +
        field('Datum', 'next_service_date', item.next_service_date, 'date') +
        field('Na kilometraži (km)', 'next_service_km', item.next_service_km, 'number') +
        `</div><p class="subtle">Opciono. Prikazuje se na kontrolnoj tabli kada se približi rok i štampa na PDF nalogu.</p></div>` +
        `<div class="full moneyFields"><h3>Finansijska evidencija</h3><div class="formGrid">` +
        field(moneyLabel('POTROŠENO'), 'spent_amount', dec(item.spent_amount), 'number', true) +
        field(moneyLabel('NAPLAĆENO'), 'charged_amount', dec(item.charged_amount), 'number', true) +
        `</div><div class="difference" id="liveDiff">Razlika: ${fmt((item.charged_amount || 0) - (item.spent_amount || 0))}</div>` +
        `<p class="subtle">Naplaćeno unosite slobodno, nezavisno od cenovnika.</p></div>`;

    formShell(fields, b => {
        if (!b.description.trim()) throw Error('Opis posla je obavezan.');
        b.spent_amount = Math.round(Number(b.spent_amount || 0) * 100);
        b.charged_amount = Math.round(Number(b.charged_amount || 0) * 100);
        return send('/orders' + (item.id ? '/' + item.id : ''), item.id ? 'PUT' : 'POST', b);
    });

    const fillVehicles = () => {
        const wanted = $('#f_vehicle_id').value, text = $('#vehFilter').value.trim().toLowerCase(), clientId = +$('#f_client_id').value;
        const options = state.vehicles.filter(v => (!clientId || v.client_id === clientId) && (!text || formatVehicle(v).toLowerCase().includes(text) || String(v.vin || '').toLowerCase().includes(text)));
        $('#f_vehicle_id').innerHTML = '<option value="">Izaberite vozilo</option>' +
            options.map(v => `<option value="${v.id}" ${String(v.id) === wanted ? 'selected' : ''}>${esc(formatVehicle(v))}</option>`).join('');
    };
    $('#f_client_id').onchange = fillVehicles;
    $('#vehFilter').oninput = fillVehicles;

    $('#f_vehicle_id').onchange = e => {
        const v = state.vehicles.find(x => x.id === +e.target.value);
        if (v && v.mileage != null && !$('#f_mileage').value) $('#f_mileage').value = v.mileage;
    };

    let update = () => {
        $('#liveDiff').textContent = 'Razlika: ' + fmt(Math.round((Number($('#f_charged_amount').value || 0) - Number($('#f_spent_amount').value || 0)) * 100));
    };

    $('#f_spent_amount').oninput = update;
    $('#f_charged_amount').oninput = update;

    $('#svcPick').onchange = e => {
        const svc = state.services.find(x => x.id === +e.target.value);
        if (!svc) return;
        const desc = document.querySelector('textarea[name=description]');
        desc.value = (desc.value.trim() ? desc.value.replace(/\s+$/, '') + '\n' : '') + '• ' + svc.name;
        $('#f_charged_amount').value = (Number($('#f_charged_amount').value || 0) + (Number(svc.price_amount) || 0) / 100).toFixed(2);
        update();
        e.target.value = '';
    };
}

async function viewOrder(id) {
    try {
        let o = await api('/orders/' + id);
        const text = v => `<p style="white-space:pre-wrap">${esc(v)}</p>`;
        const codes = (o.dtc_codes || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
        modal('Radni nalog ' + o.order_number,
            `<div class="summaryRow">` +
            `<div><span class="muted">Datum</span><h3>${esc(fd(o.date))}</h3></div>` +
            `<div><span class="muted">Klijent</span><h3>${esc(o.client_name)}</h3>${o.client_phone ? `<small>${telLink(o.client_phone)}</small>` : ''}</div>` +
            `<div><span class="muted">Vozilo</span><h3>${esc(formatVehicle(o.vehicle_name))}</h3></div>` +
            `<div><span class="muted">Status</span><select id="quickStatus">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
            `</div>` +
            (o.mileage != null ? `<p class="subtle">Kilometraža pri prijemu: <b>${nf(o.mileage)} km</b></p>` : '') +
            (o.complaint ? `<h3>Prijavljeni problem</h3>${text(o.complaint)}` : '') +
            (codes.length ? `<h3>Kodovi grešaka</h3><p>${codes.map(c => `<span class="badge warn">${esc(c)}</span>`).join(' ')}</p>` : '') +
            `<h3>Izvršeni posao</h3>${text(o.description)}` +
            `<p class="subtle">${esc(o.notes || 'Bez napomene')}</p>` +
            ((o.next_service_date || o.next_service_km != null) ? `<p class="notice">Sledeći servis: <b>${[o.next_service_date ? fd(o.next_service_date) : '', o.next_service_km != null ? nf(o.next_service_km) + ' km' : ''].filter(Boolean).join(' ili ')}</b></p>` : '') +
            `<div class="moneyFields"><div class="summaryRow">` +
            `<div>Potrošeno<h3>${fmt(o.spent_amount)}</h3></div>` +
            `<div>Naplaćeno<h3>${fmt(o.charged_amount)}</h3></div>` +
            `<div>Razlika<h3 class="${o.difference < 0 ? 'negativeText' : 'positiveText'}">${fmt(o.difference)}</h3></div>` +
            `</div></div>` +
            `<h3 style="margin-top:20px">Fotografije</h3><div class="photoGrid" id="photoGrid"></div>` +
            `<div style="margin-top:12px"><input type="file" id="photoInput" accept="image/*" multiple>` +
            `<button class="secondary" id="uploadPhotos" style="margin-top:8px">Dodaj fotografije</button></div>` +
            `<div class="formActions">` +
            `<button class="danger" id="deleteOrder">Obriši nalog</button>` +
            `<button class="secondary" id="orderPdf">PDF nalog</button>` +
            `<button class="secondary" id="dupOrder">Dupliraj</button>` +
            `<button class="secondary" id="editOrder">Izmeni nalog</button>` +
            `<button class="primary" id="doneOrder">Zatvori</button></div>`
        );

        let drawPhotos = () => {
            $('#photoGrid').innerHTML = o.photos.map(p =>
                `<div><img data-photo="${p.id}" alt="Fotografija naloga"><button class="danger" data-removephoto="${p.id}">Ukloni</button></div>`
            ).join('');

            document.querySelectorAll('[data-photo]').forEach(async img => {
                try {
                    let blob = await api('/photos/' + img.dataset.photo);
                    let url = URL.createObjectURL(blob);
                    img.src = url;
                    img.onload = () => URL.revokeObjectURL(url);
                } catch (e) { img.alt = 'Fotografija nije dostupna'; }
            });

            document.querySelectorAll('[data-removephoto]').forEach(b => b.onclick = async () => {
                if (!confirm('Ukloniti fotografiju?')) return;
                try {
                    await api('/photos/' + b.dataset.removephoto, { method: 'DELETE' });
                    o.photos = o.photos.filter(p => p.id !== +b.dataset.removephoto);
                    drawPhotos();
                } catch (e) {
                    toast(e.message);
                }
            });
        };

        drawPhotos();

        $('#quickStatus').onchange = async e => {
            try {
                await send('/orders/' + id + '/status', 'PATCH', { status: e.target.value });
                o.status = e.target.value;
                toast('Status promenjen.');
                refresh();
            } catch (err) {
                toast(err.message);
            }
        };

        $('#orderPdf').onclick = () => download('/orders/' + id + '/pdf', o.order_number + '.pdf');

        $('#uploadPhotos').onclick = async () => {
            let files = $('#photoInput').files;
            if (!files.length) return toast('Izaberite fotografije.');
            let form = new FormData();
            for (let f of files) form.append('photos', f);
            const btn = $('#uploadPhotos');
            btn.disabled = true;
            btn.textContent = 'Slanje…';
            try {
                await api('/orders/' + id + '/photos', { method: 'POST', body: form });
                toast('Fotografije su sačuvane.');
                viewOrder(id);
            } catch (e) {
                toast(e.message);
                btn.disabled = false;
                btn.textContent = 'Dodaj fotografije';
            }
        };

        $('#deleteOrder').onclick = async () => {
            if (!confirm('Trajno obrisati ovaj radni nalog i fotografije?')) return;
            try {
                await api('/orders/' + id, { method: 'DELETE' });
                closeModal();
                refresh();
            } catch (e) {
                toast(e.message);
            }
        };

        $('#editOrder').onclick = () => orderForm(o);
        $('#dupOrder').onclick = () => orderForm({ ...o, id: undefined, order_number: undefined, date: today(), status: 'done', mileage: null, complaint: '', dtc_codes: '', next_service_date: null, next_service_km: null });
        $('#doneOrder').onclick = closeModal;
    } catch (e) {
        toast(e.message);
    }
}

function ranking(items) {
    if (!items.length) return '<div class="empty">Nema podataka.</div>';
    let max = Math.max(...items.map(x => x.count));
    return items.map(x => 
        `<div class="barrow"><span>${esc(x.name)}</span><div class="bar" style="width:${Math.max(3, Math.round(x.count / max * 55))}%"></div><b>${x.count}</b></div>`
    ).join('');
}

async function statsPage(range = null) {
    if (!range) {
        if (state.period === 'monthSelect' && state.statsMonth) {
            let [year, month] = state.statsMonth.split('-').map(Number);
            let lastDay = new Date(year, month, 0).getDate();
            range = {
                from: `${year}-${String(month).padStart(2, '0')}-01`,
                to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            };
        } else {
            range = periodRange(state.period);
        }
    }

    let q = '?from=' + range.from + '&to=' + range.to,
        s = await api('/stats' + q);
    state.firstDate = s.firstDate || '';
        
    $('#content').innerHTML = 
        `<div class="panel"><h3>Izaberite period</h3>${dateControls(null, state.period)}</div>` +
        `<div class="statsGrid">` +
        statCard('Naplaćeno', fmt(s.totals.charged), 'accent') +
        statCard('Potrošeno', fmt(s.totals.spent), 'negative') +
        statCard('Razlika', fmt(s.totals.difference), s.totals.difference < 0 ? 'negative' : 'positive') +
        statCard('Broj naloga', s.totals.count) +
        statCard('Prosečno naplaćeno', fmt(s.totals.average)) +
        `</div>` +
        `<section class="panel"><h3>Finansijsko kretanje</h3>${chart(s.trend)}</section>` +
        `<div class="twoCol">` +
        `<section class="panel"><h3>Najčešće servisirane marke</h3>${ranking(s.makes)}</section>` +
        `<section class="panel"><h3>Najaktivniji klijenti</h3>${ranking(s.active)}</section>` +
        `</div>` +
        `<section class="panel"><h3>Najčešći kodovi grešaka</h3>${ranking(s.dtc)}</section>` +
        `<div class="toolbar"><span class="subtle">Izveštaj za period ${fd(range.from)} – ${fd(range.to)}</span>` +
        `<div class="filters"><button class="secondary" id="exportCsv">Izvoz CSV</button><button class="primary" id="exportPdf">Izvoz PDF</button></div></div>`;
        
    wirePeriod(statsPage);
    $('#exportCsv').onclick = () => download('/export.csv' + q, 'autodesk-izvestaj.csv');
    $('#exportPdf').onclick = () => download('/export.pdf' + q, 'autodesk-izvestaj.pdf');
}

async function download(url, name) {
    try {
        if (/^\/export\.pdf(?:\?|$)|^\/orders\/\d+\/pdf(?:\?|$)|^\/vehicles\/\d+\/history\.pdf(?:\?|$)/.test(url)) {
            AutoDeskPrint.preview(url);
            return;
        }
        const blob = await api(url);
        if (!(blob instanceof Blob)) throw Error('Izvoz nije vratio datoteku.');
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) { toast(e.message); }
}

async function settingsPage() {
    let backupsError = '';
    let [s, backups] = await Promise.all([api('/settings'), api('/backups').catch(e => { backupsError = e.message; return []; })]);
    
    $('#content').innerHTML = 
        `<section class="panel"><h3>Podaci radionice</h3>` +
        `<p class="subtle">Promena između RSD i EUR preračunava sve radne naloge i cene usluga po fiksnom kursu 1 EUR = 120 RSD. Iznosi se zaokružuju na dve decimale. Ostale valute nisu dostupne za konverziju bez definisanog kursa.</p>` +
        `<form id="settingsForm"><div class="formGrid">` +
        field('Naziv radionice', 'workshop_name', s.workshop_name || 'Auto Dijagnostika Lazarević') +
        `<div class="field"><label for="f_currency">Valuta</label><select id="f_currency" name="currency">${['RSD', 'EUR'].map(c => `<option value="${c}" ${c === (s.currency || 'RSD') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
        `<div class="field"><label for="f_date_format">Format datuma</label><select id="f_date_format" name="date_format">${[['DD.MM.YYYY', '13.11.2026'], ['YYYY-MM-DD', '2026-11-13']].map(([v, l]) => `<option value="${v}" ${v === (s.date_format || 'DD.MM.YYYY') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
        `<div class="field"><label for="f_backup_days">Automatska rezervna kopija na svakih</label><select id="f_backup_days" name="backup_days">${[[1, '1 dan'], [7, '7 dana'], [15, '15 dana'], [30, '30 dana']].map(([v, l]) => `<option value="${v}" ${v === (Number(s.backup_days) || 30) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
        textArea('Podaci radionice (adresa, telefon, PIB… – svaki u novom redu, štampa se u zaglavlju PDF-a)', 'workshop_info', s.workshop_info) +
        `</div><div class="formActions"><button class="primary">Sačuvaj podešavanja</button></div></form></section>` +
        `<section class="panel"><h3>Prenos podataka</h3><p class="subtle">Preuzmite kompletnu evidenciju ili uvezite prethodno izvezenu JSON kopiju. Uvoz zamenjuje podatke na svim uređajima.</p><button class="secondary" id="exportAll" type="button">Izvezi JSON</button> <label class="secondary" style="display:inline-block;padding:10px;cursor:pointer">Uvezi JSON<input type="file" id="importAll" accept=".json,application/json" hidden></label></section>` +
        `<section class="panel"><h3>Promena lozinke</h3><form id="pwForm"><div class="formGrid">` +
        field('Trenutna lozinka', 'current', '', 'password', true) + `<div></div>` +
        field('Nova lozinka (min. 6 znakova)', 'next', '', 'password', true) +
        field('Ponovite novu lozinku', 'next2', '', 'password', true) +
        `</div><div class="formActions"><button class="primary">Promeni lozinku</button></div></form></section>` +
        `<section class="panel"><h3>Rezervne kopije</h3>` +
        (backupsError ? `<p class="notice">Rezervne kopije nisu dostupne: ${esc(friendlyError(backupsError))}</p>` : '') +
        `<p class="subtle">Automatska kopija se pravi pri otvaranju aplikacije kada od poslednje prođe izabrani broj dana (podrazumevano 30). Čuva se poslednjih 10 automatskih i do 30 ručnih kopija. Kopije ne sadrže fotografije; za potpunu privatnu kopiju koristite „Izvezi JSON“ iznad.</p>` +
        `<button class="primary" id="backupNow">+ Napravi rezervnu kopiju</button>` +
        `<div id="backupsList" style="margin-top:20px">${backups.map(b => `<div class="toolbar"><span>${esc(new Date(b.ts).toLocaleString('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short' }))} <small class="muted">· ${b.kind === 'auto' ? 'automatska' : b.kind === 'pre-restore' ? 'pre vraćanja' : 'ručna'}</small></span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" data-backup="${esc(b.name)}">Preuzmi</button><button class="secondary" data-restore="${esc(b.name)}">Vrati</button><button class="danger" data-delbackup="${esc(b.name)}">Obriši</button></span></div>`).join('') || '<p class="muted">Nema rezervnih kopija.</p>'}</div>` +
        `<p class="notice">Sačuvajte preuzetu kopiju na bezbednom mestu. Uvoz kompletne evidencije zamenjuje podatke u oblaku.</p></section>` +
        `<section class="panel"><h3>Mrežni pristup i čuvanje podataka</h3>` +
        `<p class="subtle">Aplikacija je objavljena na GitHub Pages, a podaci se sinhronizuju preko Firebase Firestore baze. Za sinhronizaciju je potreban internet.</p></section>`;
        
    $('#settingsForm').onsubmit = async e => {
        e.preventDefault();
        try {
            const payload = Object.fromEntries(new FormData(e.target).entries());
            if (payload.currency !== s.currency) {
                if (!confirm('Svi postojeći iznosi u radnim nalozima i cenovniku biće trajno preračunati po kursu 1 EUR = 120 RSD. Zaokruživanje može uticati na iznose pri ponovnoj konverziji. Preporučuje se rezervna kopija. Nastaviti?')) return;
                await api('/backups', { method: 'POST' });
                payload.confirm_conversion = true;
            }
            await send('/settings', 'PUT', payload);
            state.currency = payload.currency;
            state.dateFormat = payload.date_format === 'YYYY-MM-DD' ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
            toast('Podešavanja sačuvana. Iznosi i valuta su ažurirani u celoj aplikaciji.');
            await navigate('settings');
        } catch (err) {
            toast(err.message);
        }
    };
    
    $('#exportAll').onclick = async () => { try { const blob=await LocalAPI.exportAll(), u=URL.createObjectURL(blob), a=document.createElement('a'); a.href=u; a.download='autodesk-evidencija.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); } catch(e){toast(e.message);} };
    $('#importAll').onchange = async e => { const file=e.target.files[0]; if(!file || !confirm('Uvoz će zameniti postojeću evidenciju na svim uređajima. Nastaviti?'))return; try { await LocalAPI.restore(file); toast('Podaci su uvezeni.'); await navigate('settings'); }catch(err){toast(err.message);} };
    $('#pwForm').onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target).entries());
        if (f.next !== f.next2) return toast('Nove lozinke se ne poklapaju.');
        try {
            await CloudSync.changePassword(f.current, f.next);
            e.target.reset();
            toast('Lozinka je promenjena.');
        } catch (err) {
            toast(err.message);
        }
    };

    $('#backupNow').onclick = async () => {
        try {
            await api('/backups', { method: 'POST' });
            toast('Rezervna kopija napravljena.');
            settingsPage();
        } catch (e) {
            toast(e.message);
        }
    };
    
    document.querySelectorAll('[data-backup]').forEach(b => b.onclick = () => download('/backups/' + encodeURIComponent(b.dataset.backup), b.dataset.backup + '.json'));
    document.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
        if (!confirm('Vratiti evidenciju iz ove kopije? Trenutno stanje se prvo čuva kao kopija „pre vraćanja“.')) return;
        try {
            await send('/backups/restore', 'POST', { name: b.dataset.restore });
            toast('Evidencija je vraćena iz kopije.');
            await navigate('dashboard');
        } catch (e) { toast(e.message); }
    });
    document.querySelectorAll('[data-delbackup]').forEach(b => b.onclick = async () => {
        if (!confirm('Obrisati ovu rezervnu kopiju?')) return;
        try { await api('/backups/' + encodeURIComponent(b.dataset.delbackup), { method: 'DELETE' }); settingsPage(); } catch (e) { toast(e.message); }
    });
}

function loginScreen() {
    document.body.innerHTML = `<div class="loginWrap"><div class="loginBox"><div class="brand"><img class="brandLogo" src="./slike/logo.png" alt=""><div><strong>Auto Dijagnostika Lazarević</strong><small>Evidencija</small></div></div><h2>Prijava</h2><p>Prijavite se svojim nalogom.</p><form id="loginForm"><div class="field"><label>Email</label><input id="email" type="email" required autocomplete="username"></div><div class="field"><label>Lozinka</label><input id="password" type="password" required autocomplete="current-password"></div><button class="primary">Prijavi se</button></form><p><button type="button" class="secondary" id="resetPw">Zaboravljena lozinka?</button></p><p id="loginError" style="color:var(--red)"></p></div></div>`;
    if (!CloudSync.ready) $('#loginError').textContent = 'Firebase nije dostupan. Proverite internet vezu i osvežite stranicu.';
    $('#resetPw').onclick = async () => {
        try {
            await CloudSync.resetPassword($('#email').value.trim());
            $('#loginError').style.color = 'var(--green)';
            $('#loginError').textContent = 'Poslat je email za postavljanje nove lozinke.';
        } catch (e) { $('#loginError').style.color = 'var(--red)'; $('#loginError').textContent = e.message; }
    };
    $('#loginForm').onsubmit = async e => {
        e.preventDefault();
        try { await CloudSync.login($('#email').value.trim(), $('#password').value); location.reload(); }
        catch (err) { $('#loginError').style.color = 'var(--red)'; $('#loginError').textContent = err.message; }
    };
}

async function init() {
    setBoot('Provera prijave…');
    const current=await CloudSync.waitForAuth();
    if (!current || current.uid!==window.AUTODESK_FIREBASE_CONFIG.ownerUid) {
        clearBootTimers();
        loginScreen();
        return;
    }
    setBoot('Učitavanje podataka…');
    const updateDateTime = () => {
        $('#today').textContent = new Date().toLocaleString('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    updateDateTime();
    setInterval(updateDateTime, 30000);

    $('#quickOrder').onclick = async () => {
        try {
            await loadBase();
            orderForm();
        } catch (e) {
            toast(e.message);
        }
    };
    
    $('#logout').onclick = async () => {
        await CloudSync.logout();
        location.reload();
    };
    
    const menuBtn = $('#menuBtn');
    const sidebar = $('#sidebar');
    const menuBackdrop = $('#menuBackdrop');
    menuBtn.onclick = () => setMenuOpen(!sidebar.classList.contains('open'));
    menuBackdrop.onclick = () => setMenuOpen(false);
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!$('#modal').classList.contains('hidden')) { if (!$('#editForm')) closeModal(); }
        else if (sidebar.classList.contains('open')) setMenuOpen(false);
    });
    history.replaceState({ page: 'dashboard' }, '');
    window.addEventListener('popstate', onPopState);
    await navigate('dashboard');
    hideBoot();
    
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    
    LocalAPI.autoBackup().catch(e => console.warn('Automatska kopija nije napravljena:', e.message));

    // Povremena provera oblaka (jedno čitanje) i prikaz stanja veze.
    setInterval(async () => { try { await api('/settings'); } catch (e) { /* stanje se prikazuje ispod */ } syncStatus(); }, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') LocalAPI.refresh().then(syncStatus, syncStatus);
    });
}

init().catch(bootFail);
