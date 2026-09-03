/**
 * Overview — the one-screen answer to "is this loop actually working?"
 *
 * Everything here is derived from the same functions the tests assert on
 * (`summarise`, `forecastSubjects`, `evaluate`), so the headline numbers on the
 * landing page cannot drift away from the numbers in the README. The only piece
 * that is expensive — the recognition report — is computed off the render path
 * and shows a "computing" state rather than a fake placeholder.
 */

import { useEffect, useMemo, useState } from 'react'
import { BOOKS, BOOK_BY_ID, CAMPUS, DATA } from '../lib/seed'
import { summarise } from '../lib/impact'
import { buildRows, forecastSubjects } from '../lib/regress'
import { runEvaluation } from '../lib/runReport'
import { openListings, openRequests, useStore } from '../lib/store'
import { Card, CoverCanvas, Head, Kpi, Note, Stat, Tag, fixed, kg, pct } from '../components/ui'
import { ColumnChart, Donut, LineChart } from '../components/charts'

const STEPS: { href: string; n: string; title: string; body: string }[] = [
  {
    href: '#/scan',
    n: '1',
    title: 'Scan the cover',
    body: 'A phone photo is matched against the school catalogue entirely on-device. No upload, no API key, no training set of other people’s children.',
  },
  {
    href: '#/loop',
    n: '2',
    title: 'List or request',
    body: 'Recognition turns a 40-second form into a 4-second one: title, edition and ISBN arrive filled in, the student only confirms condition and pickup window.',
  },
  {
    href: '#/match',
    n: '3',
    title: 'Match fairly',
    body: 'A maximum-cardinality allocator with a fairness objective decides who gets which copy, and prints the reason next to every pair.',
  },
  {
    href: '#/forecast',
    n: '4',
    title: 'Forecast the residue',
    body: 'Next-term unclaimed copies per subject tell the library whether to run a second swap day or book the recycling collection.',
  },
  {
    href: '#/impact',
    n: '5',
    title: 'Account for it',
    body: 'Every hand-over is booked as paper and CO2e kept out of landfill, with the emission factor exposed as a slider instead of buried in a constant.',
  },
]

