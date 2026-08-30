import type { Book, Campus, Condition, Listing, LoopEvent, Request } from './types'
import type { Subject } from './types'

/**
 * Deterministic data layer.
 *
 * Every number in the demo comes from this file plus a seeded PRNG, so the
 * screenshots in the README, the unit tests and the live site all agree.
 * Nothing here is real student data: the school, the catalogue and the
 * participants are synthetic (see docs/PRIVACY.md).
 */

/** mulberry32 - small, fast, and reproducible across browsers. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WILD = [
  'otter',
  'heron',
  'falcon',
  'badger',
  'lynx',
  'tern',
  'marten',
  'egret',
  'vole',
  'shrike',
  'newt',
  'gannet',
]

/** Pseudonymous participant handle. Never a real name. */
export function alias(r: () => number, i: number): string {
  return `${WILD[Math.floor(r() * WILD.length)]}-${String(i).padStart(2, '0')}`
}

export const CAMPUS: Campus = {
  name: 'Ridgeline Secondary School',
  students: 1240,
  copiesPerStudent: 6,
  currentYear: 2026,
}

/** Core mass figure used by the impact model; see docs/IMPACT.md. */
function bookMass(pages: number, hardcover: boolean): number {
  // 80 gsm stock, 0.0008 m^2 per page face, ~1.2 binder allowance for hardcover.
  const paper = (pages * 0.0008 * 80) / 1000
  return Math.round((paper + (hardcover ? 0.12 : 0.04)) * 1000) / 1000
}

interface BookSeed {
  title: string
  short: string
  publisher: string
  subject: Subject
  yearLevel: number
  pages: number
  edition: number
  adoptedYear: number
  hardcover: boolean
  cover: Book['cover']
}

const BOOK_SEEDS: BookSeed[] = [
  {
    title: 'Calculus: Foundations & Applications',
    short: 'Calculus',
    publisher: 'Meridian House',
    subject: 'Mathematics',
    yearLevel: 12,
    pages: 640,
    edition: 4,
    adoptedYear: 2024,
    hardcover: true,
    cover: { base: '#1f3a63', accent: '#e8e2d0', style: 'grid', bands: 3, titleWeight: 0.34 },
  },
  {
    title: 'Algebra in Context',
    short: 'Algebra',
    publisher: 'Northline Education',
    subject: 'Mathematics',
    yearLevel: 10,
    pages: 420,
    edition: 2,
    adoptedYear: 2021,
    hardcover: false,
    cover: { base: '#0f6b4f', accent: '#f6f1e4', style: 'cloth', bands: 2, titleWeight: 0.3 },
  },
  {
    title: 'Mechanics and Waves',
    short: 'Mechanics',
    publisher: 'Meridian House',
    subject: 'Physics',
    yearLevel: 11,
    pages: 512,
    edition: 3,
    adoptedYear: 2023,
    hardcover: true,
    cover: { base: '#2b2f38', accent: '#e8c547', style: 'photo', bands: 4, titleWeight: 0.26 },
  },
  {
    title: 'Chemistry: Structure First',
    short: 'Structure',
    publisher: 'Auburn Academic',
    subject: 'Chemistry',
    yearLevel: 11,
    pages: 488,
    edition: 1,
    adoptedYear: 2025,
    hardcover: true,
    cover: { base: '#7a2f2f', accent: '#f3e9d2', style: 'photo', bands: 2, titleWeight: 0.4 },
  },
  {
    title: 'Cell Systems & Genetics',
    short: 'Cells',
    publisher: 'Northline Education',
    subject: 'Biology',
    yearLevel: 10,
    pages: 396,
    edition: 5,
    adoptedYear: 2022,
    hardcover: false,
    cover: { base: '#14503c', accent: '#bfe3c8', style: 'photo', bands: 3, titleWeight: 0.32 },
  },
  {
    title: 'Voices in Literature',
    short: 'Voices',
    publisher: 'Kestrel Press',
    subject: 'English',
    yearLevel: 9,
    pages: 340,
    edition: 2,
    adoptedYear: 2020,
    hardcover: false,
    cover: { base: '#f0e3c8', accent: '#3b2b20', style: 'cloth', bands: 5, titleWeight: 0.44 },
  },
  {
    title: 'Rhetoric and Argument',
    short: 'Rhetoric',
    publisher: 'Kestrel Press',
    subject: 'English',
    yearLevel: 12,
    pages: 288,
    edition: 1,
    adoptedYear: 2025,
    hardcover: false,
    cover: { base: '#f6f1e4', accent: '#0f6b4f', style: 'cloth', bands: 1, titleWeight: 0.5 },
  },
  {
    title: 'Empires and Trade Routes',
    short: 'Empires',
    publisher: 'Auburn Academic',
    subject: 'History',
    yearLevel: 10,
    pages: 452,
    edition: 3,
    adoptedYear: 2021,
    hardcover: true,
    cover: { base: '#5b4632', accent: '#e8c547', style: 'photo', bands: 2, titleWeight: 0.28 },
  },
  {
    title: 'Atlas of a Changing Climate',
    short: 'Atlas',
    publisher: 'Meridian House',
    subject: 'Geography',
    yearLevel: 11,
    pages: 264,
    edition: 2,
    adoptedYear: 2023,
    hardcover: true,
    cover: { base: '#1c6f8c', accent: '#f6f1e4', style: 'grid', bands: 4, titleWeight: 0.24 },
  },
  {
    title: 'Programmes: Data Structures',
    short: 'Structures',
    publisher: 'Halcyon Tech',
    subject: 'Computer Science',
    yearLevel: 12,
    pages: 520,
    edition: 1,
    adoptedYear: 2024,
    hardcover: false,
    cover: { base: '#101418', accent: '#5ee0a0', style: 'grid', bands: 6, titleWeight: 0.2 },
  },
  {
    title: 'Drawing Foundations',
    short: 'Drawing',
    publisher: 'Kestrel Press',
    subject: 'Art & Design',
    yearLevel: 9,
    pages: 176,
    edition: 4,
    adoptedYear: 2019,
    hardcover: false,
    cover: { base: '#d97b2f', accent: '#2b2f38', style: 'photo', bands: 1, titleWeight: 0.22 },
  },
  {
    title: 'Movement & Health',
    short: 'Movement',
    publisher: 'Northline Education',
    subject: 'Physical Education',
    yearLevel: 9,
    pages: 148,
    edition: 2,
    adoptedYear: 2022,
    hardcover: false,
    cover: { base: '#e8e2d0', accent: '#7a2f2f', style: 'cloth', bands: 3, titleWeight: 0.36 },
  },
]

