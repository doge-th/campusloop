/**
 * Loop — the operating surface of the swap system.
 *
 * Two queues (supply and demand), two forms (list / request), and an activity
 * log that records every action taken in this browser session. Everything here
 * dispatches real reducer actions, so the Match and Impact tabs react to what
 * you do on this screen — the demo is not a slideshow of pre-baked states.
 */

import { useMemo, useState } from 'react'
import type { Condition, PriorityTier } from '../lib/types'
import { PRIORITY_LABEL } from '../lib/types'
import { BOOKS, BOOK_BY_ID } from '../lib/seed'
import { openListings, openRequests, TODAY, useStore } from '../lib/store'
import { Btn, Card, Empty, Field, Head, Note, Seg, Stat, Tag, fixed } from '../components/ui'

const CONDITION_OPTS: { id: Condition; label: string }[] = [
  { id: 'like-new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
  { id: 'worn', label: 'Worn' },
]

export function Loop() {
  const { state, dispatch } = useStore()

  const supply = useMemo(() => openListings(state), [state])
  const demand = useMemo(() => openRequests(state), [state])
  const pulped = state.session.filter((e) => e.kind === 'discarded').length

  const [listBook, setListBook] = useState(BOOKS[0].id)
  const [listCondition, setListCondition] = useState<Condition>('good')
  const [listSource, setListSource] = useState<'scan' | 'manual'>('manual')

  const [reqBook, setReqBook] = useState(BOOKS[0].id)
  const [reqTier, setReqTier] = useState<PriorityTier>(1)
  const [reqBy, setReqBy] = useState('2026-09-12')

  const recent = useMemo(() => [...state.log].reverse(), [state.log])

  return (
    <div className="stack">
      <Head
        title="The loop, open"
        lede="Every copy in the system is either offered or wanted. Add one to either side and the matcher on the next tab sees it immediately — this is the same state the algorithms run on, not a mock-up."
        right={
          <div className="pillrow">
            <Tag tone="plum">{state.session.length} actions this session</Tag>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'reset' })}
              title="Restore the seeded dataset and clear the log"
            >
              Reset
            </Btn>
          </div>
        }
      />

      <div className="grid g-4">
        <Stat k="Open listings" v={supply.length} note="available or reserved right now" />
        <Stat k="Open requests" v={demand.length} tone="clay" note={`${demand.filter((r) => r.priority > 1).length} from supported or newly-arrived students`} />
        <Stat k="Hand-overs this session" v={state.matchedCount} tone={state.matchedCount > 0 ? 'pine' : undefined} note="confirmed on the Match tab" />
        <Stat k="Pulped this session" v={pulped} note="copies withdrawn for recycling" />
        <Stat k="Today" v={TODAY} note="the clock the matcher and the forms both use" />
      </div>

      <div className="grid g-side">
        <div className="stack">
          <Card title="Supply — copies looking for a home" sub={`${supply.length} open · oldest first`}>
            {supply.length === 0 ? (
              <Empty>Nothing is being offered right now. List a copy on the right.</Empty>
            ) : (
              <div className="scroll-y" style={{ maxHeight: 340 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Owner</th>
                      <th>Condition</th>
                      <th>Free from</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supply
                      .slice()
                      .reverse()
                      .map((l) => {
                        const book = BOOK_BY_ID.get(l.bookId)
                        return (
                          <tr key={l.id}>
                            <td>
                              {book?.shortTitle}
                              {l.viaScan && (
                                <span className="tag pine" style={{ marginLeft: 6 }} title="Created through the Scan tab">
                                  scan
                                </span>
                              )}
                            </td>
                            <td className="mono muted">{l.owner}</td>
                            <td>{l.condition}</td>
                            <td className="num">{l.availableFrom}</td>
                            <td className="r">
                              <Btn
                                size="sm"
                                variant="ghost"
                                title="No one will claim it — route it to the recycling collection"
                                onClick={() => dispatch({ type: 'discard', listingId: l.id })}
                              >
                                Pulp
                              </Btn>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <Note tone="plain">
              “Pulp” is the honest end of the loop: when a copy truly cannot be placed it goes to paper recycling, and the
              Impact tab books it as landfill-diverted mass rather than pretending it found a home.
            </Note>
          </Card>

          <Card title="Demand — students looking for a copy" sub={`${demand.length} open · urgent first`}>
            {demand.length === 0 ? (
              <Empty>No open requests. The catalogue is fully placed today.</Empty>
            ) : (
              <div className="scroll-y" style={{ maxHeight: 300 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Student</th>
                      <th>Tier</th>
                      <th>Needed by</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand
                      .slice()
                      .sort((a, b) => (a.neededBy < b.neededBy ? -1 : 1))
                      .map((r) => {
                        const book = BOOK_BY_ID.get(r.bookId)
                        return (
                          <tr key={r.id}>
                            <td>{book?.shortTitle}</td>
                            <td className="mono muted">{r.student}</td>
                            <td>
                              {r.priority > 1 ? (
                                <span className="tag plum" title="Visible to the matcher as a weight, never as a name">
                                  {PRIORITY_LABEL[r.priority]}
                                </span>
                              ) : (
                                <span className="muted">{PRIORITY_LABEL[r.priority]}</span>
                              )}
                            </td>
                            <td className="num">{r.neededBy}</td>
                            <td className="r">
                              <Btn size="sm" variant="ghost" onClick={() => dispatch({ type: 'withdraw', requestId: r.id })}>
                                Withdraw
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
        </div>

        <div className="stack">
          <Card title="List a copy" sub="what the Scan tab automates, by hand">
            <div className="stack-sm">
              <Field label="Title">
                <select className="select" value={listBook} onChange={(e) => setListBook(e.target.value)}>
                  {BOOKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.shortTitle} — {b.subject}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Condition" hint="the one question only a human can answer honestly">
                <Seg value={listCondition} options={CONDITION_OPTS} onChange={setListCondition} />
              </Field>
              <Field label="How are you adding it?">
                <Seg
                  value={listSource}
                  options={[
                    { id: 'scan', label: 'Via scan' },
                    { id: 'manual', label: 'By hand' },
                  ]}
                  onChange={setListSource}
                />
              </Field>
              <Btn
                variant="primary"
                onClick={() =>
                  dispatch({
                    type: 'add-listing',
                    bookId: listBook,
                    condition: listCondition,
                    viaScan: listSource === 'scan',
                    note: listSource === 'scan' ? 'auto-filled from cover recognition' : undefined,
                  })
                }
              >
                Put it in the loop
              </Btn>
            </div>
          </Card>

          <Card title="Request a copy" sub="joins the want-list the matcher allocates from">
            <div className="stack-sm">
              <Field label="Title">
                <select className="select" value={reqBook} onChange={(e) => setReqBook(e.target.value)}>
                  {BOOKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.shortTitle} — {b.subject}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority tier" hint="tier is an integer weight in the matcher; the bursary list itself never enters the system">
                <Seg
                  value={String(reqTier) as '1' | '2' | '3'}
                  options={[
                    { id: '1', label: 'Standard' },
                    { id: '2', label: 'Supported' },
                    { id: '3', label: 'New arrival' },
                  ]}
                  onChange={(id) => setReqTier(Number(id) as PriorityTier)}
                />
              </Field>
              <Field label="Needed by" hint="ISO date; matches must be available no later than this">
                <input type="text" value={reqBy} onChange={(e) => setReqBy(e.target.value)} placeholder="2026-09-12" />
              </Field>
              <Btn variant="clay" onClick={() => dispatch({ type: 'add-request', bookId: reqBook, priority: reqTier, neededBy: reqBy })}>
                Ask the loop
              </Btn>
            </div>
          </Card>

          <Card title="Activity" sub="this browser session, newest first">
            <div className="log">
              {recent.map((line) => (
                <div key={line.id} className="log-line" data-kind={line.kind}>
                  {line.text}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Note tone="clay">
        Mass placed by the actions above flows straight into the impact ledger: {fixed(state.session.length)} logged
        events will be added to the twenty months of history the Forecast and Impact tabs read.
      </Note>
    </div>
  )
}
