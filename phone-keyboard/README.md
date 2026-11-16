# Phone Keyboard

Turns an Android phone into a Bluetooth keyboard for an iPad, so you can leave the hardware keyboard at home.

- Landscape, full-screen keyboard; the iPad sees a standard external keyboard and hides its on-screen one.
- Chinese input uses the iPad's own IME; the 中/英 key sends Ctrl+Space.
- Modifiers latch for one key on tap, or can be held with another finger.

Built on Android's `BluetoothHidDevice` (Android 9+). Build without Gradle: `bash tools/build.sh` runs `tests/KeyStateTest.java`, then writes `build/phone-keyboard.apk`.
