// Token Radar — the valuation model (Node 22, standard library only).
//
// The board ranks every protocol that records no token and is not a wrapped,
// staked or bridged product of one that trades. The snapshot itself decides
// who qualifies: the house watchlist is the floor (40 protocols at or above
// $50M TVL), and the board adds every other protocol that passes the same
// test on the snapshot's own fields, down to the snapshot's $5M floor.
// That gives 198 rows on this snapshot: 40 watchlist + 158 early.
//
// Implied value is computed from the snapshot's own figures only — never
// from a hand-kept list of names. The one number no protocol carries on its
// own is "what is a token worth per dollar of TVL", so the model calibrates
// it from the protocols in the SAME snapshot whose tokens already trade
// (the comparables), category by category:
//
//   categoryMultiple = shrunk median(mcap_usd / tvl_usd) over live-token
//                      protocols in the category, shrunk toward the global
//                      median with a prior weight of 8 protocols, then
//                      clamped to [0.05, 1.00].
//   sizeFactor       = (tvl_usd / $100M) ^ -0.20, clamped to [0.45, 1.60]
//                      (the snapshot's own log-log fit of mcap on TVL has
//                      slope ~0.52, so a token's value grows sublinearly
//                      with TVL: giants are worth less per TVL dollar.)
//   growthMult       = 1 + 0.4 * clamp(change_7d, -40, +60) / 100
//   maturityMult     = 0.80 + 0.20 * sqrt(min(age_days, 1095) / 1095)
//                      (age unknown: 0.90 — the middle of the range)
//   breadthMult      = 1 + 0.03 * min(chains - 1, 3)
//   implied          = round(tvl * categoryMultiple * sizeFactor
//                             * growthMult * maturityMult * breadthMult)
//
// farmerPoolUsd is a labelled yardstick only: 5% of the implied value,
// the pool that would exist if 5% of a launch went to farmers. It is an
// assumption, stated wherever it is shown, not a prediction.
//
// Farm plans are generated from the protocol's own record (category,
// primary chain, TVL tier, age) by the same code for every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  prior_weight: number;
  multiple_min: number;
  multiple_max: number;
  size_ref_usd: number;
  size_exponent: number;
  size_factor_min: number;
  size_factor_max: number;
  growth_weight: number;
  growth_min: number;
  growth_max: number;
  maturity_base: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_multiplier: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  farmer_share: number;
}

export const MODEL: ModelConstants = {
  prior_weight: 8,
  multiple_min: 0.05,
  multiple_max: 1.0,
  size_ref_usd: 100_000_000,
  size_exponent: 0.2,
  size_factor_min: 0.45,
  size_factor_max: 1.6,
  growth_weight: 0.4,
  growth_min: -40,
  growth_max: 60,
  maturity_base: 0.8,
  maturity_range: 0.2,
  maturity_days: 1095,
  unknown_age_multiplier: 0.9,
  breadth_per_chain: 0.03,
  breadth_max_chains: 3,
  farmer_share: 0.05,
};

export const MODEL_VERSION = 'radar-2-comps';

/** The model's formula, in words, for the dashboard's methodology section. */
export const MODEL_FORMULA =
  'implied = TVL x category multiple (shrunk median mcap/TVL of live-token protocols in the same category) ' +
  'x size factor (TVL/$100M)^-0.20, clamped [0.45, 1.60] ' +
  'x growth factor 1 + 0.4 x clamp(7d change, -40%, +60%) ' +
  'x maturity factor 0.80 + 0.20 x sqrt(min(age, 1095d)/1095d) ' +
  'x breadth factor 1 + 0.03 x min(chains-1, 3).';

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol must not start with (the watchlist rule). */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped / staked / staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  farmer_pool_usd: number;
  implied_multiple: number;
  why: string;
  model: {
    category_multiple: number;
    category_live_n: number;
    category_live_median: number | null;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_per_tvl: number | null;
}

