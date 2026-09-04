import { useMemo, useState } from 'react'
import type { ForecastPoint, Subject } from '../lib/types'
import { DATA } from '../lib/seed'
import type { FittedForecast, Row } from '../lib/regress'
import { buildRows, fit, forecastSubjects, predict, SPLIT } from '../lib/regress'
import { DivergingBars, IntervalChart, LineChart } from '../components/charts'
import { Card, Head, KeyValue, Note, Stat, Tag, fixed, pct } from '../components/ui'

/**
 * Forecast tab: what the model thinks will be left over at the end of term.
 *
 * Fitting 11 models (one pooled + ten per-subject) through hand-written SGD is
 * ~200 ms of maths. That is too much to redo on every keystroke of the subject
 * selector but too little to justify a loading state, so the expensive part is
 * cached at module level and only the single re-fit for the drilled subject runs
 * inside the render path.
 */

interface Bundle {
  rows: Row[]
  pooled: FittedForecast
  points: ForecastPoint[]
}

let cache: Bundle | null = null

function heavy(): Bundle {
  if (!cache) {
    const rows = buildRows(DATA.history)
    cache = { rows, pooled: fit(rows), points: forecastSubjects(rows, DATA.history) }
  }
  return cache
}

export function Forecast() {
  const P = useMemo(heavy, [])
  const subjects = useMemo(() => P.points.map((p) => p.subject), [P.points])
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'Mathematics')

  const drilled = useMemo(() => fit(P.rows, subject), [P.rows, subject])
  const series = useMemo(() => buildSeries(P.rows, drilled, subject), [P.rows, drilled, subject])

  const t = drilled.test
  const b = drilled.baseline
  const maeGain = b.mae === 0 ? 0 : (b.mae - t.mae) / b.mae
  const pooledGain =
    P.pooled.baseline.mae === 0 ? 0 : (P.pooled.baseline.mae - P.pooled.test.mae) / P.pooled.baseline.mae

  const intervalRows = P.points.map((p) => ({
    label: p.subject,
    predicted: p.predictedSurplus,
    lower: p.lower,
    upper: p.upper,
    actual: p.actualLastTerm,
  }))

  const hit = P.points.filter((p) => p.actualLastTerm >= p.lower && p.actualLastTerm <= p.upper).length

  return (
    <div className="stack">
      <Head
        title="End-of-term surplus forecast"
        lede={
          <>
            Per subject, how many copies we expect to be unable to re-home when the term closes. This is the
            number that decides whether to run a second swap day or book the pulping collection, so it is a
            real regression with a real holdout — not a smoothing of the line you can already see.
          </>
        }
        right={
          <div className="pillrow">
            <Tag tone="plum">mini-batch SGD</Tag>
            <Tag tone="on">{P.rows.length} subject-months</Tag>
            <Tag>{pct(SPLIT, 0)} / {pct(1 - SPLIT, 0)} time split</Tag>
          </div>
        }
      />

      <div className="grid g-4">
        <Stat
          k="Test MAE"
          v={fixed(t.mae, 3)}
          tone={t.mae < b.mae ? 'pine' : 'clay'}
          note={`mean-value baseline ${fixed(b.mae, 3)} — ${maeGain >= 0 ? 'down' : 'up'} ${pct(Math.abs(maeGain), 1)}`}
        />
        <Stat
          k="Test RMSE"
          v={fixed(t.rmse, 3)}
          tone={t.rmse < b.rmse ? 'pine' : 'clay'}
          note={`baseline ${fixed(b.rmse, 3)}`}
        />
        <Stat
          k="Test R²"
          v={fixed(t.r2, 3)}
          tone={t.r2 > b.r2 ? 'pine' : 'clay'}
          note={`baseline ${fixed(b.r2, 3)} · ${t.n} held-out months`}
        />
        <Stat
          k="Interval coverage"
          v={`${hit}/${P.points.length}`}
          note="subjects whose actual last-term surplus fell inside the plotted 80% band"
        />
      </div>

      <Card
        title="Predicted surplus next month, per subject"
        sub="bar = prediction, whisker = 80% interval from the holdout residuals, diamond = what actually happened last term"
      >
        <IntervalChart rows={intervalRows} format={(n) => fixed(n, 0)} />
        <Note tone="plain">
          The interval is ±1.2816 × the holdout residual spread, so it is honest about how uncertain these
          numbers are. Where the diamond sits outside the whisker, the model was wrong for that subject —
          the ranking is still what we use for planning, but nobody should treat a single subject as precise.
        </Note>
      </Card>

      <div className="grid g-side">
        <Card
          title={`Drill-down: ${subject}`}
          sub="actual discards against the fitted line; the holdout starts where the model stopped seeing data"
          right={
            <select
              aria-label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          }
        >
          <LineChart
            categories={series.categories}
            series={series.series}
            height={268}
            zeroFloor
            xTickEvery={2}
            format={(n) => fixed(n, 0)}
            yTitle="copies discarded"
          />
          <KeyValue
            rows={[
              { k: 'Training rows', v: drilled.train.n },
              { k: 'Held-out rows', v: drilled.test.n },
              { k: 'Split month', v: series.cutMonth },
              { k: 'Residual spread σ', v: fixed(drilled.residualSigma, 3) },
              { k: 'In-sample R²', v: fixed(drilled.train.r2, 3) },
              { k: 'Out-of-sample R²', v: fixed(drilled.test.r2, 3) },
            ]}
          />
        </Card>

        <div className="col">
          <Card title="What moves the number" sub="pooled model, copies per unit of feature">
            <DivergingBars
              rows={P.pooled.coefficients.map((c) => ({
                label: c.name,
                value: c.value,
                note: `${c.name}: ${signed(c.value)} copies`,
              }))}
              format={(n) => fixed(n, 2)}
              labelWidth={190}
            />
            <Note tone="plain">
              Coefficients are rescaled into original units, so they read as "each extra unsold copy is worth
              {` ${signed(largest(P.pooled.coefficients))} `} discards next month". The calendar terms dominate because that
              is what the school's disposal rule does: surplus is only written off when a term closes.
            </Note>
          </Card>

          <Card title="Convergence" sub="training MSE logged every 4 epochs">
            <LineChart
              categories={drilled.model.loss.map((_, i) => String(i * 4))}
              series={[{ name: 'train MSE', values: drilled.model.loss, color: 'var(--plum)' }]}
              height={170}
              xTickEvery={Math.ceil(drilled.model.loss.length / 6)}
              format={(n) => fixed(n, 1)}
              yTitle="MSE"
            />
            <KeyValue
              rows={[
                { k: 'Epochs', v: drilled.model.options.epochs },
                { k: 'Learning rate', v: fixed(drilled.model.options.lr, 3) },
                { k: 'Batch', v: drilled.model.options.batch },
                { k: 'L2', v: drilled.model.options.l2.toExponential(0) },
                { k: 'Seed', v: drilled.model.options.seed },
              ]}
            />
          </Card>
        </div>
      </div>

      <Card title="How this model is allowed to be judged" flat>
        <Note tone="clay">
          Out-of-sample R² for the pooled campus-wide model is {fixed(P.pooled.test.r2, 3)} (baseline{' '}
          {fixed(P.pooled.baseline.r2, 3)}), and the pooled model beats the mean-value baseline on MAE by{' '}
          {pct(pooledGain, 1)}. That is a modest fit and we are not going to pretend otherwise: 20 months of a
          single synthetic campus is {P.rows.length} rows, and term-timing dominates everything else. What we
          claim is narrower and more useful — a strictly time-ordered holdout, no feature that looks into the
          target month, and a baseline the model has to beat before the number appears on this screen.
        </Note>
      </Card>
    </div>
  )
}

