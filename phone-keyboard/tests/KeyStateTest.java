import com.alice.phonekb.KeyState;
import com.alice.phonekb.Layout;

/** 无框架断言测试：java -ea 跑，任何一条不过就非零退出。 */
public class KeyStateTest {

    static int fails = 0;

    static void check(boolean ok, String msg) {
        if (!ok) { fails++; System.out.println("FAIL " + msg); }
        else System.out.println("ok   " + msg);
    }

    static Layout.Key key(String label) {
        for (Layout.Key k : Layout.keys()) if (k.label.equals(label)) return k;
        throw new IllegalStateException("no key " + label);
    }

    static String hex(byte[] r) {
        StringBuilder sb = new StringBuilder();
        for (byte b : r) sb.append(String.format("%02X ", b));
        return sb.toString().trim();
    }

    public static void main(String[] a) {
        // 1. 键位：每行总宽 14.5，没有重叠、没有漏洞
        for (int row = 0; row < 5; row++) {
            float sum = 0;
            for (Layout.Key k : Layout.keys()) if (k.y == row) sum += k.w;
            check(Math.abs(sum - Layout.WIDTH) < 1e-4, "第 " + row + " 行宽度 = 14.5（实际 " + sum + "）");
        }
        int holes = 0;
        for (float y = 0.05f; y < 5; y += 0.1f)
            for (float x = 0.01f; x < Layout.WIDTH; x += 0.05f)
                if (Layout.hit(x, y) == null) holes++;
        check(holes == 0, "键盘区每个点都落在某个键上（空洞 " + holes + "）");

        // 2. 字母 HID 码：a=0x04, z=0x1D；数字 1=0x1E, 0=0x27
        check(key("a").usage == 0x04 && key("z").usage == 0x1D, "a/z 键码");
        check(key("1").usage == 0x1E && key("9").usage == 0x26 && key("0").usage == 0x27, "数字键码");
        check(key("⌫").usage == 0x2A && key("⏎").usage == 0x28, "退格/回车键码");

        // 3. 单击 a：按下报告带 0x04，松开全 0
        KeyState s = new KeyState();
        s.down(0, key("a"));
        check(hex(s.report()).equals("00 00 04 00 00 00 00 00"), "按住 a → " + hex(s.report()));
        s.up(0);
        check(hex(s.report()).equals("00 00 00 00 00 00 00 00"), "松开 a → 全 0");

        // 4. 点一下 ⇧ 再点 a：⇧ 单独时不发 Shift（防 iPad 拼音误切中英），a 按下时带 Shift，用完清掉
        s = new KeyState();
        Layout.Key shift = key("⇧");
        s.down(0, shift); s.up(0);
        check(s.report()[0] == 0, "只点了 ⇧ 时不发 Shift");
        check(s.shiftActive(), "点了 ⇧ 后键帽显示大写");
        s.down(1, key("a"));
        check(s.report()[0] == Layout.MOD_SHIFT && s.report()[2] == 0x04, "锁住 ⇧ 后按 a → Shift+a");
        s.up(1);
        check(!s.shiftActive() && s.report()[0] == 0, "a 松开后 ⇧ 自动取消");

        // 5. 点两下 ⇧ 等于取消
        s = new KeyState();
        s.down(0, shift); s.up(0); s.down(0, shift); s.up(0);
        check(!s.shiftActive(), "⇧ 点两下取消");

        // 6. 按住 ⌘ 同时按 c（两指）→ Cmd+C
        s = new KeyState();
        s.down(0, key("⌘")); s.down(1, key("c"));
        check(s.report()[0] == Layout.MOD_GUI && s.report()[2] == 0x06, "按住 ⌘ + c → " + hex(s.report()));
        s.up(1); s.up(0);

        // 7. 中/英 = Ctrl+空格，松开归零
        s = new KeyState();
        s.down(0, key("中/英"));
        check(hex(s.report()).equals("01 00 2C 00 00 00 00 00"), "中/英 → Ctrl+Space " + hex(s.report()));
        s.up(0);
        check(hex(s.report()).equals("00 00 00 00 00 00 00 00"), "中/英 松开归零");

        // 8. 超过 6 个键 → rollover
        s = new KeyState();
        String[] seven = {"q", "w", "e", "r", "t", "y", "u"};
        for (int i = 0; i < 7; i++) s.down(i, key(seven[i]));
        check(hex(s.report()).equals("00 00 01 01 01 01 01 01"), "7 键同按 → rollover");

        // 9. 描述符里报告 ID 是 1，和发送一致
        System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