export function Overview() {
  const { state } = useStore()

  const supply = useMemo(() => openListings(state), [state])
  const demand = useMemo(() => openRequests(state), [state])
  const summary = useMemo(() => summarise(DATA.history, BOOK_BY_ID), [])
  const points = useMemo(() => forecastSubjects(buildRows(DATA.history), DATA.history), [])

  const [acc, setAcc] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    runEvaluation().then((r) => {
      if (live) setAcc(r.accuracy1)
    })
    return () => {
      live = false
    }
  }, [])

  const months = summary.byMonth.map((m) => m.month)
  const peakCo2e = Math.max(...summary.bySubject.map((s) => s.co2eKg), 1)

  return (
    <div className="stack">
      <Head
        title="Textbooks, kept in the loop"
        lede={
          <>
            {CAMPUS.name} re-homes {CAMPUS.copiesPerStudent} textbook copies per student every year. CampusLoop scans a
            cover, matches it to a request fairly, and forecasts what will be left over — all of it in one static page,
            with nothing leaving the browser.
          </>
        }
        right={
          <div className="pillrow">
            <Tag tone="pine">on-device recognition</Tag>
            <Tag tone="gold">fairness-aware matching</Tag>
            <Tag tone="plum">zero backend</Tag>
          </div>
        }
      />

      <div className="grid g-4">
        <Kpi
          k="Re-homed"
          v={summary.handedOver}
          tone="pine"
          note={`${kg(summary.divertedKg)} of paper given a second life`}
        />
        <Kpi
          k="Sent to recycling"
          v={summary.discarded}
          tone="clay"
          note={`${kg(summary.landfillKg)} that the loop could not catch`}
        />
        <Kpi
          k="Circularity"
          v={pct(summary.circularity)}
          note="handed over ÷ (handed over + discarded), 20 months"
          right={<Donut value={summary.circularity} size={72} thickness={9} center={pct(summary.circularity, 0)} />}
        />
        <Kpi
          k="Emissions avoided"
          v={`${fixed(summary.co2eKg, 1)} kg CO2e`}
          note={`published factors put this between ${kg(summary.co2eLowKg)} and ${kg(summary.co2eHighKg)}`}
        />
      </div>

      <div className="grid g-4">
        <Stat k="Copies listed" v={summary.listed} note="including withdrawals" />
        <Stat k="Open listings" v={supply.length} note="available or reserved right now" />
        <Stat k="Open requests" v={demand.length} note={`${demand.filter((r) => r.priority > 1).length} from supported students`} />
        <Stat
          k="Matched this session"
          v={state.matchedCount}
          tone={state.matchedCount > 0 ? 'pine' : undefined}
          note="starts at zero; act on the Loop tab"
        />
        <Stat
          k="Recognition top-1"
          v={acc === null ? <span className="pulse">computing…</span> : pct(acc)}
          tone="pine"
          note="12 covers × 10 photo degradations × 2 protocols"
        />
      </div>

      <div className="grid g-side">
        <Card
          title="Twenty months of the loop"
          sub="monthly outcome of every copy that entered the system"
        >
          <LineChart
            categories={months}
            zeroFloor
            yTitle="copies"
            xTickEvery={2}
            series={[
              { name: 'handed over', values: summary.byMonth.map((m) => m.handedOver) },
              { name: 'discarded', values: summary.byMonth.map((m) => m.discarded), color: 'var(--clay)' },
            ]}
          />
          <Note tone="plain">
            The September and June spikes are term ends: listings arrive faster than the loop can place them, and the
            surplus is what the Forecast tab exists to predict.
          </Note>
        </Card>

        <Card title="Where the avoided emissions are" sub="kg CO2e by subject" flat>
          <ColumnChart
            data={summary.bySubject.slice(0, 6).map((s) => ({ label: s.subject.replace(' & ', '/'), value: s.co2eKg }))}
            height={216}
            rotate
            format={(n) => n.toFixed(1)}
          />
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {summary.bySubject.slice(0, 4).map((s) => (
              <div className="row justify-between" key={s.subject}>
                <span className="small">{s.subject}</span>
                <span className="num tiny muted">
                  {s.handedOver} copies · {pct(s.co2eKg / peakCo2e, 0)} of the leader
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Next term at a glance" sub="model prediction for unclaimed copies, 80% interval">
        <div className="grid g-4">
          {points.slice(0, 4).map((p) => (
            <div className="stat" key={p.subject}>
              <span className="stat-k">{p.subject}</span>
              <span className="stat-v">{fixed(p.predictedSurplus)}</span>
              <span className="stat-note">
                last term {p.actualLastTerm} · band {fixed(p.lower)}–{fixed(p.upper)}
              </span>
            </div>
          ))}
        </div>
        <Note tone="plain">
          Two subjects are predicted to end the term with more copies than the school can place. That is an operational
          decision, not a spreadsheet curiosity: run the second swap day, or route those titles to the librarian.
        </Note>
      </Card>

      <div className="grid g-side-l">
        <Card title="How it works" sub="five steps, one page">
          <div className="stack-sm">
            {STEPS.map((s) => (
              <a className="row items-center" key={s.n} href={s.href} style={{ gap: 12, textDecoration: 'none' }}>
                <span
                  className="num"
                  style={{
                    flex: '0 0 auto',
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'var(--pine-soft)',
                    color: 'var(--pine-2)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                  }}
                >
                  {s.n}
                </span>
                <span>
                  <strong style={{ color: 'var(--ink)', fontSize: 13.5 }}>{s.title}</strong>
                  <div className="tiny muted">{s.body}</div>
                </span>
              </a>
            ))}
          </div>
        </Card>

        <Card title="The catalogue" sub={`${BOOKS.length} titles, drawn in software from the library record`}>
          <div className="grid g-4" style={{ gap: 12 }}>
            {BOOKS.map((b) => (
              <div className="col items-center" key={b.id} style={{ gap: 6 }}>
                <CoverCanvas book={b} w={84} h={118} title={`${b.title}, ${b.subject}`} />
                <span className="tiny center" style={{ maxWidth: 92 }}>
                  {b.shortTitle}
                </span>
              </div>
            ))}
          </div>
          <Note tone="plain">
            Covers are rasterised by hand from each book’s catalogue entry, which is why the repository contains no
            binary image assets — and why the pixels on your screen are exactly the pixels the classifier sees.
          </Note>
        </Card>
      </div>
    </div>
  )
}