function largest(cs: { name: string; value: number }[]) {
  return cs.reduce((best, c) => (Math.abs(c.value) > Math.abs(best.value) ? c : best), cs[0]).value
}

function signed(x: number): string {
  return (x >= 0 ? '+' : '') + x.toFixed(2)
}

/**
 * Actual / in-sample fitted / out-of-sample predicted on one axis.
 *
 * The two model series are deliberately mutually exclusive (nulls where the
 * other lives) so the chart cannot accidentally present the fitted line as a
 * forecast — the break in the line *is* the holdout.
 */
function buildSeries(rows: Row[], f: FittedForecast, subject: Subject) {
  const sel = rows
    .filter((r) => r.subject === subject)
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  const cut = Math.max(4, Math.floor(sel.length * SPLIT))
  const actual = sel.map((r) => r.target)
  const fitted = sel.map((r, i) => (i < cut ? round2(predict(f.model, r.features)) : null))
  const predicted = sel.map((r, i) => (i >= cut ? round2(predict(f.model, r.features)) : null))
  return {
    categories: sel.map((r) => r.month),
    cutMonth: sel[cut]?.month ?? '—',
    series: [
      { name: 'actual', values: actual, color: 'var(--ink-2)' },
      { name: 'in-sample fit', values: fitted, color: 'var(--plum)', dashed: true },
      { name: 'held-out prediction', values: predicted, color: 'var(--pine)' },
    ],
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}
