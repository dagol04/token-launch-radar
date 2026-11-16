// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// early rows the radar exists to find: pre-token protocols below the watchlist floor, chosen by the
// model's own score. A protocol is pre-token when its record carries no token (no market cap, no
// CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// The value model is a peer multiple, derived from the snapshot itself, never a hardcoded list:
//
//   peer multiple  = the median market-cap / TVL of the token-bearing protocols in the same
//                    category (at least 3 peers), else the median across all token-bearing
//                    protocols; clamped to [0.02, 1.50] so one wild token cannot set the price.
//   base           = tvl_usd x peer multiple
//   growth         = clamp(change_7d, -50, 150) per cent
//   growthMult     = 1 + (growth / 100) x 0.4
//   maturity       = 0.7 + min(age_days, 1460) / 1460 x 0.3   (age_days unknown: 365)
//   implied        = max(1, round(base x growthMult x maturity))
//
// A lending protocol is therefore priced off lending tokens, a DEX off DEX tokens, and a category
// with no peers of its own off the whole market. No protocol name is ever special-cased: the same
// function scores every row, and the dashboard states the multiples it used.
//
// A protocol is rankable when it records no token, is not an exchange, carries no version marker in
// its name, and is not a wrapped, staked or bridged product (the watchlist's own rule, applied to the
// early rows too): WBTC is Bitcoin on Ethereum, not a launch still to come.

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
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2-peer-multiple';

/** How many pre-token protocols below the watchlist floor the early radar carries, by model score. */
export const EARLY_ROWS = 110;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories the watchlist's rule treats as wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

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
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_category: string;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  peer_multiple: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's peer multiple, as the dashboard's model table shows it. */
export interface PeerMultiple {
  category: string;
  multiple: number;
  peers: number;
  fallback: boolean;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_formula: string;
  global_multiple: number;
  peer_multiples: PeerMultiple[];
  protocols_total: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
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

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted copy; null when there is nothing to take it from. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The peer multiples the snapshot itself supports, by category, with the market-wide fallback. */
export function peerMultiples(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): { byCategory: Map<string, PeerMultiple>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.category === 'CEX') continue; // an exchange token's cap is not a protocol multiple
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const cat = p.category ?? 'Uncategorized';
    const list = byCat.get(cat) ?? [];
    list.push(ratio);
    byCat.set(cat, list);
  }
  const clamp = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  const globalMedian = median(all);
  const global = clamp(globalMedian ?? 0.25);
  const byCategory = new Map<string, PeerMultiple>();
  for (const [cat, ratios] of byCat) {
    if (ratios.length >= model.min_peers) {
      const m = median(ratios);
      byCategory.set(cat, { category: cat, multiple: clamp(m ?? global), peers: ratios.length, fallback: false });
    }
  }
  return { byCategory, global };
}

