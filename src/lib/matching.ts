/**
 * Demand matching: who gets which copy.
 *
 * The naive product decision is "first come, first served", which quietly
 * disadvantages exactly the students the scheme exists for: the ones who did
 * not have a phone in hand at 08:00 on results day. So the matcher maximises a
 * weighted objective over the *maximum-cardinality* set of pairings -- it never
 * hands out fewer books than physically possible, and among the ways of doing
 * that it picks the one that serves the people who needed it most.
 *
 * Three algorithmic pieces, implemented here rather than imported:
 *   1. Hopcroft-Karp: the ceiling -- how many pairings are feasible at all
 *      (O(E sqrt V)). Fairness is only ever traded against this, never against
 *      "whatever the greedy pass happened to find".
 *   2. Greedy initialisation ordered by pair utility, so the search starts from
 *      a respectable solution.
 *   3. Local search: gain-aware augmenting paths to climb back to the ceiling
 *      (choosing the highest-utility route at each step), then positive-gain
 *      2-swaps along alternating 4-cycles until nothing improves.
 *
 * Fairness is an explicit multiplier inside the utility function, so the result
 * can report its cost honestly: `utilityBefore` vs `utilityAfter`.
 *
 * Two baselines are computed on every run so the claims in the README are
 * measured rather than asserted: `firstFit` (first come, first served) and the
 * same optimiser with the fairness multiplier set to zero.
 */

import type { Book, Listing, MatchPair, MatchResult, PriorityTier, Request, Unmatched } from './types'
import { CONDITION_VALUE } from './types'

export interface MatchOptions {
  /** objective multiplier for tier 2/3 (supported place / newly arrived) */
  fairnessWeight?: number
  /** reward for re-homing a copy that has been sitting idle */
  idleWeight?: number
  /** deadline used for "needed soon" scoring, ISO date */
  today?: string
  maxIterations?: number
}

export const DEFAULT_MATCH: Required<MatchOptions> = {
  fairnessWeight: 0.45,
  idleWeight: 0.05,
  today: '2026-09-05',
  maxIterations: 500,
}

/** Adjacency for one listing: candidate requests with their utilities. */
export interface Candidate {
  r: number
  utility: number
  listingId: string
  requestId: string
  bookId: string
}

export interface CandidateSet {
  /** per listing index, feasible requests sorted by utility (desc) */
  adj: Candidate[][]
  opts: Required<MatchOptions>
  total: number
}

function tierBoost(tier: PriorityTier, w: number): number {
  if (tier === 2) return 1 + w
  if (tier === 3) return 1 + w * 0.7
  return 1
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000
}

/**
 * Utility of one (listing, request) pair. Returns -1 when the pairing is
 * infeasible, which keeps "can this happen" and "should it happen" separate.
 *
 *   base       = condition value of the copy           (0.4 .. 0.95)
 *   tier       = fairness multiplier                   (1 .. 1.45)
 *   idle       = patience bonus for stale listings     (1 .. 1.2)
 *   scan       = verified-condition bonus              (1 .. 1.04)
 *   urgency    = needed-within-4-days bonus            (1 .. 1.15)
 */
export function pairUtility(
  listing: Listing,
  request: Request,
  opts: Required<MatchOptions> = DEFAULT_MATCH,
): number {
  if (listing.status !== 'open' || request.status !== 'open') return -1
  if (listing.bookId !== request.bookId) return -1
  if (listing.availableFrom > request.neededBy) return -1
  const idleWeeks = Math.max(0, daysBetween(opts.today, listing.availableFrom)) / 7
  const idle = 1 + opts.idleWeight * Math.min(6, idleWeeks)
  const scan = listing.viaScan ? 1.04 : 1
  const urgency = daysBetween(opts.today, request.neededBy) <= 4 ? 1.15 : 1
  return CONDITION_VALUE[listing.condition] * tierBoost(request.priority, opts.fairnessWeight) * idle * scan * urgency
}

export function buildCandidates(
  listings: Listing[],
  requests: Request[],
  options: Partial<MatchOptions> = {},
): CandidateSet {
  const opts = { ...DEFAULT_MATCH, ...options }
  const adj: Candidate[][] = []
  let total = 0
  for (let li = 0; li < listings.length; li++) {
    const listing = listings[li]
    const row: Candidate[] = []
    for (let ri = 0; ri < requests.length; ri++) {
      const u = pairUtility(listing, requests[ri], opts)
      if (u < 0) continue
      row.push({ r: ri, utility: u, listingId: listing.id, requestId: requests[ri].id, bookId: listing.bookId })
    }
    row.sort((a, b) => b.utility - a.utility)
    total += row.length
    adj.push(row)
  }
  return { adj, opts, total }
}

