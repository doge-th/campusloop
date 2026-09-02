import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { StoreProvider } from './lib/store'
import { Overview } from './views/Overview'
import { Scan } from './views/Scan'
import { Loop } from './views/Loop'
import { Match } from './views/Match'
import { Forecast } from './views/Forecast'
import { Impact } from './views/Impact'
import { Method } from './views/Method'

/**
 * Application shell: a tab bar that doubles as a router.
 *
 * Tabs are mirrored into `location.hash` so any screen can be deep-linked. That
 * matters for two things — a reviewer can jump straight to the evidence they
 * care about, and the demo recording can capture each screen as its own URL.
 */

interface Tab {
  id: string
  label: string
  hint: string
  render: () => ReactNode
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', hint: 'What the loop looks like today', render: () => <Overview /> },
  { id: 'scan', label: 'Scan', hint: 'On-device textbook recognition', render: () => <Scan /> },
  { id: 'loop', label: 'Loop', hint: 'Listings and requests', render: () => <Loop /> },
  { id: 'match', label: 'Match', hint: 'Fairness-aware allocation', render: () => <Match /> },
  { id: 'forecast', label: 'Forecast', hint: 'Next-term surplus by subject', render: () => <Forecast /> },
  { id: 'impact', label: 'Impact', hint: 'Waste and CO2e kept out of landfill', render: () => <Impact /> },
  { id: 'method', label: 'Method', hint: 'How it works and what it does not', render: () => <Method /> },
]

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F6B4F" />
      <path d="M11 12a6 6 0 1 1 1.2 7.1" fill="none" stroke="#F6F1E4" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9.4 15.2 11 19.6l4.3-1.4" fill="none" stroke="#F6F1E4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function readHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '')
  return TABS.some((t) => t.id === h) ? h : 'overview'
}

export default function App() {
  const [tab, setTab] = useState<string>(() => readHash())

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (readHash() !== tab) window.location.hash = '/' + tab
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [tab])

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <StoreProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <BrandMark />
            <div>
              <div className="brand-name">CampusLoop</div>
              <div className="brand-sub">Keep textbooks in the loop</div>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tab"
                aria-current={t.id === tab ? 'page' : undefined}
                title={t.hint}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="wrap">
          <div key={active.id} className="reveal">
            {active.render()}
          </div>
        </main>

        <footer className="foot">
          <span>
            CampusLoop — synthetic demonstration dataset. No real student, staff or school records are
            used, and nothing leaves the browser.
          </span>
          <span className="mono">v1.0 · built in 2026 for open hackathon judging</span>
        </footer>
      </div>
    </StoreProvider>
  )
}
