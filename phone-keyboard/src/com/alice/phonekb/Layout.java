package com.alice.phonekb;

import java.util.ArrayList;
import java.util.List;

/** 键位表：纯 Java，不依赖 Android，测试直接用。坐标单位是「标准键宽」。 */
public final class Layout {

    public static final int KIND_NORMAL = 0;
    public static final int KIND_MODIFIER = 1;
    /** 中/英：按下等于 Ctrl+空格（iPad 切输入法）。 */
    public static final int KIND_IME = 2;

    public static final int MOD_CTRL = 0x01;
    public static final int MOD_SHIFT = 0x02;
    public static final int MOD_ALT = 0x04;
    public static final int MOD_GUI = 0x08;

    public static final int USAGE_SPACE = 0x2C;

    public static final class Key {
        public final String label;
        public final String shiftLabel;
        public final int usage;     // HID usage（键盘页 0x07）；修饰键为 0
        public final int modBit;    // 修饰键位；普通键为 0
        public final int kind;
        public final float x, y, w, h;

        Key(String label, String shiftLabel, int usage, int modBit, int kind,
            float x, float y, float w, float h) {
            this.label = label;
            this.shiftLabel = shiftLabel;
            this.usage = usage;
            this.modBit = modBit;
            this.kind = kind;
            this.x = x; this.y = y; this.w = w; this.h = h;
        }
    }

    public static final float WIDTH = 14.5f;
    public static final float ROWS = 5f;

    private static final List<Key> KEYS = new ArrayList<>();
    private static float cx, cy;

    private static void row(int r) { cx = 0; cy = r; }

    private static void k(String label, String shift, int usage, float w) {
        KEYS.add(new Key(label, shift, usage, 0, KIND_NORMAL, cx, cy, w, 1));
        cx += w;
    }

    private static void mod(String label, int bit, float w) {
        KEYS.add(new Key(label, label, 0, bit, KIND_MODIFIER, cx, cy, w, 1));
        cx += w;
    }

    static {
        String letters = "abcdefghijklmnopqrstuvwxyz";
        row(0);
        k("esc", "esc", 0x29, 1);
        String nums = "1234567890";
        String numShift = "!@#$%^&*()";
        for (int i = 0; i < 10; i++) {
            int usage = nums.charAt(i) == '0' ? 0x27 : 0x1E + (nums.charAt(i) - '1');
            k(String.valueOf(nums.charAt(i)), String.valueOf(numShift.charAt(i)), usage, 1);
        }
        k("-", "_", 0x2D, 1);
        k("=", "+", 0x2E, 1);
        k("⌫", "⌫", 0x2A, 1.5f);

        row(1);
        k("tab", "tab", 0x2B, 1.5f);
        for (char c : "qwertyuiop".toCharArray()) letter(c, letters);
        k("[", "{", 0x2F, 1);
        k("]", "}", 0x30, 1);
        k("\\", "|", 0x31, 1);

        row(2);
        KEYS.add(new Key("中/英", "中/英", USAGE_SPACE, MOD_CTRL, KIND_IME, cx, cy, 1.75f, 1));
        cx += 1.75f;
        for (char c : "asdfghjkl".toCharArray()) letter(c, letters);
        k(";", ":", 0x33, 1);
        k("'", "\"", 0x34, 1);
        k("⏎", "⏎", 0x28, 1.75f);

        row(3);
        mod("⇧", MOD_SHIFT, 2.25f);
        for (char c : "zxcvbnm".toCharArray()) letter(c, letters);
        k(",", "<", 0x36, 1);
        k(".", ">", 0x37, 1);
        k("/", "?", 0x38, 1);
        mod("⇧", MOD_SHIFT, 2.25f);

        row(4);
        mod("ctrl", MOD_CTRL, 1.25f);
        mod("⌥", MOD_ALT, 1.25f);
        mod("⌘", MOD_GUI, 1.5f);
        k("", "", USAGE_SPACE, 5.5f);
        k("`", "~", 0x35, 1);
        k("←", "←", 0x50, 1);
        k("↑", "↑", 0x52, 1);
        k("↓", "↓", 0x51, 1);
        k("→", "→", 0x4F, 1);
    }

    private static void letter(char c, String letters) {
        k(String.valueOf(c), String.valueOf(Character.toUpperCase(c)), 0x04 + letters.indexOf(c), 1);
    }

    public static List<Key> keys() { return KEYS; }

    /** 在键位坐标 (ux, uy) 处的键，没有返回 null。 */
    public static Key hit(float ux, float uy) {
        for (Key key : KEYS) {
            if (ux >= key.x && ux < key.x + key.w && uy >= key.y && uy < key.y + key.h) return key;
        }
        return null;
    }

    private Layout() {}
}
