# AutoDesk

**AutoDesk** je web aplikacija namenjena digitalnoj evidenciji rada auto-servisa. Omogućava upravljanje radnim nalozima, klijentima, vozilima, servisnim uslugama i finansijama, uz pregled statistike, generisanje dokumenata i upravljanje rezervnim kopijama podataka.

Aplikacija je prilagođena za korišćenje na računarima, tabletima i mobilnim telefonima. Podržava instalaciju kao **Progressive Web App (PWA)** i rad u režimu bez internet konekcije za pregled prethodno sinhronizovanih podataka.

Projekat koristi statički hosting putem **GitHub Pages** i **Firebase Cloud Firestore** za čuvanje podataka, bez potrebe za sopstvenim backend serverom.

---

## Glavne funkcionalnosti

### 1. Radni nalozi

- Automatsko generisanje jedinstvenih brojeva radnih naloga (`RN-000001`, `RN-000002`...)
- Evidencija datuma, klijenta i vozila
- Upravljanje statusima radnih naloga:
  - Primljeno
  - U radu
  - Čeka deo
  - Završeno
  - Preuzeto
- Evidencija prijavljenog problema i izvršenih radova
- Evidencija DTC kodova grešaka i internih napomena
- Evidencija kilometraže pri prijemu vozila, uz automatsko ažuriranje kilometraže u kartici vozila
- Podsetnici za naredni servis prema datumu i/ili kilometraži
- Finansijska evidencija:
  - Troškovi
  - Naplaćeni iznos
  - Razlika između troškova i naplate
  - Podrška za RSD i EUR
- Dodavanje usluga iz cenovnika direktno u radni nalog
- Automatsko prenošenje naziva usluge u opis i cene u polje za naplatu
- Mogućnost dupliranja postojećih radnih naloga
- Dodavanje do 12 fotografija po radnom nalogu, uz automatsku optimizaciju veličine u pregledaču
- Napredna pretraga i filtriranje prema periodu, klijentu, vozilu, statusu i DTC kodovima

### 2. Klijenti, vozila i cenovnik

**Evidencija klijenata**
- Ime i prezime / naziv klijenta
- Kontakt telefon sa mogućnošću direktnog pozivanja
- Pregled kompletne istorije radnih naloga

**Evidencija vozila**
- Marka i model
- Godište
- Motor i snaga
- Vrsta goriva
- Registraciona oznaka
- VIN broj
- Trenutna kilometraža
- Pregled servisne istorije

**Cenovnik usluga**
- Evidencija servisnih usluga i njihovih cena
- Direktno dodavanje usluga u radne naloge

Radi očuvanja integriteta podataka, klijenti i vozila koji imaju povezane radne naloge ne mogu se obrisati.

### 3. Kontrolna tabla i statistika

- Pregled dnevnih i mesečnih aktivnosti
- Grafički prikaz kretanja broja radnih naloga
- Pregled radnih naloga koji su trenutno u toku
- Podsetnici za naredne servise:
  - Istekli servisni intervali
  - Servisi u narednih 30 dana
  - Dostignuta servisna kilometraža
- Statistika prema izabranom periodu
- Najčešće servisirane marke vozila
- Pregled najaktivnijih klijenata
- Analiza najčešćih DTC kodova
- Izvoz statističkih podataka u CSV formatu, prilagođenom srpskim regionalnim podešavanjima programa Microsoft Excel

### 4. Dokumenti i PDF izveštaji

Generisanje dokumenata spremnih za štampu ili čuvanje u PDF formatu:

- Radni nalog za klijenta, bez prikaza internih finansijskih iznosa
- Izveštaj o poslovanju za izabrani period
- Servisna istorija pojedinačnog vozila

Dokumenti se otvaraju u zasebnoj kartici pregledača, sa podrškom za štampanje i opciju „Sačuvaj kao PDF“.

### 5. Rezervne kopije i upravljanje podacima

**Automatske rezervne kopije**
- Podesiv interval: 1, 7, 15 ili 30 dana
- Podrazumevani interval: 30 dana
- Automatsko čuvanje poslednjih 10 rezervnih kopija

**Ručne rezervne kopije**
- Kreiranje do 30 ručnih kopija
- Preuzimanje kopija
- Vraćanje prethodno sačuvanog stanja
- Brisanje nepotrebnih kopija

**Uvoz i izvoz**
- Izvoz kompletne evidencije u JSON format, uključujući fotografije
- Uvoz prethodno sačuvanih JSON podataka
- CSV izvoz za dalju obradu i analizu

