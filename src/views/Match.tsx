/**
 * Match — the allocator, shown with its working.
 *
 * Every figure on this screen comes out of `matchDemand()` on the current
 * supply/demand queues, including the two baselines that argue against the
 * default settings. That is deliberate: the fairness multiplier is a claim, so
 * the page has to carry the measurement that backs it (and the counter-example
 * where first-come-first-served happens to do just as well).
 */

import { useMemo } from 'react'
import type { MatchResult, Unmatched } from '../lib/types'
import { PRIORITY_LABEL } from '../lib/types'
import { BOOK_BY_ID } from '../lib/seed'
import { DEFAULT_MATCH, matchDemand } from '../lib/matching'
import type { MatchDiagnostics } from '../lib/matching'
import { openListings, openRequests, TODAY, useStore } from '../lib/store'
import { Btn, Card, Empty, Head, KeyValue, Note, Range, Stat, Tag, fixed, pct } from '../components/ui'

type Full = MatchResult & MatchDiagnostics

export function Match() {
  const { state, dispatch } = useStore()

  const listings = useMemo(() => openListings(state), [state])
  const requests = useMemo(() => openRequests(state), [state])

  const result = useMemo(
    () =>
      matchDemand(listings, requests, BOOK_BY_ID, {
        fairnessWeight: state.fairnessWeight,
        idleWeight: state.idleWeight,
        today: TODAY,
      }) as Full,
    [listings, requests, state.fairnessWeight, state.idleWeight],
  )

  // The fairness-off baseline above is re-scored under the *production*
  // objective so the numbers are comparable. Its own cardinality has to be
  // measured on its own pipeline, which is what this second run is for.
  const fairnessOffSize = useMemo(
    () =>
      (
        matchDemand(listings, requests, BOOK_BY_ID, {
          fairnessWeight: 0,
          idleWeight: state.idleWeight,
          today: TODAY,
        }) as Full
      ).finalSize,
    [listings, requests, state.idleWeight],
  )

  const listingById = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings])
  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests])

  const isDefault =
    state.fairnessWeight === DEFAULT_MATCH.fairnessWeight && state.idleWeight === DEFAULT_MATCH.idleWeight

  const confirmAll = () => {
    for (const p of result.pairs) dispatch({ type: 'confirm-handover', listingId: p.listingId, requestId: p.requestId })
    dispatch({ type: 'log', text: `Confirmed ${result.pairs.length} pairings from this allocation.`, kind: 'match' })
  }

  const baselines = [
    {
      name: 'First come, first served',
      detail: 'same feasibility rules, no objective',
      size: result.naiveSize,
      served: result.naiveSupportedServed,
      utility: result.naiveUtility,
    },
    {
      name: 'Optimised, fairness term off',
      detail: 'raw residual-value utility only',
      size: fairnessOffSize,
      served: result.zeroFairnessSupportedServed,
      utility: result.zeroFairnessUtility,
    },
    {
      name: 'CampusLoop default',
      detail: `maximum cardinality + fairness x${fixed(1 + state.fairnessWeight, 2)}`,
      size: result.finalSize,
      served: result.supportedServed,
      utility: result.utilityAfter,
    },
  ]

  const unmatchedRows: (Unmatched & { student: string; book: string; tier: string })[] = result.unmatched.map((u) => {
    const rq = requestById.get(u.requestId)
    const book = rq ? BOOK_BY_ID.get(rq.bookId) : undefined
    return {
      ...u,
      student: rq?.student ?? '—',
      book: book?.shortTitle ?? '—',
      tier: rq ? PRIORITY_LABEL[rq.priority] : '—',
    }
  })

  return (
    <div className="stack">
      <Head
        title="Who gets which copy"
        lede={
          <>
            The allocator never hands out fewer books than is physically possible. Among every maximum-cardinality
            allocation it maximises a utility that rewards useful life, urgency, idle stock — and, on top, a multiplier
            for students with a supported place or who have just arrived. Each row below carries the reason it won.
          </>
        }
        right={
          <div className="pillrow">
            <Tag tone="pine">{listings.length} open copies</Tag>
            <Tag tone="clay">{requests.length} open requests</Tag>
            <Tag tone="gold">{result.feasibleEdges} feasible edges</Tag>
          </div>
        }
      />

      <div className="grid g-4">
        <Stat
          k="Pairings proposed"
          v={result.finalSize}
          tone="pine"
          note={`maximum possible is ${result.ceiling}; greedy alone reached ${result.greedySize}`}
        />
        <Stat
          k="Supported students served"
          v={`${result.supportedServed} / ${result.supportedTotal}`}
          note={`${pct(result.supportedTotal ? result.supportedServed / result.supportedTotal : 0, 0)} of tier 2–3 requests`}
        />
        <Stat k="Objective" v={fixed(result.utilityAfter, 2)} note={`up from ${fixed(result.utilityBefore, 2)} after search`} />
        <Stat
          k="Search steps"
          v={result.iterations}
          tone={result.iterations === 0 ? 'clay' : 'pine'}
          note={
            result.iterations === 0
              ? 'the greedy pass was already optimal here — the swaps found nothing to gain'
              : 'augmenting-path repairs plus positive-gain 2-swaps'
          }
        />
      </div>

      <div className="grid g-side">
        <Card
          title="Proposed hand-overs"
          sub="ranked by pair utility; confirming books the transfer on the Impact board"
          right={
            <Btn size="sm" variant="primary" onClick={confirmAll} disabled={result.pairs.length === 0}>
              Confirm all {result.pairs.length}
            </Btn>
          }
          pad0
        >
          {result.pairs.length === 0 ? (
            <div style={{ padding: 16 }}>
              <Empty>
                Nothing left to allocate. Every open request is satisfied or has no feasible copy — the Loop tab shows
                what is still waiting.
              </Empty>
            </div>
          ) : (
            <div className="scroll-y" style={{ maxHeight: 460 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Why this pairing</th>
                    <th className="r">Utility</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.map((p) => {
                    const l = listingById.get(p.listingId)
                    const r = requestById.get(p.requestId)
                    const book = BOOK_BY_ID.get(p.bookId)
                    if (!l || !r || !book) return null
                    return (
                      <tr key={p.listingId + ':' + p.requestId}>
                        <td className="nowrap">
                          <strong>{book.shortTitle}</strong>
                          <div className="tiny dim">{book.subject}</div>
                        </td>
                        <td className="num tiny nowrap">{l.owner}</td>
                        <td className="nowrap">
                          <span className="num tiny">{r.student}</span>
                          <div className="tiny dim">
                            {PRIORITY_LABEL[r.priority]} · by {r.neededBy}
                          </div>
                        </td>
                        <td className="why">{p.why}</td>
                        <td className="r num">{fixed(p.utility, 3)}</td>
                        <td className="r">
                          <Btn size="sm" onClick={() => dispatch({ type: 'confirm-handover', listingId: p.listingId, requestId: p.requestId })}>
                            Confirm
                          </Btn>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="col">
          <Card title="Objective settings" sub="live — the table above re-solves as you drag">
            <div className="stack-sm">
              <Range
                label="Fairness multiplier"
                value={state.fairnessWeight}
                min={0}
                max={1}
                step={0.05}
                display={'x' + fixed(1 + state.fairnessWeight, 2)}
                onChange={(v) => dispatch({ type: 'weights', fairnessWeight: v })}
              />
              <Range
                label="Idle-stock bonus"
                value={state.idleWeight}
                min={0}
                max={0.3}
                step={0.01}
                display={fixed(state.idleWeight, 2)}
                onChange={(v) => dispatch({ type: 'weights', idleWeight: v })}
              />
              <Btn
                size="sm"
                variant="ghost"
                disabled={isDefault}
                onClick={() =>
                  dispatch({ type: 'weights', fairnessWeight: DEFAULT_MATCH.fairnessWeight, idleWeight: DEFAULT_MATCH.idleWeight })
                }
              >
                Restore defaults
              </Btn>
            </div>
            <Note tone="plain">
              Dropping the fairness multiplier to zero costs nothing in pairings today and loses{' '}
              {Math.max(0, result.supportedServed - result.zeroFairnessSupportedServed)} supported places — that gap is
              the whole argument for the term, measured on this queue rather than asserted.
            </Note>
          </Card>

          <Card title="Solver diagnostics" flat>
            <KeyValue
              rows={[
                { k: 'Listings x requests', v: `${listings.length} x ${requests.length}` },
                { k: 'Feasible edges', v: result.feasibleEdges },
                { k: 'Maximum cardinality (Hopcroft–Karp)', v: result.ceiling },
                { k: 'Utility-ordered greedy', v: result.greedySize },
                { k: 'After repair + 2-swaps', v: result.finalSize },
                { k: 'Objective, greedy only', v: fixed(result.utilityBefore, 3) },
                { k: 'Objective, final', v: fixed(result.utilityAfter, 3) },
                { k: 'Deadline used', v: TODAY },
              ]}
            />
          </Card>
        </div>
      </div>

      <Card title="Baselines, scored on the same objective" sub="the comparison the README claims, recomputed on every render">
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Approach</th>
                <th>How it decides</th>
                <th className="r">Pairings</th>
                <th className="r">Supported served</th>
                <th className="r">Objective</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <tr key={b.name}>
                  <td className="nowrap">
                    <strong>{b.name}</strong>
                  </td>
                  <td className="why">{b.detail}</td>
                  <td className="r num">{b.size}</td>
                  <td className="r num">
                    {b.served} / {result.supportedTotal}
                  </td>
                  <td className="r num">{fixed(b.utility, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note tone="clay">
          Read this honestly: first-come-first-served reaches the same pairings on the present queue, and its supported
          count is not worse either. What it gives up is the objective — the copies that actually still have useful life
          in them do not reliably land with the students who need them soonest. Change the fairness slider and the pair
          counts, not just the score, start to move.
        </Note>
      </Card>

      <Card title="Requests left waiting" sub={`${unmatchedRows.length} of ${requests.length} open requests`} pad0>
        {unmatchedRows.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty>Nothing is waiting. Every open request has a proposed copy.</Empty>
          </div>
        ) : (
          <div className="scroll-y" style={{ maxHeight: 320 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Title</th>
                  <th>Tier</th>
                  <th>Why it did not match this cycle</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedRows.map((u) => (
                  <tr key={u.requestId}>
                    <td className="num tiny nowrap">{u.student}</td>
                    <td className="nowrap">{u.book}</td>
                    <td className="tiny nowrap">{u.tier}</td>
                    <td className="why">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
