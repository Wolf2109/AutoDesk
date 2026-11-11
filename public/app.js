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
    token: sessionStorage.getItem('autodesk_token') || '',
    stats: null,
    filters: {},
    period: 'month',
    currency: 'RSD'
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
    let d = new Date();
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
    ].join('-');
};

const currencies = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM', 'HRK', 'MKD'];

const fmt = n => new Intl.NumberFormat('sr-RS', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
}).format((Number(n) || 0) / 100) + ' ' + state.currency;

const moneyLabel = label => label + ' (' + state.currency + ')';
const dec = n => (Number(n || 0) / 100).toFixed(2);

const toast = m => {
    let el = $('#toast');
    el.textContent = m;
    el.style.display = 'block';
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => el.style.display = 'none', 4200);
};

async function api(url, opt = {}) {
    let headers = { ...(opt.headers || {}) };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    if (opt.body && !(opt.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    
    let res;
    try {
        res = await fetch('/api' + url, { ...opt, headers, cache: 'no-store' });
    } catch (e) {
        throw Error('Server nije dostupan. Podaci nisu sačuvani.');
    }
    
    if (res.status === 401 && url !== '/auth/login') {
        state.token = '';
        sessionStorage.removeItem('autodesk_token');
        loginScreen();
        throw Error('Sesija je istekla.');
    }
    
    if (!res.ok) {
        let data = await res.json().catch(() => ({}));
        throw Error(data.error || 'Zahtev nije uspeo.');
    }
    
    return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.blob();
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
    
    return `<div class="chips" id="periodChips">${options.map(([v, l]) => 
        `<button class="chip ${initial === v ? 'active' : ''}" data-period="${v}">${l}</button>`
    ).join('')}</div>` +
    `<div id="customDates" style="display:${initial === 'custom' ? 'flex' : 'none'};gap:8px;margin-top:12px">` +
    `<input type="date" id="fromDate" value="${today()}">` +
    `<input type="date" id="toDate" value="${today()}">` +
    `<button class="secondary" id="applyDates">Primeni</button></div>`;
}

function wirePeriod(callback) {
    document.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
        state.period = b.dataset.period;
        if (state.period === 'custom') {
            $('#customDates').style.display = 'flex';
            document.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === b));
        } else {
            callback(periodRange(state.period));
        }
    });
    $('#applyDates').onclick = () => callback({ from: $('#fromDate').value, to: $('#toDate').value });
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
        `</svg><div class="legend"><span><i class="dot gold"></i>Naplaćeno</span><span><i class="dot red"></i>Potrošeno</span><em>${esc(data[0].date)} — ${esc(data[data.length - 1].date)}</em></div>`;
}

function ordersTable(rows) {
    return `<div class="tableWrap"><table><thead><tr>` +
        `<th>Nalog</th><th>Klijent / Vozilo</th><th>Opis</th><th>Potrošeno</th><th>Naplaćeno</th><th>Razlika</th><th></th>` +
        `</tr></thead><tbody>${rows.map(o => `<tr>` +
        `<td><strong>${esc(o.order_number)}</strong><small>${esc(o.date)}</small></td>` +
        `<td>${esc(o.client_name)}<small>${esc(o.vehicle_name)}</small></td>` +
        `<td>${esc(o.description).slice(0, 85)}</td>` +
        `<td>${fmt(o.spent_amount)}</td>` +
        `<td>${fmt(o.charged_amount)}</td>` +
        `<td class="${o.difference < 0 ? 'negativeText' : 'positiveText'}">${fmt(o.difference)}</td>` +
        `<td><button class="linkBtn" data-view="${o.id}">Detalji</button></td>` +
        `</tr>`).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">Nema radnih naloga.</div>'}</div>`;
}

function wireOrderViews() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewOrder(+b.dataset.view));
}

async function dashboard() {
    let d = today(), month = d.slice(0, 7) + '-01';
    let [day, mon] = await Promise.all([
        api('/stats?from=' + d + '&to=' + d),
        api('/stats?from=' + month + '&to=' + d)
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
            `${type === 'clients' || type === 'vehicles' ? ` <button class="linkBtn" data-history="${x.id}">Istorija</button>` : ''}</td></tr>`;
    }).join('');
}

