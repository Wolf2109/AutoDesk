'use strict';
/*
 * Lična vozila — zasebna celina aplikacije (nije vezana za radionicu).
 *
 * Raspored u bazi (potpuno odvojen od autodesk_users/{uid}):
 *   autodesk_private/{uid}/vehicles/{id}  -> { name, registration, year, vin, notes, created }
 *   autodesk_private/{uid}/entries/{id}   -> { vehicle_id, date, km, type, title, notes, amount, currency, created }
 *
 * Svaki unos je poseban dokument (nema pravljenja verzija / delova kao kod evidencije radionice),
 * pa izmena jednog unosa ne dira ništa drugo. Uvoz i izvoz koriste isti JSON format:
 *   [{ "Datum", "Kilometraža", "Tip", "Naslov", "Opis / beleške", "Iznos", "Valuta" }]
 */
const PrivateVehicles = (() => {
    const TYPES = ['Redovan servis', 'Delovi', 'Popravka', 'Gorivo', 'Registracija', 'Osiguranje', 'Ostalo'];
    const CURRENCIES = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM'];
    const pv = { vehicles: [], entries: [], selected: '', q: '' };

    const vcol = () => CloudSync.privateRoot().collection('vehicles');
    const ecol = () => CloudSync.privateRoot().collection('entries');

    const fdate = iso => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
    };
    const money = (n, c) => new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ' + (c || 'RSD');
    const km = n => (n || n === 0) ? new Intl.NumberFormat('sr-Latn-RS').format(n) + ' km' : '—';
    const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.km || 0) - (a.km || 0);

    async function load() {
        const c = PrivateCache.load();   // čita se samo lokalna kopija; Firebase tek na „Sinhronizuj“
        pv.vehicles = c.vehicles.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        pv.entries = c.entries.slice();
        if (!pv.vehicles.some(x => x.id === pv.selected)) pv.selected = pv.vehicles[0]?.id || '';
    }

    const current = () => pv.vehicles.find(v => v.id === pv.selected);
    const entriesOf = id => pv.entries.filter(e => e.vehicle_id === id).sort(byDate);

    /* ---------- prikaz ---------- */

    async function render() {
        await PrivateCache.ensureFirst('service');
        await load();
        const v = current();
        const tabs = pv.vehicles.map(x => `<button class="${x.id === pv.selected ? 'active' : ''}" data-pvtab="${esc(x.id)}">${esc(x.name)}${x.registration ? ' · ' + esc(x.registration) : ''}</button>`).join('');

        let body;
        if (!v) {
            body = `<section class="panel"><div class="empty">Još nema ličnih vozila.<br>Dodajte vozilo, uvezite JSON ili pritisnite „Sinhronizuj“.</div></section>`;
        } else {
            const list = entriesOf(v.id);
            const totals = {};
            list.forEach(e => { totals[e.currency || 'RSD'] = (totals[e.currency || 'RSD'] || 0) + (Number(e.amount) || 0); });
            const lastKm = list.reduce((m, e) => Math.max(m, e.km || 0), 0);
            const totalsHtml = Object.keys(totals).length
                ? Object.entries(totals).map(([c, s]) => `<div><small>Ukupno (${esc(c)})</small><strong>${money(s, c)}</strong></div>`).join('')
                : '';
            body = `<section class="panel pvPanel">
                <div class="pvSummary">
                    <div>
                        <h3 style="margin:0">${esc(v.name)}</h3>
                        <div class="subtle">${[v.registration, v.year, v.vin && 'VIN ' + v.vin].filter(Boolean).map(esc).join(' · ')}</div>
                        ${v.notes ? `<div class="pvNotes">${esc(v.notes)}</div>` : ''}
                        <div class="pvStats">
                            <div><small>Poslednja kilometraža</small><strong>${km(lastKm || null)}</strong></div>
                            <div><small>Broj unosa</small><strong>${list.length}</strong></div>
                            ${totalsHtml}
                        </div>
                    </div>
                    <div class="pvActions">
                        <button class="secondary" id="pvEditVehicle">Izmeni vozilo</button>
                        <button class="secondary" id="pvPdf">Izvezi PDF</button>
                        <button class="secondary" id="pvExport">Izvezi JSON</button>
                        <button class="danger" id="pvDeleteVehicle">Obriši vozilo</button>
                    </div>
                </div>
            </section>
            <section class="panel pvPanel" id="pvTable"></section>`;
        }

        $('#content').innerHTML = `
            ${PrivateCache.bar('service')}
            <div class="toolbar">
                <div class="search-wrapper"><input class="search" id="pvSearch" placeholder="Pretraži servise…" value="${esc(pv.q)}"></div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="secondary" id="pvImport">Uvezi JSON</button>
                    <button class="secondary" id="pvAddVehicle">+ Vozilo</button>
                    <button class="primary" id="pvAddEntry" ${v ? '' : 'disabled'}>+ Unos servisa</button>
                </div>
            </div>
            <input type="file" id="pvFile" accept="application/json,.json" class="hidden">
            ${tabs ? `<div class="pvTabs">${tabs}</div>` : ''}
            ${body}`;

        PrivateCache.bind(render, 'service');
        document.querySelectorAll('[data-pvtab]').forEach(b => b.onclick = () => { pv.selected = b.dataset.pvtab; pv.q = ''; render().catch(e => toast(e.message)); });
        $('#pvAddVehicle').onclick = () => vehicleForm();
        $('#pvAddEntry').onclick = () => entryForm();
        $('#pvImport').onclick = () => $('#pvFile').click();
        $('#pvFile').onchange = onFile;
        $('#pvSearch').oninput = e => { pv.q = e.target.value; renderTable(); };
        if (v) {
            $('#pvEditVehicle').onclick = () => vehicleForm(v);
            $('#pvPdf').onclick = () => { try { AutoDeskPrint.previewPrivate(v, entriesOf(v.id)); } catch (e) { toast(e.message); } };
            $('#pvExport').onclick = () => exportJson(v);
            $('#pvDeleteVehicle').onclick = () => deleteVehicle(v);
            renderTable();
        }
    }

    function renderTable() {
        const v = current(), box = $('#pvTable');
        if (!v || !box) return;
        const q = pv.q.toLowerCase().trim();
        const rows = entriesOf(v.id).filter(e => !q || [e.title, e.notes, e.type, e.date].some(x => String(x || '').toLowerCase().includes(q)));
        box.innerHTML = rows.length
            ? `<div class="tableWrap cards"><table class="pvTbl"><thead><tr><th>Datum</th><th>Kilometraža</th><th>Tip</th><th>Naslov i beleške</th><th>Iznos</th><th></th></tr></thead><tbody>${rows.map(e => {
                const long = (e.notes || '').split('\n').length > 3 || (e.notes || '').length > 160;
                return `<tr>
                <td class="cDate">${fdate(e.date)}</td>
                <td class="cKm">${km(e.km)}</td>
                <td class="cType">${esc(e.type)}</td>
                <td class="cTitle"><strong>${esc(e.title)}</strong>
                    <div class="pvMeta">${[fdate(e.date), e.km || e.km === 0 ? km(e.km) : '', e.type].filter(Boolean).map(esc).join(' · ')}</div>
                    ${e.notes ? `<div class="pvNotes ${long ? 'clamp' : ''}">${esc(e.notes)}</div>${long ? '<button type="button" class="pvToggle">Prikaži više</button>' : ''}` : ''}</td>
                <td class="cAmount">${Number(e.amount) ? money(e.amount, e.currency) : '<span class="pvDash">—</span>'}</td>
                <td class="cAct"><button class="secondary" data-pvedit="${esc(e.id)}">Izmeni</button><button class="danger" data-pvdel="${esc(e.id)}">Obriši</button></td>
            </tr>`; }).join('')}</tbody></table></div>`
            : `<div class="empty">${q ? 'Nema rezultata pretrage.' : 'Za ovo vozilo još nema unosa.'}</div>`;
        box.querySelectorAll('.pvToggle').forEach(b => b.onclick = () => {
            const n = b.previousElementSibling, open = n.classList.toggle('clamp');
            b.textContent = open ? 'Prikaži više' : 'Prikaži manje';
        });
        box.querySelectorAll('[data-pvedit]').forEach(b => b.onclick = () => entryForm(pv.entries.find(x => x.id === b.dataset.pvedit)));
        box.querySelectorAll('[data-pvdel]').forEach(b => b.onclick = async () => {
            if (!confirm('Obrisati ovaj unos?')) return;
            try { PrivateCache.needOnline(); await ecol().doc(b.dataset.pvdel).delete(); PrivateCache.remove('entries', b.dataset.pvdel); await render(); toast('Unos je obrisan.'); } catch (e) { toast(e.message); }
        });
    }

    /* ---------- forme ---------- */

    function vehicleForm(item = {}) {
        modal(item.id ? 'Izmena vozila' : 'Novo lično vozilo', '');
        formShell(
            field('Naziv (npr. Ford Focus 1.6)', 'name', item.name, 'text', true, 'full') +
            field('Registracija', 'registration', item.registration) +
            field('Godište', 'year', item.year) +
            field('VIN', 'vin', item.vin, 'text', false, 'full') +
            textArea('Beleške', 'notes', item.notes),
            async b => {
                PrivateCache.needOnline();
                const name = (b.name || '').trim();
                if (!name) throw Error('Unesite naziv vozila.');
                const data = { name, registration: (b.registration || '').trim(), year: (b.year || '').trim(), vin: (b.vin || '').trim(), notes: (b.notes || '').trim() };
                if (item.id) { await vcol().doc(item.id).update(data); PrivateCache.upsert('vehicles', { id: item.id, ...data }); }
                else { const ref = await vcol().add({ ...data, created: CloudSync.privateStamp() }); PrivateCache.upsert('vehicles', { id: ref.id, ...data }); pv.selected = ref.id; }
            }
        );
    }

    function entryForm(item = {}) {
        const v = current();
        modal(item.id ? 'Izmena unosa' : 'Novi unos servisa', '');
        const typeField = `<div class="field"><label for="f_type">Tip</label><input id="f_type" name="type" list="pvTypes" value="${esc(item.type || 'Redovan servis')}" required><datalist id="pvTypes">${TYPES.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>`;
        const curField = `<div class="field"><label for="f_currency">Valuta</label><select id="f_currency" name="currency">${CURRENCIES.map(c => `<option ${((item.currency || 'RSD') === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>`;
        formShell(
            selectField('Vozilo', 'vehicle_id', pv.vehicles.map(x => ({ id: x.id, label: x.name })), item.vehicle_id || v?.id || '') +
            field('Datum', 'date', item.date || today(), 'date', true) +
            field('Kilometraža', 'km', item.km ?? '', 'number') +
            typeField +
            field('Naslov', 'title', item.title, 'text', true, 'full') +
            field('Iznos', 'amount', item.amount ?? '', 'number') +
            curField +
            textArea('Opis / beleške', 'notes', item.notes),
            async b => {
                PrivateCache.needOnline();
                if (!b.vehicle_id) throw Error('Izaberite vozilo.');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw Error('Unesite ispravan datum.');
                const title = (b.title || '').trim();
                if (!title) throw Error('Unesite naslov.');
                const data = {
                    vehicle_id: b.vehicle_id, date: b.date,
                    km: b.km === '' ? null : Math.round(Number(b.km)),
                    type: (b.type || '').trim() || 'Ostalo', title,
                    notes: (b.notes || '').trim(),
                    amount: b.amount === '' ? 0 : Math.round(Number(b.amount) * 100) / 100,
                    currency: CURRENCIES.includes(b.currency) ? b.currency : 'RSD'
                };
                if (item.id) { await ecol().doc(item.id).update(data); PrivateCache.upsert('entries', { id: item.id, ...data }); }
                else { const ref = await ecol().add({ ...data, created: CloudSync.privateStamp() }); PrivateCache.upsert('entries', { id: ref.id, ...data }); }
                pv.selected = b.vehicle_id;
            }
        );
    }

    async function deleteVehicle(v) {
        const n = entriesOf(v.id).length;
        if (!confirm(`Obrisati vozilo „${v.name}“ i svih ${n} unosa servisa? Ovo se ne može poništiti.\nPreporuka: prvo izvezite JSON.`)) return;
        try {
            PrivateCache.needOnline();
            await CloudSync.privateBatchDelete(entriesOf(v.id).map(e => ecol().doc(e.id)));
            await vcol().doc(v.id).delete();
            PrivateCache.removeWhere('entries', e => e.vehicle_id === v.id);
            PrivateCache.remove('vehicles', v.id);
            pv.selected = '';
            await render();
            toast('Vozilo je obrisano.');
        } catch (e) { toast(e.message); }
    }

    /* ---------- izvoz / uvoz (isti JSON format) ---------- */

    function exportJson(v) {
        const out = entriesOf(v.id).slice().reverse().map(e => {
            const o = { 'Datum': e.date, 'Kilometraža': e.km ?? 0, 'Tip': e.type, 'Naslov': e.title };
            if (e.notes) o['Opis / beleške'] = e.notes.replace(/\n/g, '\r\n');
            o['Iznos'] = (Number(e.amount) || 0).toFixed(2);
            o['Valuta'] = e.currency || 'RSD';
            return o;
        });
        const d = new Date(), p = n => String(n).padStart(2, '0');
        const slug = (v.registration || v.name || 'vozilo').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'vozilo';
        const name = `vehicle-export-${slug}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
        NativeBridge.saveFile(name, new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })).catch(e => toast(e.message));
    }

    const parseRows = text => {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw Error('JSON mora biti lista unosa.');
        const rows = data.map(r => ({
            date: String(r['Datum'] || '').slice(0, 10),
            km: r['Kilometraža'] === undefined || r['Kilometraža'] === null || r['Kilometraža'] === '' ? null : Math.round(Number(r['Kilometraža'])),
            type: String(r['Tip'] || 'Ostalo').trim(),
            title: String(r['Naslov'] || '').trim(),
            notes: String(r['Opis / beleške'] || '').replace(/\r\n/g, '\n').trim(),
            amount: Math.round((parseFloat(String(r['Iznos'] ?? '0').replace(',', '.')) || 0) * 100) / 100,
            currency: CURRENCIES.includes(r['Valuta']) ? r['Valuta'] : 'RSD'
        })).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title);
        if (!rows.length) throw Error('U fajlu nema ispravnih unosa (potrebni su Datum i Naslov).');
        return rows;
    };

    async function onFile(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        let rows;
        try { rows = parseRows(await file.text()); } catch (err) { toast('Uvoz nije moguć: ' + err.message); return; }

        modal('Uvoz servisa iz JSON-a', '');
        const opts = pv.vehicles.map(x => `<option value="${esc(x.id)}" ${x.id === pv.selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
        $('#modalBody').innerHTML = `<form id="editForm"><p class="subtle">U fajlu je pronađeno <strong>${rows.length}</strong> unosa. Izaberite vozilo kojem pripadaju. Unosi koji već postoje (isti datum, kilometraža, naslov i iznos) biće preskočeni.</p>
            <div class="formGrid">
                <div class="field full"><label for="f_target">Vozilo</label><select id="f_target" name="target"><option value="">+ Novo vozilo</option>${opts}</select></div>
                <div class="field full" id="newNameBox"><label for="f_newname">Naziv novog vozila</label><input id="f_newname" name="newname" placeholder="npr. Ford Focus 1.6"></div>
            </div>
            <div class="formActions"><button type="button" class="secondary" id="cancelForm">Otkaži</button><button class="primary" type="submit">Uvezi</button></div></form>`;
        const sync = () => $('#newNameBox').classList.toggle('hidden', !!$('#f_target').value);
        $('#f_target').onchange = sync;
        sync();
        $('#cancelForm').onclick = closeModal;
        $('#editForm').onsubmit = async ev => {
            ev.preventDefault();
            const btn = ev.target.querySelector('button.primary');
            btn.disabled = true;
            try {
                PrivateCache.needOnline();
                let id = $('#f_target').value;
                if (!id) {
                    const name = $('#f_newname').value.trim();
                    if (!name) throw Error('Unesite naziv novog vozila.');
                    id = (await vcol().add({ name, registration: '', year: '', vin: '', notes: '', created: CloudSync.privateStamp() })).id;
                    PrivateCache.upsert('vehicles', { id, name, registration: '', year: '', vin: '', notes: '' });
                }
                const key = r => [r.date, r.km ?? '', r.title, r.amount].join('|');
                const have = new Set(pv.entries.filter(x => x.vehicle_id === id).map(key));
                const fresh = rows.filter(r => { const k = key(r); if (have.has(k)) return false; have.add(k); return true; });
                const db = CloudSync.privateDb();
                for (let i = 0; i < fresh.length; i += 400) {
                    const b = db.batch(), added = [];
                    fresh.slice(i, i + 400).forEach(r => { const ref = ecol().doc(); b.set(ref, { ...r, vehicle_id: id, created: CloudSync.privateStamp() }); added.push({ id: ref.id, ...r, vehicle_id: id }); });
                    await b.commit();
                    added.forEach(x => PrivateCache.upsert('entries', x));
                }
                pv.selected = id;
                closeModal();
                toast(`Uvezeno: ${fresh.length}, preskočeno: ${rows.length - fresh.length}.`);
                await refresh();
            } catch (err) { toast(err.message); btn.disabled = false; }
        };
    }

    return { render };
})();

window.PrivateVehicles = PrivateVehicles;