function isbn(seed: number, i: number): string {
  const r = rng(seed + i * 977)
  const d = () => Math.floor(r() * 10)
  return `978-${d()}${d()}${d()}-${d()}${d()}${d()}${d()}-${d()}${d()}${d()}-${d()}-${d()}`
}

export const BOOKS: Book[] = BOOK_SEEDS.map((s, i) => ({
  id: `bk-${String(i + 1).padStart(2, '0')}`,
  title: s.title,
  shortTitle: s.short,
  publisher: s.publisher,
  isbn: isbn(1291, i),
  edition: s.edition,
  subject: s.subject,
  yearLevel: s.yearLevel,
  pages: s.pages,
  massKg: bookMass(s.pages, s.hardcover),
  adoptedYear: s.adoptedYear,
  cover: s.cover,
}))

export const BOOK_BY_ID = new Map(BOOKS.map((b) => [b.id, b]))

export const CONDITIONS: Condition[] = ['like-new', 'good', 'fair', 'worn']

const HOMEROOMS = ['9A', '9B', '10A', '10C', '11B', '11D', '12A', '12C']

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Listings and requests are drawn so that the loop has *interesting* tension:
 * some books are oversupplied (Atlas, Movement), others are scarce (Calculus,
 * Structures) which is what makes the matching and forecast views useful.
 */
const SUPPLY_BIAS: Record<string, number> = {
  'bk-01': 0.42,
  'bk-02': 0.7,
  'bk-03': 0.55,
  'bk-04': 0.3,
  'bk-05': 0.66,
  'bk-06': 0.78,
  'bk-07': 0.25,
  'bk-08': 0.6,
  'bk-09': 0.9,
  'bk-10': 0.28,
  'bk-11': 0.72,
  'bk-12': 0.88,
}

