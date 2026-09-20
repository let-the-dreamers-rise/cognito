import {
  median,
  updateBaseline,
  isLearning,
  expectedByMinutes,
  firstWakingSignal,
  stepsToday,
  isWakingSignal,
  MIN_SAMPLES,
  DEFAULT_GRACE_MINUTES,
} from '../lambda/shared/baseline.mjs';

const IST = 'Asia/Kolkata';

describe('median', () => {
  it('returns null for no samples', () => {
    expect(median([])).toBeNull();
  });

  it('averages the middle pair for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('ignores input order', () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });
});

describe('updateBaseline', () => {
  it('does not mutate the baseline it is given', () => {
    const before = { samples: [400, 410], firstActivityMedian: 405 };
    const frozen = JSON.stringify(before);
    updateBaseline(before, 420);
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('keeps only the most recent 21 samples', () => {
    let baseline: any = { samples: [], firstActivityMedian: null };
    for (let i = 0; i < 30; i += 1) baseline = updateBaseline(baseline, 400 + i);

    expect(baseline.samples).toHaveLength(21);
    // The oldest nine readings have rolled off the window.
    expect(baseline.samples[0]).toBe(409);
  });
});

describe('the learning window', () => {
  it('reports learning until MIN_SAMPLES ordinary days are seen', () => {
    let baseline: any = { samples: [], firstActivityMedian: null };
    for (let i = 0; i < MIN_SAMPLES - 1; i += 1) baseline = updateBaseline(baseline, 440);
    expect(isLearning(baseline)).toBe(true);

    baseline = updateBaseline(baseline, 440);
    expect(isLearning(baseline)).toBe(false);
  });

  it('refuses to produce a threshold while still learning', () => {
    // This is what stops the system raising anything in its first few days.
    expect(expectedByMinutes({ samples: [440], firstActivityMedian: 440 })).toBeNull();
  });

  it('adds the grace period once it has learned', () => {
    const baseline = { samples: [440, 440, 440, 440], firstActivityMedian: 440 };
    expect(expectedByMinutes(baseline)).toBe(440 + DEFAULT_GRACE_MINUTES);
  });
});

describe('waking signals', () => {
  it('counts only signals a person makes', () => {
    expect(isWakingSignal({ type: 'interaction' })).toBe(true);
    expect(isWakingSignal({ type: 'checkin' })).toBe(true);
    expect(isWakingSignal({ type: 'transaction' })).toBe(true);

    // A phone can produce these while sitting untouched on a table, which is
    // the whole reason the two clocks are separate.
    expect(isWakingSignal({ type: 'heartbeat' })).toBe(false);
    expect(isWakingSignal({ type: 'charging' })).toBe(false);
  });

  it('finds the earliest waking signal regardless of arrival order', () => {
    const first = firstWakingSignal(
      [
        { type: 'interaction', at: '2026-09-19T12:00:00.000Z' },
        { type: 'heartbeat', at: '2026-09-19T01:00:00.000Z' },
        { type: 'steps', at: '2026-09-19T02:30:00.000Z' },
      ],
      IST
    );
    // 02:30Z is 08:00 IST, and the heartbeat before it does not count.
    expect(first?.at).toBe('2026-09-19T02:30:00.000Z');
    expect(first?.minutes).toBe(8 * 60);
  });

  it('returns null when only the phone has been talking', () => {
    expect(
      firstWakingSignal([{ type: 'heartbeat', at: '2026-09-19T02:00:00.000Z' }], IST)
    ).toBeNull();
  });
});

describe('stepsToday', () => {
  // Regression: the device resends a running day total every five minutes.
  // Summing those readings reported roughly 200,000 steps for a short walk.
  it('takes the largest reading, never the sum', () => {
    const signals = [
      { type: 'steps', at: 'a', steps: 200 },
      { type: 'steps', at: 'b', steps: 800 },
      { type: 'steps', at: 'c', steps: 1200 },
    ];
    expect(stepsToday(signals)).toBe(1200);
  });

  it('survives a reading that went backwards after midnight rollover', () => {
    const signals = [
      { type: 'steps', at: 'a', steps: 9000 },
      { type: 'steps', at: 'b', steps: 40 },
    ];
    expect(stepsToday(signals)).toBe(9000);
  });

  it('is zero when nothing was walked', () => {
    expect(stepsToday([{ type: 'heartbeat', at: 'a' }])).toBe(0);
  });
});
