# AutoDesk

Web aplikacija za evidenciju radnih naloga, vozila i klijenata auto radionice. Radi u pregledaču (računar, telefon, tablet) i može se instalirati kao aplikacija (PWA). Nema sopstvenog servera: front-end se hostuje na **GitHub Pages**, a podaci se čuvaju u **Firebase Cloud Firestore** bazi, uz prijavu jednog vlasničkog naloga.

## Mogućnosti

**Radni nalozi**
- Automatski brojevi naloga (`RN-000001`, ...), datum, klijent i vozilo
- Status: Primljeno, U radu, Čeka deo, Završeno, Preuzeto (brza promena u detaljima naloga)
- Prijavljeni problem, opis izvršenog posla, kodovi grešaka (DTC), napomena
- Kilometraža pri prijemu (automatski ažurira kilometražu vozila)
- Podsetnik za sledeći servis po datumu i/ili kilometraži
- Finansije: potrošeno, naplaćeno i razlika, u RSD ili EUR
- Dodavanje usluge iz cenovnika (naziv ide u opis, cena u „Naplaćeno“), dupliranje naloga
- Fotografije uz nalog (smanjuju se u pregledaču pre čuvanja, do 12 po nalogu)
- Filteri po periodu, klijentu, vozilu i statusu, pretraga (uključujući kodove grešaka)

**Klijenti, vozila i cenovnik**
- Evidencija klijenata (telefon kao link za poziv) i vozila (marka, model, godište, motor, snaga, gorivo, registracija, VIN, kilometraža)
- Istorija naloga po klijentu i po vozilu
- Zaštita istorije: klijent ili vozilo sa nalozima ne može se obrisati

**Kontrolna tabla i statistika**
- Danas / ovaj mesec, grafikon kretanja, nalozi u toku
- Podsetnik za servis (istekli ili u narednih 30 dana, ili dostignuta kilometraža)
- Statistika po periodu, najčešće marke, klijenti i kodovi grešaka
- Izvoz u CSV (format prilagođen srpskom Excelu)

**Dokumenti za štampu / PDF**
- Radni nalog za klijenta (bez internih iznosa), izveštaj za period, servisna istorija vozila
- Otvaraju se u novoj kartici; „Štampaj / Sačuvaj kao PDF“

**Podaci i bezbednost**
- Rezervne kopije: automatska na svakih 1, 7, 15 ili 30 dana (podrazumevano 30; čuva se poslednjih 10), ručne do 30 komada, preuzimanje, vraćanje i brisanje
- Izvoz i uvoz cele evidencije u JSON (sa fotografijama)
- Provera verzije pri svakoj izmeni, pa dva uređaja ne mogu tiho da prepišu jedan drugom izmene
- Pregled poslednjih sačuvanih podataka bez interneta (izmene zahtevaju vezu)
- Prijava Firebase nalogom, promena lozinke i „Zaboravljena lozinka?“

## Tehnologije

- HTML, CSS i JavaScript bez framework-a i bez build koraka
- Firebase Authentication i Cloud Firestore (compat SDK, učitava se sa `gstatic.com`)
- IndexedDB (lokalna kopija za pregled bez interneta)
- Service Worker i web manifest (PWA)
- GitHub Pages za hosting (`CNAME` za sopstveni domen)

## Struktura projekta

```
index.html          Osnovna stranica
app.js              Korisnički interfejs (stranice, forme, modali)
local-api.js        "API" nad Firestore bazom: pravila, provera unosa, statistika, kopije
cloud-sync.js       Firebase prijava i čuvanje u Firestore (verzije, fotografije, kopije)
print-docs.js       Dokumenti za štampu / PDF
firebase-config.js  Javna Firebase podešavanja i UID vlasnika
firestore.rules     Firestore pravila (pristup samo vlasniku)
sw.js, manifest.json, icons/, slike/   PWA i grafika
UPUTSTVO.md         Detaljno uputstvo za postavljanje i održavanje
```

## Podešavanje (kratko)

1. U Firebase konzoli napravite projekat, uključite **Authentication (Email/Password)** i **Cloud Firestore**.
2. Napravite jedan korisnički nalog (vlasnik) i kopirajte njegov UID.
3. U `firebase-config.js` upišite podešavanja Firebase web aplikacije i `ownerUid`.
4. U `firestore.rules` postavite isti UID i objavite pravila.
5. Na GitHub-u uključite **Pages** (grana `main`, folder `/ (root)`).

Detaljan postupak i ažuriranje postojeće instalacije su u [UPUTSTVO.md](UPUTSTVO.md).

## Lokalno pokretanje

Aplikacija je statična; dovoljan je bilo koji lokalni web server (Service Worker i Firebase ne rade sa `file://`):

```bash
npx serve .
# ili
python3 -m http.server 8080
```

Zatim otvorite `http://localhost:8080`. Za prijavu je potreban ispravan `firebase-config.js`, a `localhost` mora biti u listi dozvoljenih domena u Firebase Authentication podešavanjima.

## Kako se podaci čuvaju

Podaci su u kolekciji `autodesk_users/{uid}`:

| Putanja | Sadržaj |
| --- | --- |
| `sync/meta` | verzija i pokazivač na trenutnu evidenciju |
| `sync/{prefiks}{i}` | evidencija (klijenti, vozila, nalozi, cenovnik, podešavanja) kao JSON podeljen u delove, bez fotografija |
| `photos/{id}` | jedna smanjena fotografija |
| `backups/{ime}` i `backups/{ime}/chunks/{i}` | rezervne kopije |

Svaka izmena prvo proverava verziju u oblaku i čuva se samo ako se poklapa. Provera oblaka je jedno čitanje u minuti, pa je potrošnja daleko ispod besplatne dnevne kvote za jednu radionicu.

## Bezbednost

- `apiKey` u `firebase-config.js` je javna po dizajnu; zaštitu čine **Firestore pravila** koja dozvoljavaju pristup samo vlasničkom UID-u.
- Ne postavljajte na javni repozitorijum privatne podatke: JSON izvoze, kopije baze ili spiskove klijenata.
- Preporuka: redovno preuzimajte „Izvezi JSON“ kao privatnu kopiju (kopije u aplikaciji ne sadrže fotografije).

## Ograničenja

- Jedan vlasnik / jedan nalog; nema uloga ni više korisnika.
- Izmene su moguće samo uz internet vezu.
- Preporučeno je da se ne radi istovremeno na dva uređaja; aplikacija će sukob otkriti i tražiti ponavljanje izmene.
- Brojevi strana u PDF-u prikazuju se u Chrome-u i Edge-u.
- Konverzija RSD ↔ EUR koristi fiksni kurs 1 EUR = 120 RSD.

## Licenca

Privatni projekat radionice. Sva prava zadržana, osim ako vlasnik ne odluči drugačije.
