# Privacy

## The short version

CampusLoop has **no backend, no accounts, no analytics, and makes zero network
requests** after the page bundle loads. You can verify this from the Network
tab of devtools with the app open: the only entries are the document and its
own static assets. There is no API base URL anywhere in `src/`.

## What the prototype stores

Everything lives in one `localStorage` key, `campusloop.v1`:

- the demo campus state (listings, requests, matches, scan history, settings);
- nothing else. No names, no emails, no photos, no device identifiers.

The "Reset demo campus" button re-seeds deterministically from
`seed = 20260905`; clearing site data erases everything the app has ever known.

## The demo people are not people

The campus in this repo is synthetic ("Ridgeline Secondary School", 1,240
students, 20 generated months of history — formulas in `docs/ML.md` /
`src/lib/seed.ts`).

- **Every person is an alias**: one of twelve animal words plus a number,
  assigned by the seed generator. Real names are structurally impossible in the
  demo dataset — no field of any type definition (`src/lib/types.ts`) holds a
  name, contact detail, year group, or free text that could become one.
- Cover photos are rendered in-page from style specs; no camera is used and no
  image is uploaded, even in the Scan view demo.
- CSV exports (`Impact` view) contain only aggregate ledger rows, generated
  client-side and downloaded by the user.

## What a real deployment would require

This is a hackathon prototype, so this section is design intent rather than
shipped code:

1. **Consent before any real student record exists** — for under-18 students,
   guardian consent per the school's jurisdiction; the alias system above would
   be the *default view* of the data, with the name↔alias map held by the
   school's existing system, never by this app.
2. **Data minimisation**: a listing needs book, condition, availability window.
   It does not need a photo of the student, a phone number, or a home address;
   handovers happen at the library desk precisely so no addresses travel.
3. **Local-first where possible**: recognition is fully on-device
   (`docs/ML.md` — there is no server model to send the photo to, by design).
   A real build could keep photos in IndexedDB on the school tablet and never
   transmit them.
4. **Retention**: term-end purge of unmatched listings; the ledger keeps
   aggregate counts (mass, condition, subject) with the personal linkage
   dropped.
5. **Fairness audit trail**: every allocation decision is already an
   explainable one-liner (`why` strings, `docs/ML.md` §3) — if a school ever
   asks "why did that student get the book?", the answer is retrievable without
   reconstructing a model.

## No dark patterns

No cookie wall (there are no cookies), no nag screens, no share-to-unlock, no
e-mail capture. The only "growth loop" in this product is the literal circular
economy kind, and it is metered in the Impact view.
