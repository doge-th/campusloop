/**
 * Off-render-path wrappers for the two expensive reports.
 *
 * `evaluate()` rasterises 12 covers through 10 named degradations (240 probes
 * counting protocol B) and `ablation()` re-scores 5 feature cuts. On the test
 * machine that is ~3.5 s of pure maths; doing it synchronously during the first
 * render would blank the page. Both are memoised as promises so the Overview and
 * the Method tab share one computation and the numbers on screen are always the
 * same numbers the test suite asserts.
 */

import { BOOKS } from './seed'
import { buildGallery, evaluate, ablation, type EvalReport } from './classify'

export type AblationRow = { block: string; accuracy: number; drop: number }

let evalPromise: Promise<EvalReport> | null = null
let ablationPromise: Promise<AblationRow[]> | null = null

function defer<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    // Two ticks: let React paint the "computing" state before we block the thread.
    setTimeout(() => {
      try {
        resolve(work())
      } catch (e) {
        reject(e)
      }
    }, 0)
  })
}

export function runEvaluation(): Promise<EvalReport> {
  if (!evalPromise) evalPromise = defer(() => evaluate(BOOKS, buildGallery(BOOKS)))
  return evalPromise
}

export function runAblation(): Promise<AblationRow[]> {
  if (!ablationPromise) ablationPromise = defer(() => ablation(BOOKS))
  return ablationPromise
}
