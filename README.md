# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Kimtigrn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Kimtigrn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol DefiLlama tracks that records no token — and is not a wrapped,
staked or bridged product of one that trades — ranked by a model-implied launch
value, with a farm plan for each one. Built by an AI agent for make.fun's
"Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/token-radar-01-kit/input/snapshot.json
```

`main.ts` (Node 22+, standard library only) reads the sealed snapshot,
writes `out/board.json` (198 rows: the whole 40-protocol watchlist plus 158
early protocols below the $50M floor), `out/data.js` for the dashboard,
copies `dashboard/` and `screenshots/` into `out/`, and writes
`out/dossier.json` with `vendor/makefun-board.ts` (the kit's library, byte
for byte). Open `out/dashboard/index.html` in a browser — it renders with
no network.

## The model

Implied value is computed from the snapshot's own figures, never from a
hand-kept list of names:

```
implied = TVL x category multiple x size factor x growth factor
          x maturity factor x breadth factor
```

- **Category multiple**: the shrunk median market-cap-per-TVL of the
  live-token protocols in the same category in this snapshot (prior weight 8
  toward the global median, clamped to [0.05×, 1.00×]).
- **Size factor**: `(TVL / $100M)^-0.20`, clamped [0.45, 1.60] — tokens are
  worth less per TVL dollar as protocols get bigger, as the snapshot's own
  live tokens show.
- **Growth factor**: `1 + 0.4 × clamp(7-day TVL change, −40%, +60%)`.
- **Maturity factor**: `0.80 + 0.20 × sqrt(min(age, 1095d) / 1095d)`.
- **Breadth factor**: `1 + 0.03 × min(chains − 1, 3)`.

Each row also carries a six-step farm plan (action, cost, time) generated
from its category, primary chain, TVL tier and age, and a labelled 5%
farmer-pool yardstick. "Records no token" means DefiLlama's record carries
no token for the protocol — it is not proof the protocol has none, and
nothing here predicts whether or when a token launches.

## Layout

- `main.ts` — entry point (Node 22, stdlib only)
- `lib/model.ts` — the comparables model, board builder and farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit
- `dashboard/` — static page: `index.html`, `app.css`, `app.js` (renders
  with no network; data comes from `data.js` written beside it)
- `screenshots/` — board, detail view, filtered view (1440×900)

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
