/**
 * Presentational primitives for CampusLoop.
 *
 * There is deliberately no component library here: every element is a thin
 * wrapper over the hand-written design system in `styles/global.css`. That
 * keeps the shipped bundle small (the whole app is one JS chunk plus this
 * stylesheet) and makes the visual language auditable line by line.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Book } from '../lib/types'
import type { PhotoOptions } from '../lib/raster'
import { blitToCanvas, simulatePhoto } from '../lib/raster'
import { rasterizeCover } from '../lib/covers'

/* ------------------------------------------------------------------ format */

export function pct(x: number, digits = 1): string {
  return (100 * x).toFixed(digits) + '%'
}

export function fixed(x: number, digits = 1): string {
  return x.toFixed(digits)
}

export function kg(x: number): string {
  return x >= 100 ? x.toFixed(0) + ' kg' : x.toFixed(1) + ' kg'
}

export function signed(x: number, digits = 3): string {
  return (x >= 0 ? '+' : '') + x.toFixed(digits)
}

/* -------------------------------------------------------------------- card */

export function Card(props: {
  title?: ReactNode
  sub?: ReactNode
  right?: ReactNode
  flat?: boolean
  pad0?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const cls = ['card', props.flat ? 'card-flat' : '', props.pad0 ? 'pad-0' : '', props.className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <section className={cls} style={props.style}>
      {props.title !== undefined && (
        <div className="card-title">
          <h3>{props.title}</h3>
          {props.sub && <span className="sub">{props.sub}</span>}
          <span className="spacer" />
          {props.right}
        </div>
      )}
      {props.children}
    </section>
  )
}

export function Head(props: { title: ReactNode; lede: ReactNode; right?: ReactNode }) {
  return (
    <div className="head row items-end justify-between" >
      <div>
        <h1>{props.title}</h1>
        <div className="lede">{props.lede}</div>
      </div>
      {props.right}
    </div>
  )
}

/* -------------------------------------------------------------- statistics */

export function Stat(props: { k: ReactNode; v: ReactNode; note?: ReactNode; tone?: 'pine' | 'clay' }) {
  return (
    <div className="stat">
      <span className="stat-k">{props.k}</span>
      <span className={'stat-v' + (props.tone ? ' ' + props.tone : '')}>{props.v}</span>
      {props.note && <span className="stat-note">{props.note}</span>}
    </div>
  )
}

export function Kpi(props: { k: ReactNode; v: ReactNode; note?: ReactNode; tone?: 'pine' | 'clay'; right?: ReactNode }) {
  return (
    <Card className="kpi">
      <div className="kpi-top">
        <Stat k={props.k} v={props.v} tone={props.tone} />
        {props.right}
      </div>
      {props.note && <span className="stat-note">{props.note}</span>}
    </Card>
  )
}

export function BarRow(props: { label: ReactNode; value: number; max: number; display?: ReactNode; color?: string }) {
  const w = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0
  return (
    <div className="row items-center" style={{ gap: 10 }}>
      <span className="tiny muted nowrap" style={{ width: 132, flex: '0 0 auto' }}>{props.label}</span>
      <span className="bar" style={{ flex: '1 1 auto' }}>
        <i style={{ width: (w * 100).toFixed(1) + '%', background: props.color }} />
      </span>
      <span className="num tiny right nowrap" style={{ width: 62, flex: '0 0 auto' }}>
        {props.display ?? props.value}
      </span>
    </div>
  )
}

export function Meter(props: { value: number; tone?: 'pine' | 'clay' }) {
  const v = Math.max(0, Math.min(1, props.value))
  return (
    <span className="bar" style={{ display: 'block' }} aria-hidden>
      <i style={{ width: (v * 100).toFixed(1) + '%', background: `var(--${props.tone === 'clay' ? 'clay' : 'pine'})` }} />
    </span>
  )
}

/* ------------------------------------------------------------------- atoms */

export function Tag(props: { tone?: 'pine' | 'clay' | 'gold' | 'plum' | 'on'; children: ReactNode; title?: string }) {
  return (
    <span className={'tag' + (props.tone ? ' ' + props.tone : '')} title={props.title}>
      {props.children}
    </span>
  )
}

export function Dot(props: { color: string }) {
  return <span className="dot" style={{ background: props.color }} />
}

export function Btn(props: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'clay' | 'ghost'
  size?: 'sm'
  disabled?: boolean
  title?: string
}) {
  const cls = [
    'btn',
    props.variant ?? '',
    props.size ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.children}
    </button>
  )
}

export function Field(props: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
      {props.hint && <span className="tiny dim">{props.hint}</span>}
    </div>
  )
}

export function Range(props: {
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display?: ReactNode
}) {
  return (
    <div className="field">
      <label>
        {props.label}
        <span className="num" style={{ float: 'right', color: 'var(--ink)' }}>
          {props.display ?? props.value}
        </span>
      </label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Note(props: { tone?: 'clay' | 'plain'; children: ReactNode }) {
  const cls = 'note' + (props.tone ? ' ' + props.tone : '')
  return <div className={cls}>{props.children}</div>
}

export function Empty(props: { children: ReactNode }) {
  return (
    <div className="card card-flat center" style={{ padding: 26, color: 'var(--ink-3)' }}>
      {props.children}
    </div>
  )
}

export function Seg<T extends string>(props: {
  value: T
  options: { id: T; label: ReactNode }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="seg" role="group">
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === props.value}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function KeyValue(props: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="kv">
      {props.rows.map((r, i) => (
        <div className="kv-row" key={i}>
          <dt>{r.k}</dt>
          <dd className="num right">{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------------------------ canvas */

/**
 * Renders a catalogue cover entirely in software.
 *
 * `rasterizeCover`/`simulatePhoto` are pure TypeScript (no canvas 2D API, no
 * SVG, no network), which is what makes the recognition demo honest: the exact
 * pixels shown here are the exact pixels the descriptor is computed from.
 */
export function CoverCanvas(props: {
  book: Book
  w?: number
  h?: number
  photo?: PhotoOptions
  className?: string
  style?: CSSProperties
  title?: string
}) {
  const w = props.w ?? 120
  const h = props.h ?? 168
  const ref = useRef<HTMLCanvasElement | null>(null)
  const photo = props.photo

  const img = useMemo(() => {
    const clean = rasterizeCover(props.book, w, h)
    return photo ? simulatePhoto(clean, photo) : clean
  }, [props.book, w, h, photo])

  useEffect(() => {
    if (ref.current) blitToCanvas(ref.current, img, 1)
  }, [img])

  return (
    <canvas
      ref={ref}
      className={'cover' + (props.className ? ' ' + props.className : '')}
      style={{ width: w, height: h, ...props.style }}
      role="img"
      aria-label={props.title ?? `${props.book.title} cover`}
    />
  )
}
