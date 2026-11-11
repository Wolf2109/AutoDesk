# AutoDesk – Workshop Manager

Lokalna aplikacija za evidenciju auto-dijagnostičarske radionice. Node.js + Express + SQLite, responsive web interfejs, PWA, fotografije, izveštaji, lozinka i rezervne kopije.

## Instalacija na Windows 10/11

1. Instalirajte **Node.js LTS (20 ili noviji)** sa nodejs.org. Za instaliranje paketa potreban je internet **samo prvi put**.
2. Raspakujte ceo projekat u folder sa pravima upisa, npr. `C:\AutoDesk` (izbegnite `Program Files`).
3. Dvaput kliknite na `start-server.bat`. Prvi put izvršava `npm install`, zatim pokreće server.
4. Otvorite `http://localhost:3000`. Pri prvom pokretanju podesite lozinku.
5. Ubuduće za rad bez interneta samo pokrenite `start-server.bat`; svi npm paketi moraju već biti instalirani.
6. `stop-server.bat` zaustavlja proces koji sluša na portu 3000. Ako na tom portu radi neka druga aplikacija, nemojte koristiti skriptu – zaustavite server sa Ctrl+C u njegovom prozoru.

## Android i tablet

Računar i telefon povežite na istu Wi-Fi mrežu. Na računaru u Command Prompt pokrenite `ipconfig` i pronađite IPv4 adresu (npr. `192.168.1.100`). Na telefonu otvorite `http://192.168.1.100:3000`. Windows Firewall može zatražiti dozvolu za Node.js pristup privatnoj mreži.

**Važno:** Android PWA instalacija i Service Worker zahtevaju HTTPS ili pouzdano lokalno okruženje. Obična LAN HTTP adresa najčešće nije pouzdan kontekst. Za instalaciju kao samostalne PWA aplikacije postavite HTTPS sa sertifikatom kome Android veruje, npr. preko lokalnog reverse proxy servera. Sam web interfejs radi preko LAN HTTP-a, ali se PWA instalacija ne garantuje na toj adresi.

## Baza, fotografije i backup

- Baza: `data/autodesk.sqlite`.
- Fotografije: `data/uploads/*.webp`.
- Backup baze: `data/backups/*.sqlite`. Automatska provera na svakih sat vremena dok server radi; prva kopija se pravi najkasnije sat nakon pokretanja, zatim jednom dnevno. Čuva se do 30 najnovijih kopija.
- Ručni backup: Podešavanja → Napravi rezervnu kopiju. Možete i preuzeti SQLite datoteku.
- **Za potpuni backup sa fotografijama** sa zaustavljenim serverom kopirajte ceo `data` folder na drugi disk/USB. Rezervna kopija baze sama ne uključuje slike.
- Vraćanje: zaustavite server, pokrenite `restore-backup.bat`, unesite tačan naziv datoteke, pa ponovo pokrenite server. Skripta čuva prethodnu bazu kao `data/pre-restore.sqlite`. Ako je potrebno vratiti fotografije, vratite i odgovarajući `data/uploads` folder iz kompletne kopije.
- Nikad ne kopirajte samo aktivnu `.sqlite` datoteku dok je server uključen (WAL režim). Koristite dugme za backup ili zaustavite server pre kopiranja celog foldera.

## Bezbednost

Lozinka se čuva kao `scrypt` hash sa nasumičnom soli. API zahteva sesijski token, koji se čuva samo u sessionStorage. Nije predviđen direktan pristup sa interneta. Server podrazumevano sluša na svim lokalnim mrežnim interfejsima (`0.0.0.0`), zato koristite pouzdanu privatnu mrežu. Za udaljeni pristup koristite VPN + HTTPS, ne prosleđujte port direktno na internet. Za ozbiljnu produkcionu upotrebu preporučuje se dodatno testiranje bezbednosti i pouzdanosti.

## Finansijski model

Samo **potrošeno** i **naplaćeno**; obe vrednosti su nenegativne, uključujući nulu. Naplaćeno može biti manje, jednako ili veće od potrošenog. Razlika je izračunata (`naplaćeno − potrošeno`) i nije neto profit. Cenovnik je potpuno nezavisan. Iznosi se čuvaju kao celi brojevi u parama, a u interfejsu se unose u dinarima.

## Struktura

- `server.js`: SQLite inicijalizacija, REST API, validacija, autentifikacija, statistika, fotografije, PDF/CSV, backup.
- `public/`: frontend, CSS, PWA manifest, Service Worker, ikonice.
- `data/`: baza i korisničke fotografije (automatski se kreira).

## Konfiguracija

Podržane promenljive okruženja: `PORT` (podrazumevano 3000), `HOST` (podrazumevano 0.0.0.0), `AUTODESK_DATA` (putanja do foldera podataka). Nakon promene porta ažurirajte adresu za pristup i Windows skripte. Valuta u podešavanjima je informativna; prikaz novca u verziji 1.0 koristi RSD.

## Ograničenja verzije 1.0

- Potreban je instaliran Node.js i `npm install`; ZIP ne sadrži `node_modules`.
- PWA instalacija preko LAN-a zahteva zasebno HTTPS podešavanje.
- PDF podrška za srpska slova zavisi od dostupnog Unicode fonta na serveru.
- Nema automatskog offline upisa: bez veze sa serverom ništa se ne smatra sačuvanim.
- Nema automatskog startovanja servera pri podizanju Windowsa.


## Valuta u verziji 1.1

Valuta se bira u **Podešavanja → Valuta** (RSD, EUR, USD, CHF, GBP, BAM, HRK, MKD).
Izabrana oznaka se koristi u dashboardu, cenovniku, radnim nalozima, statistici i CSV/PDF izveštajima.
**Važno:** promena valute menja samo oznaku, **ne konvertuje iznose** i ne koristi devizni kurs.
Zato pre promene valute proverite da li su postojeći unosi u željenoj valuti;
za preračunavanje istorijskih podataka potreban je zaseban, kontrolisan postupak.
Za postojeću instalaciju sačuvajte folder `data`, napravite backup i zamenite programske fajlove novim.


## Verzija 1.2 — konverzija valute

U Podešavanjima možete menjati valutu između RSD i EUR. Fiksni kurs je **1 EUR = 120 RSD** (korisnički definisan, ne tržišni kurs). Pri potvrdi aplikacija prvo pravi SQLite rezervnu kopiju, pa u jednoj transakciji konvertuje `spent_amount`, `charged_amount` u svim radnim nalozima i `price_amount` u cenovniku. Dashboard, statistika, CSV i PDF zatim prikazuju preračunate iznose u novoj valuti. Ne dodaju se nova finansijska polja.

**Važno:** Iznosi se čuvaju kao celi brojevi najmanjih novčanih jedinica i zaokružuju na dve decimale. Višestruka konverzija napred-nazad može izazvati male razlike usled zaokruživanja. Za USD, CHF i druge valute konverzija nije dostupna jer kurs nije definisan. Ako je postojeća instalacija već označena drugom valutom, prvo ručno uskladite podatke iz rezervne kopije; aplikacija neće nagađati izvornu valutu.
