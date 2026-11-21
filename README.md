# AutoDesk

Web aplikacija za evidenciju radnih naloga, vozila i klijenata auto radionice, uz zasebne module za evidenciju ličnih vozila i točenja goriva. Radi u pregledaču na računaru, telefonu i tabletu i može se instalirati kao **PWA** (Progressive Web App).

Projekat nema sopstveni backend server: statički front-end se hostuje na **GitHub Pages**, dok se podaci čuvaju u **Firebase Cloud Firestore** bazi uz prijavu jednog vlasničkog naloga i lokalni keš za pregled bez interneta.

---

## Sadržaj

- [Glavne mogućnosti](#glavne-mogućnosti)
  - [Radionica: radni nalozi, klijenti i vozila](#radionica-radni-nalozi-klijenti-i-vozila)
  - [Kontrolna tabla, statistika i štampa](#kontrolna-tabla-statistika-i-štampa)
  - [Podaci, sinhronizacija i bezbednost](#podaci-sinhronizacija-i-bezbednost)
  - [Lična vozila i gorivo](#lična-vozila-i-gorivo)
- [Tehnologije i arhitektura](#tehnologije-i-arhitektura)
- [Struktura projekta](#struktura-projekta)
- [Podešavanje i pokretanje](#podešavanje-i-pokretanje)
  - [Brzo podešavanje](#brzo-podešavanje)
  - [Lokalno pokretanje](#lokalno-pokretanje)
- [Model podataka u Firestore-u](#model-podataka-u-firestore-u)
- [Bezbednost i ograničenja](#bezbednost-i-ograničenja)
- [Licenca](#licenca)

---

## Glavne mogućnosti

### Radionica: radni nalozi, klijenti i vozila

- **Radni nalozi**
  - Automatsko numerisanje (`RN-000001`, ...), datum prijema, klijent i vozilo.
  - Statusi: *Primljeno*, *U radu*, *Čeka deo*, *Završeno*, *Preuzeto* (uz brzu promenu direktno u prikazu naloga).
  - Evidencija prijavljenog problema, opisa izvršenog rada, DTC kodova grešaka i internih napomena.
  - Kilometraža pri prijemu uz automatsko ažuriranje kilometraže vozila.
  - Podsetnik za sledeći servis po datumu i/ili kilometraži.
  - Finansijski pregled po nalogu: *potrošeno*, *naplaćeno* i *razlika*, u **RSD** ili **EUR**.
  - Brzo dodavanje stavki iz cenovnika (naziv usluge ide u opis, cena u *Naplaćeno*) i dupliranje postojećih naloga.
  - Fotografije uz nalog (automatski se smanjuju u pregledaču pre čuvanja, do 12 fotografija po nalogu).
  - Pretraga (uključujući DTC kodove) i filtriranje po periodu, klijentu, vozilu i statusu.
- **Klijenti, vozila i cenovnik**
  - Baza klijenata (broj telefona kao direktan link za poziv) i vozila (marka, model, godište, motor, snaga, gorivo, registracija, VIN, kilometraža).
  - Kompletna istorija radnih naloga po klijentu i po vozilu.
  - Zaštita podataka: klijent ili vozilo koji imaju vezane naloge ne mogu se obrisati.

### Kontrolna tabla, statistika i štampa

- **Kontrolna tabla i statistika**
  - Pregled aktivnosti za tekući dan i tekući mesec, grafikon kretanja i nalozi u toku.
  - Pregled servisa koji uskoro dolaze (istekli, u narednih 30 dana ili dostignuta kilometraža).
  - Statistika po izabranom periodu: najčešće marke vozila, klijenti i DTC kodovi grešaka.
  - Izvoz podataka u **CSV** (format prilagođen srpskom Excel-u).
- **Dokumenti za štampu / PDF**
  - Radni nalog za klijenta (bez internih finansijskih iznosa), izveštaj za period i servisna istorija vozila.
  - Otvaraju se u novoj kartici pregledača spremni za opciju *Štampaj / Sačuvaj kao PDF*.

### Podaci, sinhronizacija i bezbednost

- **Rezervne kopije i prenos podataka**
  - Automatske rezervne kopije na svakih 1, 7, 15 ili 30 dana (podrazumevano 30 dana; čuva se poslednjih 10).
  - Ručne rezervne kopije do 30 komada, uz opcije preuzimanja, vraćanja i brisanja.
  - Kompletan izvoz i uvoz evidencije u **JSON** formatu (uključujući fotografije).
- **Kontrola verzija i offline pregled**
  - Provera verzije u oblaku pri svakoj izmeni sprečava da dva uređaja tiho prepišu jedan drugom promene.
  - Pregled poslednjih sačuvanih podataka bez interneta putem lokalnog keša (izmene zahtevaju aktivnu vezu).
  - Prijava putem Firebase naloga, promena lozinke i opcija *„Zaboravljena lozinka?“*.

### Lična vozila i gorivo

Aplikacija sadrži dva modula odvojena od evidencije radionice, sa sopstvenim režimom rada i sinhronizacije:

- **Lična vozila** (`autodesk_private/{uid}`)
  - Posebna evidencija privatnih vozila i njihovih servisa, nezavisna od klijenata, naloga i podešavanja radionice.
  - Uvoz i izvoz JSON podataka sa poljima: `Datum`, `Kilometraža`, `Tip`, `Naslov`, `Opis / beleške`, `Iznos`, `Valuta` (duplikati se pri uvozu automatski preskaču).
  - Zahteva objavljivanje odgovarajućeg pravila u `firestore.rules` pre prvog korišćenja.
- **Gorivo** (`autodesk_private/{uid}/fuel`)
  - Zbirno praćenje točenja goriva za sva privatna vozila (bez podele po pojedinačnom vozilu).
  - Statistika (ukupni trošak, litara, prosečna cena, poslednja cena), grafikoni mesečne potrošnje po vrsti goriva i kretanja cene po litru, pregledi po vrsti goriva i godinama, filter po godini i mesečni pregled (dizel, benzin i ukupno — litara i iznos).
  - Uvoz i izvoz JSON podataka sa poljima: `Datum`, `Vreme`, `Naziv proizvoda`, `Litara`, `Cena`, `Bodovi`, `RSD/L`.
- **Offline rad i ručna sinhronizacija (Lična vozila i Gorivo)**
  - Stranice čitaju isključivo iz lokalne kopije u pregledaču, pa rade i bez interneta i ne troše Firestore čitanja pri svakom otvaranju.
  - Podaci se povlače iz Firebase-a klikom na **Sinhronizuj** u gornjoj traci (uz prikaz vremena poslednje sinhronizacije), dok se automatsko povlačenje dešava samo jednom ako lokalna kopija još ne postoji.
  - Dodavanje, izmena, brisanje i uvoz upisuju u Firebase i odmah ažuriraju lokalnu kopiju bez dodatnog čitanja. Sinhronizacija je odvojena za *Lična vozila* i *Gorivo* (broj čitanja jednak je broju dokumenata te grupe).

---

## Tehnologije i arhitektura

- **Frontend:** Vanilla HTML, CSS i JavaScript (bez framework-a i bez build/bundler koraka).
- **Backend / Baza:** Firebase Authentication i Cloud Firestore (compat SDK učitan sa `gstatic.com`).
- **Lokalno skladište:** IndexedDB za keširanje podataka i pregled bez interneta.
- **PWA:** Service Worker (`sw.js`) i Web App Manifest (`manifest.json`).
- **Hosting:** GitHub Pages (uz podršku za `CNAME` i sopstveni domen).

---

## Struktura projekta

```text
├── index.html          # Glavna HTML struktura aplikacije
├── app.js              # Korisnički interfejs, navigacija, forme i modali
├── local-api.js        # Logika nad podacima: pravila, validacija, statistika, kopije
├── cloud-sync.js       # Firebase Auth, sinhronizacija sa Firestore-om, verzije, slike
├── print-docs.js       # Generisanje prikaza za štampu i PDF izvoz
├── firebase-config.js  # Javna Firebase konfiguracija i UID vlasničkog naloga
├── firestore.rules     # Bezbednosna pravila pristupa Firestore bazi
├── sw.js               # Service Worker za PWA i keširanje resursa
├── manifest.json       # Web manifest za instalaciju aplikacije
├── icons/              # Ikonice aplikacije za različite rezolucije
├── slike/              # Dodatni vizuelni i grafički resursi
└── UPUTSTVO.md         # Detaljno uputstvo za podešavanje, rad i ažuriranje
```

---

## Podešavanje i pokretanje

### Brzo podešavanje

1. U Firebase konzoli kreirajte projekat i omogućite **Authentication (Email/Password)** i **Cloud Firestore**.
2. Kreirajte jedan korisnički nalog (vlasnik) i sačuvajte njegov **UID**.
3. U fajl `firebase-config.js` unesite konfiguraciju Firebase web aplikacije i postavljeni `ownerUid`.
4. U fajlu `firestore.rules` postavite isti UID i objavite pravila u konzoli (*Firestore Database → Rules*), uključujući pravila za `autodesk_users` i `autodesk_private`.
5. Na GitHub repozitorijumu uključite **GitHub Pages** (grana `main`, direktorijum `/ (root)`).

Detaljnija uputstva za instalaciju i ažuriranje postojeće verzije nalaze se u [UPUTSTVO.md](UPUTSTVO.md).

### Lokalno pokretanje

Pošto se radi o statičkoj aplikaciji i PWA rešenju (Service Worker i Firebase SDK ne rade preko `file://` protokola), pokrenite lokalni web server:

```bash
npx serve .
# ili
python3 -m http.server 8080
```

Otvorite `http://localhost:8080` u pregledaču. Za prijavu je potreban ispravan `firebase-config.js`, a `localhost` mora biti dodat u listu dozvoljenih domena u **Firebase Authentication** podešavanjima.

---

## Model podataka u Firestore-u

Podaci radionice nalaze se u kolekciji `autodesk_users/{uid}`, dok su privatni moduli izdvojeni u `autodesk_private/{uid}`:

| Putanja | Sadržaj |
| --- | --- |
| `autodesk_users/{uid}/sync/meta` | verzija evidencije i pokazivač na aktivni zapis |
| `autodesk_users/{uid}/sync/{prefiks}{i}` | podaci radionice (klijenti, vozila, nalozi, cenovnik, podešavanja) podeljeni u JSON delove, bez fotografija |
| `autodesk_users/{uid}/photos/{id}` | pojedinačna kompresovana fotografija vezana za nalog |
| `autodesk_users/{uid}/backups/{ime}` i `.../chunks/{i}` | rezervne kopije baze radionice |
| `autodesk_private/{uid}` | dokumenti ličnih vozila i njihovih servisa |
| `autodesk_private/{uid}/fuel` | unosi o točenju goriva |

Svaka izmena podataka radionice proverava verziju u oblaku pre upisa i izvršava se samo ako se verzija poklapa. Periodična provera promena u oblaku vrši se jednom u minuti, što održava potrošnju čitanja znatno ispod besplatne dnevne kvote za jednu radionicu.

---

## Bezbednost i ograničenja

### Bezbednost

- Vrednost `apiKey` u `firebase-config.js` je javna po prirodi Firebase klijentskih aplikacija; stvarnu zaštitu podataka obezbeđuju **Firestore pravila** ograničena na UID vlasnika.
- **Ne objavljujte privatne podatke** (JSON izvoze, rezervne kopije, spiskove klijenata) na javne repozitorijume.
- Preporuka je da povremeno preuzimate *„Izvezi JSON“* kao lokalnu arhivu, jer rezervne kopije u okviru aplikacije ne uključuju fotografije.

### Ograničenja

- Aplikacija je projektovana za **jednog vlasnika / jedan nalog** (bez više korisničkih uloga ili timskih naloga).
- Izmene podataka zahtevaju aktivnu internet vezu.
- Ne preporučuje se istovremeni rad na dva uređaja; u slučaju konflikta verzija aplikacija će upozoriti korisnika i zatražiti ponavljanje izmene.
- Brojevi stranica pri štampi / izvozu u PDF podržani su u pregledačima zasnovanim na Chromium-u (Chrome, Edge).
- Preračunavanje između RSD i EUR koristi fiksni kurs **1 EUR = 120 RSD**.

---

## Licenca

**Privatni projekat – sva prava zadržana.**

Projekat AutoDesk razvijen je za potrebe interne evidencije i poslovanja auto-servisa. Nije objavljen pod licencom otvorenog koda. Sva prava na izvorni kod, dizajn i funkcionalnosti zadržava vlasnik projekta.