export interface Matching {
  /** listing index -> request index, or -1 */
  mL: number[]
  /** request index -> listing index, or -1 */
  mR: number[]
  size: number
}

function empty(nL: number, nR: number): Matching {
  return { mL: new Array(nL).fill(-1), mR: new Array(nR).fill(-1), size: 0 }
}

/**
 * Hopcroft-Karp maximum cardinality matching. Phase 1 builds a distance
 * layering with BFS from all free listings; phase 2 finds a maximal set of
 * vertex-disjoint shortest augmenting paths with DFS.
 */
export function hopcroftKarp(cs: CandidateSet): Matching {
  const nL = cs.adj.length
  const nR = Math.max(0, ...cs.adj.flatMap((row) => row.map((c) => c.r + 1))) || 0
  const m = empty(nL, nR)
  const dist = new Array<number>(nL).fill(0)
  const INF = Number.POSITIVE_INFINITY

  const bfs = (): boolean => {
    const q: number[] = []
    for (let u = 0; u < nL; u++) {
      dist[u] = m.mL[u] === -1 ? 0 : INF
      if (dist[u] === 0) q.push(u)
    }
    let reachedFree = false
    for (let head = 0; head < q.length; head++) {
      const u = q[head]
      for (const c of cs.adj[u]) {
        const partner = m.mR[c.r]
        if (partner === -1) {
          reachedFree = true
        } else if (dist[partner] === INF) {
          dist[partner] = dist[u] + 1
          q.push(partner)
        }
      }
    }
    return reachedFree
  }

  const seen = new Array<boolean>(nR).fill(false)
  const dfs = (u: number): boolean => {
    for (const c of cs.adj[u]) {
      if (seen[c.r]) continue
      const partner = m.mR[c.r]
      if (partner === -1 || (dist[partner] === dist[u] + 1 && dfs(partner))) {
        seen[c.r] = true
        m.mL[u] = c.r
        m.mR[c.r] = u
        m.size++
        return true
      }
    }
    dist[u] = INF
    return false
  }

  while (bfs()) {
    seen.fill(false)
    for (let u = 0; u < nL; u++) {
      if (m.mL[u] === -1) dfs(u)
    }
  }
  return m
}

/** Greedy pass over all candidates in global utility order. */
export function greedy(cs: CandidateSet): Matching {
  const m = empty(cs.adj.length, requestCount(cs))
  const all: { l: number; c: Candidate }[] = []
  cs.adj.forEach((row, l) => row.forEach((c) => all.push({ l, c })))
  all.sort((a, b) => b.c.utility - a.c.utility || a.l - b.l)
  for (const { l, c } of all) {
    if (m.mL[l] === -1 && m.mR[c.r] === -1) {
      m.mL[l] = c.r
      m.mR[c.r] = l
      m.size++
    }
  }
  return m
}

/**
 * First-come-first-served: walk the listings in the order they were posted and
 * give each one the first still-free request it can serve. This is what a real
 * "we'll just go down the queue" spreadsheet does, and it is the honest baseline
 * for both numbers that matter -- how many students get a book, and how much
 * priority support survives. Reported alongside the optimiser so the gain is
 * auditable rather than asserted.
 */
export function firstFit(cs: CandidateSet): Matching {
  const m = empty(cs.adj.length, requestCount(cs))
  for (let l = 0; l < cs.adj.length; l++) {
    if (m.mL[l] !== -1) continue
    for (const c of cs.adj[l]) {
      if (m.mR[c.r] === -1) {
        m.mL[l] = c.r
        m.mR[c.r] = l
        m.size++
        break
      }
    }
  }
  return m
}

export function utilityOf(cs: CandidateSet, m: Matching): number {
  let s = 0
  for (let l = 0; l < m.mL.length; l++) {
    const r = m.mL[l]
    if (r < 0) continue
    s += lookup(cs, l, r)
  }
  return Math.round(s * 1000) / 1000
}

function lookup(cs: CandidateSet, l: number, r: number): number {
  for (const c of cs.adj[l]) if (c.r === r) return c.utility
  return 0
}

/**
 * Climb from a (possibly sub-maximal) matching to the cardinality ceiling using
 * augmenting paths, always expanding the highest-utility candidate first. This
 * is plain BFS over the alternating graph -- shortest path, so it terminates --
 * with the neighbour order giving us "best available route" rather than an
 * arbitrary one.
 */
