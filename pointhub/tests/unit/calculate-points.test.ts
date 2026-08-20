import { describe, it, expect } from 'vitest';
import { calculateLineMilliPoints } from '../../src/engine/calculate-points';

describe('calculateLineMilliPoints', () => {
  describe('base rate (x1, multiplier=1000)', () => {
    it('calculates 100 THB at base rate → 4000 milli-points', () => {
      expect(calculateLineMilliPoints(100, 1000)).toBe(4000);
    });

    it('calculates 25 THB at base rate → 1000 milli-points (exactly 1 point)', () => {
      expect(calculateLineMilliPoints(25, 1000)).toBe(1000);
    });

    it('calculates 1 THB at base rate → 40 milli-points', () => {
      expect(calculateLineMilliPoints(1, 1000)).toBe(40);
    });
  });

  describe('x2 multiplier (multiplier=2000)', () => {
    it('calculates 100 THB at x2 → 8000 milli-points', () => {
      expect(calculateLineMilliPoints(100, 2000)).toBe(8000);
    });

    it('calculates 749 THB at x2 → 59920 milli-points', () => {
      expect(calculateLineMilliPoints(749, 2000)).toBe(59920);
    });
  });

  describe('x2.5 multiplier (multiplier=2500)', () => {
    it('calculates 47 THB at x2.5 → 4700 milli-points', () => {
      // 47 * 2500 / 25 = 4700
      expect(calculateLineMilliPoints(47, 2500)).toBe(4700);
    });

    it('calculates 260 THB at x2.5 → 26000 milli-points', () => {
      expect(calculateLineMilliPoints(260, 2500)).toBe(26000);
    });

    it('calculates 1000 THB at x2.5 → 100000 milli-points', () => {
      expect(calculateLineMilliPoints(1000, 2500)).toBe(100000);
    });
  });

  describe('x3 multiplier (multiplier=3000)', () => {
    it('calculates 250 THB at x3 → 30000 milli-points', () => {
      expect(calculateLineMilliPoints(250, 3000)).toBe(30000);
    });

    it('calculates 600 THB at x3 → 72000 milli-points', () => {
      expect(calculateLineMilliPoints(600, 3000)).toBe(72000);
    });
  });

  describe('x5 multiplier (multiplier=5000)', () => {
    it('calculates 100 THB at x5 → 20000 milli-points', () => {
      expect(calculateLineMilliPoints(100, 5000)).toBe(20000);
    });

    it('calculates 990 THB at x5 → 198000 milli-points', () => {
      expect(calculateLineMilliPoints(990, 5000)).toBe(198000);
    });

    it('calculates 24 THB at x5 → 4800 milli-points', () => {
      expect(calculateLineMilliPoints(24, 5000)).toBe(4800);
    });
  });

  describe('edge cases', () => {
    it('0 THB with any multiplier → 0 milli-points', () => {
      expect(calculateLineMilliPoints(0, 1000)).toBe(0);
      expect(calculateLineMilliPoints(0, 3000)).toBe(0);
      expect(calculateLineMilliPoints(0, 5000)).toBe(0);
    });

    it('large amount: 9999 THB at x5 → 1999800 milli-points', () => {
      // 9999 * 5000 / 25 = 1999800
      expect(calculateLineMilliPoints(9999, 5000)).toBe(1999800);
    });

    it('large amount: 9999 THB at base → 399960 milli-points', () => {
      // 9999 * 1000 / 25 = 399960
      expect(calculateLineMilliPoints(9999, 1000)).toBe(399960);
    });

    it('exact division proof: all standard multipliers produce integers', () => {
      const multipliers = [1000, 2000, 2500, 3000, 5000];
      const amounts = [1, 7, 13, 47, 100, 749, 999, 9999];

      for (const m of multipliers) {
        for (const a of amounts) {
          const result = calculateLineMilliPoints(a, m);
          expect(Number.isInteger(result)).toBe(true);
        }
      }
    });
  });
});

describe('basket rounding (floor division of totalMilliPoints / 1000)', () => {
  it('floors 17600 milli-points to 17 points (not 18)', () => {
    // Simulating the basket-level floor: Math.floor(17600 / 1000) = 17
    const totalMilliPoints = 17600;
    const pointsPosted = Math.floor(totalMilliPoints / 1000);
    expect(pointsPosted).toBe(17);
  });

  it('floors 4800 milli-points to 4 points', () => {
    const totalMilliPoints = 4800;
    expect(Math.floor(totalMilliPoints / 1000)).toBe(4);
  });

  it('exact multiple: 170000 milli-points → 170 points', () => {
    const totalMilliPoints = 170000;
    expect(Math.floor(totalMilliPoints / 1000)).toBe(170);
  });

  it('multi-line basket sums correctly before rounding', () => {
    // Simulating TX90007: Sun + SILVER: two FRESH lines at C1 x3 + base line
    // Line 1: 137 THB * x3 = 137 * 3000 / 25 = 16440 milli-points
    // Line 2: 92 THB * x3  = 92 * 3000 / 25  = 11040 milli-points
    // Line 3: 44 THB * x1  = 44 * 1000 / 25  = 1760 milli-points (not FRESH → base)
    // Total: 16440 + 11040 + 1760 = 29240
    // But actual TX90007 has total 29000 per expected-points.csv, let's verify the formula
    const line1 = calculateLineMilliPoints(137, 3000); // 16440
    const line2 = calculateLineMilliPoints(92, 3000); // 11040
    const line3 = calculateLineMilliPoints(44, 1000); // 1760

    const totalMilliPoints = line1 + line2 + line3;
    // Rounding happens ONCE at basket level
    const pointsPosted = Math.floor(totalMilliPoints / 1000);

    expect(line1).toBe(16440);
    expect(line2).toBe(11040);
    expect(line3).toBe(1760);
    expect(totalMilliPoints).toBe(29240);
    expect(pointsPosted).toBe(29);
  });

  it('per-line floor would give different result than per-basket floor', () => {
    // This demonstrates why rounding must be per-basket, not per-line
    // Line 1: 137 THB * x3 = 16440 → per-line floor = 16 points
    // Line 2: 92 THB * x3  = 11040 → per-line floor = 11 points
    // Line 3: 44 THB * x1  = 1760  → per-line floor = 1 point
    // Sum of per-line floors = 28, but per-basket floor = 29
    const perLine1 = Math.floor(calculateLineMilliPoints(137, 3000) / 1000); // 16
    const perLine2 = Math.floor(calculateLineMilliPoints(92, 3000) / 1000); // 11
    const perLine3 = Math.floor(calculateLineMilliPoints(44, 1000) / 1000); // 1
    const sumPerLine = perLine1 + perLine2 + perLine3; // 28

    const totalMilli =
      calculateLineMilliPoints(137, 3000) +
      calculateLineMilliPoints(92, 3000) +
      calculateLineMilliPoints(44, 1000);
    const perBasket = Math.floor(totalMilli / 1000); // 29

    // Per-basket gives more points than per-line rounding
    expect(sumPerLine).toBe(28);
    expect(perBasket).toBe(29);
    expect(perBasket).toBeGreaterThan(sumPerLine);
  });

  it('0 milli-points → 0 posted points', () => {
    expect(Math.floor(0 / 1000)).toBe(0);
  });

  it('999 milli-points → 0 posted points (not yet 1)', () => {
    expect(Math.floor(999 / 1000)).toBe(0);
  });

  it('1000 milli-points → exactly 1 posted point', () => {
    expect(Math.floor(1000 / 1000)).toBe(1);
  });
});