export interface Dataset {
  listings: Listing[]
  requests: Request[]
  history: LoopEvent[]
}

export function buildDataset(seed = 20260905): Dataset {
  const r = rng(seed)
  const listings: Listing[] = []
  const requests: Request[] = []

  let li = 0
  let ri = 0
  for (const b of BOOKS) {
    const bias = SUPPLY_BIAS[b.id] ?? 0.5
    const nListings = Math.round(4 + bias * 12)
    const nRequests = Math.round(2 + (1 - bias) * 14)
    for (let i = 0; i < nListings; i++) {
      li++
      listings.push({
        id: `L-${String(li).padStart(3, '0')}`,
        bookId: b.id,
        owner: alias(r, li),
        condition: CONDITIONS[Math.min(3, Math.floor(r() * 3 + (bias > 0.6 ? 0 : 1)))] as Condition,
        availableFrom: iso(2026, 9, 1 + Math.floor(r() * 20)),
        status: 'open',
        viaScan: r() > 0.55,
      })
    }
    for (let i = 0; i < nRequests; i++) {
      ri++
      const roll = r()
      requests.push({
        id: `R-${String(ri).padStart(3, '0')}`,
        bookId: b.id,
        student: alias(r, 100 + ri),
        homeroom: HOMEROOMS[Math.floor(r() * HOMEROOMS.length)],
        priority: (roll > 0.88 ? 3 : roll > 0.66 ? 2 : 1) as Request['priority'],
        neededBy: iso(2026, 9, 8 + Math.floor(r() * 26)),
        status: 'open',
      })
    }
  }

  // 20 months of loop history: listing volume, successful hand-overs and the
  // small share of copies that were pulped instead of re-homed.
  //
  // The disposal rule is written down on purpose rather than drawn at random,
  // so the surplus-forecast model in `regress.ts` has genuine structure to
  // learn and its coefficients mean something:
  //   discards(month, book) ~ unsold copies x (base + weak-demand + term-end)
  // See docs/ML.md for the exact formula and why a synthetic generator is the
  // honest choice for a demo.
  const history: LoopEvent[] = []
  let ei = 0
  const months: string[] = []
  for (let m = 0; m < 20; m++) {
    const year = 2025 + Math.floor((1 + m) / 12)
    const month = ((1 + m) % 12) + 1
    months.push(`${year}-${String(month).padStart(2, '0')}`)
  }
  for (const month of months) {
    const seasonal = month.endsWith('-09') || month.endsWith('-01') ? 2.1 : month.endsWith('-06') ? 1.5 : 0.7
    const termEnd = month.endsWith('-06') || month.endsWith('-12')
    for (const b of BOOKS) {
      const bias = SUPPLY_BIAS[b.id] ?? 0.5
      const listed = Math.max(1, Math.round((1 + r() * 5) * seasonal))
      for (let i = 0; i < listed; i++) {
        ei++
        history.push({
          id: `E-${ei}`,
          kind: 'listed',
          bookId: b.id,
          month,
          massKg: b.massKg,
        })
      }
      // Demand takes back most copies unless the subject is chronically
      // oversupplied (high bias = lots of copies, few takers).
      const takeRate = clamp(0.94 - bias * 0.55 + (r() - 0.5) * 0.12, 0.15, 0.98)
      const handedOver = Math.round(listed * takeRate)
      for (let i = 0; i < handedOver; i++) {
        ei++
        history.push({
          id: `E-${ei}`,
          kind: 'handed-over',
          bookId: b.id,
          month,
          massKg: b.massKg,
        })
      }
      const unsold = listed - handedOver
      const lambda = unsold * (0.28 + (termEnd ? 0.34 : 0) + bias * 0.22)
      const discards = poisson(lambda, r)
      for (let i = 0; i < discards; i++) {
        ei++
        history.push({ id: `E-${ei}`, kind: 'discarded', bookId: b.id, month, massKg: b.massKg })
      }
    }
  }

  return { listings, requests, history }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Tiny integer-valued noise model so discards are not perfectly smooth. */
function poisson(lambda: number, r: () => number): number {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= r()
  } while (p > L && k < 12)
  return k - 1
}

/** The synthetic dataset instance used by the UI. */
export const DATA: Dataset = buildDataset()