**Kontrola sinhronizacije**
- Provera verzije podataka pre svake izmene
- Zaštita od neprimetnog prepisivanja podataka između više uređaja
- Detekcija konflikta pri istovremenim izmenama

### 6. Bezbednost i autentifikacija

- Firebase Authentication prijava putem e-mail adrese i lozinke
- Pristup ograničen na vlasnički korisnički nalog
- Promena lozinke
- Opcija za oporavak zaboravljene lozinke
- Firestore bezbednosna pravila ograničavaju pristup podacima na UID vlasnika

### 7. Rad bez internet konekcije

Aplikacija koristi IndexedDB za čuvanje lokalne kopije poslednjih sinhronizovanih podataka.

U offline režimu omogućeni su:
- Pregled prethodno učitanih podataka
- Korišćenje aplikacije bez ponovnog preuzimanja podataka

Izmene podataka zahtevaju aktivnu internet konekciju.

---

## Lična vozila

Modul **Lična vozila** predstavlja zasebnu funkcionalnu celinu namenjenu evidenciji privatnih vozila i njihovog održavanja.

Podaci ovog modula potpuno su odvojeni od poslovne evidencije auto-servisa.

**Karakteristike:**
- Evidencija privatnih vozila
- Pojedinačna servisna istorija za svako vozilo
- Evidencija datuma i kilometraže
- Kategorija odnosno tip servisa
- Naslov i detaljan opis radova
- Evidencija troškova u RSD ili EUR
- Uvoz i izvoz podataka u JSON formatu
- Automatsko preskakanje duplikata prilikom uvoza

**Odvojena struktura podataka:**

- Poslovna evidencija: `autodesk_users/{uid}`
- Lična vozila: `autodesk_private/{uid}`

Modul Lična vozila ne učitava podatke o klijentima, radnim nalozima i podešavanjima radionice, čime se obezbeđuje potpuna funkcionalna i podatkovna izolacija.

Za korišćenje ovog modula potrebno je objaviti odgovarajuća Firestore pravila iz datoteke `firestore.rules`.

---

## Tehnologije

Projekat je razvijen korišćenjem standardnih web tehnologija, bez frontend framework-a i bez potrebe za build procesom.

| Tehnologija | Namena |
|---|---|
| HTML5 | Struktura aplikacije |
| CSS3 | Dizajn i responzivni interfejs |
| JavaScript | Poslovna logika i korisničke funkcionalnosti |
| Firebase Authentication | Autentifikacija korisnika |
| Cloud Firestore | Cloud baza podataka |
| IndexedDB | Lokalna kopija podataka |
| Service Worker | Offline podrška i keširanje |
| Web Manifest | PWA instalacija |
| GitHub Pages | Hosting aplikacije |

Firebase se koristi putem kompatibilnog (compat) SDK-a koji se učitava sa Google CDN infrastrukture (`gstatic.com`).

---

## Struktura projekta

```text
AutoDesk/
│
├── index.html             # Osnovna HTML stranica
├── app.js                 # Korisnički interfejs i logika prikaza
├── local-api.js           # Obrada podataka, validacija i statistika
├── cloud-sync.js          # Firebase autentifikacija i sinhronizacija
├── print-docs.js          # Generisanje dokumenata za štampu
├── firebase-config.js     # Firebase konfiguracija i UID vlasnika
├── firestore.rules        # Firestore bezbednosna pravila
│
├── sw.js                  # Service Worker
├── manifest.json          # PWA konfiguracija
│
├── icons/                 # Ikonice aplikacije
├── slike/                 # Grafički materijali
│
└── UPUTSTVO.md            # Detaljno uputstvo za instalaciju
```

---

## Instalacija i podešavanje

### 1. Firebase konfiguracija

Za rad aplikacije potreban je Firebase projekat sa sledećim servisima:

- Firebase Authentication – uključena Email/Password autentifikacija
- Cloud Firestore – aktivirana baza podataka

Firebase konfiguracija se definiše u datoteci `firebase-config.js`.

Potrebni parametri uključuju:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `ownerUid`

`ownerUid` predstavlja jedinstveni identifikator vlasničkog naloga.

### 2. Firestore bezbednosna pravila

Datoteka `firestore.rules` sadrži pravila kojima se pristup bazi ograničava na autentifikovanog vlasnika.

Pravila moraju biti objavljena u Firebase konzoli, u sekciji:

`Firestore Database → Rules`

Prilikom konfiguracije potrebno je koristiti isti vlasnički UID koji je definisan u `firebase-config.js`.

Posebna pravila obezbeđuju pristup i zasebnoj kolekciji `autodesk_private`, koja se koristi za modul Lična vozila.

### 3. GitHub Pages hosting

