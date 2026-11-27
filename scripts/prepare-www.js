'use strict';
/*
 * Pravi folder www/ za Android aplikaciju iz istih fajlova koje koristi web verzija.
 * Dodatno preuzima Firebase SDK i fontove u www/vendor, da se aplikacija pokreće i bez interneta.
 * (Radi se u GitHub Actions, gde internet postoji.)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const SKIP = new Set(['sw.js', 'package.json', 'package-lock.json', 'capacitor.config.json', 'firestore.rules']);
const EXT = new Set(['.html', '.js', '.css', '.json', '.ico', '.png', '.jpg', '.svg', '.txt']);
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  if (f.isFile() && !SKIP.has(f.name) && EXT.has(path.extname(f.name))) fs.copyFileSync(path.join(root, f.name), path.join(out, f.name));
}
for (const d of ['icons', 'slike']) {
  if (fs.existsSync(path.join(root, d))) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
}

fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.copyFileSync(path.join(root, 'data', 'ecu_database.json'), path.join(out, 'data', 'ecu_database.json'));

async function get(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  const indexPath = path.join(out, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  fs.mkdirSync(path.join(out, 'vendor', 'fonts'), { recursive: true });

  // 1) Firebase SDK lokalno (bez ovoga se aplikacija ne bi pokrenula bez interneta)
  try {
    const urls = [...html.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/([\w-]+\.js)/g)];
    if (!urls.length) throw new Error('Firebase skripte nisu pronađene u index.html');
    for (const m of urls) {
      fs.writeFileSync(path.join(out, 'vendor', m[1]), await get(m[0]));
      html = html.split(m[0]).join('./vendor/' + m[1]);
    }
    console.log('Firebase SDK preuzet:', urls.map(m => m[1]).join(', '));
  } catch (e) {
    console.log('::warning::Firebase SDK nije preuzet lokalno; aplikacija će pri pokretanju zahtevati internet. ' + e.message);
  }

  // 2) Google fontovi lokalno
  try {
    const link = html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/);
    if (!link) throw new Error('Link ka fontovima nije pronađen');
    let css = (await get(link[0].replace(/&amp;/g, '&'), { 'User-Agent': UA })).toString('utf8');
    let i = 0;
    for (const m of [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)]) {
      const name = 'f' + i++ + '.woff2';
      fs.writeFileSync(path.join(out, 'vendor', 'fonts', name), await get(m[1]));
      css = css.split(m[1]).join('./fonts/' + name);
    }
    fs.writeFileSync(path.join(out, 'vendor', 'fonts.css'), css);
    html = html
      .replace(/<noscript>\s*<link[^>]*fonts\.googleapis[^>]*>\s*<\/noscript>/g, '')
      .replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '')
      .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
      .replace('<link rel="stylesheet" href="./style.css">', '<link rel="stylesheet" href="./vendor/fonts.css">\n    <link rel="stylesheet" href="./style.css">');
    console.log('Fontovi preuzeti:', i);
  } catch (e) {
    console.log('::warning::Fontovi nisu preuzeti lokalno (koristiće se rezervni fontovi bez interneta). ' + e.message);
  }

  fs.writeFileSync(indexPath, html);
  console.log('www/ spreman.');
})().catch(e => { console.error(e); process.exit(1); });
