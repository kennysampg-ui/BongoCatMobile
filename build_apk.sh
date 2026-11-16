#!/usr/bin/env bash
# Compila o APK de teste (debug) e o copia para ./BongoCatMobile-debug.apk
# Requisitos: JDK 17+ e Android SDK (ANDROID_HOME) com a plataforma android-35 e build-tools.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v java >/dev/null; then
  echo "ERRO: JDK não encontrado. Instale o JDK 17 ou superior." >&2; exit 1
fi

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ] && [ ! -f local.properties ]; then
  for c in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
    [ -d "$c" ] && SDK="$c" && break
  done
fi
if [ -n "$SDK" ] && [ ! -f local.properties ]; then
  echo "sdk.dir=$SDK" > local.properties
  echo "Usando Android SDK em: $SDK"
fi
if [ -z "$SDK" ] && [ ! -f local.properties ]; then
  echo "ERRO: Android SDK não encontrado. Defina ANDROID_HOME ou abra o projeto no Android Studio uma vez." >&2
  exit 1
fi

./gradlew --no-daemon assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ./BongoCatMobile-debug.apk
echo
echo "Pronto: $(pwd)/BongoCatMobile-debug.apk"
echo "Instalar:  adb install -r BongoCatMobile-debug.apk"
