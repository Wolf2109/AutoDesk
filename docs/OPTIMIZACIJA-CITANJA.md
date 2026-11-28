# AutoDesk – optimizacija Firestore čitanja

- Lokalna evidencija ostaje u IndexedDB. Ako stariji lokalni keš nema meta podatke, a verzija se poklapa sa serverom, pokazivač generacije se sada trajno čuva. Sledeća promena može koristiti delta upit.
- Periodična provera verzije je na 10 umesto 5 minuta; pauzira se kada aplikacija nije vidljiva. Ručno osvežavanje i provera pri povratku veze ostaju.
- Automatski backup pamti vreme poslednje uspešne kopije, proverava spisak tek kada je kopija dospela i koristi isti spisak pri čišćenju. Brisanje kopije poništava lokalni raspored. Izmene rasporeda se poštuju pri sledećoj proveri.
- Istovremeni zahtevi za istu grupu privatne evidencije dele jednu sinhronizaciju. Ručno osvežavanje privatnih grupa i prvo učitavanje i dalje preuzimaju celu izabranu grupu.
- Service worker ima novu verziju. Firestore šema i pravila nisu promenjeni.

## Provera
`node tests/records-smoke.cjs`, `node tests/offline-smoke.cjs`, `node tests/dtc-smoke.cjs`.
Simulacija 500 zapisa: validan lokalni keš + ista verzija = 1 čitanje; izmena jednog zapisa = 1 čitanje i 2 upisa; drugi uređaj preuzima jednu promenu = 3 čitanja. To nisu merenja produkcijskog Firebase naloga. Prvo učitavanje, izgubljen keš, promena generacije, migracija i ručna sinhronizacija privatnih grupa mogu biti skuplji. Fotografije se i dalje preuzimaju po potrebi, a keš fotografija je memorijski.

## Instalacija
Zameniti postojeće fajlove projekta novim iz ZIP-a, bez brisanja lokalnih podataka pregledača ili aplikacije. Za Android izgraditi novi APK po postojećem postupku. Ne treba ponovo migrirati Firestore niti menjati pravila. Za test potrošnje zatvoriti prikaz kolekcija u Firebase konzoli i sačekati ažuriranje metrike.

## Napomena – 28.11.2026.
Javni JSON katalozi vozila, ECU i DTC odvojeni su od privatne Firestore evidencije. Nije potrebna nova migracija niti dodatni ključ. Postojeća Firebase pravila ostaju nepromenjena; proveriti ih u konzoli jer ZIP ne sadrži `firestore.rules`.
