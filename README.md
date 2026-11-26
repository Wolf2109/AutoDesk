# AutoDesk

**AutoDesk** je aplikacija za upravljanje evidencijom auto radionice, radnim nalozima, klijentima, vozilima, dijagnostikom i servisnom istorijom. Obuhvata i zasebne evidencije ličnih vozila, goriva, dijagnostičkih alata i licenci.

Dostupna je kao web aplikacija, instalabilna PWA i Android aplikacija zasnovana na Capacitor-u.

**Web aplikacija:** [app.autodijagnostikalazarevic.rs](https://app.autodijagnostikalazarevic.rs)

## Funkcionalnosti

### Radni nalozi

- Automatsko numerisanje naloga, datum prijema, klijent, vozilo i kilometraža.
- Statusi: Primljeno, U radu, Čeka deo, Završeno i Preuzeto.
- Evidencija prijavljenog problema, izvršenih radova, DTC kodova i napomena.
- Servisni podsetnici prema datumu i kilometraži.
- Evidencija troškova, naplaćenih usluga i finansijske razlike u RSD ili EUR.
- Cenovnik usluga, dupliranje naloga i fotografije.
- Pretraga i filtriranje prema periodu, klijentu, vozilu i statusu.
- Štampa radnog naloga, servisne istorije i periodičnih izveštaja, uz mogućnost čuvanja u PDF formatu.

### Klijenti i vozila

- Kontakt podaci klijenata i povezivanje sa vozilima.
- Marka, model, godište, motor, snaga, gorivo, registracija, VIN i kilometraža.
- Pregled servisne istorije i povezanih radnih naloga.
- Zaštita od brisanja klijenata i vozila sa postojećim nalozima.

### Pretraga vozila – ECU / TCM

Zaseban katalog vozila i podržanih elektronskih upravljačkih jedinica.

- Dve kategorije: **ECU** (motorne upravljačke jedinice, ECM) i **TCM** (upravljačke jedinice menjača).
- Povezani pretraživi padajući meniji: **Marka → Model → Verzija**. Sledeći meni se prikazuje nakon izbora prethodnog.
- Jedinstvene opcije bez duplikata, ručni unos za pretragu, navigacija tastaturom i automatsko prilagođavanje položaja liste.
- Direktna pretraga bez obaveznog izbora vozila: proizvođač i model jedinice, oznaka motora, marka, model, snaga, gorivo, alat i mod konekcije.
- Rezultati grupisani po proizvođaču, modelu i tipu upravljačke jedinice. Više oznaka motora objedinjuje se kada se poklapaju relevantni tehnički podaci i podrška; različite snage i konekcije ostaju odvojene unutar kartice.
- Konkretan model jedinice (npr. `EDC17C46` ili `DQ250`) istaknut je crvenom bojom.
- Prikaz snage u KS i kW, oznaka motora, goriva, tipa vozila, podržanog alata i modova konekcije.

Katalog sadrži **20.057 zapisa** iz različitih kategorija vozila. Godine generacija popunjene su za 9.154 zapisa u trenutnoj verziji baze; deo podataka je preliminaran. Zapisi ACM i OTHER ostaju u JSON-u, ali nisu prikazani u ECU/TCM kategorijama.

| Period proizvodnje | Prikaz |
| --- | --- |
| Poznat početak i kraj | `2012–2020` |
| Poznat samo početak ili označena tekuća proizvodnja | `2012 - →` |
| Poznat samo kraj | `→ - 2020` |
| Ista početna i završna godina | `2015` |
| Obe godine nedostaju | Godine nisu proverene |

Strelica na kraju ne mora značiti da se vozilo još proizvodi: može označavati i nepoznatu završnu godinu. Katalog služi za informativni pregled podrške; podatke treba proveriti prema konkretnoj konfiguraciji vozila i dokumentaciji proizvođača.

### DTC baza

- Lokalna baza kodova grešaka, sa pretragom po kodu i opisu.
- Prednost fabričkih opisa za izabranu marku nad generičkim opisima.
- Dodavanje kodova u nalog i dopunjavanje nedostajućih opisa bez prepisivanja postojećeg ručnog teksta.
- Prikaz u detaljima naloga, PDF-u i CSV izvozu.
- Baza ne koristi Firebase i ne predstavlja potvrdu uzroka kvara.

### Kontrolna tabla i statistika

- Pregled dnevnog i mesečnog poslovanja, naloga u toku i servisnih podsetnika.
- Grafikoni, statistika po periodu, najčešće marke, klijenti i kodovi grešaka.
- Pregled isteklih licenci i licenci koje ističu u narednih 30 dana.
- CSV izvoz prilagođen srpskim regionalnim podešavanjima.

### Lična vozila, gorivo i alati

| Celina | Funkcionalnosti |
| --- | --- |
| Lična vozila | Odvojena evidencija vozila, servisa, kilometraže, troškova i istorije; JSON uvoz/izvoz. |
| Gorivo | Evidencija svih točenja zajedno, litraža, iznos, prosečna cena, mesečni grafikoni i godišnji filteri; JSON uvoz/izvoz. |
| Alati | Naziv, model, serijski broj, licenca, aktivacija, istek, cena i napomene; filteri prema statusu licence i upozorenja. |

Ove celine koriste poseban koren Firestore baze i lokalne kopije, nezavisno od evidencije radionice.

### Dizajn i animacije

- Vizuelni identitet sa fontovima Barlow Condensed i Public Sans, crvenim i zlatnim akcentima.
- Splash ekran sa logotipom i donjim indikatorom učitavanja, bez animiranog prstena.
- Suptilne tranzicije stranica, kartica, grafikona, modala i mobilnog menija.
- Promene perioda, godina i filtera ne pokreću ponovnu animaciju cele stranice.
- Padajuće liste se otvaraju preko sadržaja, sa animiranom SVG strelicom, označenom izabranom opcijom i podrškom za tastaturu.
- Podrška za korisničko podešavanje smanjenog kretanja.

## Tehnologije

- HTML, CSS i JavaScript bez front-end frameworka.
- Firebase Authentication i Cloud Firestore.
- IndexedDB i lokalni keš za offline rad.
- Service Worker i web manifest za PWA.
- GitHub Pages i sopstveni domen.
- Capacitor 6 i GitHub Actions za Android APK.
- Statičke JSON baze za DTC i katalog vozila.

## Struktura projekta

```text
AutoDesk/
├── index.html                 # Osnovna stranica
├── app.js                     # Interfejs radionice
├── style.css                  # Stilovi i komponente
├── site-theme.css             # Vizuelni identitet
├── motion.css                 # Animacije i tranzicije
├── local-api.js               # Poslovna logika i lokalna evidencija
├── cloud-sync.js              # Firestore i sinhronizacija
├── private-cache.js           # Lokalni keš privatnih evidencija
├── private-vehicles.js        # Lična vozila
├── fuel.js                    # Gorivo
├── tools.js                   # Alati i licence
├── vehicle-search.js          # ECU/TCM katalog i pretraga
├── vehicle-search-config.js   # URL kataloga vozila
├── data/
│   └── vehicles-database.json  # Zasebno hostovan katalog
├── dtc.js                     # DTC pretraga
├── dtc-database.json          # Lokalna DTC baza
├── print-docs.js              # Dokumenti za štampu
├── original-pdf.js            # PDF funkcionalnosti
├── firebase-config.js         # Firebase konfiguracija
├── firestore.rules            # Pravila pristupa
├── firestore.indexes.json     # Podešavanja indeksa
├── sw.js                      # Service Worker
├── manifest.json              # PWA manifest
├── capacitor.config.json      # Android konfiguracija
├── native-bridge.js           # Android integracije
├── android-plugin/            # Nativni dodatak za štampu
├── scripts/                   # Priprema APK i pomoćne skripte
├── tests/                     # Funkcionalni smoke testovi
└── .github/workflows/         # Automatska izrada APK-a
```

## Lokalno pokretanje

Iz korena projekta pokrenuti statički HTTP server:

```bash
python3 -m http.server 8080
```

Otvoriti `http://localhost:8080`. Direktno otvaranje `index.html` preko `file://` nije podržan način pokretanja. Za prijavu je potrebna validna Firebase konfiguracija i dozvoljen domen `localhost`.

## Firebase podešavanje

1. U Firebase projektu uključiti Authentication (Email/Password) i Cloud Firestore.
2. Kreirati vlasnički nalog i njegov UID upisati u `firebase-config.js`.
3. Uneti konfiguraciju Firebase web aplikacije.
4. Proveriti vlasnički UID u `firestore.rules` i objaviti pravila. Indekse primeniti uz očuvanje postojećih potrebnih indeksa.
5. Pri nadogradnji postojeće baze slediti [MIGRACIJA-FIRESTORE.md](MIGRACIJA-FIRESTORE.md).

## Hosting kataloga vozila

**Katalog vozila ne ide u Firebase niti u Android APK.** Objavljuje se kao statički JSON na HTTPS hostingu.

Podrazumevana lokacija:

```text
https://app.autodijagnostikalazarevic.rs/data/vehicles-database.json
```

- Web verzija učitava relativnu putanju `./data/vehicles-database.json`.
- Android verzija koristi apsolutni HTTPS URL iz `vehicle-search-config.js`.
- Pri promeni lokacije baze prilagoditi odgovarajuću putanju u konfiguraciji.
- Ako je zahtev sa drugog origin-a, hosting mora dozvoliti CORS, uključujući Android origin `https://localhost`. Za javni katalog bez autentifikacije može se koristiti `Access-Control-Allow-Origin: *`.
- Server mora vratiti validan JSON niz, a ne HTML stranicu ili stranicu za prijavu.
- Katalog se učitava pri prvom otvaranju pretrage i čuva u memoriji tokom sesije. Web Service Worker može keširati uspešan zahtev sa istog domena; dostupnost offline nije garantovana na Androidu.
- JSON nije deo obaveznog PWA prekeširanja niti se kopira u Android `www` paket. DTC baza je, nasuprot tome, deo aplikacije.
- Zamena JSON fajla na istoj adresi ne zahteva novu izradu APK-a. Ponovno pokretanje aplikacije uz mrežnu vezu omogućava učitavanje nove baze.

Ako se pojavi poruka **Baza vozila nije dostupna**, proveriti direktan URL, HTTP status, CORS i JSON format, pa koristiti dugme **Pokušaj ponovo**.

Detalji: [VEHICLE-HOSTING.md](VEHICLE-HOSTING.md).

## Čuvanje podataka i offline rad

| Firestore putanja | Namena |
| --- | --- |
| `autodesk_users/{uid}/sync/meta` | Verzija, generacija i metapodaci evidencije |
| `autodesk_users/{uid}/record_sets/{generation}/{group}` | Pojedinačni zapisi radionice: klijenti, vozila, usluge, nalozi i metapodaci fotografija |
| `autodesk_users/{uid}/photos` | Fotografije naloga |
| `autodesk_users/{uid}/backups` | Rezervne kopije |
| `autodesk_private/{uid}/vehicles` | Lična vozila |
| `autodesk_private/{uid}/entries` | Privatni servisni unosi |
| `autodesk_private/{uid}/fuel` | Gorivo |
| `autodesk_private/{uid}/tools` | Alati i licence |

- Prva prijava i prvo preuzimanje podataka zahtevaju internet.
- Lokalna evidencija ostaje dostupna nakon prekida veze; uobičajeni offline unosi i izmene mogu se naknadno sinhronizovati.
- Različite izmene zapisa mogu se spojiti; konflikt nad istim ili povezanim zapisima zaustavlja sinhronizaciju umesto automatskog prepisivanja.
- Fotografije, operacije rezervnih kopija i pojedine masovne operacije zahtevaju internet.
- Privatne evidencije imaju zasebnu ručnu sinhronizaciju i lokalni red promena.
- Rezervne kopije, JSON izvoz/uvoz i CSV izvoz omogućavaju čuvanje evidencije van aplikacije. Offline izvoz radionice ne uključuje same fotografije; za kompletnu kopiju koristiti online izvoz.
- Ne koristiti više istovremeno otvorenih kartica za offline uređivanje na istom uređaju.

## Objavljivanje web verzije

1. Sačuvati rezervnu kopiju postojeće evidencije i završiti sinhronizaciju na uređajima.
2. Objaviti projekat u GitHub repozitorijumu, na grani `main`.
3. U Settings → Pages podesiti objavljivanje iz korenskog foldera grane `main`.
4. Zadržati `CNAME` za postojeći domen i objaviti `data/vehicles-database.json` na predviđenoj lokaciji statičkog hostinga.
5. Proveriti prijavu, dostupnost JSON-a, pretragu i Service Worker. Zatvoriti stare kartice aplikacije i ponovo otvoriti novu verziju.

## Android APK

GitHub Actions workflow **Build Android APK** priprema web fajlove, lokalne SDK resurse i fontove, Capacitor Android projekat i APK.

- Za potpisivanje podesiti GitHub Actions secrets: `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD` i `ANDROID_KEYSTORE_BASE64`.
- Ključ i lozinke nikada ne stavljati u javni repozitorijum.
- Pokrenuti workflow preko Actions → Build Android APK → Run workflow ili objaviti izmene na `main`.
- APK je predviđen za objavljivanje u Releases (`apk-latest`) i među artefaktima izvršenja.
- Za nadogradnju koristiti isti identitet aplikacije i ključ za potpisivanje.
- Android koristi sistemsku štampu/PDF i deljenje fajlova; katalog vozila ostaje na hostingu.

Detalji: [ANDROID.md](ANDROID.md).

## Testiranje

Iz korena projekta:

```bash
node tests/records-smoke.cjs
node tests/offline-smoke.cjs
node tests/dtc-smoke.cjs
node --check vehicle-search.js
```

Smoke testovi ne zamenjuju proveru na stvarnom Firebase projektu, pregledaču i Android uređaju. Pre objavljivanja proveriti i ECU/TCM filtere, grupisanje, padajuće menije, format godina, učitavanje baze sa hostinga, povratak mrežne veze i PDF štampu.

## Bezbednost i ograničenja

- Aplikacija je namenjena jednom vlasničkom nalogu, bez višekorisničkih uloga.
- Zaštita privatne evidencije zasniva se na autentifikaciji i Firestore pravilima, ne na skrivanju javnog Firebase API ključa.
- Privatne izvoze, podatke klijenata i rezervne kopije ne objavljivati u javnom repozitorijumu.
- Statički JSON katalog dostupan preko javnog hostinga može se preuzeti direktno; objavljivati samo podatke za koje postoje odgovarajuća prava distribucije.
- Katalog nema potpuno proverene godine proizvodnje za sve generacije.
- Nisu potvrđeni javna dostupnost hostinga ni kompletno end-to-end ponašanje poslednje verzije na fizičkom Android uređaju.

## Dodatna dokumentacija

- [UPUTSTVO.md](UPUTSTVO.md) – postavljanje aplikacije
- [ANDROID.md](ANDROID.md) – Android verzija
- [VEHICLE-HOSTING.md](VEHICLE-HOSTING.md) – hosting kataloga vozila
- [DTC-UPUTSTVO.md](DTC-UPUTSTVO.md) – DTC baza
- [MIGRACIJA-FIRESTORE.md](MIGRACIJA-FIRESTORE.md) – migracija Firestore evidencije
- [OPTIMIZACIJA-CITANJA.md](OPTIMIZACIJA-CITANJA.md) – optimizacija čitanja
- [IZMENE-2026-11-24.md](IZMENE-2026-11-24.md) – prethodne izmene i offline rad

## Licenca

Privatni projekat radionice. Sva prava zadržana, osim ako vlasnik ne odluči drugačije. Prava na podatke i komponente trećih strana uređena su njihovim odgovarajućim uslovima.
