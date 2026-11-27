# AutoDesk – Firestore v2

## Pre instalacije
1. Na svim starim uređajima završiti sinhronizaciju i proveriti da nema lokalnih izmena na čekanju. Izvesti kompletnu rezervnu kopiju i sačuvati van aplikacije. Zatvoriti stare aplikacije.
2. U Firebase konzoli objaviti priloženi firestore.rules (zadržava postojeći vlasnički UID). Proveriti da je UID isti kao u config/firebase-config.js. Opcionalno primeniti izuzeća indeksa iz firestore.indexes.json (uz očuvanje eventualnih drugih postojećih indeksa); Firebase CLI: firebase deploy --only firestore:rules,firestore:indexes --project ID_PROJEKTA. Ne koristiti CLI za indekse ako bi uklonio postojeće potrebne indekse.
3. Objaviti novu web verziju ili izgraditi APK postojećim GitHub Actions postupkom. Ažurirati sve uređaje. Prvo otvoriti online na jednom uređaju; proveriti broj klijenata, vozila, naloga i fotografije, zatim otvoriti druge uređaje.

Migracija je automatska pri prvom online getMeta: čita stari JSON, upisuje pojedinačne dokumente u novu generaciju, zatim transakcijom prebacuje meta pokazivač samo ako stara verzija nije promenjena. Stari delovi nisu obrisani. Fotografije i rezervne kopije ostaju na postojećim putanjama. Ne vraćati staru aplikaciju posle migracije: stare kopije ne sadrže nove izmene. Pravila sprečavaju stare upise evidencije, ali stara aplikacija još može pristupati fotografijama i privatnim kolekcijama; zato se mora ugasiti.

## Struktura i trošak
- autodesk_users/{uid}/sync/meta: verzija, generacija, verzije grupa i JSON podešavanja/brojača.
- autodesk_users/{uid}/record_sets/{generation}/clients, vehicles, services, orders, photo_metadata: jedan dokument po zapisu, JSON payload i revision; brisanja su mali tombstone dokumenti.
- Prvo učitavanje uređaja: celokupna evidencija u mrežnim stranicama od 250 dokumenata; UI i dalje koristi lokalnu IndexedDB kopiju. Nije implementirana paginacija UI niti serverska statistika.
- Provera bez izmene: jedno čitanje meta dokumenta. Izmena jednog zapisa: obično jedno transakcijsko čitanje i dva upisa (zapis + meta). Delta na drugom uređaju: meta, izmenjeni dokumenti samo iz promenjenih grupa, završna provera meta. Trošak može biti veći usled ponavljanja transakcije, praznih upita, backup-a itd.
- Veliki uvoz (>400 promena ili >7 MB procenjenih izmena) koristi novu generaciju. Stare generacije, tombstone dokumenti i nepotpune generacije se namerno ne brišu automatski; potrebno je planirano čišćenje posle provere i sigurnosne kopije. Migracija privremeno duplira deo skladišta i može dostići Spark kvotu; u tom slučaju pokazivač ostaje na prethodnoj verziji ako nije potvrđen prelaz.
- Lokalni sync metapodaci i baza za spajanje ostaju u IndexedDB. Privatna vozila, gorivo i alati zadržavaju raniju odvojenu strukturu i lokalni cache. Njihovo ručno osvežavanje nije delta sync.

## Testiranje
node tests/records-smoke.cjs i node tests/offline-smoke.cjs iz korena projekta. Prvi koristi simulirani Firestore (ne emulator), drugi simuliranu lokalnu bazu. Nije izvršeno na pravom Firebase projektu, browseru ili Android uređaju; pravila i indeksi nisu objavljeni. Testirati i stvarne podatke, konkurentne uređaje, uvoz, brisanje i povratak iz offline režima pre redovnog korišćenja.
