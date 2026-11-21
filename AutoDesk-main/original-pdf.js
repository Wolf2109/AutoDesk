'use strict';

/*
 * PDF dokumenti za AutoDesk (pdfkit).
 *  - reportPdf  : izveštaj o radnim nalozima za period (A4 položeno)
 *  - orderPdf   : radni nalog za klijenta (A4 uspravno, sa fotografijama)
 *  - historyPdf : servisna istorija jednog vozila (A4 uspravno)
 * Fontovi se nalaze u folderu fonts/ (Inter) pa PDF radi isto na svakom računaru
 * i ispravno prikazuje č, ć, š, ž, đ i ćirilicu.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ROOT = path.join(__dirname, '..');
const FONT_FILES = {
    reg: path.join(ROOT, 'fonts', 'Inter-Regular.otf'),
    bold: path.join(ROOT, 'fonts', 'Inter-Bold.otf')
};
const LOGO = path.join(ROOT, 'public', 'slike', 'logo.png');
const F = { reg: 'Reg', bold: 'Bold' };

const C = {
    navy: '#0F1B2D', gold: '#FFB81C', goldDark: '#9A6700', goldSoft: '#FFF4D6',
    ink: '#1B2433', muted: '#667085', line: '#DDE2EA', zebra: '#F6F8FB', card: '#F3F5F9',
    totalBg: '#E7ECF3', green: '#17803D', red: '#C0392B', white: '#FFFFFF', onNavy: '#B9C4D6'
};

const STATUS_LABELS = {
    received: 'Primljeno',
    in_progress: 'U radu',
    waiting: 'Čeka deo',
    done: 'Završeno',
    delivered: 'Preuzeto'
};

/* ---------- pomoćne funkcije za formatiranje ---------- */

function formatMoney(cents, currency) {
    const n = Math.round(Number(cents) || 0), abs = Math.abs(n);
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + whole + ',' + String(abs % 100).padStart(2, '0') + ' ' + currency;
}