Aplikacija ne zahteva serversko okruženje, Node.js na produkcionom serveru niti build proces.

Za objavljivanje je dovoljno:

1. Postaviti projektne datoteke u GitHub repozitorijum.
2. Uključiti GitHub Pages.
3. Izabrati granu `main` i direktorijum `/ (root)`.
4. Sačekati objavljivanje aplikacije.

Za korišćenje sopstvenog domena podržana je konfiguracija putem `CNAME` datoteke.

Detaljno uputstvo za inicijalno postavljanje, konfiguraciju i ažuriranje aplikacije nalazi se u datoteci [UPUTSTVO.md](https://github.com/Wolf2109/AutoDesk/blob/main/UPUTSTVO.md).

---

## Lokalno pokretanje

Za lokalno testiranje potreban je jednostavan HTTP server. Direktno otvaranje HTML datoteke putem `file://` protokola nije podržano zbog ograničenja Service Worker-a i Firebase servisa.

**Opcija 1 – Node.js:**

```bash
npx serve .
```

**Opcija 2 – Python:**

```bash
python3 -m http.server 8080
```

Nakon pokretanja servera aplikacija je dostupna na:

```text
http://localhost:8080
```

Za autentifikaciju je neophodna ispravna Firebase konfiguracija, a domen `localhost` mora biti dodat u listu dozvoljenih domena u Firebase Authentication podešavanjima.

---

## Struktura podataka u Firestore bazi

Poslovna evidencija čuva se u kolekciji:

`autodesk_users/{uid}`

| Putanja | Sadržaj |
|---|---|
| `sync/meta` | Verzija podataka i pokazivač na aktuelnu evidenciju |
| `sync/{prefiks}{i}` | Evidencija klijenata, vozila, radnih naloga, cenovnika i podešavanja |
| `photos/{id}` | Pojedinačne optimizovane fotografije |
| `backups/{ime}` | Metapodaci rezervnih kopija |
| `backups/{ime}/chunks/{i}` | Delovi rezervnih kopija |

Glavna evidencija serijalizuje se u JSON format i deli na manje delove radi efikasnijeg čuvanja u Firestore bazi. Fotografije se čuvaju odvojeno.

Lična vozila koriste zaseban koren:

`autodesk_private/{uid}`

U njemu se vozila i servisni unosi čuvaju kao pojedinačni dokumenti.

### Sinhronizacija i kontrola verzija

Pre svake izmene proverava se aktuelna verzija podataka u Firestore bazi.

Izmena se prihvata samo ako se lokalno očekivana verzija poklapa sa verzijom u oblaku. U suprotnom se prijavljuje konflikt i zahteva ponovno učitavanje podataka pre ponavljanja izmene.

Provera verzije ograničena je na jedno čitanje u minuti, čime se smanjuje potrošnja Firestore resursa.

---

## Bezbednost i privatnost podataka

- Firebase `apiKey` je javni konfiguracioni podatak i sam po sebi ne predstavlja bezbednosnu prepreku.
- Stvarna kontrola pristupa ostvaruje se putem Firestore Security Rules pravila.
- Pristup poslovnim i privatnim podacima ograničen je na odgovarajući autentifikovani UID.
- Privatni JSON izvozi i rezervne kopije baze ne bi trebalo da se objavljuju u javnom GitHub repozitorijumu.
- Preporučuje se redovno čuvanje lokalne JSON kopije kompletne evidencije, uključujući fotografije.

**Napomena:** Rezervne kopije koje se automatski generišu unutar aplikacije ne sadrže fotografije. Za kompletnu arhivu potrebno je koristiti funkciju `Izvezi JSON`.

---

## Ograničenja

- Sistem je namenjen jednom vlasničkom nalogu.
- Nisu implementirane korisničke uloge niti podrška za više zaposlenih sa zasebnim nalozima.
- Izmene podataka zahtevaju internet konekciju.
- Istovremeni rad na više uređaja nije preporučen zbog mogućih konflikata pri sinhronizaciji.
- Pregled prethodno sinhronizovanih podataka dostupan je i bez interneta.
- Brojevi stranica u dokumentima za štampu podržani su u pregledačima Google Chrome i Microsoft Edge.
- Konverzija između RSD i EUR koristi fiksni kurs od **1 EUR = 120 RSD**.

---

## Licenca

**Privatni projekat – sva prava zadržana.**

Projekat AutoDesk razvijen je za potrebe interne evidencije i poslovanja auto-servisa. Nije objavljen pod licencom otvorenog koda. Sva prava na izvorni kod, dizajn i funkcionalnosti zadržava vlasnik projekta.
