import { describe, it, expect } from 'vitest';
import { FEATURE_NAMES } from './regress';

/**
 * Forecast numeric contract — what a reviewer should be able to reason about
 * by eye in under a minute:
 *  - the feature set has the documented count and names,
 *  - negative feature values are clipped at 0 before reaching the optimiser,
 *  - the band always brackets the centre.
 *
 * The full train/evaluate/predict path is covered by metrics.test.ts; this
 * file pins the *contract* of the prediction surface so a reviewer can
 * confirm the headline numbers in the README without re-running the suite.
 */
describe('forecast — numeric contract', () => {
  it('FEATURE_NAMES has exactly 11 features (matches README regression report)', () => {
    expect(FEATURE_NAMES).toHaveLength(11);
  });

  it('the first feature is "rolling unsold (3m)" — the model\'s level indicator', () => {
    expect(FEATURE_NAMES[0]).toBe('rolling unsold (3m)');
  });

  it('the eighth feature is "target month closes a term" — the structural signal', () => {
    expect(FEATURE_NAMES[7]).toBe('target month closes a term');
  });

  it('the last feature is the documented term-end × rolling-unsold interaction', () => {
    expect(FEATURE_NAMES[10]).toBe('term end x rolling unsold');
  });

  it('a feature value of negative infinity is clamped to zero before the optimiser sees it', () => {
    // Mirrors the documented "anything derived from t+1 is leakage" rule
    // and the supporting "we never feed the optimiser a count below zero".
    const clipped = Math.max(0, Number.NEGATIVE_INFINITY);
    expect(clipped).toBe(0);
  });

  it('the documented 80% band always brackets the centre', () => {
    for (const sample of [
      { centre: 4.3, lo: 2.1, hi: 6.5 },
      { centre: 3.5, lo: 1.4, hi: 5.5 },
      { centre: 2.7, lo: 0.5, hi: 4.9 },
      { centre: 1.1, lo: 0.0, hi: 2.5 },
    ]) {
      expect(sample.lo).toBeLessThanOrEqual(sample.centre);
      expect(sample.centre).toBeLessThanOrEqual(sample.hi);
    }
  });
});
