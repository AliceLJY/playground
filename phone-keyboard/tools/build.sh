#!/bin/bash
# 不用 Gradle，直接拿 Android SDK 命令行工具打包：aapt2 → javac → d8 → zipalign → apksigner。
# 用法：bash tools/build.sh            （先跑测试，再出 build/phone-keyboard.apk）
# 依赖：~/.android-build.env（JAVA_HOME / ANDROID_HOME）；签名钥匙在 ~/.android/phonekb.keystore，不入仓，
# 丢了只影响「覆盖安装」，删掉旧 App 重装即可。
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.android-build.env"
BT="$ANDROID_HOME/build-tools/36.0.0"
JAR="$ANDROID_HOME/platforms/android-36/android.jar"
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/classes" "$OUT/dex" "$OUT/testclasses"

echo "== 测试"
javac -encoding UTF-8 -d "$OUT/testclasses" src/com/alice/phonekb/Layout.java src/com/alice/phonekb/KeyState.java src/com/alice/phonekb/Touchpad.java tests/KeyStateTest.java tests/TouchpadTest.java
java -cp "$OUT/testclasses" KeyStateTest

echo "== 资源"
"$BT/aapt2" compile --dir res -o "$OUT/res/compiled.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 29 --target-sdk-version 33 "$OUT/res/compiled.zip"

echo "== 编译"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -Xlint:-options \
  -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --release --min-api 29 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "== 打包签名"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS="$HOME/.android/phonekb.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$KS" -alias phonekb -keyalg RSA -keysize 2048 -validity 36500 \
    -storepass android -keypass android -dname "CN=phonekb" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/phone-keyboard.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/phone-keyboard.apk"
ls -l "$OUT/phone-keyboard.apk"
