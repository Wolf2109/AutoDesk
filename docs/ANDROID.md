# AutoDesk kao Android aplikacija

Isti kod kao web verzija, upakovan u pravu Android aplikaciju (Capacitor). APK gradi GitHub sam (Actions), ne treba ti Android Studio.

## Jednokratno podešavanje

1. Postavi sve fajlove iz ovog paketa u repozitorijum (uključujući skriveni folder `.github`).
2. GitHub → repozitorijum → **Settings → Secrets and variables → Actions** → napravi tri secret-a iz fajla `AutoDesk-kljuc-ZA-GITHUB-SECRETS.txt`: `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_BASE64`. Ključ ne stavljaj u repozitorijum.
3. Firebase konzola → **Authentication → Settings → Authorized domains**: proveri da postoji `localhost` (obično je tu po podrazumevanom).

## Građenje i instalacija

- GitHub → **Actions → Build Android APK → Run workflow** (a gradi se i pri svakom push-u na `main`). Traje oko 5–10 minuta.
- Gotov APK je na strani **Releases → apk-latest** (fajl `AutoDesk.apk`) i u Artifacts izvršenja.
- Na telefonu otvori Releases stranu, preuzmi `AutoDesk.apk` i instaliraj (dozvoli „instalaciju iz nepoznatih izvora“ za pregledač). Nove verzije se instaliraju preko stare, podaci ostaju.

## Šta se razlikuje od web verzije

- Štampa i „Sačuvaj kao PDF“ otvaraju Android prozor za štampu (izaberi „Sačuvaj kao PDF“).
- Izvoz JSON-a otvara Android „Podeli/Sačuvaj“ (Drive, Fajlovi, WhatsApp…).
- Aplikacija ima svoje fajlove, Firebase SDK i fontove u APK-u, pa se pokreće i bez interneta.
- Dugme „Nazad“ zatvara prozor ili meni, pa vraća na prethodni ekran; tek sa početne strane izlazi iz aplikacije.

## Ažuriranje
Potpisani main build ažurira postojeći apk-latest release (AutoDesk.apk i android-update.json). Instalirana aplikacija proverava versionCode pri pokretanju i jednom na sat; ručna provera je u Podešavanjima. Potvrda otvara APK u sistemskom pregledaču; korisnik zatim otvara preuzetu datoteku i potvrđuje instalaciju. Nema tihe instalacije. Isti applicationId i ključ su obavezni. Privatni GitHub repozitorijumi nisu podržani za anonimno preuzimanje. Nepotpisani build ostaje artifact i ne objavljuje se kao ažuriranje.

Sve tri referentne baze pri prvom otvaranju pretrage u sesiji pokušavaju da učitaju aktuelnu verziju sa postojećeg HTTPS hostinga. Ako mreža ili CORS ne dozvoljavaju pristup, koriste prethodno keširanu ili ugrađenu bazu. Ponovno pokretanje aplikacije osvežava memorijski keš. Ovo ne menja privatnu evidenciju radionice.
