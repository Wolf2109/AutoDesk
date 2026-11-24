# Lokalna DTC baza

U radnom nalogu izaberite vozilo, unesite kodove ili pretražite bazu po kodu/opisu. Predlozi koriste marku izabranog vozila (ili polje Marka za novo vozilo). Fabrički opis ima prednost nad generičkim; kod druge marke se ne koristi. Klik na rezultat dodaje kod. Dugme **Popuni opise iz baze** dopisuje opise koji još nisu evidentirani; postojeći ručni tekst se ne prepisuje. Ako promenite vozilo ili kodove, proverite i po potrebi ručno izmenite sačuvane opise. Status se trenutno upisuje ručno u isto polje. Opisi se čuvaju uz nalog i prikazuju u PDF-u, detaljima i CSV-u. Pretraga baze ne koristi Firebase. Baza se učitava na otvaranju obrasca i dostupna je offline nakon uspešnog keširanja web verzije, odnosno ugrađena u Android paket.

## Puna baza
ZIP sadrži lokalni JSON konvertovan iz dostavljene SQLite baze, sa engleskim opisima. Nije potreban dodatni uvoz. Skripta i workflow za buduće osvežavanje ostaju dostupni. Baza nije kompletna fabrička servisna dokumentacija i ne potvrđuje uzrok kvara.

## Testiranje
`node tests/dtc-smoke.cjs` proverava OEM prioritete, marke, generički fallback, pretragu i više kodova. Postojeći records/offline smoke testovi takođe prolaze. Nije izvršen end-to-end test na Android uređaju, stvarnoj Firebase bazi niti sa punim upstream skupom.
