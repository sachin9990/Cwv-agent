# CWV Recommendations Plan

Extend the existing CWV agent so that, in addition to flagging Red/Amber tickets, it tells the dev **what to fix** — driven by PageSpeed Insights audits.

This plan is structured so each step is small enough to finish in one sitting, and each step's output decides whether the next one is worth doing.

---

## Context (why this plan exists)

Today the agent fetches CWV scores from New Relic and decides Green/Amber/Red. When the verdict is Green it auto-comments the ticket in Azure DevOps. When it's Red or Amber, the dev is on their own to figure out *what* is wrong and *how* to fix it.

PageSpeed Insights returns a full Lighthouse audit for any public URL — not just the scores, but the specific DOM elements, scripts, and images causing the problem. We already have a `PAGE_SPEED_INSIGHTS` API key configured in `server/.env`. The goal is to surface that diagnostic detail (and eventually templated fix suggestions) in the dashboard.

**Important scope note:** the website source code lives in separate repos, not in this project. So the plan deliberately stays *advisory* — it produces copy-pasteable fix suggestions, not auto-generated patches. Going beyond advisory (Phase 3+) requires solving the cross-repo access problem and is out of scope for this MVP.

---

## Step 0 — Look at real PSI output before writing any code

**Goal:** Confirm the PSI data is actually rich enough to be useful for your URLs *before* building anything around it.

**What to do:**

1. Pick one of your known-Red ticket URLs.
2. Hit the PSI API directly in a browser or with curl:

   ```
   https://www.googleapis.com/pagespeedonline/v5/runPagespeed
     ?url=<your-url>
     &key=<PAGE_SPEED_INSIGHTS-from-.env>
     &strategy=mobile
     &category=performance
   ```

3. Open the JSON and drill into `lighthouseResult.audits`. Look at these specific audits:
   - `layout-shift-elements` — which DOM elements are shifting (drives CLS fixes)
   - `unsized-images` — images missing `width`/`height` (drives CLS fixes)
   - `largest-contentful-paint-element` — what the LCP element actually is
   - `render-blocking-resources` — scripts/styles blocking the first paint
   - `font-display` — fonts causing FOIT/FOUT
   - `non-composited-animations` — animations causing layout shifts

4. For each audit that has a non-zero `score` or non-empty `details.items`, note what data is actually present. Is the selector specific enough to act on? Are the image URLs the real ones?

**Decision point:** If `details.items` is mostly empty or generic for your URLs, the rest of this plan needs rethinking — PSI may not have enough data for your pages (e.g., authenticated pages, pages behind CAPTCHA, single-page-app routes). If the data looks rich, continue.

**Time:** ~15 minutes.

---

## Step 1 — Answer three product questions

**Goal:** Avoid building the wrong thing by locking down inputs and outputs first.

**Questions to answer by inspecting real tickets:**

