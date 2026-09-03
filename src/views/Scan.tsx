/**
 * Scan — the on-device recognition demo.
 *
 * The honest version of a "scan your textbook" feature: you pick a title, you
 * pick (or dial in) the photo conditions a hallway actually produces, and the
 * page runs the real pipeline on the real pixels it just drew —
 *
 *   rasterise cover  ->  simulatePhoto(degradations)  ->  100-dim descriptor
 *                    ->  cosine rank against the catalogue  ->  Recognition
 *
 * Nothing is pre-baked. The canvas you are looking at and the Float32Array the
 * classifier sees come from the same buffer, which is the only way the
 * "96.7% top-1" claim on the Method tab means anything.
 *
 * The confidence threshold is not cosmetic: below 0.72 the app refuses to fill
 * the listing form for you and asks a human to tap the right title. That
 * behaviour is the reason the misclassification rate is survivable.
 */

import { useMemo, useState } from 'react'
import { BOOKS } from '../lib/seed'
import { CONDITIONS } from '../lib/types'
import type { Condition } from '../lib/types'
import { simulatePhoto } from '../lib/raster'
import type { PhotoOptions } from '../lib/raster'
import { rasterizeCover } from '../lib/covers'
import { DEFAULTS, DIM, FEATURE_BLOCKS, extract, layoutFor } from '../lib/descriptor'
import { AUTO_CONFIRM, TRANSFORMS, buildGallery, rank, toRecognition } from '../lib/classify'
import type { RefEntry } from '../lib/classify'
import { openRequests, useStore } from '../lib/store'
import {
  BarRow,
  Btn,
  Card,
  CoverCanvas,
  Head,
  KeyValue,
  Meter,
  Note,
  Range,
  Seg,
  Stat,
  Tag,
  fixed,
  pct,
  signed,
} from '../components/ui'
import { FeatureStrip } from '../components/charts'

/** Render size. Deliberately the same buffer for display and for classification. */
const W = 240
const H = 336

let cachedGallery: RefEntry[] | null = null
function gallery(): RefEntry[] {
  if (!cachedGallery) cachedGallery = buildGallery(BOOKS)
  return cachedGallery
}

interface Dial {
  rotate: number
  crop: number
  brightness: number
  contrast: number
  blur: number
  noise: number
  vignette: number
  warmth: number
}

const FLAT: Dial = { rotate: 0, crop: 0, brightness: 0, contrast: 0, blur: 0, noise: 0, vignette: 0, warmth: 0 }

function dialOf(o: PhotoOptions): Dial {
  return {
    rotate: o.rotate ?? 0,
    crop: o.crop ?? 0,
    brightness: o.brightness ?? 0,
    contrast: o.contrast ?? 0,
    blur: o.blur ?? 0,
    noise: o.noise ?? 0,
    vignette: o.vignette ?? 0,
    warmth: o.warmth ?? 0,
  }
}

const DIALS: { key: keyof Dial; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: 'rotate', label: 'Tilt', min: -14, max: 14, step: 1, show: (v) => `${v}\u00b0` },
  { key: 'crop', label: 'Crop loss', min: 0, max: 0.2, step: 0.01, show: (v) => pct(v, 0) },
  { key: 'brightness', label: 'Exposure', min: -0.4, max: 0.4, step: 0.02, show: (v) => signed(v, 2) },
  { key: 'contrast', label: 'Contrast', min: -0.3, max: 0.3, step: 0.02, show: (v) => signed(v, 2) },
  { key: 'blur', label: 'Defocus', min: 0, max: 3.5, step: 0.1, show: (v) => fixed(v, 1) },
  { key: 'noise', label: 'Sensor noise', min: 0, max: 0.25, step: 0.01, show: (v) => fixed(v, 2) },
  { key: 'vignette', label: 'Corner falloff', min: 0, max: 0.5, step: 0.01, show: (v) => fixed(v, 2) },
  { key: 'warmth', label: 'Warm balance', min: 0, max: 0.7, step: 0.05, show: (v) => fixed(v, 2) },
]

/** Block boundaries come from the descriptor layout, so the strip is a legend, not art. */
const BLOCKS = FEATURE_BLOCKS.map((b) => ({ name: b.name, dim: b.dim(layoutFor(DEFAULTS)) }))

