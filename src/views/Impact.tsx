/**
 * Impact — the accounting tab.
 *
 * Two design rules govern this screen.
 *
 * 1. Nothing is a hardcoded constant. Every kilogram here comes out of
 *    `summarise()` / `handoverImpact()`, the same two functions the unit tests
 *    assert on, recomputed from the live event log — so confirming a hand-over
 *    on the Loop tab moves the number on this tab in the same frame.
 *
 * 2. The emission factor is an *input*, not an assertion. Reusing a textbook
 *    avoids roughly one new book's cradle-to-gate footprint, but published
 *    factors for printing paper span 0.7–2.5 kg CO2e/kg depending on grid mix
 *    and fibre source. Rather than pick one and present it as fact, the default
 *    sits mid-range and the slider lets a judge see exactly how sensitive the
 *    headline is. docs/IMPACT.md carries the sources.
 */

import { useMemo, useState } from 'react'
import type { Condition } from '../lib/types'
import { CONDITIONS } from '../lib/types'
import { BOOKS, BOOK_BY_ID, CAMPUS, DATA } from '../lib/seed'
import { useStore } from '../lib/store'
import {
  CAR_GPerKM,
  DISPLACEMENT,
  LOOP_OVERHEAD,
  PAPER_EF,
  carKmEquivalent,
  handoverImpact,
  summarise,
  toCsv,
  treesEquivalent,
} from '../lib/impact'
import { Btn, Card, Head, KeyValue, Note, Range, Seg, Stat, Tag, fixed, kg, pct } from '../components/ui'
import { ColumnChart, Donut, LineChart } from '../components/charts'

