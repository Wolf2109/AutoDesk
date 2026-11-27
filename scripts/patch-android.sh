#!/usr/bin/env bash
# Dopune generisanog Android projekta: sopstveni plugin za štampu, verzija, potpisivanje.
set -euo pipefail

JAVA_DIR="$(dirname "$(find android -name MainActivity.java | head -n 1)")"
echo "Java paket: $JAVA_DIR"
cp android-plugin/MainActivity.java android-plugin/HtmlPrintPlugin.java android-plugin/AutoDeskUpdatePlugin.java "$JAVA_DIR/"

RUN="${GITHUB_RUN_NUMBER:-1}"
sed -i -E "s/versionCode [0-9]+/versionCode ${RUN}/; s/versionName \"[^\"]*\"/versionName \"1.1.${RUN}\"/" android/app/build.gradle

# Allow user-confirmed APK installation through the system installer.
sed -i '/<application/i\    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />' android/app/src/main/AndroidManifest.xml

if [ -n "${KEYSTORE_PATH:-}" ]; then
  echo "Potpisivanje ključem iz GitHub Secrets."
  cat >> android/app/build.gradle <<'GRADLE'

android {
    signingConfigs {
        autodeskRelease {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.autodeskRelease
        }
    }
}
GRADLE
fi
