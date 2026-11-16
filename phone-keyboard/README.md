# Phone Keyboard · OPPO Find N6 edition

**Download**: [phone-keyboard-v0.4.apk](https://github.com/AliceLJY/playground/releases/download/phone-keyboard-v0.4/phone-keyboard-v0.4.apk) (25 KB, Android 10+). The layout is tuned for the Find N6's square inner screen; other Android phones work only if the system keeps `BluetoothHidDevice` enabled.

Turns an Android phone into a Bluetooth keyboard for an iPad, so you can leave the hardware keyboard at home.

- Any orientation: number pad top-left, trackpad top-right, full keyboard at the bottom (trackpad on top so palms don't brush it);
- the iPad sees a standard external keyboard and hides its on-screen one.
- Chinese input uses the iPad's own IME; the 中/英 key sends Ctrl+Space.
- Trackpad follows MacBook habits: tap to click, two-finger tap for right click, two-finger scroll, tap-and-drag, and long-press to start a drag-lock selection (lift and continue, tap to end). No three-finger gestures (OPPO reserves them); a shortcut row below the trackpad covers Select All, Cut, Copy, Paste, Undo, Home and App Switch.
- Modifiers latch for one key on tap, or can be held with another finger.

Built on Android's `BluetoothHidDevice` (Android 9+). Build without Gradle: `bash tools/build.sh` runs `tests/KeyStateTest.java`, then writes `build/phone-keyboard.apk`.

## Who opens this, AI assets

For anyone who carries an iPad and would rather not carry a keyboard too. All code was written with AI collaboration; the screenshot is from a real device; no AI-generated images or audio.