/** The peer multiple one protocol is priced off: its category's, or the market-wide one. */
export function peerMultipleFor(category: string | null, peers: { byCategory: Map<string, PeerMultiple>; global: number }): PeerMultiple {
  const cat = category ?? 'Uncategorized';
  const own = peers.byCategory.get(cat);
  if (own !== undefined) return own;
  return { category: cat, multiple: peers.global, peers: 0, fallback: true };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peers: { byCategory: Map<string, PeerMultiple>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; peer: PeerMultiple; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const peer = peerMultipleFor(protocol.category, peers);
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * peer.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, peer, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)) && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const peers = peerMultiples(snapshot.protocols, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by the model's own score.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, peers, model).implied }))
    .sort((a, b) => b.score - a.score || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, peer, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, peers, model);
    return { p, implied, peer, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: s.peer.multiple,
      peer_category: s.peer.category,
      peer_count: s.peer.peers,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** What one bridge-and-deposit costs in gas on a chain, as a planning estimate. */
function gasFor(chain: string): string {
  const table: Record<string, string> = {
    Ethereum: '$8',
    Solana: '$0.05',
    Base: '$0.50',
    Arbitrum: '$0.50',
    Optimism: '$0.50',
    Unichain: '$0.50',
    Binance: '$0.20',
    Avalanche: '$0.30',
    Polygon: '$0.10',
    Monad: '$0.10',
    'Hyperliquid L1': '$0.10',
    Plasma: '$0.20',
    Berachain: '$0.20',
    Katana: '$0.20',
    Sonic: '$0.10',
    Ink: '$0.20',
    Scroll: '$0.30',
    Blast: '$0.20',
    Linea: '$0.30',
    Sei: '$0.10',
    Sui: '$0.05',
    Aptos: '$0.05',
    Tron: '$1',
    Bitcoin: '$2',
  };
  return table[chain] ?? '$1';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the supply position open.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('leveraged farm') || c.includes('yield')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and let the yield compound.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it in your wallet.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small basis position.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}'s own bridge and use one of its apps.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} of USDC into a ${name} managed pool on ${chain} and let it rebalance.`;
  if (c.includes('payment')) return `Fund $${capital} into your ${name} balance on ${chain} and make one real payment.`;
  if (c.includes('governance')) return `Deposit $${capital} of the governance asset into ${name} and cast one vote.`;
  if (c.includes('card')) return `Order the ${name} card and load $${capital} onto it, then spend from it once.`;
  if (c.includes('anchor') || c.includes('decentralized btc')) return `Deposit $${capital} of BTC through ${name} on ${chain} and hold the receipt.`;
  if (c.includes('farm')) return `Deposit $${capital} of USDC into the ${name} farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second action: depth, not a repeat of the first. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Allocate a second $${Math.round(capital / 2)} to a different ${name} vault so the activity spans two strategies.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${Math.round(capital / 4)} of USDC against the supply at a low loan-to-value and repay half of it within a week.`;
  if (c.includes('dex')) return `Add $${Math.round(capital / 2)} of liquidity to a second ${name} pool on ${chain} and vote on one gauge or proposal.`;
  if (c.includes('leveraged farm') || c.includes('yield')) return `Harvest the vault's first yield and restake it into the same vault so the position compounds.`;
  if (c.includes('rwa')) return `Mint a second $${Math.round(capital / 2)} tranche of the asset and hold it in a separate wallet label.`;
  if (c.includes('basis')) return `Open the hedge leg of the basis trade so both sides of the position are live.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open a second small hedge in the opposite direction and close the first one after a day.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the first staking rewards through ${name} instead of withdrawing them.`;
  if (c.includes('stable')) return `Provide $${Math.round(capital / 2)} of the stable asset as liquidity on ${chain}.`;
  if (c.includes('insurance')) return `Stake $${Math.round(capital / 2)} in ${name}'s cover pool so you are both a buyer and a backer.`;
  if (c.includes('chain')) return `Use a second app on ${chain} — a swap or a deposit — so the wallet's activity is not one transaction only.`;
  if (c.includes('liquidity manager')) return `Let the pool rebalance once, then add $${Math.round(capital / 2)} after the first rebalance.`;
  if (c.includes('payment')) return `Make a second payment to a different merchant so the balance shows real use.`;
  if (c.includes('governance')) return `Delegate the voting power to an active delegate and follow one proposal to its close.`;
  if (c.includes('card')) return `Spend from the card a second time on a different day so the load is not a single event.`;
  if (c.includes('anchor') || c.includes('decentralized btc')) return `Mint the protocol's BTC-backed asset with the receipt and hold both sides.`;
  if (c.includes('farm')) return `Harvest the farm's first rewards and restake them instead of selling.`;
  return `Make a second deposit of $${Math.round(capital / 2)} so the position grows instead of sitting still.`;
}

/** The category's weekly qualifying action, in one phrase. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supply top-up, a borrow or a repayment';
  if (c.includes('dex')) return 'a swap, a liquidity add or a gauge vote';
  if (c.includes('yield') || c.includes('farm')) return 'a deposit, a harvest or a restake';
  if (c.includes('rwa')) return 'a mint, a transfer or a redemption';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'a hedge, a close or a margin top-up';
  if (c.includes('staking') || c.includes('restak')) return 'a stake, a restake or a claim';
  if (c.includes('risk curator') || c.includes('allocator')) return 'a vault deposit or a strategy switch';
  if (c.includes('governance')) return 'a vote or a delegation';
  if (c.includes('insurance')) return 'a cover renewal or a claim check';
  return 'a deposit, a swap or a vote';
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Move $${capital} of USDC to ${chain} so the funds are ready in the wallet you will farm with.`,
      cost: `about ${gas} of gas to bridge`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about ${gas} of gas, no new capital`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action each week, such as ${weeklyFor(p)}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
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
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    listed_at: row.listed_at,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const peers = peerMultiples(snapshot.protocols, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const peerList: PeerMultiple[] = [...peers.byCategory.values()]
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_formula: 'implied = TVL x peer multiple (median mcap/TVL of token-bearing peers in the same category) x growth multiplier x maturity multiplier',
    global_multiple: round4(peers.global),
    peer_multiples: peerList,
    protocols_total: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
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
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
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
