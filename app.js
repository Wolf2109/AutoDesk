'use strict';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

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
    dateFormat: 'DD.MM.YYYY'
};

const navItems = [
    ['dashboard', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>', 'Dashboard'],
    ['orders', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"/><path d="M8 5.5H6a2 2 0 00-2 2V19a2 2 0 002 2h12a2 2 0 002-2V7.5a2 2 0 00-2-2h-2"/><path d="M8 12h8M8 16h5"/></svg>', 'Radni nalozi'],
    ['clients', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>', 'Klijenti'],
    ['vehicles', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16l1.5-5.5A2 2 0 018.4 9h7.2a2 2 0 011.9 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/></svg>', 'Vozila'],
    ['services', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>', 'Cenovnik'],
    ['stats', '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>', 'Statistika'],
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
const badge = s => `<span class="badge ${STATUS[s]?.[1] || 'muted'}">${STATUS[s]?.[0] || ''}</span>`;

const toast = m => {
    let el = $('#toast');
    el.textContent = m;
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

async function navigate(page) {
    state.page = page;
    $('#sidebar')?.classList.remove('open');
    renderNav();
    $('#pageTitle').textContent = navItems.find(x => x[0] === page)?.[2] || 'AutoDesk';
    
    try {
        let settings = await api('/settings');
        state.currency = currencies.includes(settings.currency) ? settings.currency : 'RSD';
        state.dateFormat = settings.date_format === 'YYYY-MM-DD' ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
        const brand = document.querySelector('#sidebar .brand strong');
        if (brand && settings.workshop_name) brand.textContent = settings.workshop_name;
        await loadBase();
        
        if (page === 'dashboard') await dashboard();
        else if (page === 'orders') await listPage('orders');
        else if (['clients', 'vehicles', 'services'].includes(page)) await listPage(page);
        else if (page === 'stats') await statsPage();
        else if (page === 'settings') await settingsPage();
    } catch (e) {
        toast(e.message);
    }
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
    for (let y = current.getFullYear(); y > 2025; y--) {
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
    let W = 800, H = 240, px = 12, py = 24, base = H - py,
        max = Math.max(1, ...data.flatMap(x => [x.spent, x.charged])),
        xy = key => data.map((x, i) => [px + i * (W - 2 * px) / Math.max(1, data.length - 1), base - (x[key] / max) * (H - 2 * py)]),
        line = key => xy(key).map(p => p.join(',')).join(' '),
        c = xy('charged'),
        area = `${c[0][0]},${base} ${line('charged')} ${c[c.length - 1][0]},${base}`,
        grid = [0, .33, .66, 1].map(f => `<line x1="${px}" x2="${W - px}" y1="${py + f * (H - 2 * py)}" y2="${py + f * (H - 2 * py)}"/>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafikon naplaćenog i potrošenog">` +
        `<defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB81C" stop-opacity=".38"/><stop offset="1" stop-color="#FFB81C" stop-opacity="0"/></linearGradient></defs>` +
        grid + `<polygon points="${area}" fill="url(#gArea)" stroke="none"/>` +
        `<polyline points="${line('charged')}" fill="none" stroke="#FFB81C"/>` +
        `<polyline points="${line('spent')}" fill="none" stroke="#FF6B6B" stroke-dasharray="6 6"/>` +
        `</svg><div class="legend"><span><i class="dot gold"></i>Naplaćeno</span><span><i class="dot red"></i>Potrošeno</span><em>${esc(fd(data[0].date))} — ${esc(fd(data[data.length - 1].date))}</em></div>`;
}

function ordersTable(rows) {
    return `<div class="tableWrap"><table><thead><tr>` +
        `<th>Nalog</th><th>Klijent / Vozilo</th><th>Opis</th><th>Potrošeno</th><th>Naplaćeno</th><th>Razlika</th><th></th>` +
        `</tr></thead><tbody>${rows.map(o => `<tr>` +
        `<td><strong>${esc(o.order_number)}</strong><small>${esc(fd(o.date))}</small>${badge(o.status)}</td>` +
        `<td>${esc(o.client_name)}<small>${esc(o.vehicle_name)}</small></td>` +
        `<td>${esc(o.description.length > 85 ? o.description.slice(0, 85) + '…' : o.description)}${o.dtc_codes ? `<small>${esc(o.dtc_codes)}</small>` : ''}</td>` +
        `<td>${fmt(o.spent_amount)}</td>` +
        `<td>${fmt(o.charged_amount)}</td>` +
        `<td class="${o.difference < 0 ? 'negativeText' : 'positiveText'}">${fmt(o.difference)}</td>` +
        `<td><button class="linkBtn" data-view="${o.id}">Detalji</button></td>` +
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
    return `<div class="remRow"><div><strong>${esc(x.vehicle_name)}</strong><small>${esc([x.registration, x.client_name, x.phone].filter(Boolean).join(' · '))}</small></div>` +
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

    $('#refreshDash').onclick = dashboard;
    $('#dashboardNew').onclick = () => orderForm();
    wireOrderViews();
}

const tableColumns = {
    clients: ['Ime i prezime', 'Telefon', 'Email', ''],
    vehicles: ['Vozilo', 'Klijent', 'Registracija', 'VIN', ''],
    services: ['Usluga', 'Cena', '']
};

function entityRows(type, rows) {
    return rows.map(x => {
        let vals = type === 'clients' ? [x.name, x.phone, x.email] :
                   type === 'vehicles' ? [x.make + ' ' + x.model, state.clients.find(c => c.id === x.client_id)?.name || '', x.registration, x.vin] :
                   [x.name, fmt(x.price_amount)];
                   
        return `<tr>${vals.map(v => `<td>${esc(v)}</td>`).join('')}` +
            `<td><button class="linkBtn" data-edit="${x.id}">Izmeni</button> ` +
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
    
    let rows = await api(url + (query.size ? '?' + query : ''));
    state[type] = rows;

    let hasActiveFilters = isOrder && (params.from || params.to || params.client_id || params.vehicle_id || params.status);
    
    let clientsOptions = state.clients.map(c => `<option value="${c.id}" ${String(params.client_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    let vehiclesOptions = state.vehicles.map(v => `<option value="${v.id}" ${String(params.vehicle_id) === String(v.id) ? 'selected' : ''}>${esc(v.make + ' ' + v.model + ' ' + (v.registration || ''))}</option>`).join('');

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
                ${isOrder ? `<button class="secondary" id="toggleFiltersBtn">⚙️ Filteri ${hasActiveFilters ? '(aktivni)' : ''}</button>` : ''}
                <button class="primary" id="addEntity">+ Dodaj ${name}</button>
            </div>
        </div>
        ${filtersHtml}
        <section class="panel" id="tableContainer">
            <!-- Dinamički prikaz tabele u realnom vremenu -->
        </section>
    `;

    $('#content').innerHTML = contentHtml;

    // Funkcija za instant filtriranje u memoriji (Real-time)
    const renderTable = (searchQuery) => {
        let q = searchQuery.toLowerCase().trim();
        let filtered = rows;

        if (q) {
            filtered = rows.filter(item => {
                if (isOrder) {
                    return (item.order_number && item.order_number.toLowerCase().includes(q)) ||
                           (item.client_name && item.client_name.toLowerCase().includes(q)) ||
                           (item.vehicle_name && item.vehicle_name.toLowerCase().includes(q)) ||
                           (item.description && item.description.toLowerCase().includes(q)) ||
                           (item.notes && item.notes.toLowerCase().includes(q));
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

        $('#tableContainer').innerHTML = isOrder ? 
            ordersTable(filtered) : 
            `<div class="tableWrap"><table><thead><tr>${tableColumns[type].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${entityRows(type, filtered)}</tbody></table>${filtered.length ? '' : '<div class="empty">Nema unetih podataka.</div>'}</div>`;

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

    // Incijalno iscrtavanje tabele
    renderTable(searchValue);

    $('#addEntity').onclick = () => isOrder ? orderForm() : entityForm(type);

    const searchInput = $('#searchInput');

    // Real-time kucanje (odmah reaguje bez refresha)
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
}

function closeModal() {
    $('#modal').classList.add('hidden');
}

$('#closeModal').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

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
            await navigate(state.page);
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
        fields = selectField('Klijent', 'client_id', state.clients.map(x => ({ id: x.id, label: x.name })), item.client_id) +
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
        .map(x => ({ id: x.id, label: x.make + ' ' + x.model + ' · ' + (x.registration || 'bez registracije') }));
    let statuses = Object.entries(STATUS).map(([k, [l]]) => ({ id: k, label: l }));

    let fields = field('Datum', 'date', item.date || today(), 'date', true) +
        selectField('Status', 'status', statuses, item.status || 'done') +
        selectField('Klijent', 'client_id', clients, item.client_id) +
        selectField('Vozilo', 'vehicle_id', vehicles, item.vehicle_id) +
        field('Kilometraža pri prijemu (km)', 'mileage', item.mileage, 'number') +
        field('Kodovi grešaka (odvojite zarezom)', 'dtc_codes', item.dtc_codes) +
        textArea('Prijavljeni problem', 'complaint', item.complaint) +
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

    $('#f_client_id').onchange = e => {
        let options = state.vehicles.filter(v => v.client_id === +e.target.value);
        $('#f_vehicle_id').innerHTML = '<option value="">Izaberite vozilo</option>' +
            options.map(v => `<option value="${v.id}">${esc(v.make + ' ' + v.model + ' · ' + (v.registration || 'bez registracije'))}</option>`).join('');
    };

    $('#f_vehicle_id').onchange = e => {
        const v = state.vehicles.find(x => x.id === +e.target.value);
        if (v && v.mileage != null && !$('#f_mileage').value) $('#f_mileage').value = v.mileage;
    };

    let update = () => {
        $('#liveDiff').textContent = 'Razlika: ' + fmt(Math.round((Number($('#f_charged_amount').value || 0) - Number($('#f_spent_amount').value || 0)) * 100));
    };

    $('#f_spent_amount').oninput = update;
    $('#f_charged_amount').oninput = update;
}

async function viewOrder(id) {
    try {
        let o = await api('/orders/' + id);
        const text = v => `<p style="white-space:pre-wrap">${esc(v)}</p>`;
        const codes = (o.dtc_codes || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
        modal('Radni nalog ' + o.order_number,
            `<div class="summaryRow">` +
            `<div><span class="muted">Datum</span><h3>${esc(fd(o.date))}</h3></div>` +
            `<div><span class="muted">Klijent</span><h3>${esc(o.client_name)}</h3></div>` +
            `<div><span class="muted">Vozilo</span><h3>${esc(o.vehicle_name)}</h3></div>` +
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
                } catch (e) {}
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
                navigate(state.page);
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
            try {
                await api('/orders/' + id + '/photos', { method: 'POST', body: form });
                toast('Fotografije su sačuvane.');
                viewOrder(id);
            } catch (e) {
                toast(e.message);
            }
        };

        $('#deleteOrder').onclick = async () => {
            if (!confirm('Trajno obrisati ovaj radni nalog i fotografije?')) return;
            try {
                await api('/orders/' + id, { method: 'DELETE' });
                closeModal();
                navigate(state.page);
            } catch (e) {
                toast(e.message);
            }
        };

        $('#editOrder').onclick = () => orderForm(o);
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
        `<div class="toolbar"><span class="subtle">Izveštaj za period ${fd(range.from)} – ${fd(range.to)}</span>` +
        `<div class="filters"><button class="secondary" id="exportCsv">Izvoz CSV</button><button class="primary" id="exportPdf">Izvoz PDF</button></div></div>`;
        
    wirePeriod(statsPage);
    $('#exportCsv').onclick = () => download('/export.csv' + q, 'autodesk-report.csv');
    $('#exportPdf').onclick = () => download('/export.pdf' + q, 'autodesk-izvestaj.pdf');
}

async function download(url, name) {
    try {
        let blob = await api(url),
            a = document.createElement('a'),
            href = URL.createObjectURL(blob);
        a.href = href;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
        toast(e.message);
    }
}

async function settingsPage() {
    let [s, backups] = await Promise.all([api('/settings'), api('/backups')]);
    
    $('#content').innerHTML = 
        `<section class="panel"><h3>Podaci radionice</h3>` +
        `<p class="subtle">Promena između RSD i EUR preračunava sve radne naloge i cene usluga po fiksnom kursu 1 EUR = 120 RSD. Iznosi se zaokružuju na dve decimale. Ostale valute nisu dostupne za konverziju bez definisanog kursa.</p>` +
        `<form id="settingsForm"><div class="formGrid">` +
        field('Naziv radionice', 'workshop_name', s.workshop_name || 'AutoDesk') +
        `<div class="field"><label for="f_currency">Valuta</label><select id="f_currency" name="currency">${['RSD', 'EUR'].map(c => `<option value="${c}" ${c === (s.currency || 'RSD') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
        `<div class="field"><label for="f_date_format">Format datuma</label><select id="f_date_format" name="date_format">${[['DD.MM.YYYY', '13.11.2026'], ['YYYY-MM-DD', '2026-11-13']].map(([v, l]) => `<option value="${v}" ${v === (s.date_format || 'DD.MM.YYYY') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
        textArea('Podaci radionice (adresa, telefon, PIB… – svaki u novom redu, štampa se u zaglavlju PDF-a)', 'workshop_info', s.workshop_info) +
        `</div><div class="formActions"><button class="primary">Sačuvaj podešavanja</button></div></form></section>` +
        `<section class="panel"><h3>Prenos podataka</h3><p class="subtle">Preuzmite kompletnu evidenciju ili uvezite prethodno izvezenu JSON kopiju. Uvoz zamenjuje podatke na svim uređajima.</p><button class="secondary" id="exportAll" type="button">Izvezi JSON</button> <label class="secondary" style="display:inline-block;padding:10px;cursor:pointer">Uvezi JSON<input type="file" id="importAll" accept=".json,application/json" hidden></label></section>` +
        `<section class="panel"><h3>Promena lozinke</h3><form id="pwForm"><div class="formGrid">` +
        field('Trenutna lozinka', 'current', '', 'password', true) + `<div></div>` +
        field('Nova lozinka (min. 6 znakova)', 'next', '', 'password', true) +
        field('Ponovite novu lozinku', 'next2', '', 'password', true) +
        `</div><div class="formActions"><button class="primary">Promeni lozinku</button></div></form></section>` +
        `<section class="panel"><h3>Rezervne kopije</h3>` +
        `<p class="subtle">Rezervne kopije se čuvaju u Firebase evidenciji. Redovno preuzimajte i privatnu kopiju podataka.</p>` +
        `<button class="primary" id="backupNow">+ Napravi rezervnu kopiju</button>` +
        `<div id="backupsList" style="margin-top:20px">${backups.map(n => `<div class="toolbar"><span>${esc(n)}</span><button class="secondary" data-backup="${esc(n)}">Preuzmi</button></div>`).join('') || '<p class="muted">Nema rezervnih kopija.</p>'}</div>` +
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
    
    document.querySelectorAll('[data-backup]').forEach(b => b.onclick = () => download('/backups/' + encodeURIComponent(b.dataset.backup), b.dataset.backup));
}

function loginScreen() {
    document.body.innerHTML = `<div class="loginWrap"><div class="loginBox"><div class="brand"><div><strong>Auto Dijagnostika Lazarević</strong><small>Kontrolna tabla</small></div></div><h2>Prijava</h2><p>Prijavite se svojim Firebase nalogom.</p><form id="loginForm"><div class="field"><label>Email</label><input id="email" type="email" required autocomplete="username"></div><div class="field"><label>Lozinka</label><input id="password" type="password" required autocomplete="current-password"></div><button class="primary">Prijavi se</button></form><p><button type="button" class="secondary" id="verifyOwner">Pošalji potvrdu emaila</button></p><p id="loginError" style="color:var(--red)"></p></div></div>`;
    if(!CloudSync.ready) $('#loginError').textContent='Prvo popunite firebase-config.js prema UPUTSTVO.md.';
    $('#email').value='';
    $('#verifyOwner').onclick=async()=>{try{await CloudSync.resend($('#email').value.trim(),$('#password').value);$('#loginError').textContent='Poslat je email za potvrdu.';}catch(e){$('#loginError').textContent=e.message;}};
    $('#loginForm').onsubmit=async e=>{e.preventDefault();try{await CloudSync.login($('#email').value.trim(),$('#password').value);location.reload();}catch(err){$('#loginError').textContent=err.message;}};
}

async function init() {
    const current=await CloudSync.waitForAuth();
    if (!current || current.uid!==window.AUTODESK_FIREBASE_CONFIG.ownerUid) {
        loginScreen();
        return;
    }
    const updateDateTime = () => {
    $('#today').textContent = new Date().toLocaleString('sr-Latn-RS', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

updateDateTime();
setInterval(updateDateTime, 1000);
    
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
        sessionStorage.removeItem('autodesk_token');
        location.reload();
    };
    
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    await navigate('dashboard');
    
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    
    setInterval(async () => {
        try {
            await api('/health');
            $('#serverDot').style.color = '#35C879';
        } catch (e) {
            $('#serverDot').style.color = '#E34B4B';
            toast('Sinhronizacija nije dostupna. Proverite internet vezu.');
        }
    }, 60000);
}

init();