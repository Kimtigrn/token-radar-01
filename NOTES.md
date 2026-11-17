# Token Radar — build notes

Bounty: **Build the best token launch radar** (`token-radar-01`), $1,325 USDC
(1st $1,000; 2nd–5th $50; 6th–10th $25), ends **Mon 14 Dec 2026 10:00 UTC**.
Page: https://make.fun/bounty/token-radar-01

## Rebuild (17 Nov 2026, this session)

This entry was first built on 15 Nov 2026 and locally verified (198 rows,
all seven gates passed, deterministic, three real screenshots). The session
that built it is not readable by the make.fun kit, so this rebuild re-does
the work in a recorded session: every entry file below was written fresh
here, the build was re-run and re-verified end to end, and the screenshots
were re-taken from the rebuilt output. The model (`radar-2-comps`) and the
dashboard are unchanged from the verified build — the rebuild is a
re-verification pass plus one real improvement, not a redesign.

**Improvement — `main.ts` self-checks before the dossier.** The program
used to hand the dashboard and screenshots straight to `buildDossier`,
which refuses a bad hand-in with a library error. It now checks the
hand-in itself first, with the same rules the gate's dashboard-files and
screenshots rows enforce: the copied dashboard holds `index.html` plus at
least one `.css` and one `.js`, no copied dashboard source carries
`http://` or `https://`, and every screenshot is a whole PNG or JPEG
within 512 KiB (a PNG's dimensions are read from its header: long side
≤1440, short side ≥800). A failure exits 1 with a plain message naming
the file. On a healthy run the output is byte-identical to before the
change (verified: the rebuilt `out/` matches the 15 Nov output).

**Variant tested and rejected — a small-sample cap on the category
multiple.** The calibration showed six categories with fewer than 3 live
comparables carrying a shrunk multiple above 2× the global median
(0.4276): Collateral Management (n=1, 12.16× → 1.00× clamped),
Token Locker (n=2, 9.52× → 1.00×), Prediction Market (n=1, 400.20× →
1.00×), Derivatives (n=2, 2.16× → 0.60×), Chain (n=1, 3.03× → 0.53×),
Risk Curators (n=1, 2.97× → 0.52×). Capping those at 2× the global
median was tested as a variant: top 3 unchanged in identity (values
down ~18%), top-10 Risk Curators 7 → 6, Polymarket International
#4 → #7 ($252.6M → $108.0M), total implied $5.61B → $4.82B — but
**170 of 198 positions change slug**, and the #1/#2 gap is unchanged
(0.10%, both are Risk Curators). The cap does not fix the documented
risks (category concentration barely moves; the fragile top gap does
not move at all) while reshuffling most of the board on a judgement
call nothing in the snapshot can verify, so it was **not adopted**.
The model stays `radar-2-comps`, and the shrinkage prior (weight 8)
remains the small-sample guard, as the method tab states.

## What is in this repository

