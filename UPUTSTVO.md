# AutoDesk – GitHub Pages + Firebase (jedan korisnik)

## 1. Firebase (besplatni Spark plan)

1. Otvorite https://console.firebase.google.com/ i napravite projekat na besplatnom **Spark** planu.
2. **Authentication → Sign-in method → Email/Password → Enable**.
3. Korisnički nalog napravićete **direktno na AutoDesk stranici** preko dugmeta **Napravi prvi nalog**. Firebase će poslati poruku za potvrdu emaila; otvorite je pre prijave. Ako poruka nije stigla, koristite **Pošalji potvrdu emaila**. **Ne isključujte bezbednosnu proveru.**
4. **Firestore Database → Create database**, odaberite region i production mode.
5. U **Firestore Database → Rules** nalepite sadržaj `firestore.rules` i umesto `OVDE_TVOJ_EMAIL` upišite **isti email** kao za prijavu. Kliknite **Publish**.
6. **Project settings → Your apps → Web app**: registrujte Web aplikaciju i prepišite `apiKey`, `authDomain`, `projectId`, `appId` u `firebase-config.js`. U `ownerEmail` upišite isti email.
7. **Authentication → Settings → Authorized domains**: dodajte `KORISNICKOIME.github.io` (bez `https://` i bez putanje).

**Napomena:** Firebase web config nije tajna, ali Firestore pravila jesu važna. Nikad ne postavljajte Service Account ključ, privatni ključ ili SQLite bazu na javni GitHub repozitorijum.

## 2. GitHub Pages

1. Napravite novi GitHub repozitorijum (može biti javan; **bez privatnih podataka**).
2. **Sadržaj foldera `public/`** (ne ceo projekat) prebacite u **koren** repozitorijuma: `index.html`, `app.js`, `cloud-sync.js`, `local-api.js`, `firebase-config.js`, `style.css`, `sw.js`, `manifest.json`, `icons/`, `slike/`.
3. U repozitorijumu otvorite **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
4. Otvorite `https://KORISNICKOIME.github.io/IME-REPOZITORIJUMA/`.

## 3. Prenos postojeće evidencije

U posebnom fajlu `AutoDesk-podaci-za-uvoz.json` nalaze se podaci iz dostavljene SQLite baze, uključujući WAL promene (61 vozilo, 61 radni nalog, 1 klijent). **Ovaj JSON je privatan i ne sme na GitHub.**

1. Prijavite se u AutoDesk na GitHub Pages.
2. Otvorite **Podešavanja → Uvoz i izvoz evidencije**.
3. Izaberite `AutoDesk-podaci-za-uvoz.json` i potvrdite uvoz.
4. Sačekajte završetak sinhronizacije, zatim proverite evidenciju na drugom uređaju.

## 4. Važna ograničenja

- Aplikacija je namenjena **jednom vlasničkom nalogu**. Izmene se upisuju u Firestore i na drugom uređaju se vide nakon osvežavanja stranice. Nije implementovana automatska promena ekrana uživo bez osvežavanja.
- Za rad i sinhronizaciju potrebna je internet veza. Lokalni IndexedDB služi kao pomoćna kopija, **nije obećan potpuni offline režim**.
- Fotografije se čuvaju kao kodirani podaci u Firestore dokumentima; velike količine fotografija mogu brzo dostići besplatne kvote i povećati vreme učitavanja. Za veće galerije potrebno je odvojeno skladište.
- PDF izvoz otvara prozor za štampanje i izbor **Save as PDF** (dozvolite pop-up prozore).
- Firebase Spark ima ograničene besplatne kvote; prekoračenje može blokirati operacije do obnavljanja kvote.
- Izvorni SQLite fajl, WAL, node_modules i server nisu potrebni na GitHub Pages i nisu uključeni u paket za objavu.
- Redovno koristite **Podešavanja → Preuzmi kompletnu evidenciju** kao dodatnu privatnu rezervnu kopiju.

## Već uneta Firebase konfiguracija

Konfiguracija Firebase projekta `evidencija-autodijagnostika` već je upisana u `firebase-config.js`. Pre objave zamenite `OVDE_TVOJ_EMAIL` u `firebase-config.js` i `firestore.rules` istom adresom kojom ćete se prijavljivati. Firestore pravila morate ručno objaviti u Firebase konzoli.

Za prilagođeni domen u Authentication → Settings → Authorized domains dodajte `app.autodjiagnostikalazarevic.rs`. U GitHub Pages → Custom domain postavite isti poddomen i kreirajte odgovarajući CNAME DNS zapis.