1. **URL source.** Open 5–10 real CWV tickets in Azure DevOps. Is the URL to test already in a known field (description, custom field, area path)? Or does the agent need to derive it from the title? Document where to read it from.
2. **Mobile or desktop?** PSI returns different audits and different CrUX field data for `strategy=mobile` vs `strategy=desktop`. Pick one to start with — don't try to support both up front. (Most CWV-on-mobile tickets imply `mobile`, but confirm with whoever files the tickets.)
3. **Where do recommendations surface?** Two options:
   - **Dashboard panel only** — devs see suggestions when they open the dashboard.
   - **Also posted to the Azure ticket** — extend the existing `/comment-assign` flow so Amber/Red tickets get a comment with the recommendations, just like Green tickets get the "metrics met threshold" comment today.

   The second option is more valuable but adds risk (you're writing into tickets you previously only read). Decide before building.

**Output:** A short note (in this doc or elsewhere) recording your answers. Reference them in the steps below.

---

## Step 2 — Add a `/get-recommendations` backend endpoint

**Goal:** A thin, testable backend wrapper around PSI that returns clean parsed audit data. No UI work yet.

**What to build (in [server/](server/)):**

- New endpoint, e.g. `GET /get-recommendations?url=<url>&ticket_id=<id>`
- Calls PSI with the URL from Step 1's answer, using `strategy=mobile` (or whatever Step 1 picked)
- Parses the response and returns a clean shape, roughly:

  ```json
  {
    "ticket_id": "12345",
    "url": "https://...",
    "cls": {
      "score": 0.34,
      "status": "red",
      "audits": [
        { "id": "unsized-images", "title": "...", "items": [...] },
        { "id": "layout-shift-elements", "title": "...", "items": [...] }
      ]
    },
    "lcp": { ... },
    "inp": { ... }
  }
  ```

- Cache the PSI response per URL for ~10 minutes — PSI is slow (5–15s per call) and rate-limited.

**Why this shape:** It mirrors the existing `/get-metric` response, so the frontend can call both and merge them per ticket.

**Test with curl or Postman before touching the UI.** Run it against 3–5 different URLs from your real ticket pool. Confirm the JSON is what the frontend will actually need.

---

## Step 3 — Surface the audits in the dashboard

**Goal:** Show the *diagnosis* (no fix suggestions yet). Ship this and live with it for a few days before adding more.

**What to build (in [client/src/](client/src/)):**

- On each ticket row that is Amber or Red, add a "Why is this red?" expander/disclosure.
- When expanded, fetch `/get-recommendations` for that ticket (lazy — don't call PSI for every row on page load; it's slow and rate-limited).
- Render the parsed audits as a readable list, grouped by metric (CLS / LCP / INP). For each audit show: title, what's failing, and the raw `items` (element selectors, image URLs, etc.) in a collapsible "Details" subsection.
- Show a loading spinner while PSI runs — these calls take 5–15 seconds.

**Why diagnosis-only first:** You will learn a lot from a week of devs looking at real audit data. The fix templates you write in Step 4 will be much better informed than if you write them now.

---

## Step 4 — Add a templated fix-suggestions layer

**Goal:** Turn audit data into copy-pasteable fix suggestions. Pure mapping table — no LLM, no codebase access.

**What to build:**

A static rules table in the backend (e.g. `server/recommendations.py`) that maps PSI audit IDs to suggestion text. Start with ~10–15 rules covering the most common CWV issues:

| Audit | When it fires | Suggested fix text |
|---|---|---|
| `unsized-images` | `items` non-empty | "Add explicit `width` and `height` attributes to these images so the browser can reserve space: `<list>`" |
| `layout-shift-elements` | shift > 0.05 | "Element `<selector>` is shifting by `<value>`. Reserve space with `min-height` or `aspect-ratio` on its container." |
| `font-display` | fails | "Add `font-display: swap` (or `optional`) to your `@font-face` declarations to avoid invisible text during font load." |
| `render-blocking-resources` | `items` non-empty | "These scripts/styles are blocking first paint. Add `defer` or `async`, or inline critical CSS: `<list>`" |
| `largest-contentful-paint-element` | LCP > 2.5s | "Your LCP element is `<selector>`. Preload it with `<link rel='preload'>` and ensure it's not lazy-loaded." |
| `uses-optimized-images` | savings > 10KB | "Convert these images to WebP/AVIF for `<X>KB` savings: `<list>`" |
| `non-composited-animations` | `items` non-empty | "These animations are causing layout shifts. Use `transform`/`opacity` instead of `top`/`left`/`width`/`height`: `<list>`" |

Extend `/get-recommendations` to attach a `suggestion` string to each audit it returns. Render the suggestion text in the dashboard panel from Step 3.

**Don't write rules for audits you haven't actually seen fire on your URLs.** Start with what you observed in Step 0 / Step 3.

---

## ~~Step 5 — Add a Mobile / Desktop / Both toggle~~

~~**Goal:** Let each PSI run target mobile, desktop, or both — instead of mobile-only.~~

~~**Why:** `strategy` was hardcoded to `"mobile"` in [client/src/components/CWVDashBoard.tsx:200](client/src/components/CWVDashBoard.tsx#L200). PSI returns substantially different audits and different CrUX field data for `strategy=mobile` vs `strategy=desktop`. Some tickets are about desktop-specific issues (large viewports, hover interactions, desktop-only ads, wider images), and a mobile-only run will give the dev misleading recommendations. Mobile and desktop scores also frequently diverge — devs need to see which form factor is the actual problem.~~

~~**What to do:**~~

- ~~Add a small toggle to the PSI panel: **Mobile / Desktop / Both** (default to whichever Step 1 chose).~~
- ~~When **Mobile** or **Desktop** is selected, pass that value as the `strategy` query param to `/get-pagespeed`.~~
- ~~When **Both** is selected, fire two `/get-pagespeed` calls in parallel (one per strategy) and render the audits side-by-side or in stacked sections, each labelled clearly.~~
- ~~Persist the user's choice per session (e.g. `sessionStorage`) so the toggle doesn't reset every time the panel is reopened.~~
- ~~Optional polish: per-ticket defaults — if the ticket title, area path, or metadata indicates a desktop-only issue, default the toggle to Desktop automatically.~~

~~**Backend note:** [server/routes/pagespeed.py](server/routes/pagespeed.py) already accepts `strategy` as a query param, so no backend change is required — this is a frontend-only step, plus the parallel-fetch wiring for the "Both" case.~~

~~**Caching interaction:** If you've added the response cache from the "What more you can do" notes, key it on `(url, strategy)` — never share a cached mobile response across a desktop request.~~

---

## Step 6 — Validate and decide what's next

**Goal:** Confirm the MVP is useful before investing in anything bigger.

**What to do:**

1. Pick 5–10 known-problem tickets across different sites/properties.
2. Run the full flow end-to-end (dashboard → expand row → read suggestions).
3. For each ticket, ask the dev who'd normally work it: *"Is this suggestion actionable enough that you'd act on it?"*

**Decision matrix:**

- **Most suggestions useful** → MVP is done. Decide between:
  - **Expand rule coverage** (more audits, better-written suggestions) — low risk, incremental value
  - **Auto-post recommendations to Azure tickets** (Step 1's question #3, if you deferred it) — medium risk, high reach
  - **Phase 3: codebase mapping** — solve the cross-repo access problem (see the original analysis for options: per-ticket repo mapping, CI-side integration, MCP/CLI). High effort, only worth it if the advisory output isn't enough.

- **Most suggestions vague or wrong** → Don't add more layers. Fix what's there first. Common causes: PSI data is thinner than expected on your pages (revisit Step 0), the rules in Step 4 are too generic, the URL being tested isn't representative of the user-experienced page.

---

## Suggested execution order this week

- **Today:** Step 0 (15 min). This is the cheapest way to find out if the whole plan is viable.
- **Day 1–2:** Step 1 (product questions) + Step 2 (backend endpoint).
- **Day 3:** Step 3 (dashboard surfacing). Ship it.
- **Few days of dogfooding:** Use Step 3 against real tickets. Note which audits keep showing up.
- **Day 6–7:** Step 4 (templated suggestions), informed by what you saw.
- **Week 2:** Step 5 (validation) and a decision on what's next.

---

## What this plan deliberately does *not* include

- **LLM-drafted patches** — would need codebase access; deferred to Phase 3.
- **Auto-opening PRs in the target repo** — same reason; deferred to Phase 4.
- **Mobile + desktop support** — pick one in Step 1 to keep scope small.
- **Recommendations for non-CWV Lighthouse categories** (SEO, accessibility, best-practices) — out of scope; the ticket pool is CWV-focused.
- **Re-running PSI after a fix to confirm it worked** — nice-to-have for later; PSI is slow and rate-limited so this needs careful design.