function augmentToCeiling(cs: CandidateSet, m: Matching, ceiling: number): number {
  let steps = 0
  while (m.size < ceiling && steps < cs.opts.maxIterations) {
    steps++
    const path = findAugmentingPath(cs, m)
    if (!path) break
    for (let i = 0; i + 1 < path.length; i += 2) {
      const l = path[i]
      const r = path[i + 1]
      m.mL[l] = r
      m.mR[r] = l
    }
    m.size++
  }
  return steps
}

/** Returns [l0, r0, l1, r1, ...] ending on a free request, or null. */
function findAugmentingPath(cs: CandidateSet, m: Matching): number[] | null {
  const q: { l: number; trail: number[] }[] = []
  const visitedL = new Array<boolean>(cs.adj.length).fill(false)
  for (let l = 0; l < cs.adj.length; l++) {
    if (m.mL[l] === -1) {
      visitedL[l] = true
      q.push({ l, trail: [l] })
    }
  }
  while (q.length) {
    const { l, trail } = q.shift()!
    for (const c of cs.adj[l]) {
      if (m.mR[c.r] === -1) return [...trail, c.r]
      const next = m.mR[c.r]
      if (!visitedL[next]) {
        visitedL[next] = true
        q.push({ l: next, trail: [...trail, c.r, next] })
      }
    }
  }
  return null
}

/**
 * Positive-gain 2-swaps: two matched pairs (l1,r1) and (l2,r2) exchange partners
 * when u(l1,r2)+u(l2,r1) beats the current total and both new pairs are
 * feasible. Cardinality is untouched, so this can only ever help.
 */
function improveUtility(cs: CandidateSet, m: Matching, maxIter: number): number {
  let iterations = 0
  let improved = true
  while (improved && iterations < maxIter) {
    improved = false
    outer: for (let l1 = 0; l1 < m.mL.length; l1++) {
      const r1 = m.mL[l1]
      if (r1 < 0) continue
      for (const c of cs.adj[l1]) {
        const r2 = c.r
        if (r2 === r1) continue
        const l2 = m.mR[r2]
        if (l2 < 0 || l2 === l1) continue
        const rOther = m.mL[l2]
        const gain = c.utility + lookup(cs, l2, r1) - (lookup(cs, l1, r1) + lookup(cs, l2, rOther))
        if (gain > 1e-9) {
          m.mL[l1] = r2
          m.mR[r2] = l1
          m.mL[l2] = r1
          m.mR[r1] = l2
          improved = true
          iterations++
          break outer
        }
      }
    }
  }
  return iterations
}

/**
 * The end-to-end matcher used by the app.
 *
 * Note `utilityBefore` is the greedy-only objective, i.e. what a "just sort by
 * score" implementation would ship; `utilityAfter` is after ceiling repair and
 * swaps. Both are reported so the improvement is auditable in the UI.
 */