function formatDate(iso, style) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return style === 'YYYY-MM-DD' ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}.${m[2]}.${m[1]}`;
}

function formatNumber(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function nowStamp() {
    const d = new Date(), p = x => String(x).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function periodLabel(from, to, style) {
    const open = from <= '2000-01-01', end = to >= '9999-12-31';
    if (open && end) return 'Svi nalozi';
    if (open) return 'do ' + formatDate(to, style);
    if (end) return 'od ' + formatDate(from, style);
    return from === to ? formatDate(from, style) : `${formatDate(from, style)} – ${formatDate(to, style)}`;
}

const clean = v => String(v ?? '').trim();

/* ---------- osnovne komponente ---------- */

function createDoc(res, { landscape = false, title, shop }) {
    const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margins: { top: 40, bottom: 58, left: 40, right: 40 },
        bufferPages: true,
        info: { Title: title, Author: shop.name, Creator: 'AutoDesk' }
    });
    const hasFonts = fs.existsSync(FONT_FILES.reg) && fs.existsSync(FONT_FILES.bold);
    doc.registerFont(F.reg, hasFonts ? FONT_FILES.reg : 'Helvetica');
    doc.registerFont(F.bold, hasFonts ? FONT_FILES.bold : 'Helvetica-Bold');
    doc.font(F.reg);
    doc.pipe(res);
    return doc;
}

const bottomLimit = doc => doc.page.height - doc.page.margins.bottom;
const contentWidth = doc => doc.page.width - doc.page.margins.left - doc.page.margins.right;

/** Tamna traka sa logom, podacima radionice i naslovom dokumenta. Vraća y ispod zaglavlja. */
function drawHeader(doc, shop, { title, lines = [] }) {
    const W = doc.page.width, m = doc.page.margins.left, bandH = 92;
    doc.rect(0, 0, W, bandH).fill(C.navy);
    doc.rect(0, bandH, W, 3).fill(C.gold);

    const hasLogo = fs.existsSync(LOGO);
    let textX = m;
    if (hasLogo) {
        doc.image(LOGO, m - 6, 10, { width: 72, height: 72 });
        textX = m + 80;
    }

    // levo: naziv (ako nema logotipa) + podaci radionice
    const info = clean(shop.info).split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    const block = [];
    if (!hasLogo) block.push({ t: shop.name, f: F.bold, s: 15, c: C.white, h: 21 });
    info.forEach(t => block.push({ t, f: F.reg, s: 8.5, c: C.onNavy, h: 12.5 }));
    let ly = (bandH - block.reduce((a, b) => a + b.h, 0)) / 2;
    const leftW = W / 2 - textX - 8;
    for (const b of block) {
        doc.font(b.f).fontSize(b.s).fillColor(b.c).text(b.t, textX, ly, { width: leftW, height: b.h, ellipsis: true });
        ly += b.h;
    }

    // desno: naslov, broj dokumenta, dodatne linije
    const rx = W / 2, rw = W / 2 - m;
    doc.font(F.bold).fontSize(17).fillColor(C.white).text(title, rx, 18, { width: rw, align: 'right', lineBreak: false });
    let ry = 43;
    lines.forEach((t, i) => {
        doc.font(i === 0 ? F.bold : F.reg).fontSize(i === 0 ? 12 : 8.5).fillColor(i === 0 ? C.gold : C.onNavy)
            .text(t, rx, ry, { width: rw, align: 'right', lineBreak: false });
        ry += i === 0 ? 18 : 12.5;
    });
    return bandH + 3 + 20;
}

/** Podnožje na svim stranicama: naziv radionice, vreme generisanja i broj strane. */
function drawFooters(doc, shop) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const p = doc.page, m = p.margins.left, y = p.height - 32, keep = p.margins.bottom;
        p.margins.bottom = 0; // da upis u donjoj margini ne napravi novu stranicu
        doc.moveTo(m, y - 8).lineTo(p.width - m, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
        doc.font(F.reg).fontSize(7.5).fillColor(C.muted);
        doc.text(`${shop.name}  ·  Generisano ${nowStamp()}`, m, y, { width: (p.width - 2 * m) * 0.75, lineBreak: false });
        doc.text(`Strana ${i + 1} od ${range.count}`, m, y, { width: p.width - 2 * m, align: 'right', lineBreak: false });
        p.margins.bottom = keep;
    }
}

function sectionTitle(doc, text, y) {
    const m = doc.page.margins.left;
    doc.font(F.bold).fontSize(8).fillColor(C.goldDark).text(text.toUpperCase(), m, y, { characterSpacing: 0.8, lineBreak: false });
    doc.moveTo(m, y + 13).lineTo(m + contentWidth(doc), y + 13).lineWidth(0.6).strokeColor(C.line).stroke();
    return y + 22;
}

/** Kartice sa ključnim brojevima u jednom redu. */
function drawCards(doc, y, items) {
    const m = doc.page.margins.left, gap = 10, n = items.length;
    const w = (contentWidth(doc) - gap * (n - 1)) / n, h = 54;
    items.forEach((it, i) => {
        const x = m + i * (w + gap);
        doc.roundedRect(x, y, w, h, 6).fill(C.card);
        doc.rect(x, y + 9, 3, h - 18).fill(it.accent || C.gold);
        doc.font(F.reg).fontSize(7).fillColor(C.muted)
            .text(it.label.toUpperCase(), x + 14, y + 11, { width: w - 20, lineBreak: false, characterSpacing: 0.6 });
        doc.font(F.bold).fontSize(it.size || 13.5).fillColor(it.color || C.ink)
            .text(it.value, x + 14, y + 27, { width: w - 20, lineBreak: false });
    });
    return y + h + 18;
}

/** Kartica sa parovima oznaka/vrednost (klijent, vozilo). rows: [[oznaka, vrednost], ...] */
function infoCardHeight(rows) {
    return 32 + Math.max(1, rows.filter(r => clean(r[1])).length) * 16 + 6;
}

function drawInfoCard(doc, x, y, w, h, title, rows) {
    doc.roundedRect(x, y, w, h, 6).fill(C.card);
    doc.rect(x, y + 10, 3, 14).fill(C.gold);
    doc.font(F.bold).fontSize(8).fillColor(C.goldDark).text(title.toUpperCase(), x + 14, y + 13, { characterSpacing: 0.8, lineBreak: false });
    let ry = y + 32;
    for (const [label, value] of rows) {
        if (!clean(value)) continue;
        doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text(label, x + 14, ry + 2, { width: 66, lineBreak: false });
        doc.font(F.bold).fontSize(9.5).fillColor(C.ink).text(clean(value), x + 82, ry, { width: w - 94, height: 13, ellipsis: true });
        ry += 16;
    }
}

function ensureSpace(doc, needed) {
    if (doc.y + needed > bottomLimit(doc)) doc.addPage();
}

/**
 * Tabela sa ponavljanjem zaglavlja na svakoj stranici.
 * columns: [{ label, w, align, lines(row) -> [{t, bold, color, size}], maxLines }]
 * row._total = true crta red ukupno.
 */
function drawTable(doc, { columns, rows, y, pad = 6 }) {
    const m = doc.page.margins.left, totalW = columns.reduce((a, c) => a + c.w, 0);
    const lineH = size => size * 1.28;

    const measure = row => {
        let h = 0;
        for (const col of columns) {
            let ch = 0;
            for (const ln of col.lines(row)) {
                doc.font(ln.bold ? F.bold : F.reg).fontSize(ln.size || 8.5);
                ch += doc.heightOfString(clean(ln.t) || ' ', { width: col.w - 2 * pad });
            }
            if (col.maxLines) ch = Math.min(ch, col.maxLines * lineH(8.5) + 2);
            h = Math.max(h, ch);
        }
        return Math.max(h + 2 * pad - 1, 24);
    };

    const head = at => {
        doc.rect(m, at, totalW, 22).fill(C.navy);
        let x = m;
        for (const col of columns) {
            doc.font(F.bold).fontSize(7.5).fillColor(C.white)
                .text(col.label.toUpperCase(), x + pad, at + 7, { width: col.w - 2 * pad, align: col.align || 'left', lineBreak: false, characterSpacing: 0.5 });
            x += col.w;
        }
        return at + 22;
    };

    y = head(y);
    rows.forEach((row, idx) => {
        const h = measure(row);
        if (y + h > bottomLimit(doc)) {
            doc.addPage();
            y = head(doc.page.margins.top);
        }
        if (row._total) doc.rect(m, y, totalW, h).fill(C.totalBg);
        else if (idx % 2 === 1) doc.rect(m, y, totalW, h).fill(C.zebra);
        if (!row._total) doc.moveTo(m, y + h).lineTo(m + totalW, y + h).lineWidth(0.4).strokeColor(C.line).stroke();

        let x = m;
        for (const col of columns) {
            let cy = y + pad;
            const maxH = col.maxLines ? col.maxLines * lineH(8.5) + 2 : null;
            const startY = cy;
            for (const ln of col.lines(row)) {
                const size = ln.size || 8.5;
                doc.font(ln.bold || row._total ? F.bold : F.reg).fontSize(size).fillColor(ln.color || C.ink);
                const txt = clean(ln.t) || ' ';
                const full = doc.heightOfString(txt, { width: col.w - 2 * pad });
                const avail = maxH ? Math.max(0, maxH - (cy - startY)) : full;
                const hh = Math.min(full, avail);
                if (hh <= 0) break;
                doc.text(txt, x + pad, cy, { width: col.w - 2 * pad, align: col.align || 'left', height: hh + 1, ellipsis: true });
                cy += hh;
            }
            x += col.w;
        }
        y += h;
    });
    return y;
}

/* ---------- 1) Izveštaj ---------- */

function reportPdf(res, { rows, from, to, currency, shop }) {
    const doc = createDoc(res, { landscape: true, title: 'Izveštaj o radnim nalozima', shop });
    const d = iso => formatDate(iso, shop.dateFormat), money = v => formatMoney(v, currency);

    let y = drawHeader(doc, shop, {
        title: 'IZVEŠTAJ O RADNIM NALOZIMA',
        lines: ['Period: ' + periodLabel(from, to, shop.dateFormat), 'Valuta: ' + currency]
    });

    const spent = rows.reduce((a, r) => a + r.spent_amount, 0), charged = rows.reduce((a, r) => a + r.charged_amount, 0);
    const diff = charged - spent;
    y = drawCards(doc, y, [
        { label: 'Broj naloga', value: String(rows.length), accent: C.navy },
        { label: 'Naplaćeno', value: money(charged), accent: C.gold },
        { label: 'Potrošeno', value: money(spent), accent: C.red },
        { label: 'Razlika', value: money(diff), accent: diff < 0 ? C.red : C.green, color: diff < 0 ? C.red : C.green },
        { label: 'Prosek po nalogu', value: money(rows.length ? Math.round(charged / rows.length) : 0), accent: C.navy }
    ]);

    // mesečni pregled (samo kada period obuhvata više meseci)
    const byMonth = new Map();
    for (const r of rows) {
        const k = r.date.slice(0, 7), e = byMonth.get(k) || { month: k, count: 0, spent: 0, charged: 0 };
        e.count++; e.spent += r.spent_amount; e.charged += r.charged_amount;
        byMonth.set(k, e);
    }
    if (byMonth.size > 1) {
        const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24);
        const monthNames = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
        y = sectionTitle(doc, 'Pregled po mesecima', y);
        const total = { _total: true, month: 'UKUPNO', count: rows.length, spent, charged };
        const cols = [
            { label: 'Mesec', w: 230, lines: r => [{ t: r._total ? r.month : `${monthNames[+r.month.slice(5) - 1]} ${r.month.slice(0, 4)}` }] },
            { label: 'Naloga', w: 90, align: 'right', lines: r => [{ t: r.count }] },
            { label: 'Potrošeno', w: 147, align: 'right', lines: r => [{ t: money(r.spent) }] },
            { label: 'Naplaćeno', w: 147, align: 'right', lines: r => [{ t: money(r.charged) }] },
            { label: 'Razlika', w: 148, align: 'right', lines: r => [{ t: money(r.charged - r.spent), color: r.charged - r.spent < 0 ? C.red : C.green, bold: true }] }
        ];
        y = drawTable(doc, { columns: cols, rows: [...months, total], y, pad: 5 }) + 22;
    }

    doc.y = y;
    ensureSpace(doc, 90);
    y = sectionTitle(doc, 'Pregled radnih naloga', doc.y);

    const columns = [
        { label: 'Nalog', w: 68, lines: r => r._total ? [{ t: 'UKUPNO' }] : [{ t: r.order_number, bold: true }, { t: STATUS_LABELS[r.status] || '', size: 7, color: C.muted }] },
        { label: 'Datum', w: 60, lines: r => r._total ? [{ t: '' }] : [{ t: d(r.date) }] },
        { label: 'Klijent / Vozilo', w: 190, lines: r => r._total ? [{ t: rows.length + ' naloga', color: C.muted }] : [{ t: r.client_name, bold: true }, { t: clean(r.vehicle_name).replace(/\s•\s*$/, ''), color: C.muted, size: 8 }] },
        { label: 'Opis posla', w: 222, maxLines: 3, lines: r => r._total ? [{ t: '' }] : [{ t: r.description }] },
        { label: 'Potrošeno', w: 74, align: 'right', lines: r => [{ t: money(r.spent_amount) }] },
        { label: 'Naplaćeno', w: 74, align: 'right', lines: r => [{ t: money(r.charged_amount) }] },
        { label: 'Razlika', w: 74, align: 'right', lines: r => [{ t: money(r.charged_amount - r.spent_amount), bold: true, color: r.charged_amount - r.spent_amount < 0 ? C.red : C.green }] }
    ];
    const total = { _total: true, spent_amount: spent, charged_amount: charged };
    if (rows.length) drawTable(doc, { columns, rows: [...rows, total], y });
    else doc.font(F.reg).fontSize(10).fillColor(C.muted).text('Nema radnih naloga u izabranom periodu.', doc.page.margins.left, y + 6);

    drawFooters(doc, shop);
    doc.end();
}

/* ---------- 2) Radni nalog (za klijenta) ---------- */

function orderPdf(res, { order, client, vehicle, photos = [], currency, shop }) {
    const doc = createDoc(res, { title: 'Radni nalog ' + order.order_number, shop });
    const d = iso => formatDate(iso, shop.dateFormat), m = doc.page.margins.left, W = contentWidth(doc);

    let y = drawHeader(doc, shop, {
        title: 'RADNI NALOG',
        lines: [order.order_number, 'Datum: ' + d(order.date), 'Status: ' + (STATUS_LABELS[order.status] || '')]
    });

    // klijent i vozilo
    const km = order.mileage ?? vehicle.mileage;
    const clientRows = [['Ime', client.name], ['Telefon', client.phone], ['Email', client.email]];
    const vehicleRows = [
        ['Vozilo', `${vehicle.make} ${vehicle.model}`], ['Registracija', vehicle.registration], ['VIN', vehicle.vin],
        ['Godište', vehicle.year], ['Motor', [vehicle.engine, vehicle.power, vehicle.fuel].map(clean).filter(Boolean).join(' · ')],
        ['Kilometraža', km != null ? formatNumber(km) + ' km' : '']
    ];
    const gap = 12, cw = (W - gap) / 2, ch = Math.max(infoCardHeight(clientRows), infoCardHeight(vehicleRows));
    drawInfoCard(doc, m, y, cw, ch, 'Klijent', clientRows);
    drawInfoCard(doc, m + cw + gap, y, cw, ch, 'Vozilo', vehicleRows);
    doc.y = y + ch + 18;

    // tekstualne sekcije
    const textBlock = (title, text) => {
        if (!clean(text)) return;
        ensureSpace(doc, 70);
        const ty = sectionTitle(doc, title, doc.y);
        doc.font(F.reg).fontSize(10).fillColor(C.ink).text(clean(text), m, ty, { width: W, lineGap: 2.5 });
        doc.y += 14;
    };

    textBlock('Prijavljeni problem', order.complaint);

    const codes = clean(order.dtc_codes).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    if (codes.length) {
        ensureSpace(doc, 70);
        let cy = sectionTitle(doc, 'Dijagnostika – kodovi grešaka', doc.y), cx = m;
        doc.font(F.bold).fontSize(9);
        for (const code of codes) {
            const pw = Math.min(W, doc.widthOfString(code) + 18);
            if (cx + pw > m + W) { cx = m; cy += 22; }
            if (cy + 18 > bottomLimit(doc)) { doc.addPage(); cy = doc.page.margins.top; cx = m; }
            doc.roundedRect(cx, cy, pw, 17, 8.5).fillAndStroke(C.goldSoft, C.gold);
            doc.font(F.bold).fontSize(9).fillColor(C.ink).text(code, cx + 9, cy + 4.5, { width: pw - 12, height: 11, ellipsis: true });
            cx += pw + 6;
        }
        doc.y = cy + 32;
    }

    textBlock('Izvršeni radovi', order.description);
    textBlock('Napomena', order.notes);

    // iznos
    ensureSpace(doc, 80);
    y = doc.y + 2;
    doc.roundedRect(m, y, W, 46, 7).fill(C.navy);
    doc.font(F.reg).fontSize(9).fillColor(C.onNavy).text('UKUPNO NAPLAĆENO', m + 18, y + 11, { characterSpacing: 0.8, lineBreak: false });
    doc.font(F.reg).fontSize(8).fillColor(C.onNavy).text('Iznos je naveden u valuti: ' + currency, m + 18, y + 26, { lineBreak: false });
    doc.font(F.bold).fontSize(20).fillColor(C.gold).text(formatMoney(order.charged_amount, currency), m, y + 13, { width: W - 18, align: 'right', lineBreak: false });
    doc.y = y + 46 + 14;

    if (order.next_service_date || order.next_service_km != null) {
        ensureSpace(doc, 50);
        y = doc.y;
        const parts = [];
        if (order.next_service_date) parts.push('do ' + d(order.next_service_date));
        if (order.next_service_km != null) parts.push('ili na ' + formatNumber(order.next_service_km) + ' km');
        doc.roundedRect(m, y, W, 32, 6).fillAndStroke(C.goldSoft, C.gold);
        doc.font(F.bold).fontSize(9).fillColor(C.goldDark).text('PREPORUČENI SLEDEĆI SERVIS', m + 14, y + 7, { characterSpacing: 0.6, lineBreak: false });
        doc.font(F.bold).fontSize(10).fillColor(C.ink).text(parts.join(' '), m + 14, y + 18, { width: W - 28, lineBreak: false });
        doc.y = y + 32 + 16;
    }

    // fotografije
    if (photos.length) {
        ensureSpace(doc, 160);
        let py = sectionTitle(doc, 'Fotografije', doc.y);
        const cols = 3, g = 10, pw = (W - g * (cols - 1)) / cols, ph = pw * 0.75;
        photos.forEach((buf, i) => {
            const col = i % cols;
            if (col === 0 && i > 0) py += ph + g;
            if (py + ph > bottomLimit(doc)) { doc.addPage(); py = doc.page.margins.top; }
            const px = m + col * (pw + g);
            doc.roundedRect(px, py, pw, ph, 4).fill(C.card);
            try { doc.image(buf, px, py, { fit: [pw, ph], align: 'center', valign: 'center' }); } catch (e) { /* neispravna slika se preskače */ }
        });
        doc.y = py + ph + 20;
    }

    // potpisi
    ensureSpace(doc, 90);
    y = doc.y + 34;
    const sw = 190;
    doc.lineWidth(0.7).strokeColor(C.muted);
    doc.moveTo(m, y).lineTo(m + sw, y).stroke();
    doc.moveTo(m + W - sw, y).lineTo(m + W, y).stroke();
    doc.font(F.reg).fontSize(8).fillColor(C.muted)
        .text('Predao (radionica)', m, y + 5, { width: sw, align: 'center', lineBreak: false })
        .text('Preuzeo (klijent)', m + W - sw, y + 5, { width: sw, align: 'center', lineBreak: false });

    drawFooters(doc, shop);
    doc.end();
}

/* ---------- 3) Servisna istorija vozila ---------- */

function historyPdf(res, { vehicle, client, orders, currency, shop }) {
    const name = `${vehicle.make} ${vehicle.model}`;
    const doc = createDoc(res, { title: 'Servisna istorija – ' + name, shop });
    const d = iso => formatDate(iso, shop.dateFormat), money = v => formatMoney(v, currency);
    const m = doc.page.margins.left, W = contentWidth(doc);

    let y = drawHeader(doc, shop, {
        title: 'SERVISNA ISTORIJA',
        lines: [name, clean(vehicle.registration), 'Servisa: ' + orders.length]
    });

    const vehicleRows = [
        ['Vozilo', name], ['Registracija', vehicle.registration], ['VIN', vehicle.vin], ['Godište', vehicle.year],
        ['Motor', [vehicle.engine, vehicle.power, vehicle.fuel].map(clean).filter(Boolean).join(' · ')],
        ['Kilometraža', vehicle.mileage != null ? formatNumber(vehicle.mileage) + ' km' : '']
    ];
    const clientRows = [['Vlasnik', client.name], ['Telefon', client.phone], ['Email', client.email]];
    const gap = 12, cw = (W - gap) / 2, ch = Math.max(infoCardHeight(clientRows), infoCardHeight(vehicleRows));
    drawInfoCard(doc, m, y, cw, ch, 'Vozilo', vehicleRows);
    drawInfoCard(doc, m + cw + gap, y, cw, ch, 'Vlasnik', clientRows);
    y = sectionTitle(doc, 'Izvršeni servisi', y + ch + 18);

    const charged = orders.reduce((a, o) => a + o.charged_amount, 0);
    const columns = [
        { label: 'Datum', w: 62, lines: r => r._total ? [{ t: 'UKUPNO' }] : [{ t: d(r.date), bold: true }] },
        { label: 'Nalog', w: 62, lines: r => r._total ? [{ t: '' }] : [{ t: r.order_number, color: C.muted }] },
        { label: 'Km', w: 58, align: 'right', lines: r => r._total ? [{ t: '' }] : [{ t: r.mileage != null ? formatNumber(r.mileage) : '–', color: C.muted }] },
        { label: 'Izvršeni radovi', w: 233, maxLines: 8, lines: r => r._total ? [{ t: orders.length + ' servisa', color: C.muted }] : [{ t: r.description }].concat(clean(r.dtc_codes) ? [{ t: 'Kodovi: ' + clean(r.dtc_codes), size: 7.5, color: C.goldDark, bold: true }] : []) },
        { label: 'Iznos', w: 100, align: 'right', lines: r => [{ t: money(r.charged_amount), bold: true }] }
    ];
    if (orders.length) drawTable(doc, { columns, rows: [...orders, { _total: true, charged_amount: charged }], y });
    else doc.font(F.reg).fontSize(10).fillColor(C.muted).text('Za ovo vozilo još nema radnih naloga.', m, y + 6);

    drawFooters(doc, shop);
    doc.end();
}

module.exports = { reportPdf, orderPdf, historyPdf, STATUS_LABELS, formatDate };
