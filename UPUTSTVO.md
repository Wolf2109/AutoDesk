# AutoDesk — spojena verzija za GitHub Pages + Firebase

Ova verzija preuzima interfejs i funkcije iz novog AutoDesk.zip, uz postojeći Firebase nalog, Firestore sinhronizaciju, lokalni keš i ikonice.

1. Sačuvajte rezervnu kopiju trenutne evidencije u aplikaciji (Podešavanja → Izvezi JSON) pre zamene fajlova.
2. Na GitHub repozitorijumu `Wolf2109/AutoDesk` postavite **sadržaj ovog foldera** u root repozitorijuma. Ne postavljajte ZIP, SQLite bazu, `node_modules`, server.js niti privatne podatke.
3. U GitHub Pages zadržite `main` / `(root)` i custom domain `app.autodjiagnostikalazarevic.rs`.
4. Firestore pravila ostaju ista (ograničena na postojeći UID).
5. Sačekajte Pages deployment, uradite hard refresh i testirajte prijavljivanje, kreiranje probnog naloga, status naloga, podsetnike, fotografije, podešavanja, izvoz i prijavu na drugom uređaju.

Važno: nova verzija uvodi status naloga i servisne podsetnike; postojeći nalozi bez statusa prikazuju se kao završeni. Lokalni keš ubrzava navigaciju, a ponovna provera oblaka je približno na svakih 30 sekundi. Firestore sinhronizacija koristi jedan dokumentni skup, a ne pojedinačne zapise, pa izbegavajte istovremeno uređivanje na dva uređaja.

**Nemojte postavljati `AutoDesk/data/` na javni GitHub** — sadrži privatnu SQLite evidenciju.