export function matchDemand(
  listings: Listing[],
  requests: Request[],
  books: Map<string, Book>,
  options: Partial<MatchOptions> = {},
): MatchResult {
  const cs = buildCandidates(listings, requests, options)
  const ceiling = hopcroftKarp(cs).size
  const m = greedy(cs)
  const utilityBefore = utilityOf(cs, m)
  const sizeBefore = m.size

  const augSteps = augmentToCeiling(cs, m, ceiling)
  const swapSteps = improveUtility(cs, m, cs.opts.maxIterations)

  const matchedRequests = new Set<number>()
  for (let l = 0; l < m.mL.length; l++) if (m.mL[l] >= 0) matchedRequests.add(m.mL[l])

  // Baseline 1: first come, first served, same feasibility rules, no objective.
  const naive = firstFit(cs)
  // Baseline 2: identical pipeline with the fairness multiplier switched off.
  // This is the price of the fairness term, measured rather than claimed.
  const csPlain = buildCandidates(listings, requests, { ...options, fairnessWeight: 0 })
  const plainCeiling = hopcroftKarp(csPlain).size
  const plain = greedy(csPlain)
  augmentToCeiling(csPlain, plain, plainCeiling)
  improveUtility(csPlain, plain, csPlain.opts.maxIterations)

  const pairs: MatchPair[] = []
  for (let l = 0; l < m.mL.length; l++) {
    const r = m.mL[l]
    if (r < 0) continue
    const listing = listings[l]
    const request = requests[r]
    const book = books.get(listing.bookId)
    if (!book) continue
    pairs.push({
      listingId: listing.id,
      requestId: request.id,
      bookId: listing.bookId,
      utility: lookup(cs, l, r),
      why: explain(listing, request, book, cs.opts),
    })
  }
  pairs.sort((a, b) => b.utility - a.utility)

  const unmatched: Unmatched[] = requests
    .map((rq, ri) => ({ rq, ri }))
    .filter(({ ri }) => !matchedRequests.has(ri))
    .map(({ rq }) => ({ requestId: rq.id, reason: whyUnmatched(rq, listings, requests, matchedRequests, options.today ?? cs.opts.today) }))

  const supported = requests.filter((rq) => rq.priority > 1)
  const plainServed = new Set<number>()
  for (let l = 0; l < plain.mL.length; l++) if (plain.mL[l] >= 0) plainServed.add(plain.mL[l])
  const naiveServed = new Set<number>()
  for (let l = 0; l < naive.mL.length; l++) if (naive.mL[l] >= 0) naiveServed.add(naive.mL[l])
  const countServed = (served: Set<number>) => supported.filter((rq) => served.has(requests.indexOf(rq))).length

  return {
    pairs,
    unmatched,
    utilityBefore,
    utilityAfter: utilityOf(cs, m),
    supportedServed: countServed(matchedRequests),
    supportedTotal: supported.length,
    iterations: augSteps + swapSteps,
    /** extra diagnostics the Matching view uses */
    ceiling,
    greedySize: sizeBefore,
    finalSize: m.size,
    feasibleEdges: cs.total,
    naiveSize: naive.size,
    naiveUtility: utilityOf(cs, naive),
    naiveSupportedServed: countServed(naiveServed),
    zeroFairnessSupportedServed: countServed(plainServed),
    zeroFairnessUtility: utilityOf(cs, plain),
  } as MatchResult & MatchDiagnostics
}

export interface MatchDiagnostics {
  ceiling: number
  greedySize: number
  finalSize: number
  feasibleEdges: number
  /** first-come-first-served: pairings achieved */
  naiveSize: number
  /** first-come-first-served: scored under the *same* objective, for comparison */
  naiveUtility: number
  /** tier 2/3 students served by first-come-first-served */
  naiveSupportedServed: number
  /** tier 2/3 students served when the fairness multiplier is removed */
  zeroFairnessSupportedServed: number
  /** the raw-contribution objective reached once fairness is switched off */
  zeroFairnessUtility: number
}

function requestCount(cs: CandidateSet): number {
  let max = -1
  for (const row of cs.adj) for (const c of row) max = Math.max(max, c.r)
  return max + 1
}

function explain(listing: Listing, request: Request, book: Book, opts: Required<MatchOptions>): string {
  const bits = [`${book.shortTitle} · ${listing.condition} condition`]
  if (request.priority === 2) bits.push(`supported place (+${Math.round(opts.fairnessWeight * 100)}%)`)
  else if (request.priority === 3) bits.push(`newly arrived (+${Math.round(opts.fairnessWeight * 70)}%)`)
  if (daysBetween(opts.today, request.neededBy) <= 4) bits.push(`needed by ${request.neededBy}`)
  if (listing.viaScan) bits.push('condition verified by scan')
  return bits.join(' · ')
}

function whyUnmatched(rq: Request, listings: Listing[], all: Request[], matched: Set<number>, today: string): string {
  const sameBook = listings.filter((l) => l.bookId === rq.bookId && l.status === 'open')
  if (sameBook.length === 0) {
    return 'No copy of this title is in the loop yet. You are on the want-list and get first offer when one is listed.'
  }
  const inWindow = sameBook.filter((l) => l.availableFrom <= rq.neededBy)
  if (inWindow.length === 0) {
    return `Copies exist but none is free before your needed-by date (${rq.neededBy}); offered the next hand-over window instead.`
  }
  const servedRivals = all
    .map((x, i) => ({ x, i }))
    .filter(({ x, i }) => x.bookId === rq.bookId && matched.has(i)).length
  const later = inWindow.filter((l) => daysBetween(today, l.availableFrom) > 0).length
  const queueNote = later > 0 ? ` ${later} copy/copy-chain frees up later this month.` : ''
  return `Only ${inWindow.length} cop${inWindow.length === 1 ? 'y' : 'ies'} could reach you in time and ${servedRivals} were matched ahead of you this cycle. Your queue position is kept.${queueNote}`
}
