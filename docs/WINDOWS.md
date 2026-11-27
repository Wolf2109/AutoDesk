# AutoDesk za Windows (64-bit)

GitHub Actions → Build Windows EXE → Run workflow (main). Workflow se pokreće i pri push-u na main. Po uspešnom završetku preuzmite artifact AutoDesk-Windows i raspakujte ga. Sadrži AutoDesk-Setup.exe i AutoDesk-Portable.exe. Portable ne zahteva instalaciju, ali korisnički podaci ostaju u lokalnom Windows profilu. EXE fajlovi nisu digitalno potpisani; Windows može prikazati upozorenje. Instalirajte samo proverene buildove iz svog repozitorijuma.

Lokalni build (Node.js 22 i Windows): iz korena `node scripts/prepare-www.js --desktop`, zatim `cd desktop`, `npm install`, `npm run dist`. Za razvoj `npm start` nakon pripreme. Rezultat u desktop/dist.

Sve tri baze se pakuju lokalno; Firebase SDK se preuzima tokom builda. Prijava i cloud sinhronizacija zahtevaju internet i postojeća Firebase pravila; offline dostupnost privatnih podataka zavisi od prethodne prijave i postojećeg keša. Windows koristi stabilan lokalni origin http://127.0.0.1:18743, dostupan samo na loopback interfejsu. Ako je port zauzet, aplikacija prijavljuje grešku. Automatsko ažuriranje opisano je ispod. Android workflow i web hosting ostaju nezavisni.

Pre distribucije proveriti prijavu, pretrage, štampanje i offline režim na Windows računaru. Ako Firebase odbije origin, proveriti postavke projekta i ograničenja API ključa; ne menjati Firestore pravila radi zaobilaženja autentifikacije.

## Ažuriranje
GitHub Actions na main objavljuje Windows release v1.0.<run_number> sa NSIS instalacijom i latest.yml. Instalirana verzija proverava pri pokretanju i jednom na sat; meniju AutoDesk → Proveri ažuriranja. Preuzimanje i restart zahtevaju potvrdu. Portable otvara stranicu release-a. Repozitorijum mora biti javno dostupan; ne ugrađivati token u aplikaciju. Pre distribucije potpisati instalaciju i testirati prelazak sa jedne verzije na drugu. Trenutna konfiguracija objavljuje svaki uspešan main build, ne samo ručno odabrane stabilne verzije.


## Fullscreen
Setup and Portable launch in fullscreen. Press F11 to toggle fullscreen, or Esc to exit fullscreen. Alt+F4 closes the application.
