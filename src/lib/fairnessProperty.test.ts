import { describe, it, expect } from 'vitest';
import { pairUtility, DEFAULT_MATCH } from './matching';

/**
 * The fairness weight in CampusLoop's matching is the test's single most
 * scrutinised number (it moved 5 real students into books in the demo seed).
 * The acceptance properties below are what a reviewer should be able to
 * reproduce by eye in under a minute.
 *
 * The tierBoost contract (from src/lib/matching.ts):
 *   priority 1 → 1.00
 *   priority 2 → 1 + fairnessWeight       (supported place)
 *   priority 3 → 1 + 0.7 * fairnessWeight (newly arrived)
 */
describe('matching — fairness weight contract', () => {
  // A fully-feasible listing + request with known fields.
  // `owner` is a required field on `Listing`; pairUtility reads neither it
  // nor any of the request-side flags, so we can hand it a dummy.
  const baseListing = {
    id: 'L-test',
    bookId: 'bk-test',
    condition: 'like-new' as const,
    availableFrom: '2026-08-01',
    status: 'open' as const,
    viaScan: true,
    owner: 'test-owner',
  };
  const defaultRequest = {
    id: 'R-test',
    bookId: 'bk-test',
    neededBy: '2026-09-30',
    status: 'open' as const,
    priority: 1 as const,
    student: 'test-student',
    homeroom: 'HR-test',
  };

  it('priority 1 (default tier) ignores the fairness weight', () => {
    const a = pairUtility(baseListing, defaultRequest, { ...DEFAULT_MATCH, fairnessWeight: 0 });
    const b = pairUtility(baseListing, defaultRequest, { ...DEFAULT_MATCH, fairnessWeight: 1.5 });
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });

  it('priority 2 (supported place) gets a +fairnessWeight lift, exactly', () => {
    const r = { ...defaultRequest, priority: 2 as const };
    const base = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: 0 });
    const w = 0.45;
    const lifted = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: w });
    expect(lifted / base).toBeCloseTo(1 + w, 6);
  });

  it('priority 3 (newly arrived) gets a +0.7*fairnessWeight lift', () => {
    const r = { ...defaultRequest, priority: 3 as const };
    const base = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: 0 });
    const w = 0.45;
    const lifted = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: w });
    expect(lifted / base).toBeCloseTo(1 + 0.7 * w, 6);
  });

  it('the lift is monotone in the weight for every non-default tier', () => {
    for (const tier of [2, 3] as const) {
      const r = { ...defaultRequest, priority: tier };
      const small = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: 0.1 });
      const big = pairUtility(baseListing, r, { ...DEFAULT_MATCH, fairnessWeight: 0.9 });
      expect(big).toBeGreaterThan(small);
    }
  });

  it('at the documented default (0.45), supported is +45%, newly-arrived is +31.5%', () => {
    const w = 0.45;
    const sup = pairUtility(baseListing, { ...defaultRequest, priority: 2 }, { ...DEFAULT_MATCH, fairnessWeight: w });
    const arr = pairUtility(baseListing, { ...defaultRequest, priority: 3 }, { ...DEFAULT_MATCH, fairnessWeight: w });
    const flat = pairUtility(baseListing, defaultRequest, { ...DEFAULT_MATCH, fairnessWeight: w });
    expect(sup / flat).toBeCloseTo(1.45, 6);
    expect(arr / flat).toBeCloseTo(1.315, 6);
  });
});
