// Three observations of the existing model, not three speed-zone flags.
// Times/tolerances are exhibit choices (SPEC.md), pending human playtesting.
export const HOLD_S = 1;
const CONFIRM_HINT = '先单看后足，稳定观察一秒再确认。';
export const newDiscovery = (status = 'waiting') => ({ status, step: 0, held: 0, down: 0, swing: 0, ready: false, hint: '' });
export const discoveryOpen = (s) => ['invited', 'active', 'reward'].includes(s.status);

export function discoveryIntent(s, intent) {
  if (intent === 'close') return newDiscovery('closed');
  if (intent === 'invite' && s.status === 'waiting') return newDiscovery('invited');
  if (intent === 'start' && s.status === 'invited') return newDiscovery('active');
  if (intent === 'confirm' && s.status === 'active' && s.step === 2) {
    return s.ready ? { ...newDiscovery('reward'), step: 3 } : { ...s, hint: CONFIRM_HINT };
  }
  return s;
}

export function observeDiscovery(s, pose, dt, focus) {
  if (s.status !== 'active') return s;
  const reset = (hint) => ({ ...s, held: 0, down: 0, swing: 0, ready: false, hint });
  if (pose.v <= 0.02 || pose.swag > 0.01 || pose.explode > 0.01) return reset('先让它跑起来，再看腿怎样着地。');
  if (s.step === 2 && focus !== 'legs2') return reset('点「后足」单看这一对，再观察一秒。');
  const liftedPairs = s.step === 0 ? 1 : 2;
  let required = 0, down = s.down, swing = s.swing;
  for (let i = 0; i < pose.legs.length; i++) {
    const leg = pose.legs[i];
    if (leg.pair < liftedPairs) {
      if (leg.stance || leg.lift < 0.99 || leg.load > 0.01 || leg.P[1] <= 0.3) {
        return reset(s.step === 0 ? '再看前足：调快一点，直到它不再踩地。' : '再看中足：调快一点，让它也离地。');
      }
    } else {
      if (leg.lift > 0.01) return reset('有点快了：调慢一点，让中足还在跑。');
      const bit = 1 << i;
      required |= bit;
      if (leg.stance && leg.load > 0.01 && Math.abs(leg.P[1]) <= 0.3) down |= bit;
      if (!leg.stance && leg.P[1] > 0.3) swing |= bit;
    }
  }
  // A stalled/background frame cannot stand in for a second of observation.
  const held = Math.min(HOLD_S, s.held + Math.max(0, Math.min(0.05, dt)));
  const ready = held >= HOLD_S && required !== 0 && (down & required) === required && (swing & required) === required;
  if (ready && s.step < 2) return { ...newDiscovery('active'), step: s.step + 1 };
  return { ...s, held, down, swing, ready, hint: !ready && s.hint === CONFIRM_HINT ? CONFIRM_HINT : '' };
}

export function discoveryText(s) {
  if (s.status === 'invited') return '你来找换腿点？调速度，三步各观察一秒。';
  if (s.status === 'reward') return '你发现了六足→四足→二足';
  if (s.status !== 'active') return '';
  const prompts = ['① 调速度：前足不踩地，中后足还在跑。', '② 再加速：让中足也抬起，只用后足跑。', '③ 点「后足」单看，观察后确认。'];
  return s.hint || (s.ready ? '看见后足轮流着地了？点「确认后足」。' : prompts[s.step]);
}
