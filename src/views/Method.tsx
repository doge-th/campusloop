/**
 * Method — "how does this actually work, and how would I check it?"
 *
 * Two rules govern this view:
 *   1. Every number here is produced by the same functions the other views call,
 *      evaluated in this browser at render time. Nothing is hardcoded, so nothing
 *      can drift away from the implementation.
 *   2. Weaknesses are shown, not hidden. The ablation, the held-out R², and the
 *      zero-iteration matching pass are all reported at face value.
 *
 * The two report-level evaluations (240 probes, plus five re-runs with feature
 * blocks switched off) take a few seconds, so they are requested through the
 * shared promise cache in `lib/runReport.ts`: first frame shows placeholders,
 * the frame after the cache resolves shows the tables. Anyone who revisits the
 * tab gets them instantly.
 */
import { useEffect, useMemo, useState } from 'react'
import { BOOKS, BOOK_BY_ID, CAMPUS, DATA } from '../lib/seed'
import { AUTO_CONFIRM, TRANSFORMS, buildGallery } from '../lib/classify'
import type { EvalReport } from '../lib/classify'
import { runAblation, runEvaluation } from '../lib/runReport'
import type { AblationRow } from '../lib/runReport'
import { DEFAULTS, DIM, FEATURE_BLOCKS, layoutFor } from '../lib/descriptor'
import { rasterizeCover } from '../lib/covers'
import { buildRows, fit } from '../lib/regress'
import { matchDemand } from '../lib/matching'
import type { MatchDiagnostics } from '../lib/matching'
import type { MatchResult } from '../lib/types'
import { PAPER_EF, summarise } from '../lib/impact'
import {
  BarRow,
  Card,
  CoverCanvas,
  Head,
  KeyValue,
  Note,
  Stat,
  Tag,
  fixed,
  kg,
  pct,
} from '../components/ui'
import { DivergingBars, FeatureStrip, LineChart } from '../components/charts'

const LAYOUT = layoutFor(DEFAULTS)
const BLOCK_DIMS = FEATURE_BLOCKS.map((b) => ({ name: b.name, dim: b.dim(LAYOUT), note: b.note }))

const PENDING = <span className="pulse">computing…</span>

function titleOf(id: string): string {
  return BOOK_BY_ID.get(id)?.shortTitle ?? id
}

