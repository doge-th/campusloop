/**
 * CampusLoop domain model.
 *
 * Everything in this app is expressed in terms of a *book* (a title in the
 * school catalogue) plus the two sides of the loop: students who have one
 * (`Listing`) and students who need one (`Request`). `LoopEvent` is the
 * append-only history used for the impact dashboard.
 *
 * No real personal data is modelled anywhere: participants are pseudonymous
 * handles (see `alias()` in lib/seed.ts) because the demo runs on synthetic
 * data for a fictional school.
 */

export const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'History',
  'Geography',
  'Computer Science',
  'Art & Design',
  'Physical Education',
] as const

export type Subject = (typeof SUBJECTS)[number]

export const CONDITIONS = ['like-new', 'good', 'fair', 'worn'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Residual share of a book's production footprint that is still "useful life" left in it. */
export const CONDITION_VALUE: Record<Condition, number> = {
  'like-new': 0.95,
  good: 0.8,
  fair: 0.6,
  worn: 0.4,
}

/**
 * A title in the school catalogue. `massKg` drives every impact number in the
 * app (see lib/impact.ts) and `adoptedYear` drives curriculum stability in the
 * forecasting model.
 */
export interface Book {
  id: string
  title: string
  shortTitle: string
  publisher: string
  isbn: string
  edition: number
  subject: Subject
  yearLevel: number
  pages: number
  /** Paper mass of a single physical copy, kg (cover + text block). */
  massKg: number
  /** First year this edition is used for teaching at the school. */
  adoptedYear: number
  /** Cover recipe used to render the catalogue image on a <canvas>. */
  cover: CoverSpec
}

/** Declarative recipe for a synthetic cover so the repo needs no binary assets. */
export interface CoverSpec {
  /** Base cloth colour, hex. */
  base: string
  /** Secondary colour for bands/rules, hex. */
  accent: string
  /** 'cloth' = flat colour + rules, 'grid' = plotted grid, 'photo' = abstract shapes. */
  style: 'cloth' | 'grid' | 'photo'
  /** Number of horizontal accent bands. */
  bands: number
  /** 0..1 fraction of the cover taken by the title block. */
  titleWeight: number
}

export type ListingStatus = 'open' | 'reserved' | 'matched' | 'withdrawn'

export interface Listing {
  id: string
  bookId: string
  /** Pseudonymous handle of the student offering the copy. */
  owner: string
  condition: Condition
  /** ISO date the copy becomes available. */
  availableFrom: string
  status: ListingStatus
  /** True when the listing was created from the recognition flow. */
  viaScan: boolean
  /** Notes written by the owner (anonymised). */
  note?: string
}

export type RequestStatus = 'open' | 'reserved' | 'matched' | 'withdrawn'

/**
 * Fairness tier. Tier 2/3 are visible to the matching engine only as an
 * integer weight; the school's bursary list is never part of the dataset.
 */
export type PriorityTier = 1 | 2 | 3

export const PRIORITY_LABEL: Record<PriorityTier, string> = {
  1: 'Standard',
  2: 'Supported',
  3: 'New arrival',
}

export interface Request {
  id: string
  bookId: string
  student: string
  homeroom: string
  priority: PriorityTier
  neededBy: string
  status: RequestStatus
}

export type EventKind = 'listed' | 'handed-over' | 'discarded' | 'requested'

export interface LoopEvent {
  id: string
  kind: EventKind
  bookId: string
  /** Month bucket in ISO form, e.g. '2025-09'. */
  month: string
  /** Mass moved by this event in kg (0 for `requested`). */
  massKg: number
}

export interface Campus {
  name: string
  students: number
  /** Copies a student is expected to hold across the catalogue. */
  copiesPerStudent: number
  currentYear: number
}

/** Result of one recognition attempt. */
export interface Recognition {
  bookId: string
  /** 0..1 similarity-based confidence. */
  confidence: number
  /** Ranked alternatives, most similar first (excluding the winner). */
  alternatives: { bookId: string; confidence: number }[]
  /** Which pipeline produced this answer. */
  engine: 'descriptor' | 'cnn+descriptor'
  /** Feature-space distance to the nearest reference, for transparency. */
  distance: number
}

/** One row of the matching output. */
export interface MatchPair {
  listingId: string
  requestId: string
  bookId: string
  /** Utility of this pair, used for ranking and for the local-search objective. */
  utility: number
  /** Human readable justification shown in the UI. */
  why: string
}

export interface Unmatched {
  requestId: string
  reason: string
}

export interface MatchResult {
  pairs: MatchPair[]
  unmatched: Unmatched[]
  /** Objective value before/after the fairness local search. */
  utilityBefore: number
  utilityAfter: number
  /** Share of tier 2/3 requests satisfied. */
  supportedServed: number
  supportedTotal: number
  iterations: number
}

export interface ForecastPoint {
  subject: Subject
  predictedSurplus: number
  actualLastTerm: number
  lower: number
  upper: number
}
