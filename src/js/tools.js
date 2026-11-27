'use strict';
/*
 * Alati — evidencija uređaja i rokova licenci (zasebna celina, isti privatni koren kao Gorivo).
 * Podaci: autodesk_private/{uid}/tools/{id} ->
 *   { name, model, serial, license, activated, expires, price, notes }
 * expires prazan = trajna licenca (bez roka).
 */
const ToolsTracker = (() => {
    const SOON = 30;                          // „uskoro ističe“ = u narednih 30 dana
    const st = { all: [], filter: 'all', q: '' };

    const col = () => CloudSync.privateRoot().collection('tools');
    const fdate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
    const rsd = n => new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + ' RSD';

    /** Broj dana do isteka (negativno = isteklo, null = trajna licenca). */
    function daysLeft(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return null;
        const t = new Date(); t.setHours(0, 0, 0, 0);
        return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - t) / 86400000);
    }
    function status(e) {
        const d = daysLeft(e.expires);
        if (d === null) return { key: 'perm', cls: 'muted', label: 'Trajna licenca', note: '' };
        if (d < 0) return { key: 'expired', cls: 'bad', label: 'Istekla', note: `pre ${-d} ${-d === 1 ? 'dan' : 'dana'}` };
        if (d === 0) return { key: 'soon', cls: 'warn', label: 'Ističe danas', note: 'danas' };
        if (d <= SOON) return { key: 'soon', cls: 'warn', label: 'Ističe uskoro', note: `za ${d} ${d === 1 ? 'dan' : 'dana'}` };
        return { key: 'ok', cls: 'ok', label: 'Važi', note: d >= 365 ? `još ${(d / 365).toFixed(1).replace('.', ',')} god.` : `za ${d} dana` };
    }
    const order = e => { const d = daysLeft(e.expires); return d === null ? 1e9 : d; };

    /** Broj licenci koje su istekle ili uskoro ističu (za značku u meniju). */
    function alertCount() {
        try { return (PrivateCache.load().tools || []).filter(e => ['expired', 'soon'].includes(status(e).key)).length; }
        catch (e) { return 0; }
    }

    async function render() {
        await PrivateCache.ensureFirst('tools');
        st.all = PrivateCache.load().tools.slice().sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
        const cnt = k => st.all.filter(e => status(e).key === k).length;
        const q = st.q.trim().toLowerCase();
        const list = st.all.filter(e => (st.filter === 'all' || status(e).key === st.filter) &&
            (!q || [e.name, e.model, e.serial, e.license, e.notes].some(v => String(v || '').toLowerCase().includes(q))));
        const tab = (k, label, n) => `<button class="${st.filter === k ? 'active' : ''}" data-tf="${k}">${label}${n !== undefined ? ` (${n})` : ''}</button>`;

        prepareContentMotion('tools', true);
        $('#content').innerHTML = `
            ${PrivateCache.bar('tools')}
            <div class="toolbar">
                <div class="subtle" style="align-self:center">Uređaji i rokovi licenci</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="secondary" id="tlExport" ${st.all.length ? '' : 'disabled'}>Izvezi JSON</button>
                    <button class="primary" id="tlAdd">+ Novi uređaj</button>
                </div>
            </div>
            <div class="statsGrid tlStats">
                ${statCard('Uređaja', st.all.length, '', 'u evidenciji')}
                ${statCard('Važe', cnt('ok') + cnt('perm'), 'positive', 'licence u roku')}
                ${statCard('Ističu uskoro', cnt('soon'), cnt('soon') ? 'accent' : '', `u narednih ${SOON} dana`)}
                ${statCard('Istekle', cnt('expired'), cnt('expired') ? 'negative' : '', 'potrebno obnoviti')}
            </div>
            <div class="pvTabs">
                ${tab('all', 'Svi', st.all.length)}${tab('expired', 'Istekle', cnt('expired'))}${tab('soon', 'Ističu uskoro', cnt('soon'))}${tab('ok', 'Važe', cnt('ok'))}${tab('perm', 'Trajne', cnt('perm'))}
            </div>
            ${st.all.length ? `<div class="toolbar" style="margin-bottom:14px"><input type="search" id="tlSearch" class="search" placeholder="Pretraga uređaja, modela, serijskog broja…" value="${esc(st.q)}"></div>` : ''}
            ${list.length ? `<div class="tlGrid">${list.map(card).join('')}</div>`
                : `<section class="panel"><div class="empty">${st.all.length ? 'Nema uređaja za izabrani filter.' : 'Još nema unetih uređaja.<br>Dodajte uređaj i datum isteka licence ili pritisnite „Sinhronizuj“.'}</div></section>`}`;

        PrivateCache.bind(render, 'tools');
        refreshBadge();
        $('#tlAdd').onclick = () => form();
        $('#tlExport').onclick = exportJson;
        document.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { st.filter = b.dataset.tf; render().catch(e => toast(e.message)); });
        const s = $('#tlSearch');
        if (s) s.oninput = () => {
            st.q = s.value; const pos = s.selectionStart;
            render().then(() => { const n = $('#tlSearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }).catch(e => toast(e.message));
        };
        document.querySelectorAll('[data-tedit]').forEach(b => b.onclick = () => form(st.all.find(x => x.id === b.dataset.tedit)));
        document.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => {
            if (!confirm('Obrisati ovaj uređaj?')) return;
            try { PrivateCache.edit('tools', b.dataset.tdel, null); await render(); toast('Uređaj je obrisan.'); }
            catch (e) { toast(e.message); }
        });
        document.querySelectorAll('[data-trenew]').forEach(b => b.onclick = () => form({ ...st.all.find(x => x.id === b.dataset.trenew), _renew: true }));
    }

    function card(e) {
        const s = status(e), meta = [e.model, e.serial ? 'S/N ' + e.serial : ''].filter(Boolean).map(esc).join(' · ');
        const row = (l, v) => v ? `<div><span>${l}</span><b>${v}</b></div>` : '';
        return `<article class="tlCard ${s.key}">
            <div class="tlHead"><div><h3>${esc(e.name)}</h3>${meta ? `<div class="tlMeta">${meta}</div>` : ''}</div><span class="badge ${s.cls}">${s.label}</span></div>
            <div class="tlExp"><span>Licenca ističe</span><strong>${e.expires ? fdate(e.expires) : '—'}</strong>${s.note ? `<em>${s.note}</em>` : ''}</div>
            <div class="tlRows">${row('Licenca', esc(e.license))}${row('Aktivirana', e.activated ? fdate(e.activated) : '')}${row('Cena obnove', e.price ? rsd(e.price) : '')}</div>
            ${e.notes ? `<p class="tlNotes">${esc(e.notes)}</p>` : ''}
            <div class="tlAct">${e.expires ? `<button class="secondary" data-trenew="${esc(e.id)}">Obnovi</button>` : ''}<button class="secondary" data-tedit="${esc(e.id)}">Izmeni</button><button class="danger" data-tdel="${esc(e.id)}">Obriši</button></div>
        </article>`;
    }

    function form(item = {}) {
        const renew = !!item._renew;
        modal(renew ? 'Obnova licence' : item.id ? 'Izmena uređaja' : 'Novi uređaj', '');
        const addYear = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[1] + 1}-${m[2]}-${m[3]}` : ''; };
        const base = daysLeft(item.expires) > 0 ? item.expires : today();
        formShell(
            field('Naziv uređaja', 'name', item.name || '', 'text', true, 'full') +
            field('Model / proizvođač', 'model', item.model || '') +
            field('Serijski broj', 'serial', item.serial || '') +
            field('Licenca / softver', 'license', item.license || '', 'text', false, 'full') +
            field('Datum aktivacije', 'activated', renew ? today() : item.activated || '', 'date') +
            field('Licenca ističe', 'expires', renew ? addYear(base) : item.expires || '', 'date') +
            field('Cena obnove (RSD)', 'price', item.price ?? '', 'number') +
            textArea('Beleške', 'notes', item.notes || ''),
            async b => {
                if (!(b.name || '').trim()) throw Error('Unesite naziv uređaja.');
                if (b.activated && b.expires && b.expires < b.activated) throw Error('Datum isteka je pre datuma aktivacije.');
                const data = {
                    name: b.name.trim(), model: (b.model || '').trim(), serial: (b.serial || '').trim(), license: (b.license || '').trim(),
                    activated: b.activated || '', expires: b.expires || '', price: b.price === '' ? null : Math.round(Number(b.price) * 100) / 100, notes: (b.notes || '').trim()
                };
                if (item.id) { PrivateCache.edit('tools', item.id, data); }
                else { const ref = {id: PrivateCache.create('tools', data)}; }
            }
        );
        if (renew) setTimeout(() => $('#f_expires')?.focus(), 50);
    }

    function exportJson() {
        const out = st.all.map(e => ({ 'Uređaj': e.name, 'Model': e.model || '', 'Serijski broj': e.serial || '', 'Licenca': e.license || '', 'Aktivirana': e.activated || '', 'Ističe': e.expires || '', 'Cena obnove': e.price ?? null, 'Beleške': e.notes || '' }));
        const d = new Date(), p = x => String(x).padStart(2, '0');
        NativeBridge.saveFile(`alati-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`, new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })).catch(e => toast(e.message));
    }

    /** Značka sa brojem licenci koje traže pažnju, pored stavke „Alati“ u meniju. */
    function refreshBadge() {
        const b = document.querySelector('[data-nav="tools"]');
        if (!b) return;
        b.querySelector('.navBadge')?.remove();
        const n = alertCount();
        if (n) b.insertAdjacentHTML('beforeend', `<i class="navBadge" title="Licence koje ističu ili su istekle">${n}</i>`);
    }

    function dashboardCard() {
        const c = PrivateCache.load(), rows = c.tools.filter(e => ['expired','soon'].includes(status(e).key)).sort((a,b) => order(a)-order(b));
        return `<section class="panel"><div class="toolbar"><h3>Licence koje ističu (${rows.length})</h3><button class="secondary" id="dashTools">Otvori alate</button></div>${rows.length ? rows.map(e => `<div class="tlCard ${status(e).key}"><div class="tlHead"><strong>${esc(e.name)}${e.model ? ' · ' + esc(e.model) : ''}</strong><span class="badge ${status(e).cls}">${status(e).label}</span></div><div class="subtle">${esc(fdate(e.expires))} · ${esc(status(e).note)}</div></div>`).join('') : `<p class="subtle">${c.syncedAt.tools ? 'Nema licenci koje ističu u narednih 30 dana ili su istekle.' : 'Licence još nisu sinhronizovane.'}</p>`}</section>`;
    }
    return { render, alertCount, refreshBadge, dashboardCard };
})();

window.ToolsTracker = ToolsTracker;