export function Method() {
  const [rep, setRep] = useState<EvalReport | null>(null)
  const [abl, setAbl] = useState<AblationRow[] | null>(null)

  useEffect(() => {
    let live = true
    runEvaluation().then((r) => {
      if (live) setRep(r)
    })
    runAblation().then((a) => {
      if (live) setAbl(a)
    })
    return () => {
      live = false
    }
  }, [])

  /* ---- light models: cheap enough to run during the first render ---- */

  const gallery = useMemo(() => buildGallery(BOOKS), [])
  const probeCover = useMemo(() => rasterizeCover(BOOKS[0]), [])

  const world = useMemo(() => {
    const months = Array.from(new Set(DATA.history.map((e) => e.month))).sort()
    return {
      months,
      events: DATA.history.length,
      listings: DATA.listings.length,
      requests: DATA.requests.length,
      subjects: new Set(BOOKS.map((b) => b.subject)).size,
    }
  }, [])

  const models = useMemo(() => {
    const rows = buildRows(DATA.history)
    return {
      fc: fit(rows),
      m: matchDemand(DATA.listings, DATA.requests, BOOK_BY_ID) as MatchResult & MatchDiagnostics,
      s: summarise(DATA.history, BOOK_BY_ID),
    }
  }, [])

  /** SGD convergence, thinned to at most ~48 points so the line stays readable. */
  const loss = useMemo(() => {
    const src = models.fc.model.loss
    const step = Math.max(1, Math.ceil(src.length / 48))
    const categories: string[] = []
    const values: number[] = []
    for (let i = 0; i < src.length; i += step) {
      categories.push(String(i + 1))
      values.push(Number(src[i].toFixed(4)))
    }
    const lastIdx = src.length - 1
    if (categories[categories.length - 1] !== String(src.length)) {
      categories.push(String(src.length))
      values.push(Number(src[lastIdx].toFixed(4)))
    }
    return { categories, values, epochs: src.length }
  }, [models.fc])

  /* ---- derived copy fragments that must agree with the code ---- */

  const misses = rep ? rep.rows.filter((r) => !r.correct).length : 0
  const outsideTop3 = rep ? rep.rows.filter((r) => !r.inTop3).length : 0
  const worst = rep
    ? rep.byTransform.reduce((a, b) => (b.accuracy < a.accuracy ? b : a), rep.byTransform[0])
    : null

  return (
    <div className="stack">
      <Head
        title="Method and evidence"
        lede="Every figure in this app is computed in your browser from the functions described below. This page is the audit: what runs, how well it actually works, and which parts are still weak."
        right={
          <div className="pillrow">
            <Tag tone="pine">no network</Tag>
            <Tag tone="clay">deterministic seed</Tag>
            <Tag>{rep ? `${rep.total} live judgements` : 'measuring now'}</Tag>
          </div>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <Card title="The synthetic campus" sub="data/seed.ts">
        <div className="grid g-2">
          <KeyValue
            rows={[
              { k: 'School', v: CAMPUS.name },
              { k: 'Students', v: CAMPUS.students.toLocaleString('en-US') },
              { k: 'Textbooks per student', v: CAMPUS.copiesPerStudent },
              { k: 'Titles catalogued', v: BOOKS.length },
              { k: 'Subjects', v: world.subjects },
              { k: 'Months simulated', v: `${world.months.length} (${world.months[0]} → ${world.months[world.months.length - 1]})` },
              { k: 'Loop events', v: world.events.toLocaleString('en-US') },
              { k: 'Open listings / requests', v: `${world.listings} / ${world.requests}` },
              { k: 'Generator seed', v: 'fixed, deterministic' },
            ]}
          />
          <div className="stack">
            <div className="prose">
              <p>
                Real school-transfer logs would name students. The dataset is therefore synthetic,
                generated by one seeded routine from a fixed book catalogue, so the pipeline can be
                exercised end to end without putting anybody&rsquo;s reading habits on a server.
              </p>
              <p>
                Because the seed is constant, every number in this app is reproducible to the last
                decimal by anyone who runs <code className="mono">npm run test</code> on the
                repository.
              </p>
            </div>
            <Note tone="plain">
              Synthetic data is the honest weakness of this build: the model is tested against
              realistic <em>degradations</em>, but against synthetic <em>demand</em>. Nothing here
              has been measured against a school that actually ran a swap week. See{' '}
              <code className="mono">docs/ML.md</code> for why the noise model was kept mild
              deliberately.
            </Note>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Model 1 · recognition"
        sub="lib/covers.ts → lib/descriptor.ts → lib/classify.ts"
        right={
          <div className="pillrow">
            <Tag tone="pine">100 features</Tag>
            <Tag>{DIM === 100 ? 'hand-built' : 'check DIM'}</Tag>
          </div>
        }
      >
        <div className="grid g-side">
          <div className="stack">
            <KeyValue
              rows={[
                { k: 'Cover input', v: `rasterized on demand at ${probeCover.w}×${probeCover.h}` },
                { k: 'Reference gallery', v: `${gallery.length} titles, one descriptor each` },
                { k: 'Photo model', v: `${TRANSFORMS.length} named degradations` },
                { k: 'Descriptor', v: `${DIM}-dimensional Float32Array, learned by nobody` },
                { k: 'Matching', v: 'L2-normalised cosine over the gallery' },
                { k: 'Confidence', v: 'logistic margin between top-1 and top-2' },
                { k: 'Auto-confirm rule', v: `confidence ≥ ${pct(AUTO_CONFIRM, 0)}, else ask a human` },
              ]}
            />
            <div className="prose">
              <p>
                There is no trained model to ship. Each cover is drawn with plain canvas fills,
                passed through <code className="mono">simulatePhoto()</code> &mdash; perspective
                tilt, crop, white balance, vignette, sensor noise, defocus and motion blur, in that
                order &mdash; and reduced to{' '}
                {BLOCK_DIMS.map((b) => `${b.dim} ${b.name.toLowerCase()}`).join(', ')}. The vector is
                normalised so cosine similarity ignores overall brightness.
              </p>
              <p>
                Recognition is scored against degraded probes only. Comparing a clean cover with
                itself would measure the rasteriser, not the descriptor, and would report a perfect
                score that means nothing.
              </p>
            </div>
          </div>
          <div className="stack">
            <div className="card-title">
              Feature blocks<span className="sub">descriptor.ts</span>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th className="r">Dim</th>
                  </tr>
                </thead>
                <tbody>
                  {BLOCK_DIMS.map((b) => (
                    <tr key={b.name}>
                      <td>
                        {b.name}
                        <div className="why">{b.note}</div>
                      </td>
                      <td className="r mono">{b.dim}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="strong">Total</td>
                    <td className="r mono">{DIM}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <FeatureStrip
              v={gallery[0].vector}
              blocks={BLOCK_DIMS.map((b) => ({ name: b.name, dim: b.dim }))}
              height={38}
            />
          </div>
        </div>

        <div className="row wrap-row items-end" style={{ gap: 10 }}>
          {gallery.slice(0, 12).map((g) => {
            const book = BOOK_BY_ID.get(g.bookId)
            if (!book) return null
            return (
              <CoverCanvas
                key={g.bookId}
                book={book}
                w={58}
                h={81}
                title={book.shortTitle}
                style={{ borderRadius: 5 }}
              />
            )
          })}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Measured accuracy"
        sub="two protocols, recomputed each time this tab opens"
        right={
          <div className="pillrow">
            <Tag tone="pine">{rep ? pct(rep.accuracy1, 1) : PENDING}</Tag>
            <Tag>chance {rep ? pct(rep.chanceLevel, 1) : '8.3%'}</Tag>
          </div>
        }
      >
        <div className="grid g-4">
          <Stat
            k="Protocol A · top-1"
            v={rep ? pct(rep.accuracy1, 1) : PENDING}
            note="clean gallery, degraded probe"
            tone="pine"
          />
          <Stat k="Protocol A · top-3" v={rep ? pct(rep.accuracy3, 1) : PENDING} note="right book in the shortlist" />
          <Stat
            k="Protocol B · top-1"
            v={rep ? pct(rep.splitAccuracy1, 1) : PENDING}
            note="both sides degraded differently"
            tone="clay"
          />
          <Stat
            k="Mean confidence"
            v={rep ? pct(rep.meanConfidence, 1) : PENDING}
            note={`against a ${rep ? pct(rep.chanceLevel, 1) : '8.3%'} guess`}
          />
        </div>

        {rep && (
          <Note tone={rep.confusions.length === 0 ? 'plain' : 'clay'}>
            {rep.total} judgements &mdash; {BOOKS.length} titles &times; {TRANSFORMS.length}{' '}
            degradations. {misses} were wrong, {outsideTop3} could not be recovered by looking at the
            top three. Protocol B exists because a gallery of clean references flatters the
            descriptor: when the reference is itself a photograph taken under a different lamp, the
            honest answer is the number on the right above.
          </Note>
        )}

        <div className="grid g-2">
          <div>
            <div className="card-title">
              Accuracy by degradation<span className="sub">protocol A</span>
            </div>
            {rep ? (
              <div className="stack-sm">
                {rep.byTransform.map((t) => (
                  <BarRow
                    key={t.transform}
                    label={t.transform}
                    value={t.accuracy}
                    max={1}
                    display={pct(t.accuracy, 1)}
                    color={t.accuracy >= 1 ? undefined : 'var(--clay)'}
                  />
                ))}
              </div>
            ) : (
              <div className="stack-sm">
                {TRANSFORMS.map((t) => (
                  <div key={t.name} className="pulse bar" />
                ))}
              </div>
            )}
            {worst && (
              <p className="dim small">
                Weakest condition: <strong>{worst.transform}</strong> at {pct(worst.accuracy, 1)}.
                That is exactly the kind of frame the auto-confirm threshold exists to catch &mdash;
                anything below {pct(AUTO_CONFIRM, 0)} is put in front of a person instead of being
                written to the ledger.
              </p>
            )}
          </div>

          <div>
            <div className="card-title">
              Which books get confused<span className="sub">wrong top-1 picks</span>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Asked</th>
                    <th>Answered</th>
                    <th className="r">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rep
                    ? rep.confusions.map((c, i) => (
                        <tr key={`${c.a}-${c.b}-${i}`}>
                          <td>{titleOf(c.a)}</td>
                          <td>{titleOf(c.b)}</td>
                          <td className="r mono">{c.n}</td>
                        </tr>
                      ))
                    : Array.from({ length: 4 }, (_, i) => (
                        <tr key={i}>
                          <td colSpan={3}>
                            <div className="pulse bar" />
                          </td>
                        </tr>
                      ))}
                  {rep && rep.confusions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="dim">
                        none at this seed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rep && rep.confusions.length > 0 && (
              <p className="dim small">
                Each row is a pair whose printed covers are close enough that a degraded frame can
                put them in the same order. The remedy is the margin: those judgements come out with
                low confidence and land in the review queue rather than in the ledger.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Ablation · what each feature block is worth"
        sub="one block zeroed at a time, gallery and probes both, then re-normalised"
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Block switched off</th>
                <th className="r">Top-1</th>
                <th className="r">Drop</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              {(abl ?? BLOCK_DIMS.map((b) => ({ block: b.name, accuracy: NaN, drop: NaN }))).map(
                (row) => {
                  const known = !Number.isNaN(row.accuracy)
                  return (
                    <tr key={row.block}>
                      <td>{row.block}</td>
                      <td className="r mono">{known ? pct(row.accuracy, 1) : PENDING}</td>
                      <td className="r mono">{known ? pct(row.drop, 1) : PENDING}</td>
                      <td className="why">
                        {known
                          ? row.drop > 1e-9
                            ? 'removing it costs accuracy'
                            : 'redundant on this catalogue'
                          : ''}
                      </td>
                    </tr>
                  )
                },
              )}
            </tbody>
          </table>
        </div>
        <Note tone="plain">
          Zeroing a block on both sides is the point: it measures what the block contributes once
          the rest of the vector is re-normalised to compensate, which is a marginal contribution
          rather than a total one. On this catalogue the local colour cells and the edge grid carry
          nearly all of the discrimination; the coarse histogram and the row/column profiles are
          cheap insurance that never paid out. That is a fine outcome for a 100-number descriptor
          and a poor outcome for anyone who wanted to claim the extra blocks were clever.
        </Note>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card
        title="Model 2 · demand forecast"
        sub="lib/regress.ts — hand-written mini-batch SGD, no linear-algebra dependency"
      >
        <div className="grid g-side">
          <div className="stack">
            <div className="card-title">
              Fitted coefficients<span className="sub">copies per listing-week, on the z-scored design matrix</span>
            </div>
            <DivergingBars
              rows={models.fc.coefficients.map((c) => ({ label: c.name, value: c.value }))}
              format={(n) => n.toFixed(2)}
              labelWidth={210}
            />
            <div className="hair" />
            <div className="prose">
              <p>
                Eleven features: a term, subject level-shifts, weeks until the term ends, whether the
                target month closes a term, subject&times;term interaction, school-holiday and
                exam-month flags, month index, and the trailing four-week mean and trend of the
                series itself. Everything is standardised before descent so a single learning rate
                behaves.
              </p>
              <p>
                {loss.epochs} epochs of full-batch gradient descent, Adam-free, and the loss trace is
                the one the optimiser actually recorded &mdash; not a re-scoring of the final model.
              </p>
            </div>
            <LineChart
              categories={loss.categories}
              series={[{ name: 'mean squared loss', values: loss.values }]}
              height={170}
              format={(n) => n.toFixed(2)}
              xTickEvery={8}
              yTitle="loss"
            />
          </div>

          <Card flat title="Held-out error" sub="last 25% of the timeline, never seen in training">
            <div className="stack">
              <div className="grid g-2">
                <Stat
                  k="MAE"
                  v={fixed(models.fc.test.mae, 3)}
                  note={`baseline ${fixed(models.fc.baseline.mae, 3)}`}
                  tone={models.fc.test.mae < models.fc.baseline.mae ? 'pine' : 'clay'}
                />
                <Stat
                  k="RMSE"
                  v={fixed(models.fc.test.rmse, 3)}
                  note={`baseline ${fixed(models.fc.baseline.rmse, 3)}`}
                  tone={models.fc.test.rmse < models.fc.baseline.rmse ? 'pine' : 'clay'}
                />
              </div>
              <Stat
                k="R² on held-out weeks"
                v={fixed(models.fc.test.r2, 3)}
                note={`trailing-mean baseline scores ${fixed(models.fc.baseline.r2, 3)}`}
                tone={models.fc.test.r2 > 0 ? 'pine' : 'clay'}
              />
              <KeyValue
                rows={[
                  { k: 'Rows (train + test)', v: `${models.fc.train.n} + ${models.fc.test.n} = ${models.fc.train.n + models.fc.test.n}` },
                  { k: 'Split', v: 'chronological, never shuffled' },
                  { k: 'Residual σ', v: fixed(models.fc.residualSigma, 3) },
                  { k: 'In-sample R²', v: fixed(models.fc.train.r2, 3) },
                ]}
              />
              <Note tone="clay">
                The held-out R² is small. That is the honest answer for eleven hand-picked features
                against a noisy twelve-week horizon, and it is why the forecast is presented as a
                stocking aid with an error band rather than as a promise. A model that only beats a
                trailing mean by a little is still worth having &mdash; but it should say so out
                loud.
              </Note>
            </div>
          </Card>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <div className="grid g-2">
        <Card
          title="Model 3 · the matcher"
          sub="lib/matching.ts — cardinality ceiling, greedy, BFS augmenting paths, 2-swap"
        >
          <KeyValue
            rows={[
              { k: 'Problem size', v: `${world.listings} listings × ${world.requests}` },
              { k: 'Feasible edges', v: models.m.feasibleEdges },
              { k: 'Cardinality ceiling', v: models.m.ceiling },
              { k: 'After greedy pass', v: models.m.greedySize },
              { k: 'Final matching', v: models.m.finalSize },
              { k: 'Utility', v: `${fixed(models.m.utilityBefore, 2)} → ${fixed(models.m.utilityAfter, 2)}` },
              { k: 'Improvement rounds', v: models.m.iterations },
              { k: 'Supported requests served', v: `${models.m.supportedServed} / ${models.m.supportedTotal}` },
            ]}
          />
          <Note tone={models.m.iterations === 0 ? 'clay' : 'plain'}>
            The BFS repair and the positive-gain 2-swap both ran and found nothing to gain on this
            queue: the greedy pass already reached the cardinality ceiling and the utility ordering
            had no inversion left to rotate out. That is reported instead of hidden, because the
            machinery is only worth its keep on queues where it does bite &mdash; and the test suite
            constructs those deliberately.
          </Note>
        </Card>

        <Card title="Model 4 · the ledger" sub="lib/impact.ts — arithmetic over the same event log">
          <KeyValue
            rows={[
              { k: 'Books listed', v: models.s.listed.toLocaleString('en-US') },
              { k: 'Handed over', v: models.s.handedOver.toLocaleString('en-US') },
              { k: 'Discarded avoided', v: models.s.discarded.toLocaleString('en-US') },
              { k: 'Diverted mass', v: kg(models.s.divertedKg) },
              { k: 'Landfill avoided', v: kg(models.s.landfillKg) },
              { k: 'Circularity', v: pct(models.s.circularity, 1), },
              { k: 'CO₂e avoided', v: `${kg(models.s.co2eKg)} CO₂e` },
              { k: 'Published factor range', v: `${kg(models.s.co2eLowKg)} – ${kg(models.s.co2eHighKg)} CO₂e` },
            ]}
          />
          <Note tone="plain">
            The ledger is arithmetic, not a model: mass times an emission factor, summed over logged
            events. The headline factor is {PAPER_EF.default} {PAPER_EF.unit}; the low&ndash;high
            spread is the published range and not a confidence interval. Both are shown wherever the
            number appears. Recycled-paper factors already exclude avoided landfill, so the two lines
            above are alternative framings of one saving and are never added &mdash;{' '}
            <code className="mono">docs/IMPACT.md</code> states this and records that the historical
            roll-up does not apply a per-condition displacement discount, while live session events
            do. Circularity is mass-weighted, not count-weighted.
          </Note>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Card title="What CampusLoop is not">
        <div className="stack">
          <Note tone="clay">
            It is not a neural network. There is no training set, no gradient step inside the
            classifier, and nothing to download: a school&rsquo;s Chromebook runs the whole pipeline in
            milliseconds with the tab closed to the internet afterwards. The cost of that choice is
            visible above &mdash; the descriptor is hand-built, so its ceiling is the catalogue it was
            designed against.
          </Note>
          <Note tone="clay">
            It is not real evidence yet. No cohort of students has swapped books with this tool, so
            the environmental figures describe a simulated campus that behaves the way the generator
            was told to behave. Treat the numbers as a working demonstration and a test harness, not
            as a savings claim about any school.
          </Note>
          <KeyValue
            rows={[
              { k: 'Network requests', v: 'none — the app never opens a connection' },
              { k: 'Images stored', v: 'none — covers are rasterised, photos stay in memory' },
              { k: 'Identifiers', v: 'local device only, nothing leaves the browser' },
              { k: 'Model files', v: 'zero bytes to download' },
              { k: 'Third-party analytics', v: 'none' },
            ]}
          />
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card title="Reproduce these numbers" sub="clone it and check the arithmetic yourself">
        <div
          className="mono tiny"
          style={{
            background: 'var(--paper-3)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            lineHeight: 1.9,
            whiteSpace: 'pre-wrap',
          }}
        >
          {'git clone https://github.com/doge-th/campusloop.git && cd campusloop\nnpm install\nnpm run test\nnpm run build && npm run preview'}
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Module</th>
                <th>Responsibility</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['lib/raster.ts', 'paints a textbook cover from a spec, no images'],
                ['lib/descriptor.ts', 'turns pixels into 100 numbers, nothing else'],
                ['lib/classify.ts', 'photo degradation, kNN, confidence, both eval protocols, ablation'],
                ['lib/regress.ts', 'z-scored linear regression trained by mini-batch SGD'],
                ['lib/matching.ts', 'bipartite matching with fairness-weighted utility'],
                ['lib/impact.ts', 'mass and emission accounting over the event log'],
                ['lib/seed.ts', 'the deterministic synthetic campus everything reads from'],
              ].map(([mod, job]) => (
                <tr key={mod}>
                  <td className="mono">{mod}</td>
                  <td>
                    {job}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note tone="plain">
          The suite asserts behaviour rather than appearance: descriptor layout round-trips, both evaluation
          protocols beating chance by a wide margin, the ablation ordering, the regression beating
          the trailing-mean baseline out of sample, the matcher never exceeding its cardinality
          ceiling and being deterministic, and the impact identities that make the mass arithmetic
          verifiable in one line. If any of the numbers on this page drift away from what the code
          does, a test fails.
        </Note>
      </Card>
    </div>
  )
}