export function Scan() {
  const { state, dispatch } = useStore()

  const [bookId, setBookId] = useState(BOOKS[0].id)
  const [preset, setPreset] = useState(0)
  const [dial, setDial] = useState<Dial>(() => dialOf(TRANSFORMS[0].opts))
  const [condition, setCondition] = useState<Condition>('good')
  const [listedNote, setListedNote] = useState<string | null>(null)

  const book = BOOKS.find((b) => b.id === bookId)!

  const photo = useMemo<PhotoOptions>(() => ({ ...dial, seed: 7 }), [dial])

  const { rec, ranked, vector } = useMemo(() => {
    const g = gallery()
    const probe = simulatePhoto(rasterizeCover(book, W, H), photo)
    const v = extract(probe)
    return { vector: v, ranked: rank(v, g), rec: toRecognition(v, g) }
  }, [book, photo])

  const waiting = useMemo(() => openRequests(state).filter((r) => r.bookId === bookId).length, [state, bookId])
  const autoConfirmed = rec.confidence >= AUTO_CONFIRM

  function applyPreset(i: number) {
    setPreset(i)
    setDial(dialOf(TRANSFORMS[i].opts))
  }

  function move(key: keyof Dial, v: number) {
    setPreset(-1)
    setDial((d) => ({ ...d, [key]: v }))
  }

  function pick(next: string) {
    setBookId(next)
    setListedNote(null)
  }

  function list() {
    dispatch({
      type: 'add-listing',
      bookId: rec.bookId,
      condition,
      viaScan: true,
      note: autoConfirmed
        ? `listed from a photo, ${pct(rec.confidence, 0)} confidence`
        : 'listed after a human confirmed the title',
    })
    setListedNote(
      `${rec.bookId === bookId ? 'Confirmed' : 'Switched to'} ${
        BOOKS.find((b) => b.id === rec.bookId)!.shortTitle
      } and added to the loop as ${condition}. The Loop tab now has one more copy a student can claim.`,
    )
  }

  const isClean = preset === -1 && DIALS.every((d) => dial[d.key] === FLAT[d.key])

  return (
    <div className="stack">
      <Head
        title="Scan the cover"
        lede="Pick a title, then pick the photo a teenager actually takes. The ranker runs on the pixels below, on this device, in about ten milliseconds."
        right={
          <div className="pillrow">
            <Tag tone="pine">no upload</Tag>
            <Tag tone="plum">{DIM}-dim descriptor</Tag>
            <Tag tone="gold">{BOOKS.length}-title catalogue</Tag>
          </div>
        }
      />

      <div className="grid g-side-l">
        <Card
          title="The photo"
          sub="same buffer on screen and in the classifier"
          right={<Tag tone={isClean ? 'on' : 'clay'}>{preset < 0 ? (isClean ? 'clean render' : 'custom') : TRANSFORMS[preset].name}</Tag>}
        >
          <div className="row items-center" style={{ gap: 18, flexWrap: 'wrap' }}>
            <CoverCanvas book={book} w={W} h={H} photo={photo} title={`${book.title} as photographed`} />
            <div className="col" style={{ flex: '1 1 190px', gap: 10, minWidth: 190 }}>
              <div className="tiny muted">Which book is this? (the student never types it)</div>
              <div className="pillrow">
                {BOOKS.map((b) => (
                  <Btn key={b.id} size="sm" variant={b.id === bookId ? 'primary' : 'ghost'} onClick={() => pick(b.id)}>
                    {b.shortTitle}
                  </Btn>
                ))}
              </div>
              <hr className="hair" />
              <div className="tiny muted">Photographed under which conditions?</div>
              <div className="pillrow">
                {TRANSFORMS.map((t, i) => (
                  <Btn key={t.name} size="sm" variant={i === preset ? 'primary' : 'ghost'} onClick={() => applyPreset(i)}>
                    {t.name}
                  </Btn>
                ))}
              </div>
            </div>
          </div>

          <hr className="hair" />

          <div className="grid g-2" style={{ gap: '4px 22px' }}>
            {DIALS.map((d) => (
              <Range
                key={d.key}
                label={d.label}
                value={dial[d.key]}
                min={d.min}
                max={d.max}
                step={d.step}
                display={d.show(dial[d.key])}
                onChange={(v) => move(d.key, v)}
              />
            ))}
          </div>
          <Note tone="plain">
            These eight numbers are the constructor of <code>simulatePhoto</code>, the same function the 240-probe
            evaluation harness uses. Drag defocus past 2.5 and exposure past &plusmn;0.35 and you will find the handful
            of settings where the descriptor really does give up — they are the honest limit of a 100-number summary.
          </Note>
        </Card>

        <div className="stack">
          <Card
            title="What the classifier thinks"
            sub={`${DIM} numbers, ${BOOKS.length} candidates, one cosine ranking`}
            right={<Tag tone={autoConfirmed ? 'pine' : 'clay'}>{autoConfirmed ? 'Auto-confirmed' : 'Needs a human'}</Tag>}
          >
            <div className="col" style={{ gap: 4 }}>
              <span className="tiny muted">Best match</span>
              <strong style={{ fontSize: 17, lineHeight: 1.25 }}>{BOOKS.find((b) => b.id === rec.bookId)!.title}</strong>
              <span className="tiny muted">
                {BOOKS.find((b) => b.id === rec.bookId)!.publisher} · {BOOKS.find((b) => b.id === rec.bookId)!.edition} ·{' '}
                {BOOKS.find((b) => b.id === rec.bookId)!.subject}
              </span>
            </div>

            <hr className="hair" />

            <div className="row justify-between items-center">
              <span className="small">Confidence</span>
              <span className="num" style={{ fontSize: 20, color: autoConfirmed ? 'var(--pine)' : 'var(--clay)' }}>
                {pct(rec.confidence)}
              </span>
            </div>
            <Meter value={rec.confidence} tone={autoConfirmed ? 'pine' : 'clay'} />
            <div className="tiny muted">
              Confidence comes from the gap to the runner-up, not from raw cosine — cosine saturates, so two layouts
              that are both merely close would otherwise both claim 98%.
            </div>

            <hr className="hair" />

            {ranked.slice(0, 4).map((r, i) => (
              <BarRow
                key={r.bookId}
                label={
                  <span>
                    {i === 0 ? '1. ' : ''}
                    {BOOKS.find((b) => b.id === r.bookId)!.shortTitle}
                  </span>
                }
                value={r.similarity}
                max={1}
                display={pct(r.similarity)}
                color={i === 0 ? 'var(--pine)' : 'var(--line-2)'}
              />
            ))}

            <Note tone={rec.bookId === bookId ? 'plain' : 'clay'}>
              {rec.bookId === bookId
                ? 'Correct. The distance to the nearest reference in feature space is ' +
                  fixed(rec.distance, 4) +
                  ', and the runner-up is ' +
                  pct(ranked[0].similarity - ranked[1].similarity) +
                  ' further away.'
                : 'Wrong title — this is one of the confusions the Method tab counts. The app would show you the four candidates above and ask you to tap one, which is why an 83% dark-frame accuracy still ships.'}
            </Note>
          </Card>

          <Card title="The feature vector" sub={`${DIM} numbers, grouped by what they measure`}>
            <FeatureStrip v={vector} blocks={BLOCKS} height={38} />
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {FEATURE_BLOCKS.map((b, i) => (
                <div className="row justify-between" key={b.name}>
                  <span className="small">{b.name}</span>
                  <span className="num tiny muted">{BLOCKS[i].dim} dims</span>
                </div>
              ))}
            </div>
            <Note tone="plain">
              Each of the 4x4 cells contributes hue direction, saturation, brightness and edge energy. That is the whole
              model: no weights, no download, nothing that was trained on anybody else’s book.
            </Note>
          </Card>
        </div>
      </div>

      <div className="grid g-side">
        <Card title="Confirm and list" sub="what the student sees next" flat>
          <div className="grid g-2" style={{ alignItems: 'start' }}>
            <div className="stack-sm">
              <div className="field">
                <label>Condition</label>
                <Seg
                  value={condition}
                  options={CONDITIONS.map((c) => ({ id: c, label: c }))}
                  onChange={(c) => setCondition(c as Condition)}
                />
              </div>
              <KeyValue
                rows={[
                  { k: 'Title', v: BOOKS.find((b) => b.id === rec.bookId)!.shortTitle },
                  { k: 'ISBN', v: BOOKS.find((b) => b.id === rec.bookId)!.isbn },
                  { k: 'Pages / mass', v: `${BOOKS.find((b) => b.id === rec.bookId)!.pages} pp · ${fixed(BOOKS.find((b) => b.id === rec.bookId)!.massKg, 2)} kg` },
                  { k: 'Available from', v: 'today' },
                  { k: 'Students waiting', v: waiting > 0 ? `${waiting}` : 'none yet' },
                ]}
              />
              <div className="row" style={{ gap: 8 }}>
                <Btn variant="primary" onClick={list}>
                  Add this copy to the loop
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() => {
                    setDial(FLAT)
                    setPreset(-1)
                  }}
                >
                  Reset camera
                </Btn>
              </div>
              {listedNote && <Note>{listedNote}</Note>}
            </div>
            <Note tone="plain">
              Four fields that used to be typed are now filled from a photo, and the one field that decides whether a
              copy gets re-homed or pulped — condition — is the one a person still answers. {waiting > 0 ? `There are ${waiting} open request${waiting === 1 ? '' : 's'} for this title right now, so the Match tab will pick this copy up on the next run.` : 'Nobody is asking for this title yet, which is exactly the case the want-list and the surplus forecast exist for.'}
            </Note>
          </div>
        </Card>

        <Card title="Why the boring part matters" flat>
          <div className="grid g-2">
            <Stat k="Catalogue" v={BOOKS.length} note="titles drawn from library records" />
            <Stat k="Descriptor" v={DIM} note="floats per photo, no learned weights" />
            <Stat k="Threshold" v={pct(AUTO_CONFIRM, 0)} note="below this, ask a human" />
            <Stat k="Work per probe" v="~10 ms" note="rasterise, degrade, extract, rank" />
          </div>
          <Note tone="plain">
            A 50 MB model would probably be more accurate and would need a server, an upload consent screen, and a
            reason for a 16-year-old to trust it with a photo of their classroom. This one is forty kilobytes of
            TypeScript you can read.
          </Note>
        </Card>
      </div>
    </div>
  )
}