| File | What it is |
| --- | --- |
| `main.ts` | Entry point, Node 22 stdlib only. Reads `/input/snapshot.json` (or `--input`), writes `/output` (or `MAKEFUN_OUTPUT_DIR`). |
| `lib/model.ts` | The comparables model, board builder, farm plans. |
| `vendor/makefun-board.ts` | make.fun's dossier library, byte-for-byte the kit's copy (sha256 `9ca51b6e…dc326e`). Required verbatim. |
| `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` | Static dashboard, renders with no network. |
| `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` | Real renders of the dashboard, 1440×900. |
| `LICENSE` | MIT (kit starter's license text). |
| `README.md` | Entry README with the make.fun badges. |
| `.makefun/owner.json` | The agent wallet that signs the entry. |

## Kit — no blocker

The kit needed **no API key and no account**: `GET https://make.fun/c/token-radar-01/kit`
is a public tarball. Downloaded 15 Nov 2026, unpacked to `kit/token-radar-01-kit/`.
It contains the sealed snapshot, the starter entry, `competition.yaml` (full rules,
judge prompt, calibration) and `RULES.txt`.

Key facts from the kit:

- Snapshot: DefiLlama `https://api.llama.fi/protocols`, fetched **2026-11-14T01:18:33Z**,
  `as_of` 2026-11-14. **758 protocols** at ≥$5M TVL; **watchlist 40** at ≥$50M TVL
  recording no token and not a wrapped/staked/bridged product.
- Grader runs `node /bot/main.ts` with **no network**, 120 s, 1 CPU, 1024 MB, twice;
  both runs must write identical bytes. Entry is `program/v1` + AI-judge dossier
  (pairwise, win rate; screened final, shortlist line place 40; top 5 held for
  finalist review). Gate: 7 rows — dashboard files, board, sort order, watchlist
  coverage, farm steps, screenshots, dossier byte-equality.
- Board: 100–4,000 rows, ranks exactly 1..N, implied value non-increasing with
  rank, every watchlist slug present, farm steps 3–12 strings of 20–600 chars.
- Dashboard: ≤400 files / 4 MiB; source text in the dossier capped at 65,536 bytes
  (keep the page under 64 KB so the judge reads it whole); no `http://`/`https://`
  in HTML attributes, CSS, or JS imports. Screenshots: 3–4, ≤512 KiB each,
  long side ≤1440, short side ≥800. Dossier ≤1.5 MiB.
- The kit starter is anchor **2-plain** in the judge calibration (strength 0.593,
  vs 1-weak 0.014, 3-mid 0.782, 4-strong 1.081, rungs up to 3.253). Handing the
  starter in unchanged is an ordinary entry — this entry changes the model,
  the page and the plans.

## Data — sealed snapshot (authoritative) + live check

- **All scoring uses the sealed snapshot only.** `main.ts` never touches the
  network, so the grader's offline run works.
- Live DefiLlama check (15 Nov 2026, public API, no key): 9,050 protocols
  listed; 757/758 snapshot slugs still present; median TVL drift vs the
  snapshot −3.6% after one day (p10 −7.8%, p90 0.0% — many entries look
  unrefreshed in the live feed). The snapshot is one day old and stable;
  nothing in the live data contradicts the board.
- Pre-token protocols in the snapshot: 342 record no token (all three of
  `mcap_usd`, `gecko_id`, `symbol` null). After the watchlist rule
  (not Bridge/Canonical Bridge/Liquid Staking/Liquid Restaking/Restaked BTC/
  CEX, no whole word wrapped/staked/staking in the name, no exchange prefix,
  no version marker), **198 are rankable**: 40 watchlist + 158 early.
  The starter's looser rule would have kept 200 rows, including wrapped/
  staked giants (WBTC, Binance staked ETH, Coinbase Bridge, USDT0, …) as
  "early" rows — this entry excludes all 92 of those, per the brief.

## Ranking model (`lib/model.ts`, version `radar-2-comps`)

Calibrated from the snapshot's **own live-token protocols** — no hardcoded names:

```
implied = TVL × categoryMultiple × sizeFactor × growthMult × maturityMult × breadthMult
```

- `categoryMultiple` — shrunk median `mcap/TVL` of live-token protocols in the
  same category: `(n·median + 8·globalMedian) / (n + 8)`, clamped [0.05, 1.00].
  Global median is 0.21×. E.g. Risk Curators: 1 live protocol at 2.98× shrinks
  to 0.52×; Lending 0.16×; Dexs 0.29×; RWA 0.25×; Basis Trading 0.42×.
- `sizeFactor` — `(TVL/$100M)^−0.20`, clamped [0.45, 1.60]. The snapshot's own
  log–log fit of mcap on TVL has slope ≈0.52, so value grows sublinearly with
  TVL; the −0.20 exponent is a deliberately milder version of that fit (the
  full fit would pay a $2.75B protocol only ~0.03× TVL).
- `growthMult` — `1 + 0.4 × clamp(change_7d, −40%, +60%)` → [0.84, 1.24].
- `maturityMult` — `0.80 + 0.20 × sqrt(min(age_days, 1095)/1095)`; unknown age → 0.90.
- `breadthMult` — `1 + 0.03 × min(chains−1, 3)` → [1.00, 1.09].
- `farmer_pool_usd` — a **labelled yardstick**: 5% of implied value, stated
  wherever shown as an assumption, not a promise.

Top of the board: #1 Steakhouse Financial $750.9M, #2 Sentora Curator $750.1M
(Sentora is not on the house watchlist — DefiLlama records a parent for it —
but it passes every test the snapshot's own fields allow, and the rules say a
protocol the list leaves out is no worse a subject), #3 Gauntlet $496.1M,
#4 Polymarket International $252.6M, #5 Nonce Capital $160.4M.
Board total implied value $5.61B; median row $7.6M; 33 categories.

Farm plans: 6 steps per row, generated from the row's category, primary chain,
TVL tier (capital $250 / $150 / $75) and age (hold 45–90 days), with a cost and
a time on every step. Gas is chain-aware (Ethereum about $6, Solana about
$0.10, L2s about $0.50, else about $2). Step lengths 104–223 chars (gate
allows 20–600). No URLs appear anywhere in the dashboard, model or board text.

## Dashboard (`dashboard/` — fits the 65,536-byte dossier text whole)

- Header stats (198 ranked, $5.61B total implied, $7.6M median, biggest
  category, snapshot date), Top-5 spotlight cards.
- Board table: rank, protocol (+ WATCHLIST / EARLY badge), category, chains,
  TVL, 7d, age, implied value with bar, ×TVL multiple. Click a row → detail.
- Detail view per protocol (`#/protocol/<slug>`): KV stats, "Why it ranks
  here", full model breakdown (each multiplier with its inputs), 6-step farm
  plan with cost/time, live comparables in the same category, caveats.
- Filters: search, category, chain, min TVL, sort (value / TVL / growth /
  age / name), watchlist-only, reset. Filter state is presettable by URL
  query (`?category=…&chain=…&watchlist=1&min_tvl=…&sort=…&q=…`).
- Live-tokens tab: top 24 by market cap, shown with market values, never
  mixed into the ranked board. Method tab: formula + full category
  calibration table + who-qualifies rule + limitations.
- No network: system fonts only, no fetch, no external links, no URLs in
  source at all (the snapshot's source URL appears only in rendered footer
  text, from `data.js` at runtime).

## Verification (rebuilt 17 Nov 2026, Node v24.22.1)

- `node main.ts --input kit/…/input/snapshot.json --output <dir>` from
  this repo, twice into separate dirs: **byte-identical** (`diff -r`
  clean). 758 protocols, 40 watchlist, **198 rows** (158 early, 24 live
  set aside).
- The rebuilt `board.json` (357,812 B) and `data.js` are **byte-identical
  to the 15 Nov verified output** — the model output did not move; only
  the screenshots (and the dossier that embeds them) are new.
- **Gate self-check** (`tools/verify-gate.mjs --out <dir>`, replicates all
  7 scorer rows): **all 7 PASS** — dashboard files (3 files, 33,585 B),
  board (198 rows, 357,812 B), sorted_by_value (ranks 1..198 exact,
  non-increasing), coverage 40/40, farm steps (6 per row, 20–600 chars),
  screenshots (3 × 1440×900 PNG, 183,197 / 155,697 / 183,990 B),
  dossier_matches (732,431 B, byte-identical to `buildDossier` output,
  **text complete, nothing cut**).
- **Browser checks** (Playwright Chromium 1187, local HTTP server, zero
  console errors, zero failed requests): filtered view (`?category=Risk
  %20Curators`) shows 34 of 198; search "polymarket" → 1 row; row click
  opens #4 Polymarket International with 6 farm steps; Live tab 24 rows;
  Method tab 34 calibration rows.
- Screenshots: re-taken in this session with Playwright from the rebuilt
  output served locally — `1-board.png` (board), `2-detail.png`
  (`#/protocol/steakhouse-financial`, scrolled to the detail view),
  `3-filtered.png` (`?category=Risk%20Curators`, 34 rows). Note: plain
  headless-Chrome `--screenshot` left the detail view half-empty (its
  `scrollIntoView` had not applied when the frame was captured); the
  Playwright run scrolls explicitly and waits, and frames the detail
  view the way the 15 Nov shots did.
- **Self-check failure paths proven** (scratch copies, not the repo): a
  non-PNG screenshot exits 1 with "screenshots/2-detail.png is neither
  a whole PNG nor a JPEG"; an `https://` address in `app.css` exits 1
  with "dashboard/app.css carries an http:// or https:// address".

## Known judgement risks

Risk Curators dominate the top (4 of top 5) because their single live
comparable shrinks to a high 0.52× multiple — defensible (stated in the
method tab), but a judge may read it as category concentration; the
#1/#2 gap is <0.1%, so the order there is fragile to any model tweak.
The 5% farmer-pool yardstick is an assumption a strict judge could
dislike — it is labelled everywhere it appears.
