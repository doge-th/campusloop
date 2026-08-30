import { createContext, useContext, useMemo, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { Book, Condition, Listing, LoopEvent, Request } from './types'
import { DATA } from './seed'
import { BOOKS } from './seed'
import { DEFAULT_MATCH } from './matching'

/**
 * A tiny reducer store.
 *
 * The seed data is frozen; everything a visitor does in the demo lives in
 * `session` so the numbers on the Impact board move in real time and a single
 * "Reset" button restores the pristine synthetic world.
 */

export const TODAY = '2026-09-05'
export const CURRENT_MONTH = '2026-09'

export interface LogLine {
  id: number
  text: string
  kind: 'scan' | 'match' | 'handover' | 'discard' | 'info'
}

export interface AppState {
  listings: Listing[]
  requests: Request[]
  session: LoopEvent[]
  log: LogLine[]
  fairnessWeight: number
  idleWeight: number
  matchedCount: number
}

export type Action =
  | { type: 'confirm-handover'; listingId: string; requestId: string }
  | { type: 'discard'; listingId: string }
  | { type: 'withdraw'; requestId: string }
  | { type: 'add-listing'; bookId: string; condition: Condition; viaScan: boolean; note?: string }
  | { type: 'add-request'; bookId: string; priority: 1 | 2 | 3; neededBy: string }
  | { type: 'weights'; fairnessWeight?: number; idleWeight?: number }
  | { type: 'log'; text: string; kind: LogLine['kind'] }
  | { type: 'reset' }

const initial: AppState = {
  listings: DATA.listings.map((l) => ({ ...l })),
  requests: DATA.requests.map((r) => ({ ...r })),
  session: [],
  log: [
    {
      id: 1,
      kind: 'info',
      text: `Loaded ${DATA.listings.length} listings and ${DATA.requests.length} requests for the 2026 autumn term.`,
    },
  ],
  fairnessWeight: DEFAULT_MATCH.fairnessWeight,
  idleWeight: DEFAULT_MATCH.idleWeight,
  matchedCount: 0,
}

let logSeq = 100
function withLog(state: AppState, text: string, kind: LogLine['kind']): LogLine[] {
  logSeq += 1
  return [...state.log.slice(-39), { id: logSeq, text, kind }]
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'confirm-handover': {
      const listing = state.listings.find((l) => l.id === action.listingId)
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!listing || !request) return state
      const book = BOOKS.find((b) => b.id === listing.bookId)!
      const ev: LoopEvent = {
        id: `S-${state.session.length + 1}`,
        kind: 'handed-over',
        bookId: listing.bookId,
        month: CURRENT_MONTH,
        massKg: book.massKg,
      }
      return {
        ...state,
        listings: state.listings.map((l) => (l.id === listing.id ? { ...l, status: 'matched' } : l)),
        requests: state.requests.map((r) => (r.id === request.id ? { ...r, status: 'matched' } : r)),
        session: [...state.session, ev],
        matchedCount: state.matchedCount + 1,
        log: withLog(
          state,
          `Hand-over confirmed: ${book.shortTitle} (${listing.condition}) ${listing.owner} → ${request.student}.`,
          'handover',
        ),
      }
    }
    case 'discard': {
      const listing = state.listings.find((l) => l.id === action.listingId)
      if (!listing || listing.status === 'withdrawn') return state
      const book = BOOKS.find((b) => b.id === listing.bookId)!
      const ev: LoopEvent = {
        id: `S-${state.session.length + 1}`,
        kind: 'discarded',
        bookId: listing.bookId,
        month: CURRENT_MONTH,
        massKg: book.massKg,
      }
      return {
        ...state,
        listings: state.listings.map((l) => (l.id === listing.id ? { ...l, status: 'withdrawn' } : l)),
        session: [...state.session, ev],
        log: withLog(state, `Pulped a copy of ${book.shortTitle} (${listing.condition}).`, 'discard'),
      }
    }
    case 'withdraw': {
      const request = state.requests.find((r) => r.id === action.requestId)
      if (!request) return state
      return {
        ...state,
        requests: state.requests.map((r) => (r.id === request.id ? { ...r, status: 'withdrawn' } : r)),
        log: withLog(state, `${request.student} withdrew a request.`, 'info'),
      }
    }
    case 'add-listing': {
      const book = BOOKS.find((b) => b.id === action.bookId)!
      const id = `L-NEW-${state.listings.length + 1}`
      const listing: Listing = {
        id,
        bookId: action.bookId,
        owner: `you-${String(state.listings.length % 90).padStart(2, '0')}`,
        condition: action.condition,
        availableFrom: TODAY,
        status: 'open',
        viaScan: action.viaScan,
        note: action.note,
      }
      const ev: LoopEvent = {
        id: `S-${state.session.length + 1}`,
        kind: 'listed',
        bookId: action.bookId,
        month: CURRENT_MONTH,
        massKg: book.massKg,
      }
      return {
        ...state,
        listings: [listing, ...state.listings],
        session: [...state.session, ev],
        log: withLog(
          state,
          action.viaScan
            ? `Scanned a copy of ${book.shortTitle} into the loop as ${action.condition}.`
            : `Listed ${book.shortTitle} as ${action.condition}.`,
          'scan',
        ),
      }
    }
    case 'add-request': {
      const book = BOOKS.find((b) => b.id === action.bookId)!
      const id = `R-NEW-${state.requests.length + 1}`
      const request: Request = {
        id,
        bookId: action.bookId,
        student: `you-${String(state.requests.length % 90).padStart(2, '0')}`,
        homeroom: '—',
        priority: action.priority,
        neededBy: action.neededBy,
        status: 'open',
      }
      const ev: LoopEvent = {
        id: `S-${state.session.length + 1}`,
        kind: 'requested',
        bookId: action.bookId,
        month: CURRENT_MONTH,
        massKg: 0,
      }
      return {
        ...state,
        requests: [...state.requests, request],
        session: [...state.session, ev],
        log: withLog(state, `Requested ${book.shortTitle} by ${action.neededBy}.`, 'match'),
      }
    }
    case 'weights':
      return {
        ...state,
        fairnessWeight: action.fairnessWeight ?? state.fairnessWeight,
        idleWeight: action.idleWeight ?? state.idleWeight,
      }
    case 'log':
      return { ...state, log: withLog(state, action.text, action.kind) }
    case 'reset':
      logSeq = 100
      return { ...initial, listings: DATA.listings.map((l) => ({ ...l })), requests: DATA.requests.map((r) => ({ ...r })) }
    default:
      return state
  }
}

const StoreCtx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): { state: AppState; dispatch: Dispatch<Action> } {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** Open (unmatched) supply and demand, the two queues the matching engine sees. */
export function openListings(state: AppState): Listing[] {
  return state.listings.filter((l) => l.status === 'open' || l.status === 'reserved')
}
export function openRequests(state: AppState): Request[] {
  return state.requests.filter((r) => r.status === 'open' || r.status === 'reserved')
}

export function bookById(id: string): Book {
  return BOOKS.find((b) => b.id === id)!
}
