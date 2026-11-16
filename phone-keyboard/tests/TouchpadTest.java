import com.alice.phonekb.Layout;
import com.alice.phonekb.Touchpad;

import java.util.ArrayList;
import java.util.List;

/** 触控板手势：用假的时间和坐标喂进去，看发出去的鼠标报告对不对。density 取 3（像素 = dp × 3）。 */
public class TouchpadTest {

    static final List<int[]> out = new ArrayList<>();
    static final List<int[]> combos = new ArrayList<>();
    static final Touchpad.Sink SINK = new Touchpad.Sink() {
        public void mouse(int b, int dx, int dy, int w, int p) { out.add(new int[]{b, dx, dy, w, p}); }
        public void combo(int mods, int usage) { combos.add(new int[]{mods, usage}); }
    };

    static Touchpad fresh() { out.clear(); combos.clear(); return new Touchpad(3, SINK); }

    static void check(boolean ok, String msg) { KeyStateTest.check(ok, "[触控板] " + msg); }

    static int sum(int field) { int s = 0; for (int[] r : out) s += r[field]; return s; }

    static boolean anyButton(int b) { for (int[] r : out) if (r[0] == b) return true; return false; }

    static void run() {
        // 单指往右下滑 60dp → 指针往右下走，不点击
        Touchpad p = fresh();
        p.down(0, 100, 100, 0);
        for (int i = 1; i <= 20; i++) p.move(0, 100 + i * 9, 100 + i * 9, i * 10);
        p.up(0, 400);
        check(sum(1) > 0 && sum(2) > 0, "单指右下滑 → 指针右下移（dx=" + sum(1) + " dy=" + sum(2) + "）");
        check(!anyButton(1), "单指滑动不产生点击");
        check(Math.abs(sum(1) - (int) (60 * 1.4f)) <= 15, "位移量约等于 60dp×增益（实际 " + sum(1) + "）");

        // 轻点 → 左键按下再松开
        p = fresh();
        p.down(0, 100, 100, 0); p.up(0, 80);
        check(out.size() == 2 && out.get(0)[0] == 1 && out.get(1)[0] == 0, "轻点 → 左键单击");

        // 手指抖一点（< 8dp）仍算轻点
        p = fresh();
        p.down(0, 100, 100, 0); p.move(0, 110, 105, 40); p.up(0, 90);
        check(out.size() == 2 && out.get(0)[0] == 1, "轻微抖动仍算轻点");

        // 按太久不算轻点
        p = fresh();
        p.down(0, 100, 100, 0); p.up(0, 600);
        check(out.isEmpty(), "长按不松手 0.6 秒不产生点击");

        // 双指轻点 → 右键
        p = fresh();
        p.down(0, 100, 100, 0); p.down(1, 200, 100, 20); p.up(0, 100); p.up(1, 110);
        check(out.size() == 2 && out.get(0)[0] == 2 && out.get(1)[0] == 0, "双指轻点 → 右键单击");

        // 双指往上滑 → 滚轮负（往下翻），不移动指针
        p = fresh();
        p.down(0, 100, 500, 0); p.down(1, 200, 500, 5);
        for (int i = 1; i <= 20; i++) { p.move(0, 100, 500 - i * 12, i * 10); p.move(1, 200, 500 - i * 12, i * 10); }
        p.up(0, 300); p.up(1, 300);
        check(sum(3) < 0 && sum(1) == 0 && sum(2) == 0 && !anyButton(2), "双指上滑 → 往下翻（wheel=" + sum(3) + "），指针不动");

        // 双指往左滑 → 横向往右翻
        p = fresh();
        p.down(0, 500, 100, 0); p.down(1, 500, 200, 5);
        for (int i = 1; i <= 20; i++) { p.move(0, 500 - i * 12, 100, i * 10); p.move(1, 500 - i * 12, 200, i * 10); }
        p.up(0, 300); p.up(1, 300);
        check(sum(4) > 0, "双指左滑 → 横向滚动（pan=" + sum(4) + "）");

        // 轻点后马上按住拖 → 左键按住移动，松手放开
        p = fresh();
        p.down(0, 100, 100, 0); p.up(0, 80);
        out.clear();
        p.down(0, 100, 100, 200);
        for (int i = 1; i <= 10; i++) p.move(0, 100 + i * 10, 100, 200 + i * 15);
        p.up(0, 400);
        check(out.get(0)[0] == 1 && out.get(out.size() - 1)[0] == 0, "轻点后按住 → 拖动开始按下、松手放开");
        boolean heldWhileMoving = true;
        for (int i = 1; i < out.size() - 1; i++) if (out.get(i)[0] != 1) heldWhileMoving = false;
        check(heldWhileMoving && sum(1) > 0, "拖动过程中左键一直按着并且在移动");

        // 轻点后隔太久再按 → 普通移动，不拖
        p = fresh();
        p.down(0, 100, 100, 0); p.up(0, 80);
        out.clear();
        p.down(0, 100, 100, 800);
        for (int i = 1; i <= 10; i++) p.move(0, 100 + i * 10, 100, 800 + i * 15);
        p.up(0, 1100);
        check(!anyButton(1), "隔 0.7 秒再按 → 只移动不拖");

        // 三指上滑 → ⌘H 一次
        p = fresh();
        p.down(0, 100, 500, 0); p.down(1, 200, 500, 0); p.down(2, 300, 500, 0);
        for (int i = 1; i <= 20; i++) for (int f = 0; f < 3; f++) p.move(f, 100 + f * 100, 500 - i * 15, i * 10);
        p.up(0, 300); p.up(1, 300); p.up(2, 300);
        check(combos.size() == 1 && combos.get(0)[0] == Layout.MOD_GUI && combos.get(0)[1] == 0x0B, "三指上滑 → ⌘H 一次");
        check(out.isEmpty(), "三指手势不发鼠标报告");

        // 三指横滑 → ⌘Tab
        p = fresh();
        p.down(0, 500, 100, 0); p.down(1, 500, 200, 0); p.down(2, 500, 300, 0);
        for (int i = 1; i <= 20; i++) for (int f = 0; f < 3; f++) p.move(f, 500 - i * 15, 100 + f * 100, i * 10);
        p.up(0, 300); p.up(1, 300); p.up(2, 300);
        check(combos.size() == 1 && combos.get(0)[1] == 0x2B, "三指横滑 → ⌘Tab");

        // 一次滑很快：单份报告不超过 ±127
        p = fresh();
        p.down(0, 0, 0, 0); p.move(0, 30, 0, 10); p.move(0, 2000, 0, 20); p.up(0, 30);
        boolean inRange = true;
        for (int[] r : out) if (Math.abs(r[1]) > 127) inRange = false;
        check(inRange && sum(1) > 600, "大位移拆成多份、每份不超 127（总 " + sum(1) + "）");
    }
}