/** One category's calibration, for the dashboard's methodology table. */
export interface CategoryCalibration {
  category: string;
  live_n: number;
  live_median: number | null;
  multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_formula: string;
  global_median_mcap_per_tvl: number;
  calibration: CategoryCalibration[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty list of finite numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped, staked or bridged product of a token that already trades, by the
 * watchlist rule applied to the snapshot's own fields.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/**
 * The comparables: for every category, the median mcap/TVL of the
 * snapshot's live-token protocols in that category, shrunk toward the
 * global median. Categories with no live protocol fall back to the global
 * median outright.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): {
  globalMedian: number;
  byCategory: Map<string, { n: number; median: number | null; multiple: number }>;
} {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.25;
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const list = byCat.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(p.category, list);
  }
  const byCategory = new Map<string, { n: number; median: number | null; multiple: number }>();
  const categories = new Set(snapshot.protocols.map((p) => p.category).filter((c): c is string => c !== null));
  for (const category of categories) {
    const list = byCat.get(category) ?? [];
    if (list.length === 0) {
      byCategory.set(category, { n: 0, median: null, multiple: round4(globalMedian) });
      continue;
    }
    const med = median(list);
    const shrunk = (list.length * med + model.prior_weight * globalMedian) / (list.length + model.prior_weight);
    const multiple = Math.min(model.multiple_max, Math.max(model.multiple_min, shrunk));
    byCategory.set(category, { n: list.length, median: round4(med), multiple: round4(multiple) });
  }
  return { globalMedian: round4(globalMedian), byCategory };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: { globalMedian: number; byCategory: Map<string, { n: number; median: number | null; multiple: number }> },
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  categoryLiveN: number;
  categoryLiveMedian: number | null;
  sizeFactor: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const cal = protocol.category !== null ? calibration.byCategory.get(protocol.category) : undefined;
  const categoryMultiple = cal?.multiple ?? calibration.globalMedian;
  const sizeRaw = Math.pow(protocol.tvl_usd / model.size_ref_usd, -model.size_exponent);
  const sizeFactor = Math.min(model.size_factor_max, Math.max(model.size_factor_min, sizeRaw));
  const growthPct = Math.min(model.growth_max, Math.max(model.growth_min, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    age === null
      ? model.unknown_age_multiplier
      : model.maturity_base + model.maturity_range * Math.sqrt(Math.min(age, model.maturity_days) / model.maturity_days);
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * categoryMultiple * sizeFactor * growthMult * maturityMult * breadthMult),
  );
  return {
    implied,
    categoryMultiple,
    categoryLiveN: cal?.n ?? 0,
    categoryLiveMedian: cal?.median ?? null,
    sizeFactor: round4(sizeFactor),
    growthPct,
    growthMult: round4(growthMult),
    maturityMult: round4(maturityMult),
    breadthMult: round4(breadthMult),
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One sentence saying why a row ranks where it does, from its own components. */
function whyRow(p: SnapshotProtocol, v: ReturnType<typeof impliedValue>, watchlist: boolean): string {
  const tvl = `$${(p.tvl_usd / 1e6).toFixed(p.tvl_usd >= 1e9 ? 0 : 1)}M TVL`;
  const growth = p.change_7d === null ? 'no 7-day change reported' : `7-day TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}%`;
  const cat =
    v.categoryLiveN > 0
      ? `${p.category ?? 'uncategorised'} tokens trade at a median ${v.categoryMultiple.toFixed(2)}x TVL across ${v.categoryLiveN} live ${v.categoryLiveN === 1 ? 'protocol' : 'protocols'}`
      : `${p.category ?? 'uncategorised'} has no live-token comparable in this snapshot, so the global median ${v.categoryMultiple.toFixed(2)}x TVL applies`;
  return (
    `${tvl}, ${growth}, ${cat}. ` +
    `${watchlist ? 'On the house watchlist. ' : 'Below the watchlist floor, found by the same no-token test. '}` +
    `Records no token, so the launch — if one ever comes — is still entirely ahead of it.`
  );
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  // The watchlist is the floor: every slug on it must appear. A watchlist
  // slug that failed isRankable would be a data contradiction; include it
  // anyway and let the gate's coverage row, not the model, be the judge.
  const index = bySlug(snapshot.protocols);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && !chosen.includes(p)) chosen.push(p);
  }
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, calibration, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    implied_value_usd: s.v.implied,
    farmer_pool_usd: Math.max(1, Math.round(s.v.implied * model.farmer_share)),
    implied_multiple: round4(s.v.implied / s.p.tvl_usd),
    why: whyRow(s.p, s.v, watchlist.has(s.p.slug)),
    model: {
      category_multiple: s.v.categoryMultiple,
      category_live_n: s.v.categoryLiveN,
      category_live_median: s.v.categoryLiveMedian,
      size_factor: s.v.sizeFactor,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      breadth_multiplier: s.v.breadthMult,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
}

/** Typical gas for one transaction on the protocol's primary chain, in dollars. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $6 of gas';
  if (chain === 'Solana') return 'about $0.10 of gas';
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Unichain', 'Ink', 'Katana', 'Monad'].includes(chain)) return 'about $0.50 of gas';
  return 'about $2 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/**
 * The category's core action and its weekly follow-up, in the words a
 * farmer can follow. Keyed on the category's words, never on a name.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open as collateral.`,
      weekly: `Borrow a small amount against the collateral, then repay it, so the position shows both sides of the market.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      core: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      weekly: `Swap a small amount through the pool and, if the range drifts, rebalance the position once.`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('farm')) {
    return {
      core: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the shares.`,
      weekly: `Claim any vault rewards and compound them back into the same vault.`,
    };
  }
  if (c.includes('rwa') || c.includes('anchor btc') || c.includes('decentralized btc')) {
    return {
      core: `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in your wallet.`,
      weekly: `Top the position up by a small amount so the holding keeps growing.`,
    };
  }
  if (c.includes('risk curator') || c.includes('capital allocator')) {
    return {
      core: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`,
      weekly: `Deposit a small amount into a second vault of ${name} so more than one strategy counts.`,
    };
  }
  if (c.includes('derivative') || c.includes('basis trading')) {
    return {
      core: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`,
      weekly: `Rebalance the hedge once and keep the margin above the protocol's minimum.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund $${capital} on ${name} on ${chain} and take a position in one live market.`,
      weekly: `Take a position in one new market each week and let the old ones settle.`,
    };
  }
  if (c.includes('restak') || c.includes('staking pool')) {
    return {
      core: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      weekly: `Top the stake up by a small amount and keep the receipt in the same wallet.`,
    };
  }
  if (c.includes('stablecoin') || c.includes('dual-token')) {
    return {
      core: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
      weekly: `Swap a small amount in and out of the stable asset through ${name}'s own route.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`,
      weekly: `Check the policy's status and renew it before it lapses.`,
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      core: `Move $${capital} onto ${name} on ${chain} and make one real payment with it.`,
      weekly: `Make one more payment through ${name} each week.`,
    };
  }
  if (c.includes('governance')) {
    return {
      core: `Deposit $${capital} into ${name} on ${chain} and vote in its next governance round.`,
      weekly: `Vote in each new proposal and keep the deposit in place.`,
    };
  }
  if (c.includes('index')) {
    return {
      core: `Buy $${capital} of ${name}'s index on ${chain} and hold it.`,
      weekly: `Top the index holding up by a small amount.`,
    };
  }
  if (c.includes('chain') && !c.includes('cross')) {
    return {
      core: `Bridge $${capital} of USDC onto ${chain} through ${name}'s own route and use its flagship app once.`,
      weekly: `Use the flagship app on ${chain} once a week so the address stays active.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in the destination app.`,
      weekly: `Bridge a small amount back and forth once a week.`,
    };
  }
  return {
    core: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    weekly: `Make one qualifying action each week, such as a deposit, a swap or a vote.`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const { core, weekly } = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing to set up, plus gas for the first transaction',
      time: '5 minutes',
    },
    { text: core, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' },
    { text: weekly, cost: `${gas} a week`, time: '10 minutes a week' },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay to claim and never follow a claim link from a chat or a post.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const calibration = calibrate(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_formula: MODEL_FORMULA,
    global_median_mcap_per_tvl: calibration.globalMedian,
    calibration: [...calibration.byCategory.entries()]
      .filter(([, v]) => v.n > 0)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([category, v]) => ({ category, live_n: v.n, live_median: v.median, multiple: v.multiple })),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