async function listPage(type, params = {}) {
    let isOrder = type === 'orders',
        name = type === 'clients' ? 'klijenta' : type === 'vehicles' ? 'vozilo' : type === 'services' ? 'uslugu' : 'radni nalog';
    
    let url = '/' + type, query = new URLSearchParams();
    for (let [k, v] of Object.entries(params)) if (v && k !== 'search') query.set(k, v);
    
    let rows = await api(url + (query.size ? '?' + query : ''));
    state[type] = rows;

    let hasActiveFilters = isOrder && (params.from || params.to || params.client_id || params.vehicle_id);
    
    let clientsOptions = state.clients.map(c => `<option value="${c.id}" ${String(params.client_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    let vehiclesOptions = state.vehicles.map(v => `<option value="${v.id}" ${String(params.vehicle_id) === String(v.id) ? 'selected' : ''}>${esc(v.make + ' ' + v.model + ' ' + (v.registration || ''))}</option>`).join('');

    let filtersHtml = isOrder ? `
        <div class="panel" id="filtersPanel" style="display: ${hasActiveFilters ? 'block' : 'none'}; margin-bottom: 16px;">
            <div class="filters">
                <input type="date" id="orderFrom" value="${esc(params.from || '')}">
                <input type="date" id="orderTo" value="${esc(params.to || '')}">
                <select id="orderClient"><option value="">Svi klijenti</option>${clientsOptions}</select>
                <select id="orderVehicle"><option value="">Sva vozila</option>${vehiclesOptions}</select>
                <button class="secondary" id="filterOrders">Filtriraj</button>
                <button class="ghost" id="resetOrders">Poništi</button>
            </div>
        </div>` : '';

    let searchValue = params.search || '';

    let contentHtml = `
        <div class="toolbar">
            <div class="search-wrapper">
                <input class="search" id="searchInput" placeholder="Pretraži ${isOrder ? 'naloge, klijente, vozila...' : '...'}..." value="${esc(searchValue)}">
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
            search: searchInput.value
        });
        
        $('#resetOrders').onclick = () => listPage(type);
    } else {
        document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => entityForm(type, rows.find(x => x.id === +b.dataset.edit)));
        document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => removeEntity(type, +b.dataset.delete));
        document.querySelectorAll('[data-history]').forEach(b => b.onclick = () => {
            navigate('orders').then(() => listPage('orders', { [type === 'clients' ? 'client_id' : 'vehicle_id']: b.dataset.history }));
        });
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
    
    formShell(fields, b => send('/' + type + (item.id ? '/' + item.id : ''), item.id ? 'PUT' : 'POST', b));
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
    let clients = state.clients.map(x => ({ id: x.id, label: x.name }));
    let vehicles = state.vehicles.filter(x => !item.client_id || x.client_id === item.client_id)
        .map(x => ({ id: x.id, label: x.make + ' ' + x.model + ' · ' + (x.registration || 'bez registracije') }));
        
    let fields = field('Datum', 'date', item.date || today(), 'date', true) +
        selectField('Klijent', 'client_id', clients, item.client_id) +
        selectField('Vozilo', 'vehicle_id', vehicles, item.vehicle_id) +
        textArea('Opis izvršenog posla *', 'description', item.description) +
        textArea('Napomena', 'notes', item.notes) +
        `<div class="full moneyFields"><h3>Finansijska evidencija</h3><div class="formGrid">` +
        field(moneyLabel('POTROŠENO'), 'spent_amount', dec(item.spent_amount), 'number', true) +
        field(moneyLabel('NAPLAĆENO'), 'charged_amount', dec(item.charged_amount), 'number', true) +
        `</div><div class="difference" id="liveDiff">Razlika: ${fmt((item.charged_amount || 0) - (item.spent_amount || 0))}</div>` +
        `<p class="subtle">Naplaćeno unosite slobodno, nezavisno od cenovnika.</p></div>`;
        
    formShell(fields, b => {
        if (!b.description.trim()) throw Error('Opis posla je obavezan.');
        return send('/orders' + (item.id ? '/' + item.id : ''), item.id ? 'PUT' : 'POST', b);
    });
    
    $('#f_client_id').onchange = e => {
        let options = state.vehicles.filter(v => v.client_id === +e.target.value);
        $('#f_vehicle_id').innerHTML = '<option value="">Izaberite vozilo</option>' +
            options.map(v => `<option value="${v.id}">${esc(v.make + ' ' + v.model + ' ' + v.registration)}</option>`).join('');
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
        modal('Radni nalog ' + o.order_number, 
            `<div class="summaryRow">` +
            `<div><span class="muted">Datum</span><h3>${esc(o.date)}</h3></div>` +
            `<div><span class="muted">Klijent</span><h3>${esc(o.client_name)}</h3></div>` +
            `<div><span class="muted">Vozilo</span><h3>${esc(o.vehicle_name)}</h3></div>` +
            `</div>` +
            `<h3>Izvršeni posao</h3><p>${esc(o.description)}</p>` +
            `<p class="subtle">${esc(o.notes || 'Bez napomene')}</p>` +
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

async function statsPage(range = periodRange(state.period)) {
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
        `<div class="toolbar"><span class="subtle">Izveštaj za period ${range.from} – ${range.to}</span>` +
        `<div class="filters"><button class="secondary" id="exportCsv">Izvoz CSV</button><button class="primary" id="exportPdf">Izvoz PDF</button></div></div>`;
        
    wirePeriod(statsPage);
    $('#exportCsv').onclick = () => download('/export.csv' + q, 'autodesk-report.csv');
    $('#exportPdf').onclick = () => download('/export.pdf' + q, 'autodesk-report.pdf');
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
        field('Format datuma', 'date_format', s.date_format || 'DD.MM.YYYY') +
        textArea('Podaci radionice', 'workshop_info', s.workshop_info) +
        `</div><div class="formActions"><button class="primary">Sačuvaj podešavanja</button></div></form></section>` +
        `<section class="panel"><h3>Rezervne kopije</h3>` +
        `<p class="subtle">Kopije SQLite baze čuvaju se na Windows računaru. Fotografije se čuvaju odvojeno u data/uploads i treba ih posebno kopirati.</p>` +
        `<button class="primary" id="backupNow">+ Napravi rezervnu kopiju</button>` +
        `<div id="backupsList" style="margin-top:20px">${backups.map(n => `<div class="toolbar"><span>${esc(n)}</span><button class="secondary" data-backup="${esc(n)}">Preuzmi</button></div>`).join('') || '<p class="muted">Nema rezervnih kopija.</p>'}</div>` +
        `<p class="notice">Vraćanje kopije radi bezbednosti obavljajte sa zaustavljenim serverom, pomoću restore-backup.bat.</p></section>` +
        `<section class="panel"><h3>Mrežni pristup i čuvanje podataka</h3>` +
        `<p class="subtle">Server: port 3000 (podrazumevano). Podaci: folder data na Windows računaru. Promena lokacije i porta vrši se kroz AUTODESK_DATA i PORT u Windows skripti. Android uređaj mora biti na istoj Wi-Fi mreži. Za instalaciju PWA na Android potreban je HTTPS ili pouzdano lokalno okruženje.</p></section>`;
        
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
            toast('Podešavanja sačuvana. Iznosi i valuta su ažurirani u celoj aplikaciji.');
            await navigate('settings');
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
    document.body.innerHTML = 
        `<div class="loginWrap"><div class="loginBox"><div class="brand"><span class="brand-mark">A<span>.</span></span>` +
        `<div><strong>AUTODESK</strong><small>WORKSHOP MANAGER</small></div></div>` +
        `<h2 id="loginTitle">Prijava</h2><p id="loginHelp">Unesite lozinku za pristup evidenciji radionice.</p>` +
        `<form id="loginForm"><div class="field"><label>Lozinka</label><input id="password" type="password" minlength="6" required autocomplete="current-password"></div>` +
        `<button class="primary" id="loginSubmit">Prijavi se</button></form><p id="loginError" style="color:var(--red)"></p></div></div>`;
        
    api('/auth/status').then(s => {
        if (!s.setup) {
            $('#loginTitle').textContent = 'Prvo pokretanje';
            $('#loginHelp').textContent = 'Kreirajte lozinku (najmanje 6 znakova) za zaštitu aplikacije.';
        }
        $('#loginForm').onsubmit = async e => {
            e.preventDefault();
            let password = $('#password').value;
            try {
                if (!s.setup) await send('/auth/setup', 'POST', { password });
                let a = await send('/auth/login', 'POST', { password });
                state.token = a.token;
                sessionStorage.setItem('autodesk_token', a.token);
                location.reload();
            } catch (err) {
                $('#loginError').textContent = err.message;
            }
        };
    }).catch(e => $('#loginError').textContent = e.message);
}

async function init() {
    if (!state.token) {
        loginScreen();
        return;
    }
    $('#today').textContent = new Date().toLocaleDateString('sr-RS', { day: 'numeric', month: 'long', year: 'numeric' });
    
    $('#quickOrder').onclick = async () => {
        try {
            await loadBase();
            orderForm();
        } catch (e) {
            toast(e.message);
        }
    };
    
    $('#logout').onclick = async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        sessionStorage.removeItem('autodesk_token');
        location.reload();
    };
    
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    await navigate('dashboard');
    
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    
    setInterval(async () => {
        try {
            await api('/health');
            $('#serverDot').style.color = '#35C879';
        } catch (e) {
            $('#serverDot').style.color = '#E34B4B';
            toast('Veza sa serverom je prekinuta. Unosi nisu sačuvani.');
        }
    }, 60000);
}

init();