'use strict';
// Public reference catalogs only; workshop/user data is independent.
(() => {
  const validators = {
    'vehicles-database.json': r => Array.isArray(r) && r.length > 0 && !!r[0].brand_name,
    'ecu_database.json': r => Array.isArray(r) && r.length > 0 && 'bosch_number' in r[0],
    'dtc-database.json': r => !!r?.generic && !!r?.manufacturers
  };
  const names = Object.keys(validators);
  const native = () => globalThis.Capacitor?.isNativePlatform?.() || location.hostname === '127.0.0.1';
  const local = name => new URL('./data/'+name, document.baseURI).href;
  const remote = name => native() ? 'https://app.autodijagnostikalazarevic.rs/data/'+name : local(name);
  const openCache = async () => {try {return await globalThis.caches?.open('autodesk-public-catalogs-v1');} catch (_) {return null;}};
  const read = async (response, validate) => {
    if (!response?.ok) throw Error('Baza nije dostupna');
    const data = await response.json();
    if (!validate(data)) throw Error('Neispravan format baze');
    return data;
  };
  globalThis.loadAutoDeskCatalog = async (name, validate) => {
    if (!names.includes(name)) throw Error('Nepoznata baza');
    const cache = await openCache();
    try {return await read(await cache?.match(remote(name)), validate);} catch (_) {}
    // Installed apps read bundled files; web downloads only on first use if not cached.
    const response = await fetch(local(name), {credentials:'omit', cache:name==='vehicles-database.json'?'no-cache':'force-cache'});
    const data = await read(response.clone(), validate);
    // Do not overwrite a newer manual sync with a bundled copy.
    try {if (cache) await cache.put(remote(name), response);} catch (_) {}
    return data;
  };
  let busy = false;
  async function sync() {
    if (busy) throw Error('Sinhronizacija je već u toku.');
    busy = true;
    try {
      const cache = await openCache();
      if (!cache) throw Error('Lokalni keš nije dostupan.');
      const results = [];
      for (const name of names) {
        try {
          const response = await fetch(remote(name), {credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(60000)});
          await read(response.clone(), validators[name]);
          await cache.put(remote(name), response);
          results.push({name, ok:true});
        } catch (e) {results.push({name, ok:false, error:e.message});}
      }
      if (results.some(r=>r.ok)) globalThis.dispatchEvent(new Event('autodesk-catalog-sync'));
      return results;
    } finally {busy = false;}
  }
  function mount(root) {
    if (!root) return;
    const panel = document.createElement('section'); panel.className='panel';
    const h = document.createElement('h3'); h.textContent='Sinhronizacija baza';
    const p = document.createElement('p'); p.className='subtle'; p.textContent='Baze vozila, ECU i DTC osvežavaju se samo na zahtev. Pretraga koristi lokalne podatke.';
    const b = document.createElement('button'); b.type='button'; b.className='secondary'; b.textContent='Sinhronizuj baze';
    const status = document.createElement('p'); status.className='subtle'; status.setAttribute('role','status');
    b.onclick = async () => {
      b.disabled=true; status.textContent='Preuzimanje baza…';
      try {
        const results=await sync(); const failures=results.filter(r=>!r.ok);
        status.textContent=failures.length ? `Osveženo ${results.length-failures.length}/${results.length} baza. Neuspešno: ${failures.map(r=>r.name).join(', ')}. Prethodne kopije su zadržane.` : 'Sve tri baze su uspešno sinhronizovane.';
      } catch(e) {status.textContent=e.message;} finally {b.disabled=false;}
    };
    panel.append(h,p,b,status); root.prepend(panel);
  }
  globalThis.AutoDeskCatalogs={mount,sync};
})();
