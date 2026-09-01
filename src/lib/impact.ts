import type { Book, Condition, LoopEvent } from './types'
import { CONDITION_VALUE } from './types'

/**
 * Impact accounting.
 *
 * The model answers one question: *how much production did this hand-over
 * prevent?* A reused copy displaces a new copy, so the avoided burden is the
 * cradle-to-gate footprint of the paper we did not print, discounted by
 * (a) the chance the taker still buys new because the condition is rough and
 * (b) the small footprint of running the loop itself (transport + cleaning).
 *
 * Emission factors are documented in docs/IMPACT.md, including the published
 * range we tested against. The UI exposes the factor as a slider so no number
 * in this app is a black box.
 */

/** kg CO2e per kg of printing/writing paper (cradle-to-gate). */
export const PAPER_EF = {
  default: 1.2,
  low: 0.7,
  high: 2.5,
  unit: 'kg CO2e / kg paper',
  note: 'Mid-range of published cradle-to-gate factors for printing and writing paper. Grid mix and fibre source move this a lot, which is why it is a user-visible input rather than a constant.',
} as const

/** Share of a new copy's footprint that stays avoided after loop overhead. */
export const LOOP_OVERHEAD = 0.08

/**
 * Probability that a hand-over in a given condition actually replaces a
 * purchase. A worn cover still gets used for a term, but the odds that it
 * stops a new buy are lower.
 */
export const DISPLACEMENT: Record<Condition, number> = {
  'like-new': 0.96,
  good: 0.9,
  fair: 0.75,
  worn: 0.55,
}

/** grams CO2e per km for a 1.6 km round trip by car (average petrol hatchback). */
export const CAR_GPerKM = 171

export interface HandoverImpact {
  massKg: number
  newCopiesAvoided: number
  co2eKg: number
  co2eLow: number
  co2eHigh: number
}

export function handoverImpact(book: Book, condition: Condition, tripsByCarKm = 0): HandoverImpact {
  const displaced = DISPLACEMENT[condition]
  const gross = book.massKg * PAPER_EF.default * displaced
  const transport = (tripsByCarKm * CAR_GPerKM) / 1000
  const net = gross * (1 - LOOP_OVERHEAD) - transport
  return {
    massKg: book.massKg,
    newCopiesAvoided: displaced,
    co2eKg: round1(net),
    co2eLow: round1(book.massKg * PAPER_EF.low * displaced * (1 - LOOP_OVERHEAD) - transport),
    co2eHigh: round1(book.massKg * PAPER_EF.high * displaced * (1 - LOOP_OVERHEAD) - transport),
  }
}

export interface ImpactSummary {
  handedOver: number
  discarded: number
  listed: number
  divertedKg: number
  landfillKg: number
  co2eKg: number
  co2eLowKg: number
  co2eHighKg: number
  /** handed-over / (handed-over + discarded), the loop's own survival rate. */
  circularity: number
  bySubject: { subject: string; co2eKg: number; handedOver: number }[]
  byMonth: { month: string; handedOver: number; discarded: number; co2eKg: number }[]
}

export function summarise(events: LoopEvent[], books: Map<string, Book>): ImpactSummary {
  let handedOver = 0
  let discarded = 0
  let listed = 0
  let divertedKg = 0
  let landfillKg = 0
  let co2e = 0
  let low = 0
  let high = 0
  const subjectMap = new Map<string, { co2eKg: number; handedOver: number }>()
  const monthMap = new Map<string, { handedOver: number; discarded: number; co2eKg: number }>()

  for (const e of events) {
    const book = books.get(e.bookId)
    if (!book) continue
    const m = monthMap.get(e.month) ?? { handedOver: 0, discarded: 0, co2eKg: 0 }
    if (e.kind === 'handed-over') {
      handedOver++
      divertedKg += e.massKg
      const gain = e.massKg * PAPER_EF.default * (1 - LOOP_OVERHEAD)
      co2e += gain
      low += e.massKg * PAPER_EF.low * (1 - LOOP_OVERHEAD)
      high += e.massKg * PAPER_EF.high * (1 - LOOP_OVERHEAD)
      const s = subjectMap.get(book.subject) ?? { co2eKg: 0, handedOver: 0 }
      s.co2eKg += gain
      s.handedOver += 1
      subjectMap.set(book.subject, s)
      m.handedOver += 1
      m.co2eKg += gain
    } else if (e.kind === 'discarded') {
      discarded++
      landfillKg += e.massKg
      m.discarded += 1
    } else if (e.kind === 'listed') {
      listed++
    }
    monthMap.set(e.month, m)
  }

  return {
    handedOver,
    discarded,
    listed,
    divertedKg: round1(divertedKg),
    landfillKg: round1(landfillKg),
    co2eKg: round1(co2e),
    co2eLowKg: round1(low),
    co2eHighKg: round1(high),
    circularity: handedOver + discarded === 0 ? 0 : handedOver / (handedOver + discarded),
    bySubject: [...subjectMap.entries()]
      .map(([subject, v]) => ({ subject, co2eKg: round1(v.co2eKg), handedOver: v.handedOver }))
      .sort((a, b) => b.co2eKg - a.co2eKg),
    byMonth: [...monthMap.entries()]
      .map(([month, v]) => ({ month, ...v, co2eKg: round1(v.co2eKg) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  }
}

/** Residual useful life of a copy, used by the matching utility function. */
export function residualValue(condition: Condition): number {
  return CONDITION_VALUE[condition]
}

export function treesEquivalent(co2eKg: number): number {
  // A mature tree absorbs roughly 21 kg CO2e per year (USDA Forest Service
  // single-tree growth estimates). We report "tree-years", not "trees felled".
  return round1(co2eKg / 21)
}

export function carKmEquivalent(co2eKg: number): number {
  // EPA average passenger car: 400 g CO2e per km for a mid-size petrol vehicle.
  return Math.round((co2eKg * 1000) / 400)
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return ''
  const head = Object.keys(rows[0])
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head.join(','), ...rows.map((r) => head.map((h) => esc(r[h] ?? '')).join(','))].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
