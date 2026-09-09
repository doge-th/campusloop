# NextStep showcase posts

Three versions of the same short pitch — paste into NextStep Discord
`#showcase`, HackAlphaX email, and the NextStep Devpost Discussions
when reCAPTCHA is solved. URL addresses have been triple-checked.

## NextStep Discord (`#showcase`) — 200 chars max version

> CampusLoop — zero-network textbook circulation that keeps 51.4 kg of
> paper in the loop and avoids 56.7 kg CO₂e per library / 20 months.
> 4 engines, 25 commits, 19 tests. Earth Forward from the
> resource-conservation side. https://dog e-th.github.io/campusloop

## HackAlphaX email — short version

> To: contact@hackalphax.co
> Subject: CampusLoop submission — Earth Forward fit (#1171907)
>
> Hi HackAlphaX team,
>
> Quick note for the NextStep organisers' eyes: CampusLoop (Devpost
> submission 1171907) is in. It is a zero-network, browser-only textbook
> circulation engine — the Earth Forward angle is the resource-conservation
> side (51.4 kg paper / 56.7 kg CO₂e in 20 months, fully auditable in the
> impact ledger). I am happy to clarify the theme fit or the build-period
> question if helpful.
>
> Live demo: https://doge-th.github.io/campusloop/
> Repo: https://github.com/doge-th/campusloop
> Devpost page: https://devpost.com/software/campusloop-p3vahw
>
> — doge

## NextStep Devpost Discussions — long version (the one I tried to post)

> Title: CampusLoop — zero-network textbook circulation (Earth Forward fit)
>
> Body:
> Hi NextStep organizers and fellow builders!
>
> I want to flag a project that is on Earth Forward from a narrow but
> auditable angle: CampusLoop, a zero-network, browser-only textbook
> circulation engine.
>
> What it does (4 engines, ~6,900 lines, 19 tests, 25 progressive commits):
>
> - Cover recognition — 100-d hand-crafted descriptor over a software-
>   rasterised catalogue, cosine kNN with margin-based confidence.
>   Honest 94.2% / 96.7% top-1 under two protocols.
> - Demand forecast — pooled linear regression (11 features, mini-batch
>   SGD) predicting next-month unsold copies per subject, with 80% bands.
>   MAE 0.755, +0.140 R² over a mean baseline.
> - Fair matching — feasibility + 5-factor utility + Hopcroft-Karp ceiling
>   + fairness-weighted greedy + 2-swap. 34/34 supported-needy requests
>   served.
> - Impact ledger — one line of checkable arithmetic, mass × edition
>   factor × 0.92 per handover. EF range surfaced as a slider.
>
> Why it fits Earth Forward: a single library keeping 51.4 kg of paper in
> the loop and avoiding 56.7 kg CO2e in 20 months is a small number, but
> it is the kind that survives a reviewer clicking through to
> docs/IMPACT.md. The Forecast tab tells the librarian whether to run a
> second swap day or book the recycling collection — that is resource
> conservation in a single tool.
>
> Why it does not fit some Earth Forward sub-themes: I am not building a
> climate sensor or a renewable-energy dashboard. The README is explicit
> about what CampusLoop is and is not (see docs/ROADMAP.md).
>
> Stack: Vite 7 + React 19 + TypeScript 5.9 strict, react and react-dom as
> the only runtime dependencies, MIT, runnable with three commands
> (npm install && npm run dev && npm run test).
>
> Live demo: https://doge-th.github.io/campusloop/
> 4:47 walkthrough: https://doge-th.github.io/campusloop/campusloop_demo.mp4
> Repo: https://github.com/doge-th/campusloop
> Devpost submission: https://devpost.com/software/campusloop-p3vahw
>
> I am 16, self-taught, this is my first solo hackathon build. Happy to
> answer questions in this thread.
>
> — doge

## How to actually post (since Devpost requires reCAPTCHA)

The Devpost Discussions post needs a human to solve the reCAPTCHA. The
cleanest sequence in a logged-in browser:

1. Go to https://nextstep2026.devpost.com/forum_topics
2. Click "Post a new discussion topic"
3. Paste the title and body above
4. Solve the reCAPTCHA checkbox
5. Click "Post discussion"

For the NextStep Discord (`discord.gg/hFxwvgZDsh`):

1. Join the server
2. Open `#showcase` (or `#submissions` if there is one)
3. Paste the short version, plus the live demo link

For the HackAlphaX email:

1. Open your mail client to `contact@hackalphax.co`
2. Paste the short version