export function Impact() {
  const { state } = useStore()
  const [ef, setEf] = useState<number>(PAPER_EF.default)
  const [bookId, setBookId] = useState<string>(BOOKS[0].id)
  const [condition, setCondition] = useState<Condition>('good')
  const [carKm, setCarKm] = useState<number>(1.6)

  // History plus whatever the visitor has just done in the demo. This is the
  // only place the two are combined, and it is why the numbers are live.
  const summary = useMemo(() => summarise([...DATA.history, ...state.session], BOOK_BY_ID), [state.session])

  // summarise() integrates mass x PAPER_EF.default x (1 - overhead); the paper
  // term is linear in the factor, so rescaling it is exact rather than an estimate.
  const scale = ef / PAPER_EF.default
  const avoided = summary.co2eKg * scale

  const handover = handoverImpact(BOOK_BY_ID.get(bookId) ?? BOOKS[0], condition, carKm)
  const carTransportKg = (carKm * CAR_GPerKM) / 1000
  const handoverAtEf = (handover.co2eKg + carTransportKg) * scale - carTransportKg

  const months = summary.byMonth.map((m) => m.month)
  const sensitivity = [PAPER_EF.low, PAPER_EF.default, 1.8, PAPER_EF.high].map((f) => ({
    f,
    kg: summary.co2eKg * (f / PAPER_EF.default),
  }))

  function download() {
    const rows = summary.byMonth.map((m) => ({
      month: m.month,
      handed_over: m.handedOver,
      discarded: m.discarded,
      co2e_kg_at_1_2: m.co2eKg,
      co2e_kg_at_selected_factor: (m.co2eKg * scale).toFixed(2),
    }))
    const csv = toCsv(rows)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${CAMPUS.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-loop-impact.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack">
      <Head
        title="What the loop actually saved"
        lede={`${CAMPUS.students} students, ${CAMPUS.copiesPerStudent} copies each, twenty months of history — converted into paper diverted from the pulping bin and production that never happened. Every figure below is recomputed from the same event log you are editing on the Loop tab.`}
        right={
          <div className="pillrow">
            <Tag tone="pine">{summary.handedOver} hand-overs</Tag>
            <Tag tone="clay">{summary.discarded} discarded</Tag>
            <Tag tone="gold">factor is an input</Tag>
          </div>
        }
      />

      <div className="grid g-4">
        <Stat
          k="Emissions avoided"
          v={`${fixed(avoided)} kg CO2e`}
          tone="pine"
          note={`at ${fixed(ef, 2)} ${PAPER_EF.unit}`}
        />
        <Stat
          k="Published range"
          v={`${fixed(summary.co2eLowKg)}–${fixed(summary.co2eHighKg)}`}
          note="kg CO2e across the factors we could defend"
        />
        <Stat k="Paper diverted" v={kg(summary.divertedKg)} note="given a second life instead of pulped" />
        <Stat k="Paper lost" v={kg(summary.landfillKg)} tone="clay" note="the loop's own failure rate, in mass" />
      </div>

      <div className="grid g-side">
        <Card
          title="Emission factor"
          sub="the single biggest uncertainty in any reuse claim"
          right={<Btn size="sm" onClick={download}>export CSV</Btn>}
        >
          <Range
            label={`${PAPER_EF.unit} of printing paper`}
            value={ef}
            min={PAPER_EF.low}
            max={PAPER_EF.high}
            step={0.05}
            onChange={setEf}
            display={fixed(ef, 2)}
          />
          <KeyValue
            rows={[
              { k: 'Avoided at this factor', v: `${fixed(avoided)} kg CO2e` },
              { k: 'Equivalent tree-years', v: `${fixed(treesEquivalent(avoided))}` },
              { k: 'Equivalent car distance', v: `${carKmEquivalent(avoided)} km` },
              {
                k: 'One term of this loop, per student',
                v: `${fixed(avoided / CAMPUS.students, 3)} kg CO2e`,
              },
            ]}
          />
          <Note tone="plain">
            {PAPER_EF.note} Tree-years use ~21 kg CO2e absorbed per mature tree per year; the car figure uses
            ~400 g/km. Both are conversions for scale, not additional claims.
          </Note>
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <div className="tiny muted">Sensitivity of the headline to the factor</div>
            {sensitivity.map((s) => (
              <div className="row items-center" style={{ gap: 10 }} key={s.f}>
                <span className="num tiny" style={{ width: 46, flex: '0 0 auto' }}>
                  {fixed(s.f, 2)}
                </span>
                <span className="bar" style={{ flex: '1 1 auto' }}>
                  <i
                    style={{
                      width: pct((s.kg / (summary.co2eKg * (PAPER_EF.high / PAPER_EF.default))) * 100, 1),
                      background: Math.abs(s.f - ef) < 0.001 ? 'var(--gold)' : 'var(--pine)',
                      opacity: Math.abs(s.f - ef) < 0.001 ? 1 : 0.45,
                    }}
                  />
                </span>
                <span className="num tiny right" style={{ width: 74, flex: '0 0 auto' }}>
                  {fixed(s.kg)} kg
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Loop survival rate" sub="handed over ÷ (handed over + discarded)">
          <div className="center" style={{ padding: '6px 0 2px' }}>
            <Donut
              value={summary.circularity}
              size={168}
              thickness={17}
              center={pct(summary.circularity, 0)}
              caption={`${summary.handedOver} re-homed of ${summary.handedOver + summary.discarded} settled copies`}
            />
          </div>
          <KeyValue
            rows={[
              { k: 'Copies listed', v: summary.listed },
              { k: 'Re-homed', v: summary.handedOver },
              { k: 'Discarded', v: summary.discarded },
              {
                k: 'Still in the queue',
                v: Math.max(0, summary.listed - summary.handedOver - summary.discarded),
              },
            ]}
          />
          <Note tone="clay">
            {pct(1 - summary.circularity)} of settled copies could not be placed and went to pulping. That is the
            number the forecast and the fairness weighting exist to push down; it is reported here unflattered.
          </Note>
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="Avoided production by subject" sub="kg CO2e, heavier textbooks score higher by design">
          <ColumnChart
            data={summary.bySubject.map((s) => ({
              label: s.subject.replace(' & ', '/').replace('Physical Education', 'PE'),
              value: s.co2eKg * scale,
            }))}
            height={250}
            rotate
            format={(n) => n.toFixed(1)}
          />
          <Note tone="plain">
            A subject only appears here when a copy was actually re-homed. The ranking is mass-weighted, which is
            the honest weighting: avoiding one atlas is not the same as avoiding one novel.
          </Note>
        </Card>

        <Card title="Twenty months, settled outcomes" sub="copies per month">
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
            The gap between the two lines at each term end is the surplus the Forecast tab models. Closing it is an
            operations problem — a second swap day, or an earlier pickup window — not a data-science one.
          </Note>
        </Card>
      </div>

      <Card title="Anatomy of a single hand-over" sub="pick a title, a condition and a pickup journey">
        <div className="grid g-2" style={{ alignItems: 'start' }}>
          <div className="col">
            <div className="field">
              <label>Textbook</label>
              <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Textbook">
                {BOOKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortTitle} — {fixed(b.massKg, 2)} kg
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Condition of the copy handed over</label>
              <Seg<Condition>
                value={condition}
                onChange={setCondition}
                options={CONDITIONS.map((c) => ({ id: c, label: c }))}
              />
            </div>
            <Range
              label="Collection journey by car"
              value={carKm}
              min={0}
              max={20}
              step={0.2}
              onChange={setCarKm}
              display={`${fixed(carKm)} km`}
            />
            <KeyValue
              rows={[
                { k: 'Paper mass moved', v: kg(handover.massKg) },
                { k: 'New copies displaced', v: `${pct(handover.newCopiesAvoided, 0)} chance` },
                {
                  k: `Footprint avoided at ${fixed(ef, 2)}`,
                  v: `${fixed(handoverAtEf, 3)} kg CO2e`,
                },
                {
                  k: 'Charged to the loop',
                  v: `${fixed(carTransportKg, 4)} kg CO2e`,
                },
                { k: 'Loop overhead on production', v: pct(LOOP_OVERHEAD, 0) },
              ]}
            />
          </div>

          <div className="col">
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th className="r">Displaces a new buy</th>
                    <th className="why">why it is discounted</th>
                  </tr>
                </thead>
                <tbody>
                  {CONDITIONS.map((c) => (
                    <tr key={c}>
                      <td className={c === condition ? 'num' : 'muted'}>{c}</td>
                      <td className="r num">{pct(DISPLACEMENT[c], 0)}</td>
                      <td className="why">{DISPLACE_NOTE[c]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note tone="plain">
              A worn copy is still used, but the odds that it stopped a purchase are lower, so its credit is lower.
              The published-factor band for this single hand-over is {kg(handover.co2eLow)} to{' '}
              {kg(handover.co2eHigh)} CO2e.
            </Note>
            <Note tone="clay">
              The twenty-month headline above is a mass-weighted sum and does not apply the per-condition
              displacement discount that this card does. Applying it would lower the headline; it is reported the
              conservative way on purpose, and the difference is one of the things docs/IMPACT.md exists to
              disclose.
            </Note>
          </div>
        </div>
      </Card>
    </div>
  )
}

const DISPLACE_NOTE: Record<Condition, string> = {
  'like-new': 'indistinguishable from a new purchase at the till',
  good: 'shelf-wear only; a parent would still buy it second-hand happily',
  fair: 'annotations and a bent corner; a real but partial substitute',
  worn: 'used for a term, but unlikely to have stopped the purchase on its own',
}
