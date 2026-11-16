package com.alice.phonekb;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 按键状态机：多指按住、修饰键「点一下锁一次」、组成 8 字节 HID 键盘报告。
 * 纯 Java，测试直接用。
 */
public final class KeyState {

    /** 每根手指（pointerId）当前按着的键。 */
    private final Map<Integer, Layout.Key> held = new LinkedHashMap<>();
    /** 点一下锁住、等下一个普通键松开时清掉的修饰键。 */
    private int latched = 0;

    public void down(int pointer, Layout.Key key) {
        if (key == null) return;
        if (key.kind == Layout.KIND_MODIFIER) {
            latched ^= key.modBit;   // 点一下锁上，再点一下取消
        }
        held.put(pointer, key);
    }

    public void up(int pointer) {
        Layout.Key key = held.remove(pointer);
        if (key != null && key.kind != Layout.KIND_MODIFIER) {
            latched = 0;             // 用过一次就清
        }
    }

    public void clear() {
        held.clear();
        latched = 0;
    }

    public int latched() { return latched; }

    /** 画面用：锁住的也算，键帽显示大写/符号。 */
    public boolean shiftActive() { return ((latched | heldModifiers()) & Layout.MOD_SHIFT) != 0; }

    public boolean isHeld(Layout.Key key) { return held.containsValue(key); }

    private int heldModifiers() {
        int m = 0;
        for (Layout.Key k : held.values()) {
            if (k.kind == Layout.KIND_MODIFIER || k.kind == Layout.KIND_COMBO) m |= k.modBit;
        }
        return m;
    }

    /**
     * 发给 iPad 的修饰位：手指按着的照发；点一下锁住的，只在有普通键按下时才带上。
     * 否则单点一下 ⇧ 会被 iPad 拼音当成「单按 Shift 切中英」。
     */
    public int modifiers() {
        int m = heldModifiers();
        for (Layout.Key k : held.values()) {
            if (k.kind != Layout.KIND_MODIFIER) { m |= latched; break; }
        }
        return m;
    }

    /** 8 字节：修饰位、保留、最多 6 个键；超过 6 个按规范全填 0x01（rollover）。 */
    public byte[] report() {
        byte[] r = new byte[8];
        r[0] = (byte) modifiers();
        List<Integer> usages = new ArrayList<>();
        for (Layout.Key k : held.values()) {
            if (k.kind == Layout.KIND_MODIFIER) continue;
            if (!usages.contains(k.usage)) usages.add(k.usage);
        }
        if (usages.size() > 6) {
            for (int i = 2; i < 8; i++) r[i] = 0x01;
            return r;
        }
        for (int i = 0; i < usages.size(); i++) r[2 + i] = (byte) (int) usages.get(i);
        return r;
    }
}
