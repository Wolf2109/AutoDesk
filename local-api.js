'use strict';
/*
 * "API" koji aplikacija koristi nad Firestore bazom (GitHub Pages izdanje nema server).
 *  - Evidencija (klijenti, vozila, nalozi, cenovnik, podešavanja) je jedan JSON bez fotografija.
 *  - Fotografije su zasebni dokumenti, smanjeni u pregledaču pre slanja.
 *  - Izmena uvek prvo proverava verziju u oblaku (jedno čitanje) i čuva se samo ako se verzija poklapa.
 *  - IndexedDB čuva poslednju kopiju za pregled kada nema interneta (izmene tada nisu dozvoljene).
 */
const LocalAPI = (() => {
  const DBNAME = 'autodesk-pages-v1';
  const STATUSES = ['received', 'in_progress', 'waiting', 'done', 'delivered'];
  const ACTIVE = ['received', 'in_progress', 'waiting'];
  const RECHECK_MS = 60000;
  const EUR_RATE = 120;
  const BACKUP_DAYS = [1, 7, 15, 30];

  /* ---------- lokalna kopija (IndexedDB) ---------- */
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const r = indexedDB.open(DBNAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('state');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return connection;
  }
  const emptyState = () => ({ clients: [], vehicles: [], services: [], orders: [], photos: [], settings: { currency: 'RSD' }, seq: 0, ids: {} });
  async function localRead() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const r = db.transaction('state', 'readonly').objectStore('state').get('main');
      r.onsuccess = () => resolve(r.result || emptyState());
      r.onerror = () => reject(r.error);
    });
  }
  async function localWrite(s) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('state', 'readwrite');
      t.objectStore('state').put(s, 'main');
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }

  /* ---------- pomoćne ---------- */
  const err = m => { throw Error(m); };
  const num = x => Number(x) || 0;
  const stamp = () => new Date().toISOString();
  const clone = x => structuredClone(x);
  const text = (x, max) => String(x ?? '').trim().slice(0, max);
  const intOrNull = (x, label) => {
    if (x === '' || x == null) return null;
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0) err('Neispravna vrednost: ' + label + '.');
    return Math.round(n);
  };
  const money = x => Math.max(0, Math.round(num(x)));
  const dateOrNull = x => {
    if (!x) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || Number.isNaN(Date.parse(x))) err('Neispravan datum.');
    return x;
  };
  const localToday = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const vehicleLabel = v => v ? [[v.make, v.model].filter(Boolean).join(' '), v.registration].filter(Boolean).join(' · ') : '';
  const blobToDataURL = blob => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  function normalize(s) {
    const out = { ...emptyState(), ...s };
    for (const k of ['clients', 'vehicles', 'services', 'orders', 'photos']) if (!Array.isArray(out[k])) out[k] = [];
    out.settings = { currency: 'RSD', ...(out.settings || {}) };
    out.ids = out.ids || {};
    return out;
  }

  /** Smanjuje fotografiju tako da stane u jedan Firestore dokument. */
  async function compress(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch { err('Format fotografije nije podržan. Koristite JPG ili PNG.'); }
      let max = 1600, quality = .78;
      for (let i = 0; i < 7; i++) {
        const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * r));
        c.height = Math.max(1, Math.round(img.naturalHeight * r));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', quality);
        if (out.length <= 750000) return out;
        max = Math.round(max * .8);
        quality = Math.max(.5, quality - .06);
      }
      err('Fotografiju nije moguće dovoljno smanjiti.');
    } finally { URL.revokeObjectURL(url); }
  }

  /** Prebacuje fotografije i rezervne kopije iz starog formata (unutar evidencije) u zasebne dokumente. */
  async function migrate(s) {
    let changed = false;
    for (const p of s.photos) {
      if (!p.blob && !p.data) continue;
      let data = p.data || await blobToDataURL(p.blob);
      if (data.length > 750000) data = await compress(await (await fetch(data)).blob());
      await CloudSync.putPhoto(p.id, data, p.work_order_id);
      delete p.blob; delete p.data;
      changed = true;
    }
    if (s.backups && Object.keys(s.backups).length) {
      for (const [name, snap] of Object.entries(s.backups)) {
        const copy = { ...snap, photos: (snap.photos || []).map(({ id, work_order_id }) => ({ id, work_order_id })) };
        delete copy.backups;
        await CloudSync.putBackup(name.replace(/\.json$/, ''), JSON.stringify(copy), 'manual');
      }
    }
    if ('backups' in s) { delete s.backups; changed = true; }
    return changed;
  }

  /* ---------- sinhronizacija ---------- */
  let snapshot = null, version = 0, lastCheck = 0, lastSync = 0, offline = false;
  let initial = null, background = null, mutex = Promise.resolve();

  async function pull() {
    const meta = await CloudSync.getMeta();
    if (!meta) {
      const local = normalize(await localRead());
      if (local.clients.length || local.orders.length || local.vehicles.length || local.services.length) {
        await migrate(local);
        version = await CloudSync.saveState(local, 0);
        snapshot = local;
      } else { snapshot = emptyState(); version = 0; }
    } else if (!snapshot || (meta.version || 0) !== version) {
      const { meta: m, state } = await CloudSync.loadState();
      const s = normalize(state);
      version = m.version || 0;
      if (await migrate(s)) {
        try { version = await CloudSync.saveState(s, version); }
        catch (e) { if (e.code !== 'conflict') throw e; snapshot = null; return pull(); }
      }
      snapshot = s;
      await localWrite(s).catch(() => {});
    }
    lastCheck = lastSync = Date.now();
    offline = false;
  }

  async function ensure(fresh) {
    if (!window.CloudSync?.ready) err('Firebase nije dostupan. Proverite internet vezu.');
    try {
      if (!snapshot) { initial ??= pull().finally(() => { initial = null; }); await initial; }
      else if (fresh) await pull();
      else if (Date.now() - lastCheck > RECHECK_MS && !background) {
        background = pull().catch(e => { offline = true; console.warn('Pozadinska sinhronizacija:', e); }).finally(() => { background = null; });
      }
    } catch (e) {
      if (fresh) { offline = true; err('Nema veze sa oblakom. Izmena nije sačuvana.'); }
      if (snapshot) { offline = true; return; }
      const local = normalize(await localRead());
      if (!(local.clients.length || local.orders.length || local.vehicles.length)) throw e;
      snapshot = local; version = -1; offline = true;
    }
  }

  async function read(fresh = false) { await ensure(fresh); return clone(snapshot); }

  async function write(s) {
    try { version = await CloudSync.saveState(s, version); }
    catch (e) {
      if (e.code === 'conflict') { await pull().catch(() => {}); err('Podaci su u međuvremenu izmenjeni na drugom uređaju. Osveženo je — ponovite izmenu.'); }
      throw e;
    }
    snapshot = clone(s);
    lastCheck = lastSync = Date.now();
    offline = false;
    await localWrite(s).catch(() => {});
  }

  const lock = fn => { const run = mutex.then(fn, fn); mutex = run.catch(() => {}); return run; };

  /* ---------- fotografije ---------- */
  const photoCache = new Map();
  async function photoData(id) {
    if (photoCache.has(id)) return photoCache.get(id);
    const data = await CloudSync.getPhoto(id);
    photoCache.set(id, data);
    if (photoCache.size > 60) photoCache.delete(photoCache.keys().next().value);
    return data;
  }

  /* ---------- čišćenje unosa ---------- */
  const cleanClient = b => {
    const name = text(b.name, 120);
    if (!name) err('Unesite ime klijenta.');
    return { name, phone: text(b.phone, 40), email: text(b.email, 120), notes: text(b.notes, 2000) };
  };
  const cleanVehicle = (b, s) => {
    const client_id = num(b.client_id);
    if (!s.clients.some(c => c.id === client_id)) err('Klijent ne postoji.');
    const make = text(b.make, 60), model = text(b.model, 60);
    if (!make || !model) err('Marka i model su obavezni.');
    return {
      client_id, make, model, year: intOrNull(b.year, 'godište'), engine: text(b.engine, 60), power: text(b.power, 40), fuel: text(b.fuel, 40),
      registration: text(b.registration, 20).toUpperCase(), vin: text(b.vin, 25).toUpperCase(), mileage: intOrNull(b.mileage, 'kilometraža'), notes: text(b.notes, 2000)
    };
  };
  const cleanService = b => {
    const name = text(b.name, 120);
    if (!name) err('Naziv usluge je obavezan.');
    return { name, price_amount: money(b.price_amount) };
  };
  const cleanOrder = (b, s) => {
    const client_id = num(b.client_id), vehicle_id = num(b.vehicle_id);
    if (!s.clients.some(c => c.id === client_id)) err('Klijent ne postoji.');
    if (!s.vehicles.some(v => v.id === vehicle_id && v.client_id === client_id)) err('Vozilo ne pripada izabranom klijentu.');
    const description = text(b.description, 5000);
    if (!description) err('Opis posla je obavezan.');
    const status = b.status || 'done';
    if (!STATUSES.includes(status)) err('Neispravan status naloga.');
    return {
      date: dateOrNull(b.date) || err('Datum je obavezan.'), client_id, vehicle_id, status,
      complaint: text(b.complaint, 3000), description, dtc_codes: text(b.dtc_codes, 500), notes: text(b.notes, 5000),
      mileage: intOrNull(b.mileage, 'kilometraža'), next_service_date: dateOrNull(b.next_service_date), next_service_km: intOrNull(b.next_service_km, 'sledeći servis (km)'),
      spent_amount: money(b.spent_amount), charged_amount: money(b.charged_amount)
    };
  };
  const bumpMileage = (s, vehicle_id, km) => {
    if (km == null) return;
    const v = s.vehicles.find(x => x.id === vehicle_id);
    if (v && km > num(v.mileage)) v.mileage = km;
  };

  /* ---------- prikaz naloga ---------- */
  function rich(s, o) {
    const c = s.clients.find(x => x.id === o.client_id), v = s.vehicles.find(x => x.id === o.vehicle_id);
    return {
      ...o, status: o.status || 'done', client_name: c?.name || '', client_phone: c?.phone || '', client_email: c?.email || '',
      vehicle_name: vehicleLabel(v), vehicle_make: v?.make || '', vehicle_model: v?.model || '', vehicle_registration: v?.registration || '', vehicle_vin: v?.vin || '',
      vehicle_year: v?.year ?? null, vehicle_engine: v?.engine || '', vehicle_power: v?.power || '', vehicle_fuel: v?.fuel || '', vehicle_mileage: v?.mileage ?? null,
      difference: num(o.charged_amount) - num(o.spent_amount)
    };
  }
  const sortOrders = rows => rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const inRange = (o, q) => (!q.get('from') || o.date >= q.get('from')) && (!q.get('to') || o.date <= q.get('to'));
  const codesOf = o => [...new Set(String(o.dtc_codes || '').split(/[,;\n]+/).map(x => x.trim().split(/\s+/)[0]?.toUpperCase()).filter(Boolean))];

  const csvField = x => {
    let t = String(x ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  function buildCsv(rows, currency, statusLabels) {
    const cols = [
      ['order_number', 'Nalog'], ['date', 'Datum'], ['status', 'Status'], ['client_name', 'Klijent'], ['vehicle_name', 'Vozilo'], ['mileage', 'Kilometraža'],
      ['complaint', 'Prijavljeni problem'], ['dtc_codes', 'Kodovi grešaka'], ['description', 'Opis posla'], ['notes', 'Napomena'],
      ['spent_amount', 'Potrošeno'], ['charged_amount', 'Naplaćeno'], ['difference', 'Razlika']
    ];
    const cell = (o, k) => {
      if (['spent_amount', 'charged_amount', 'difference'].includes(k)) return (num(o[k]) / 100).toFixed(2).replace('.', ',');
      if (k === 'status') return statusLabels[o.status] || o.status;
      return o[k];
    };
    // Tačka-zarez i decimalni zarez: tako se CSV ispravno otvara u srpskom Excelu.
    const head = cols.map(c => csvField(c[1])).concat(csvField('Valuta')).join(';');
    const body = rows.map(o => cols.map(([k]) => csvField(cell(o, k))).concat(csvField(currency)).join(';'));
    return new Blob(['\ufeff' + [head, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }
  const STATUS_LABELS = { received: 'Primljeno', in_progress: 'U radu', waiting: 'Čeka deo', done: 'Završeno', delivered: 'Preuzeto' };

  /* ---------- rezervne kopije ---------- */
  const backupName = kind => kind === 'auto' ? localToday() + '_auto' : stamp().replace(/[:.]/g, '-') + '_' + kind;
  async function snapshotJson(s) { const c = clone(s); delete c.backups; return JSON.stringify(c); }
  async function pruneBackups() {
    const all = await CloudSync.listBackups();
    const autos = all.filter(b => b.kind === 'auto'), others = all.filter(b => b.kind !== 'auto');
    // Čuva se poslednjih 10 automatskih i 30 ručnih kopija.
    for (const b of [...autos.slice(10), ...others.slice(30)]) await CloudSync.deleteBackup(b.name).catch(() => {});
  }
  async function makeBackup(kind = 'manual') {
    const s = await read(true), name = backupName(kind);
    await CloudSync.putBackup(name, await snapshotJson(s), kind);
    await pruneBackups().catch(() => {});
    return name;
  }
  /** Pravi automatsku kopiju ako je od poslednje prošlo izabrani broj dana (1, 7, 15 ili 30). */
  async function autoBackup() {
    const st = await read(), days = BACKUP_DAYS.includes(Number(st.settings.backup_days)) ? Number(st.settings.backup_days) : 30;
    const last = (await CloudSync.listBackups()).find(b => b.kind === 'auto');
    // Tolerancija od 6 sati: otvaranje aplikacije malo ranije u danu ne odlaže kopiju za ceo dan.
    if (last && Date.now() - last.ts < days * 86400000 - 6 * 3600000) return null;
    return makeBackup('auto');
  }

  async function replaceAll(parsed) {
    if (!['clients', 'vehicles', 'services', 'orders'].every(k => Array.isArray(parsed[k]))) err('Neispravna kopija.');
    {
      const current = await read(true);
      await CloudSync.putBackup(backupName('pre-restore'), await snapshotJson(current), 'pre-restore');
      const next = normalize(parsed);
      delete next.backups;
      next.photos = (parsed.photos || []).map(p => ({ id: p.id, work_order_id: p.work_order_id }));
      for (const p of parsed.photos || []) {
        if (p.data) {
          let data = p.data;
          if (data.length > 750000) data = await compress(await (await fetch(data)).blob());
          await CloudSync.putPhoto(p.id, data, p.work_order_id);
        }
      }
      const keep = new Set(next.photos.map(p => p.id));
      await write(next);
      const stale = current.photos.filter(p => !keep.has(p.id)).map(p => p.id);
      if (stale.length) await CloudSync.deletePhotos(stale).catch(() => {});
      photoCache.clear();
    }
  }

  /* ---------- glavni ulaz ---------- */
  async function call(url, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    if (method === 'GET') return exec(url, opt, method);
    return lock(() => exec(url, opt, method));
  }

  async function exec(url, opt, method) {
    const u = new URL(url, 'https://local.invalid'), parts = u.pathname.split('/').filter(Boolean), table = parts[0], key = Number(parts[1]), q = u.searchParams;
    if (table === 'health') return { ok: true, offline, lastSync };
    const s = await read(method !== 'GET');
    const body = opt.body instanceof FormData ? opt.body : opt.body ? JSON.parse(opt.body) : {};
    const save = async result => { await write(s); return result; };
    const next = t => (s.ids[t] = (s.ids[t] || Math.max(0, ...(s[t] || []).map(x => x.id))) + 1);

    if (table === 'settings') {
      if (method === 'GET') return clone(s.settings);
      const old = s.settings.currency || 'RSD', currency = body.currency || old;
      if (!['RSD', 'EUR'].includes(currency)) err('Nepodržana valuta.');
      if (currency !== old) {
        if (body.confirm_conversion !== true) err('Potvrdite konverziju.');
        const f = old === 'RSD' ? 1 / EUR_RATE : EUR_RATE;
        for (const o of s.orders) { o.spent_amount = Math.round(num(o.spent_amount) * f); o.charged_amount = Math.round(num(o.charged_amount) * f); }
        for (const x of s.services) x.price_amount = Math.round(num(x.price_amount) * f);
      }
      s.settings.currency = currency;
      if ('workshop_name' in body) s.settings.workshop_name = text(body.workshop_name, 120);
      if ('workshop_info' in body) s.settings.workshop_info = text(body.workshop_info, 1000);
      if (['DD.MM.YYYY', 'YYYY-MM-DD'].includes(body.date_format)) s.settings.date_format = body.date_format;
      if (BACKUP_DAYS.includes(Number(body.backup_days))) s.settings.backup_days = Number(body.backup_days);
      const result = await save({ ok: true, currency, converted: currency !== old });
      return result;
    }

    if (['clients', 'vehicles', 'services'].includes(table)) {
      const a = s[table];
      if (method === 'GET') {
        const search = (q.get('search') || '').toLowerCase();
        let result = clone(a).sort((x, y) => y.id - x.id);
        if (search) result = result.filter(x => Object.values(x).some(v => String(v ?? '').toLowerCase().includes(search)));
        return result;
      }
      if (method === 'DELETE') {
        if (table === 'clients' && (s.vehicles.some(v => v.client_id === key) || s.orders.some(o => o.client_id === key))) err('Klijent ima povezana vozila ili naloge. Istorija je zaštićena.');
        if (table === 'vehicles' && s.orders.some(o => o.vehicle_id === key)) err('Vozilo ima radne naloge. Istorija je zaštićena.');
        const i = a.findIndex(x => x.id === key);
        if (i < 0) err('Zapis nije pronađen.');
        a.splice(i, 1);
        return save({ ok: true });
      }
      const values = table === 'clients' ? cleanClient(body) : table === 'vehicles' ? cleanVehicle(body, s) : cleanService(body);
      if (method === 'POST') { const record = { ...values, id: next(table) }; a.push(record); return save(clone(record)); }
      if (method === 'PUT') {
        const i = a.findIndex(x => x.id === key);
        if (i < 0) err('Zapis nije pronađen.');
        a[i] = { ...a[i], ...values, id: key };
        return save(clone(a[i]));
      }
    }

    if (table === 'orders') {
      if (parts[1] === 'finish-all' && method === 'POST') {
        let updated = 0;
        for (const o of s.orders) if (ACTIVE.includes(o.status)) { o.status = 'done'; o.updated_at = stamp(); updated++; }
        return updated ? save({ ok: true, updated }) : { ok: true, updated: 0 };
      }
      if (parts[2] === 'status' && method === 'PATCH') {
        const o = s.orders.find(x => x.id === key);
        if (!o) err('Nalog nije pronađen.');
        if (!STATUSES.includes(body.status)) err('Neispravan status.');
        o.status = body.status; o.updated_at = stamp();
        return save({ ok: true, status: o.status });
      }
      if (parts[2] === 'photos' && method === 'POST') {
        if (!s.orders.some(o => o.id === key)) err('Nalog nije pronađen.');
        const files = body.getAll('photos');
        if (s.photos.filter(p => p.work_order_id === key).length + files.length > 12) err('Najviše 12 fotografija po nalogu.');
        const added = [];
        try {
          for (const f of files) {
            if (!f.type.startsWith('image/')) err('Dozvoljene su samo slike.');
            if (f.size > 25 * 1024 * 1024) err('Fotografija je prevelika (najviše 25 MB).');
            const id = next('photos');
            await CloudSync.putPhoto(id, await compress(f), key);
            added.push(id);
            s.photos.push({ id, work_order_id: key });
          }
          return await save({ ok: true, added: added.length });
        } catch (e) {
          if (added.length) await CloudSync.deletePhotos(added).catch(() => {});
          throw e;
        }
      }
      if (method === 'GET') {
        if (key) {
          const o = s.orders.find(x => x.id === key);
          if (!o) err('Nalog nije pronađen.');
          return { ...rich(s, o), photos: s.photos.filter(p => p.work_order_id === key).map(p => ({ id: p.id })) };
        }
        const st = q.get('status'), search = (q.get('search') || '').toLowerCase();
        let rows = s.orders.filter(o => {
          const status = o.status || 'done';
          return (!st || (st === 'active' ? ACTIVE.includes(status) : status === st)) && inRange(o, q) &&
            (!q.get('client_id') || o.client_id === num(q.get('client_id'))) && (!q.get('vehicle_id') || o.vehicle_id === num(q.get('vehicle_id')));
        }).map(o => rich(s, o));
        if (search) rows = rows.filter(o => [o.order_number, o.description, o.complaint, o.dtc_codes, o.client_name, o.vehicle_name].some(x => String(x || '').toLowerCase().includes(search)));
        return sortOrders(rows);
      }
      if (method === 'DELETE') {
        const i = s.orders.findIndex(o => o.id === key);
        if (i < 0) err('Nalog nije pronađen.');
        const gone = s.photos.filter(p => p.work_order_id === key).map(p => p.id);
        s.orders.splice(i, 1);
        s.photos = s.photos.filter(p => p.work_order_id !== key);
        const result = await save({ ok: true });
        if (gone.length) await CloudSync.deletePhotos(gone).catch(() => {});
        return result;
      }
      const values = cleanOrder(body, s);
      bumpMileage(s, values.vehicle_id, values.mileage);
      if (method === 'POST') {
        const o = { ...values, id: next('orders'), order_number: 'RN-' + String(++s.seq).padStart(6, '0'), created_at: stamp(), updated_at: stamp() };
        s.orders.push(o);
        return save(rich(s, o));
      }
      if (method === 'PUT') {
        const i = s.orders.findIndex(o => o.id === key);
        if (i < 0) err('Nalog nije pronađen.');
        s.orders[i] = { ...s.orders[i], ...values, id: key, updated_at: stamp() };
        return save(rich(s, s.orders[i]));
      }
    }

    if (table === 'photos') {
      const i = s.photos.findIndex(p => p.id === key);
      if (method === 'GET') return await (await fetch(await photoData(key))).blob();
      if (i < 0) err('Fotografija nije pronađena.');
      if (method === 'DELETE') {
        s.photos.splice(i, 1);
        const result = await save({ ok: true });
        await CloudSync.deletePhotos([key]).catch(() => {});
        photoCache.delete(key);
        return result;
      }
    }

    if (table === 'reminders') {
      const cutoff = localToday(30), latest = new Map();
      for (const o of sortOrders([...s.orders])) if (!latest.has(o.vehicle_id)) latest.set(o.vehicle_id, o);
      const rows = [...latest.values()].map(o => ({ o, v: s.vehicles.find(x => x.id === o.vehicle_id), c: s.clients.find(x => x.id === o.client_id) }))
        .filter(({ o, v }) => (o.next_service_date && o.next_service_date <= cutoff) || (o.next_service_km != null && v && num(v.mileage) >= num(o.next_service_km)))
        .map(({ o, v, c }) => ({
          id: o.id, order_number: o.order_number, next_service_date: o.next_service_date || null, next_service_km: o.next_service_km ?? null,
          client_name: c?.name || '', phone: c?.phone || '', vehicle_name: v ? [v.make, v.model].filter(Boolean).join(' ') : '', registration: v?.registration || '', vehicle_mileage: v?.mileage ?? null
        }))
        .sort((a, b) => (a.next_service_date || '9999').localeCompare(b.next_service_date || '9999')).slice(0, 30);
      return { today: localToday(), rows };
    }

    if (table === 'stats') {
      const rows = s.orders.filter(o => inRange(o, q));
      const spent = rows.reduce((a, o) => a + num(o.spent_amount), 0), charged = rows.reduce((a, o) => a + num(o.charged_amount), 0);
      const top = (items, getKeys) => {
        const m = new Map();
        for (const o of items) for (const k of getKeys(o)) if (k) m.set(k, (m.get(k) || 0) + 1);
        return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
      };
      const dates = new Map();
      for (const o of rows) {
        const d = dates.get(o.date) || { date: o.date, spent: 0, charged: 0 };
        d.spent += num(o.spent_amount); d.charged += num(o.charged_amount);
        dates.set(o.date, d);
      }
      const first = s.orders.reduce((m, o) => (!m || o.date < m ? o.date : m), '');
      return {
        totals: { count: rows.length, spent, charged, difference: charged - spent, average: rows.length ? Math.round(charged / rows.length) : 0 },
        clients: s.clients.length, vehicles: s.vehicles.length, firstDate: first,
        trend: [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)),
        makes: top(rows, o => [s.vehicles.find(v => v.id === o.vehicle_id)?.make]),
        active: top(rows, o => [s.clients.find(c => c.id === o.client_id)?.name]),
        dtc: top(rows, codesOf),
        recent: sortOrders(s.orders.map(o => rich(s, o))).slice(0, 6)
      };
    }

    if (table === 'export.csv') {
      const rows = sortOrders(s.orders.filter(o => inRange(o, q)).map(o => rich(s, o)));
      return buildCsv(rows, s.settings.currency || 'RSD', STATUS_LABELS);
    }

    if (table === 'backups') {
      if (method === 'GET' && !parts[1]) return CloudSync.listBackups();
      if (method === 'POST' && parts[1] === 'restore') {
        const name = decodeURIComponent(body.name || '');
        return replaceAll(JSON.parse(await CloudSync.getBackup(name))).then(() => ({ ok: true }));
      }
      if (method === 'POST') return { filename: await makeBackup('manual') };
      if (method === 'GET') return new Blob([await CloudSync.getBackup(decodeURIComponent(parts[1]))], { type: 'application/json' });
      if (method === 'DELETE') { await CloudSync.deleteBackup(decodeURIComponent(parts[1])); return { ok: true }; }
    }

    err('Nepodržana operacija: ' + method + ' ' + url);
  }

  /* ---------- izvoz / uvoz cele evidencije (sa fotografijama) ---------- */
  async function exportAll() {
    const s = await read(true), out = clone(s);
    out.photos = [];
    for (const p of s.photos) {
      try { out.photos.push({ ...p, data: await photoData(p.id) }); }
      catch { out.photos.push({ ...p }); }
    }
    return new Blob([JSON.stringify(out)], { type: 'application/json' });
  }
  async function restore(file) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { err('Datoteka nije ispravna JSON kopija.'); }
    await lock(() => replaceAll(parsed));
  }

  return {
    call, restore, exportAll, photoData,
    autoBackup: () => lock(autoBackup),
    status: () => ({ offline, lastSync }),
    refresh: () => lock(() => pull().catch(e => { offline = true; throw e; }))
  };
})();
