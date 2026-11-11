'use strict';

const express = require('express'),
      Database = require('better-sqlite3'),
      fs = require('fs'),
      path = require('path'),
      crypto = require('crypto'),
      multer = require('multer'),
      sharp = require('sharp'),
      PDFDocument = require('pdfkit');

const ROOT = __dirname,
      DATA = path.resolve(process.env.AUTODESK_DATA || path.join(ROOT, 'data')),
      UP = path.join(DATA, 'uploads'),
      BACK = path.join(DATA, 'backups');

[DATA, UP, BACK].forEach(p => fs.mkdirSync(p, { recursive: true }));

const db = new Database(path.join(DATA, 'autodesk.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
    CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER, engine TEXT DEFAULT '', power TEXT DEFAULT '', fuel TEXT DEFAULT '', registration TEXT DEFAULT '', vin TEXT DEFAULT '', mileage INTEGER, notes TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS work_orders(id INTEGER PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, date TEXT NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT, description TEXT NOT NULL, notes TEXT DEFAULT '', spent_amount INTEGER NOT NULL DEFAULT 0 CHECK(spent_amount>=0), charged_amount INTEGER NOT NULL DEFAULT 0 CHECK(charged_amount>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price_amount INTEGER NOT NULL DEFAULT 0 CHECK(price_amount>=0));
    CREATE TABLE IF NOT EXISTS work_order_photos(id INTEGER PRIMARY KEY, work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, filename TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    
    CREATE INDEX IF NOT EXISTS idx_vehicles_client ON vehicles(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON work_orders(date);
    CREATE INDEX IF NOT EXISTS idx_orders_client ON work_orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_vehicle ON work_orders(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_photos_order ON work_order_photos(work_order_id);
`);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    next();
});

const sessions = new Map();

function setting(k, def = '') {
    return db.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value ?? def;
}

function setSetting(k, v) {
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
}

function auth(req, res, next) {
    if (['/api/auth/status', '/api/auth/login', '/api/auth/setup', '/api/health'].includes(req.path)) return next();
    let t = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!t || !sessions.has(t)) return res.status(401).json({ error: 'Prijavite se.' });
    if (sessions.get(t) < Date.now()) {
        sessions.delete(t);
        return res.status(401).json({ error: 'Sesija je istekla.' });
    }
    sessions.set(t, Date.now() + 12 * 3600000);
    next();
}

function hash(pass, salt) {
    return crypto.scryptSync(pass, salt, 64).toString('hex');
}

function verify(pass) {
    const s = setting('auth_salt'), h = setting('auth_hash');
    if (!s || !h) return false;
    return crypto.timingSafeEqual(Buffer.from(hash(pass, s), 'hex'), Buffer.from(h, 'hex'));
}

app.get('/api/health', (q, r) => r.json({ ok: true }));
app.get('/api/auth/status', (q, r) => r.json({ setup: !!setting('auth_hash') }));

app.post('/api/auth/setup', (q, r) => {
    if (setting('auth_hash')) return r.status(403).json({ error: 'Lozinka je već podešena.' });
    let p = q.body.password;
    if (typeof p !== 'string' || p.length < 6) return r.status(400).json({ error: 'Lozinka mora imati najmanje 6 znakova.' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.transaction(() => {
        setSetting('auth_salt', salt);
        setSetting('auth_hash', hash(p, salt));
    })();
    r.json({ ok: true });
});

app.post('/api/auth/login', (q, r) => {
    if (!verify(q.body.password || '')) return r.status(401).json({ error: 'Pogrešna lozinka.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 12 * 3600000);
    r.json({ token });
});

app.use('/api', auth);

app.post('/api/auth/logout', (q, r) => {
    sessions.delete((q.headers.authorization || '').replace(/^Bearer /, ''));
    r.json({ ok: true });
});

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const str = (x, max = 1000) => String(x ?? '').trim().slice(0, max);
const id = x => {
    let n = Number(x);
    if (!Number.isSafeInteger(n) || n < 1) throw fail('Neispravan ID.');
    return n;
};
const money = x => {
    if (x === '' || x == null) return 0;
    let n = Number(x);
    if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) > Number.MAX_SAFE_INTEGER) throw fail('Neispravan iznos.');
    return Math.round(n * 100);
};
const date = x => {
    let s = str(x, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s) throw fail('Neispravan datum.');
    return s;
};

const wrap = fn => (q, r) => {
    try {
        fn(q, r);
    } catch (e) {
        console.error(e);
        r.status(e.status || 500).json({ error: e.status ? e.message : 'Greška na serveru.' });
    }
};

function exists(table, key) {
    return !!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(key);
}

const schemas = {
    clients: ['name', 'phone', 'email', 'notes'],
    vehicles: ['client_id', 'make', 'model', 'year', 'engine', 'power', 'fuel', 'registration', 'vin', 'mileage', 'notes'],
    services: ['name', 'price_amount']
};

function clean(table, b) {
    if (table === 'clients') {
        let name = str(b.name, 160);
        if (!name) throw fail('Unesite ime klijenta.');
        return { name, phone: str(b.phone, 80), email: str(b.email, 160), notes: str(b.notes, 3000) };
    }
    if (table === 'vehicles') {
        let client_id = id(b.client_id), make = str(b.make, 100), model = str(b.model, 100);
        if (!exists('clients', client_id)) throw fail('Klijent ne postoji.');
        if (!make || !model) throw fail('Marka i model su obavezni.');
        let year = b.year === '' || b.year == null ? null : Number(b.year),
            mileage = b.mileage === '' || b.mileage == null ? null : Number(b.mileage);
        if (year !== null && (!Number.isInteger(year) || year < 1886 || year > 2200)) throw fail('Neispravno godište.');
        if (mileage !== null && (!Number.isSafeInteger(mileage) || mileage < 0)) throw fail('Neispravna kilometraža.');
        return { client_id, make, model, year, engine: str(b.engine, 120), power: str(b.power, 80), fuel: str(b.fuel, 80), registration: str(b.registration, 60), vin: str(b.vin, 80), mileage, notes: str(b.notes, 3000) };
    }
    let name = str(b.name, 180);
    if (!name) throw fail('Naziv usluge je obavezan.');
    return { name, price_amount: money(b.price_amount) };
}

for (const table of Object.keys(schemas)) {
    app.get('/api/' + table, wrap((q, r) => {
        const search = str(q.query.search, 150);
        let where = '', args = [];
        if (search) {
            const cols = table === 'clients' ? ['name', 'phone', 'email'] : table === 'vehicles' ? ['make', 'model', 'registration', 'vin'] : ['name'];
            where = ' WHERE ' + cols.map(c => `${c} LIKE ?`).join(' OR ');
            args = cols.map(() => '%' + search + '%');
        }
        r.json(db.prepare(`SELECT * FROM ${table}${where} ORDER BY id DESC LIMIT 2000`).all(...args));
    }));

    app.post('/api/' + table, wrap((q, r) => {
        let b = clean(table, q.body), keys = Object.keys(b);
        const result = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(b));
        r.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(result.lastInsertRowid));
    }));

    app.put('/api/' + table + '/:id', wrap((q, r) => {
        let key = id(q.params.id);
        if (!exists(table, key)) throw fail('Zapis nije pronađen.', 404);
        let b = clean(table, q.body), keys = Object.keys(b);
        db.prepare(`UPDATE ${table} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...Object.values(b), key);
        r.json(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(key));
    }));

    app.delete('/api/' + table + '/:id', wrap((q, r) => {
        let key = id(q.params.id);
        if (!exists(table, key)) throw fail('Zapis nije pronađen.', 404);
        if (table === 'clients' && (db.prepare('SELECT 1 FROM vehicles WHERE client_id=?').get(key) || db.prepare('SELECT 1 FROM work_orders WHERE client_id=?').get(key))) throw fail('Klijent ima povezana vozila ili naloge. Istorija je zaštićena.', 409);
        if (table === 'vehicles' && db.prepare('SELECT 1 FROM work_orders WHERE vehicle_id=?').get(key)) throw fail('Vozilo ima radne naloge. Istorija je zaštićena.', 409);
        db.prepare(`DELETE FROM ${table} WHERE id=?`).run(key);
        r.json({ ok: true });
    }));
}

function orderInput(b) {
    const client_id = id(b.client_id), vehicle_id = id(b.vehicle_id);
    if (!exists('clients', client_id)) throw fail('Klijent ne postoji.');
    if (db.prepare('SELECT client_id FROM vehicles WHERE id=?').get(vehicle_id)?.client_id !== client_id) throw fail('Vozilo ne pripada izabranom klijentu.');
    const description = str(b.description, 5000);
    if (!description) throw fail('Opis posla je obavezan.');
    return { date: date(b.date), client_id, vehicle_id, description, notes: str(b.notes, 5000), spent_amount: money(b.spent_amount), charged_amount: money(b.charged_amount) };
}

const orderSelect = `SELECT w.*, c.name client_name, v.make || ' ' || v.model || ' • ' || COALESCE(v.registration, '') vehicle_name, (w.charged_amount - w.spent_amount) difference FROM work_orders w JOIN clients c ON c.id=w.client_id JOIN vehicles v ON v.id=w.vehicle_id`;

app.get('/api/orders', wrap((q, r) => {
    let w = [], p = [];
    if (q.query.from) { w.push('w.date>=?'); p.push(date(q.query.from)); }
    if (q.query.to) { w.push('w.date<=?'); p.push(date(q.query.to)); }
    if (q.query.client_id) { w.push('w.client_id=?'); p.push(id(q.query.client_id)); }
    if (q.query.vehicle_id) { w.push('w.vehicle_id=?'); p.push(id(q.query.vehicle_id)); }
    if (q.query.search) {
        let s = '%' + str(q.query.search, 100) + '%';
        w.push('(w.order_number LIKE ? OR w.description LIKE ? OR c.name LIKE ? OR v.registration LIKE ?)');
        p.push(s, s, s, s);
    }
    r.json(db.prepare(orderSelect + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY w.date DESC, w.id DESC LIMIT 5000').all(...p));
}));

app.get('/api/orders/:id', wrap((q, r) => {
    let key = id(q.params.id), v = db.prepare(orderSelect + ' WHERE w.id=?').get(key);
    if (!v) throw fail('Nalog nije pronađen.', 404);
    v.photos = db.prepare('SELECT id,filename FROM work_order_photos WHERE work_order_id=?').all(key).map(p => ({ id: p.id, url: '/api/photos/' + p.id }));
    r.json(v);
}));

app.post('/api/orders', wrap((q, r) => {
    let b = orderInput(q.body);
    let v = db.transaction(() => {
        let next = Number(setting('order_sequence', '0')) + 1;
        setSetting('order_sequence', next);
        let order_number = 'RN-' + String(next).padStart(6, '0'),
            keys = ['order_number', ...Object.keys(b)],
            vals = [order_number, ...Object.values(b)];
        let result = db.prepare(`INSERT INTO work_orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
        return db.prepare(orderSelect + ' WHERE w.id=?').get(result.lastInsertRowid);
    })();
    r.status(201).json(v);
}));

app.put('/api/orders/:id', wrap((q, r) => {
    let key = id(q.params.id);
    if (!exists('work_orders', key)) throw fail('Nalog nije pronađen.', 404);
    let b = orderInput(q.body);
    db.prepare('UPDATE work_orders SET ' + Object.keys(b).map(k => k + '=?').join(',') + ', updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...Object.values(b), key);
    r.json(db.prepare(orderSelect + ' WHERE w.id=?').get(key));
}));

app.delete('/api/orders/:id', wrap((q, r) => {
    let key = id(q.params.id), photos = db.prepare('SELECT filename FROM work_order_photos WHERE work_order_id=?').all(key);
    let result = db.prepare('DELETE FROM work_orders WHERE id=?').run(key);
    if (!result.changes) throw fail('Nalog nije pronađen.', 404);
    for (let p of photos) fs.rmSync(path.join(UP, p.filename), { force: true });
    r.json({ ok: true });
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 12 } });

app.post('/api/orders/:id/photos', upload.array('photos', 12), async (q, r) => {
    try {
        let key = id(q.params.id);
        if (!exists('work_orders', key)) throw fail('Nalog nije pronađen.', 404);
        if (!q.files?.length) throw fail('Izaberite fotografije.');
        let saved = [];
        for (const f of q.files) {
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(f.mimetype)) throw fail('Dozvoljene su samo fotografije.');
            let filename = crypto.randomUUID() + '.webp';
            await sharp(f.buffer, { limitInputPixels: 40000000 })
                .rotate()
                .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 78 })
                .toFile(path.join(UP, filename));
            let out = db.prepare('INSERT INTO work_order_photos(work_order_id,filename) VALUES(?,?)').run(key, filename);
            saved.push({ id: Number(out.lastInsertRowid), url: '/api/photos/' + out.lastInsertRowid });
        }
        r.status(201).json(saved);
    } catch (e) {
        r.status(e.status || 400).json({ error: e.message });
    }
});

app.get('/api/photos/:id', wrap((q, r) => {
    let p = db.prepare('SELECT filename FROM work_order_photos WHERE id=?').get(id(q.params.id));
    if (!p) throw fail('Fotografija nije pronađena.', 404);
    r.type('webp').sendFile(path.join(UP, p.filename));
}));

app.delete('/api/photos/:id', wrap((q, r) => {
    let key = id(q.params.id), p = db.prepare('SELECT filename FROM work_order_photos WHERE id=?').get(key);
    if (!p) throw fail('Fotografija nije pronađena.', 404);
    db.prepare('DELETE FROM work_order_photos WHERE id=?').run(key);
    fs.rmSync(path.join(UP, p.filename), { force: true });
    r.json({ ok: true });
}));

function range(q) {
    let from = q.query.from ? date(q.query.from) : '0000-01-01',
        to = q.query.to ? date(q.query.to) : '9999-12-31';
    if (from > to) throw fail('Početni datum mora biti pre završnog.');
    return { from, to };
}

app.get('/api/stats', wrap((q, r) => {
    let { from, to } = range(q), args = [from, to],
        totals = db.prepare('SELECT COUNT(*) count, COALESCE(SUM(spent_amount),0) spent, COALESCE(SUM(charged_amount),0) charged FROM work_orders WHERE date BETWEEN ? AND ?').get(...args);
    r.json({
        totals: { ...totals, difference: totals.charged - totals.spent, average: totals.count ? Math.round(totals.charged / totals.count) : 0 },
        clients: db.prepare('SELECT COUNT(*) n FROM clients').get().n,
        vehicles: db.prepare('SELECT COUNT(*) n FROM vehicles').get().n,
        trend: db.prepare('SELECT date, SUM(spent_amount) spent, SUM(charged_amount) charged FROM work_orders WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date').all(...args),
        makes: db.prepare('SELECT v.make name, COUNT(*) count FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.date BETWEEN ? AND ? GROUP BY v.make ORDER BY count DESC LIMIT 5').all(...args),
        active: db.prepare('SELECT c.name, COUNT(*) count FROM work_orders w JOIN clients c ON c.id=w.client_id WHERE w.date BETWEEN ? AND ? GROUP BY c.id ORDER BY count DESC LIMIT 5').all(...args),
        recent: db.prepare(orderSelect + ' ORDER BY w.date DESC, w.id DESC LIMIT 6').all()
    });
}));

app.get('/api/export.csv', wrap((q, r) => {
    let { from, to } = range(q),
        rows = db.prepare(orderSelect + ' WHERE w.date BETWEEN ? AND ? ORDER BY w.date DESC').all(from, to);
    let currency = setting('currency', 'RSD');
    let fields = ['order_number', 'date', 'client_name', 'vehicle_name', 'description', 'notes', 'spent_amount', 'charged_amount', 'difference'];
    let esc = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    
    r.set('Content-Type', 'text/csv; charset=utf-8');
    r.set('Content-Disposition', 'attachment; filename="autodesk-report.csv"');
    r.send('\uFEFF' + fields.concat('currency').join(',') + '\r\n' + rows.map(x => fields.map(k => esc(k.endsWith('amount') || k === 'difference' ? (x[k] / 100).toFixed(2) : x[k])).concat(esc(currency)).join(',')).join('\r\n'));
}));

app.get('/api/export.pdf', wrap((q, r) => {
    let { from, to } = range(q),
        rows = db.prepare(orderSelect + ' WHERE w.date BETWEEN ? AND ? ORDER BY w.date DESC').all(from, to);
    let doc = new PDFDocument({ margin: 40, size: 'A4' });
    
    r.set('Content-Type', 'application/pdf');
    r.set('Content-Disposition', 'attachment; filename="autodesk-report.pdf"');
    doc.pipe(r);
    
    let font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        winfont = 'C:/Windows/Fonts/arial.ttf';
    if (fs.existsSync(font)) doc.font(font);
    else if (fs.existsSync(winfont)) doc.font(winfont);
    
    doc.fontSize(18).text('AutoDesk - Izveštaj');
    let currency = setting('currency', 'RSD');
    doc.fontSize(10).text(`Period: ${from} — ${to} | Valuta: ${currency}`);
    doc.moveDown();
    
    let spent = 0, charged = 0;
    for (const x of rows) {
        spent += x.spent_amount;
        charged += x.charged_amount;
        doc.fontSize(9).text(`${x.order_number} | ${x.date} | ${x.client_name} | ${x.vehicle_name}`);
        doc.text(`Potrošeno: ${(x.spent_amount / 100).toFixed(2)} ${currency} | Naplaćeno: ${(x.charged_amount / 100).toFixed(2)} ${currency} | Razlika: ${(x.difference / 100).toFixed(2)} ${currency}`);
        doc.moveDown(0.5);
    }
    
    doc.moveDown().fontSize(12).text(`Ukupno potrošeno: ${(spent / 100).toFixed(2)} ${currency} | Naplaćeno: ${(charged / 100).toFixed(2)} ${currency} | Razlika: ${((charged - spent) / 100).toFixed(2)} ${currency}`);
    doc.end();
}));

app.get('/api/settings', wrap((q, r) => {
    let rows = db.prepare("SELECT key,value FROM app_settings WHERE key NOT IN ('auth_salt','auth_hash','order_sequence')").all();
    r.json(Object.fromEntries(rows.map(x => [x.key, x.value])));
}));

app.put('/api/settings', wrap((q, r) => {
    const allowed = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM', 'HRK', 'MKD'];
    if ('currency' in q.body && !allowed.includes(q.body.currency)) throw fail('Nepodržana valuta.');
    
    const previous = setting('currency', 'RSD'),
          next = q.body.currency || previous;
          
    if (next !== previous) {
        if (!(['RSD', 'EUR'].includes(previous) && ['RSD', 'EUR'].includes(next))) {
            throw fail('Automatska konverzija je dostupna samo između RSD i EUR. Za ostale valute nije definisan kurs.');
        }
        if (q.body.confirm_conversion !== true) {
            throw fail('Potvrdite konverziju svih postojećih iznosa po kursu 1 EUR = 120 RSD.');
        }
        
        const numerator = previous === 'RSD' ? 1 : 120,
              denominator = previous === 'RSD' ? 120 : 1;
              
        const convert = value => {
            const result = Math.round(value * numerator / denominator);
            if (!Number.isSafeInteger(result)) throw fail('Iznos je prevelik za konverziju.');
            return result;
        };
        
        db.transaction(() => {
            for (const row of db.prepare('SELECT id,spent_amount,charged_amount FROM work_orders').all()) {
                db.prepare('UPDATE work_orders SET spent_amount=?, charged_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
                    .run(convert(row.spent_amount), convert(row.charged_amount), row.id);
            }
            for (const row of db.prepare('SELECT id,price_amount FROM services').all()) {
                db.prepare('UPDATE services SET price_amount=? WHERE id=?').run(convert(row.price_amount), row.id);
            }
            setSetting('currency', next);
        })();
    }
    
    for (const k of ['workshop_name', 'workshop_info', 'date_format']) {
        if (k in q.body) setSetting(k, str(q.body[k], 1000));
    }
    
    r.json({ ok: true, currency: next, converted: next !== previous, rate: '1 EUR = 120 RSD' });
}));

function backup() {
    let file = 'autodesk-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite';
    return db.backup(path.join(BACK, file)).then(() => file);
}

app.get('/api/backups', wrap((q, r) => r.json(fs.readdirSync(BACK).filter(x => /^autodesk-[\w-]+\.sqlite$/.test(x)).sort().reverse())));

app.post('/api/backups', async (q, r) => {
    try {
        r.json({ filename: await backup() });
    } catch (e) {
        r.status(500).json({ error: 'Rezervna kopija nije uspela.' });
    }
});

app.get('/api/backups/:name', wrap((q, r) => {
    let n = q.params.name;
    if (!/^autodesk-[\w-]+\.sqlite$/.test(n) || !fs.existsSync(path.join(BACK, n))) throw fail('Kopija nije pronađena.', 404);
    r.download(path.join(BACK, n));
}));

app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

app.use((e, q, r, next) => {
    console.error(e);
    r.status(400).json({ error: e.message || 'Greška pri obradi zahteva.' });
});

const port = Number(process.env.PORT || 3000),
      host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => console.log(`AutoDesk: http://localhost:${port}`));

setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (setting('last_backup') !== today) {
        backup().then(() => {
            setSetting('last_backup', today);
            let files = fs.readdirSync(BACK).filter(x => x.endsWith('.sqlite')).sort().reverse();
            files.slice(30).forEach(f => fs.rmSync(path.join(BACK, f), { force: true }));
        }).catch(console.error);
    }
}, 3600000).unref();