import {
  SEVERITY,
  assess,
  isCritical,
  waitSecondsFor,
  describe as describeSeverity,
} from '../lambda/shared/severity.mjs';

const NOW = new Date('2026-09-19T06:00:00.000Z'); // 11:30 IST
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

/** A learned routine: usually up at 07:20 IST, so we would worry after 09:20. */
const baseline = { samples: [440, 440, 440, 440], firstActivityMedian: 440 };
const LEARNED_EXPECTED_BY = 560;
const NOW_MINUTES = 11 * 60 + 30;

const member = (over: Record<string, unknown> = {}) => ({
  name: 'Amma',
  baseline,
  lastSeenAt: hoursAgo(0.1),
  lastWakingAt: hoursAgo(0.1),
  ...over,
});

const check = (m: any, over: Record<string, unknown> = {}) =>
  assess({
    member: m,
    now: NOW,
    expectedBy: LEARNED_EXPECTED_BY,
    nowMinutes: NOW_MINUTES,
    sawWakingToday: true,
    ...over,
  });

describe('an ordinary day', () => {
  it('raises nothing when she has been up and about', () => {
    expect(check(member())).toBeNull();
  });

  it('raises nothing before her usual time, even with no sign of her', () => {
    expect(
      check(member({ lastWakingAt: hoursAgo(9), lastSeenAt: hoursAgo(0.1) }), {
        sawWakingToday: false,
        nowMinutes: 6 * 60, // 06:00, before she normally rises
      })
    ).toBeNull();
  });

  it('stays silent while the routine is still being learned', () => {
    expect(
      check(member({ lastWakingAt: hoursAgo(9) }), {
        sawWakingToday: false,
        expectedBy: null,
      })
    ).toBeNull();
  });
});

describe('escalating silence', () => {
  it('calls it late when her usual time has passed', () => {
    expect(
      check(member({ lastWakingAt: hoursAgo(9), lastSeenAt: hoursAgo(0.1) }), {
        sawWakingToday: false,
      })
    ).toBe(SEVERITY.LATE);
  });

  it('notices a phone that is alive but untouched for 12 hours', () => {
    expect(
      check(member({ lastWakingAt: hoursAgo(13), lastSeenAt: hoursAgo(0.1) }), {
        sawWakingToday: false,
      })
    ).toBe(SEVERITY.SILENT_12H);
  });

  it('separates a dark phone from an untouched one', () => {
    // The phone itself has gone quiet: off, flat, or out of signal. That has an
    // ordinary explanation, so it ranks below a phone that is demonstrably on.
    expect(
      check(member({ lastWakingAt: hoursAgo(13), lastSeenAt: hoursAgo(13) }), {
        sawWakingToday: false,
      })
    ).toBe(SEVERITY.DEVICE_DARK);
  });

  it('escalates at a day, and again at two', () => {
    expect(
      check(member({ lastWakingAt: hoursAgo(25), lastSeenAt: hoursAgo(0.1) }), {
        sawWakingToday: false,
      })
    ).toBe(SEVERITY.CRITICAL_24H);

    expect(
      check(member({ lastWakingAt: hoursAgo(49), lastSeenAt: hoursAgo(0.1) }), {
        sawWakingToday: false,
      })
    ).toBe(SEVERITY.CRITICAL_48H);
  });

  it('treats two days of silence as critical even at 3am', () => {
    // The long silences must not be suppressed by the time of day the way a
    // late morning is.
    expect(
      check(member({ lastWakingAt: hoursAgo(49) }), {
        sawWakingToday: false,
        nowMinutes: 3 * 60,
      })
    ).toBe(SEVERITY.CRITICAL_48H);
  });

  it('treats a long-enrolled member we have never heard from as critical', () => {
    expect(
      check(
        member({
          lastWakingAt: null,
          lastSeenAt: null,
          createdAt: hoursAgo(72),
        }),
        { sawWakingToday: false }
      )
    ).toBe(SEVERITY.CRITICAL_48H);
  });

  it('does not cry critical over someone who enrolled ten minutes ago', () => {
    // Regression: an unset clock read as infinitely stale, so a brand new
    // member was assessed critical48 on the very next sweep. A family's first
    // experience of this product must not be "Amma has not touched her phone
    // in two days" ten minutes after installing it.
    expect(
      check(
        member({
          lastWakingAt: null,
          lastSeenAt: null,
          createdAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
        }),
        { sawWakingToday: false }
      )
    ).toBeNull();
  });
});

describe('how politely to behave', () => {
  it('treats only a day or more of silence as critical', () => {
    expect(isCritical(SEVERITY.CRITICAL_24H)).toBe(true);
    expect(isCritical(SEVERITY.CRITICAL_48H)).toBe(true);
    expect(isCritical(SEVERITY.LATE)).toBe(false);
    expect(isCritical(SEVERITY.SILENT_12H)).toBe(false);
  });

  it('shortens the wait between rungs as things get worse', () => {
    expect(waitSecondsFor(SEVERITY.CRITICAL_48H)).toBeLessThan(
      waitSecondsFor(SEVERITY.CRITICAL_24H)
    );
    expect(waitSecondsFor(SEVERITY.CRITICAL_24H)).toBeLessThan(
      waitSecondsFor(SEVERITY.SILENT_12H)
    );
    expect(waitSecondsFor(SEVERITY.SILENT_12H)).toBeLessThan(waitSecondsFor(SEVERITY.LATE));
  });
});

describe('a clock that was written as an empty string', () => {
  // ?? only falls back on null and undefined. An empty string sails past it
  // into hoursSince, which treats any falsy value as Infinity - so a blank
  // clock reads as infinitely stale and the politest member in the system is
  // assessed as two days silent.
  it('does not read a blank waking clock as two days of silence', () => {
    expect(
      check(
        member({
          lastWakingAt: '',
          lastSeenAt: hoursAgo(0.1),
          createdAt: hoursAgo(3),
        })
      )
    ).toBeNull();
  });

  it('does not read a blank device clock as a dark phone', () => {
    expect(
      check(
        member({
          lastWakingAt: hoursAgo(0.1),
          lastSeenAt: '',
          createdAt: hoursAgo(3),
        })
      )
    ).toBeNull();
  });
});

describe('what the family is told', () => {
  it('speaks plainly and never leaks a severity code', () => {
    for (const severity of Object.values(SEVERITY)) {
      const sentence = describeSeverity(severity, 'Amma');
      expect(sentence).toContain('Amma');
      expect(sentence).not.toMatch(/critical|silent12|deviceDark/i);
    }
  });
});
