import { addDays, daysInclusive, isIsoDate, kstDate, splitWindow } from './kst';

describe('kst date helpers', () => {
  it('converts an instant to the KST calendar date', () => {
    expect(kstDate(new Date('2026-11-07T14:59:59Z'))).toBe('2026-11-07');
    expect(kstDate(new Date('2026-11-07T15:00:00Z'))).toBe('2026-11-08'); // 00:00 KST
  });

  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-28')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-11-08', '2026-11-08')).toBe(1);
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
  });
});

describe('splitWindow', () => {
  it('returns a single window when the range fits', () => {
    expect(splitWindow('2026-11-01', '2026-11-07', 31)).toEqual([{ from: '2026-11-01', to: '2026-11-07' }]);
  });

  it('splits into consecutive, non-overlapping chunks of at most maxDays', () => {
    const windows = splitWindow('2026-01-01', '2026-03-06', 31);
    expect(windows).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-03-03' },
      { from: '2026-03-04', to: '2026-03-06' },
    ]);
    for (const w of windows) expect(daysInclusive(w.from, w.to)).toBeLessThanOrEqual(31);
  });

  it('handles a one-day window', () => {
    expect(splitWindow('2026-11-08', '2026-11-08', 7)).toEqual([{ from: '2026-11-08', to: '2026-11-08' }]);
  });

  it('rejects reversed or invalid windows', () => {
    expect(() => splitWindow('2026-11-08', '2026-11-01', 31)).toThrow(/after/);
    expect(() => splitWindow('2026-02-30', '2026-03-01', 31)).toThrow(/Invalid/);
    expect(() => splitWindow('2026-11-01', '2026-11-08', 0)).toThrow(/maxDays/);
  });
});
