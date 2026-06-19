/**
 * PickleTab Fair Scheduler — v4 (full-history greedy)
 *
 * WHY v4: v3 only remembered the single previous round (`prevPairs`), so the
 * same pair would happily reappear two or three rounds later. v4 tracks the
 * *cumulative* history of how often every pair has partnered and how often
 * every pair has faced each other, then always builds each game by picking the
 * partner / opponents you've shared the court with the LEAST so far. This is the
 * same approach used by the reference generator (pkbl.netlify.app) and produces
 * much better variety for 8–12 player sessions.
 *
 * Guarantees / behaviour each round:
 *   ✅ Partners are chosen by fewest lifetime partnerships (least-repeated first)
 *   ✅ Opponents are chosen by fewest lifetime head-to-head meetings
 *   ✅ Sitting is even — driven by consecutive sit-outs, then total plays
 *   ✅ Nobody sits twice in a row while someone else hasn't sat at all
 *   ✅ Deterministic for a given (players, courts) input so rounds are stable
 *      across re-renders, but well-mixed via a seeded shuffle.
 *
 * The exported API (Matchup, Round, generateSchedule, getRound,
 * getMatchupsForRound) is unchanged so the rest of the app keeps working.
 */

export interface Matchup {
  teamA: number[];
  teamB: number[];
  gameNumber: number;
  courtNumber: number;
}

export interface Round {
  roundNumber: number;
  matchups: Matchup[];
  sitting: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pairKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/** Deterministic PRNG (mulberry32) so a given session always schedules the same way. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a provided RNG (so tie-breaks are fair but reproducible). */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutable scheduling state (cumulative history across all rounds)
// ─────────────────────────────────────────────────────────────────────────────

interface SchedState {
  playCount: Record<number, number>;        // games played
  consecutiveSitOut: Record<number, number>; // sit-outs in a row right now
  totalSitOut: Record<number, number>;       // lifetime sit-outs
  partnerCount: Record<string, number>;       // pairKey -> times partnered
  opponentCount: Record<string, number>;      // pairKey -> times faced as opponents
  lastPartnerRound: Record<string, number>;   // pairKey -> last round index they partnered
  lastOpponentRound: Record<string, number>;  // pairKey -> last round index they were opponents
  round: number;                              // current round index being built
}

// How many recent rounds a repeat partnership/opponent is penalised for.
// gap of 1 = back-to-back, 2 = one round apart, etc. A wide window means the
// optimiser keeps pushing repeat partners as far apart as the roster allows,
// not just past the immediate next couple of rounds.
// Partners: we strongly want a comfortable gap before any repeat. Penalise
// repeats up to PARTNER_TARGET_GAP rounds apart — beyond that gap the spacing is
// "good enough" and we let opponent spacing take over, which keeps opponent
// back-to-backs low in dense rosters instead of trading them away for an even
// wider (but unnoticeable) partner gap.
const PARTNER_TARGET_GAP = 7;   // partners: aim for at least ~7 rounds between repeats
const OPP_RECENT_WINDOW = 6;    // opponents: window for opponent spacing
const RECENT_PENALTY = 1000;    // dominates lifetime counts so recent repeats are avoided first

function initState(playerIds: number[]): SchedState {
  const s: SchedState = {
    playCount: {},
    consecutiveSitOut: {},
    totalSitOut: {},
    partnerCount: {},
    opponentCount: {},
    lastPartnerRound: {},
    lastOpponentRound: {},
    round: 0,
  };
  playerIds.forEach((id) => {
    s.playCount[id] = 0;
    s.consecutiveSitOut[id] = 0;
    s.totalSitOut[id] = 0;
  });
  return s;
}

/**
 * Partner cost = lifetime partnerships + a big penalty that decays over the last
 * few rounds. A pair that partnered last round costs ~RECENT_PENALTY*3, two
 * rounds ago ~RECENT_PENALTY*2, etc. — so the picker exhausts every fresher
 * option before ever repeating a recent partner.
 */
function partnerCost(s: SchedState, a: number, b: number): number {
  const k = pairKey(a, b);
  const base = s.partnerCount[k] || 0;
  const last = s.lastPartnerRound[k];
  let recent = 0;
  if (last !== undefined) {
    const gap = s.round - last; // 1 = previous round
    if (gap <= PARTNER_TARGET_GAP) {
      // Quadratic decay: a tight gap is penalised FAR more than a wide one, so
      // the optimiser always prefers the largest possible spacing between
      // repeat partners up to the target gap.
      const closeness = PARTNER_TARGET_GAP - gap + 1; // 1..PARTNER_TARGET_GAP
      recent = closeness * closeness * RECENT_PENALTY;
    }
  }
  return base + recent;
}

function opponentCost(s: SchedState, a: number, b: number): number {
  const k = pairKey(a, b);
  const base = s.opponentCount[k] || 0;
  const last = s.lastOpponentRound[k];
  let recent = 0;
  if (last !== undefined) {
    const gap = s.round - last;
    if (gap <= OPP_RECENT_WINDOW) {
      const closeness = OPP_RECENT_WINDOW - gap + 1;
      recent = closeness * closeness * RECENT_PENALTY;
    }
  }
  return base + recent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build one round's games — multi-candidate optimiser
//
// Instead of a single greedy pass (which can be forced into a back-to-back
// repeat early and never recover), we generate MANY complete candidate rounds
// from the same playing set, score each by a recency-weighted cost, and keep
// the best. Across hundreds of randomised tries the optimiser reliably finds a
// round with no recent partner/opponent repeat whenever one exists.
// ─────────────────────────────────────────────────────────────────────────────

function buildGames(
  s: SchedState,
  playing: number[],
  numCourts: number,
  rng: () => number
): { teamA: number[]; teamB: number[]; court: number }[] {
  let best: { teamA: number[]; teamB: number[]; court: number }[] | null = null;
  let bestCost = Infinity;

  // Many randomised candidates; keep the lowest-cost one. With the quadratic
  // recency penalty, lower cost == wider spacing between any repeat partners,
  // so we DON'T early-stop at the first "no back-to-back" candidate — we keep
  // searching to push repeats as far apart as the roster physically allows.
  // We only break early when a candidate is completely clean of any recent
  // partner OR opponent repeat within the windows (cost below one penalty unit).
  // Early-stop threshold: the roundCost packs partner tiers in the bands
  // >= 1_000_000 (t1 = back-to-back at 1e9, t3 = close partner repeat at 1e6).
  // A cost below that means this round has NO partner repeat within the target
  // window at all — the thing players care most about — so it's safe to stop
  // searching. Lower bands (opponent spacing, lifetime balance) are still
  // minimised across the candidates we do try.
  const PARTNER_CLEAN = 1_000_000;
  const ATTEMPTS = 250;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const cand = greedyCandidate(s, playing, numCourts, rng);
    repairRound(s, cand, rng);
    const cost = roundCost(s, cand);
    if (cost < bestCost) {
      bestCost = cost;
      best = cand;
    }
    if (bestCost < PARTNER_CLEAN) break;
  }

  return best ?? greedyCandidate(s, playing, numCourts, rng);
}

/** One randomised greedy attempt at filling all courts for this round. */
function greedyCandidate(
  s: SchedState,
  playing: number[],
  numCourts: number,
  rng: () => number
): { teamA: number[]; teamB: number[]; court: number }[] {
  // Pool of players to place, randomised so equal-history ties resolve fairly.
  const pool = shuffle(playing, rng);
  const games: { teamA: number[]; teamB: number[]; court: number }[] = [];

  const courtsToFill = Math.min(numCourts, Math.floor(pool.length / 4));

  for (let court = 0; court < courtsToFill && pool.length >= 4; court++) {
    // 1) First player: take the one who has played the fewest games (then random).
    pool.sort((a, b) => (s.playCount[a] - s.playCount[b]) || (rng() - 0.5));
    const p1 = pool.shift()!;

    // 2) Partner: lowest partner cost with p1 (lifetime + recent-repeat penalty).
    pool.sort((a, b) => {
      const d = partnerCost(s, p1, a) - partnerCost(s, p1, b);
      if (d !== 0) return d;
      return (s.playCount[a] - s.playCount[b]) || (rng() - 0.5);
    });
    const p2 = pool.shift()!;

    // 3) First opponent: lowest combined opponent cost vs the p1/p2 team.
    pool.sort((a, b) => {
      const av = opponentCost(s, p1, a) + opponentCost(s, p2, a);
      const bv = opponentCost(s, p1, b) + opponentCost(s, p2, b);
      if (av !== bv) return av - bv;
      return (s.playCount[a] - s.playCount[b]) || (rng() - 0.5);
    });
    const p3 = pool.shift()!;

    // 4) Second opponent: lowest partner cost with p3, then lowest H2H vs team A.
    pool.sort((a, b) => {
      const d = partnerCost(s, p3, a) - partnerCost(s, p3, b);
      if (d !== 0) return d;
      const av = opponentCost(s, p1, a) + opponentCost(s, p2, a);
      const bv = opponentCost(s, p1, b) + opponentCost(s, p2, b);
      if (av !== bv) return av - bv;
      return (s.playCount[a] - s.playCount[b]) || (rng() - 0.5);
    });
    const p4 = pool.shift()!;

    games.push({ teamA: [p1, p2], teamB: [p3, p4], court: court + 1 });
  }

  return games;
}

/**
 * Repair pass: after greedy construction, look for any team whose two players
 * are a recently-repeated pair (within the recency windows). When found, try swapping
 * one of them with a player from another court so the total recent-repeat +
 * lifetime cost across the round goes down. Only helps when 2+ courts exist;
 * a no-op for single-court rounds (nothing to swap with).
 */
function roundCost(s: SchedState, games: { teamA: number[]; teamB: number[]; court: number }[]): number {
  // Lexicographic scoring packed into one number. Each tier uses a magnitude
  // band large enough that any amount of a lower tier can never outweigh a
  // single unit of a higher tier. Priority order (most → least important):
  //   T1  partner back-to-back (gap == 1)   — never allowed
  //   T3  partner spacing (smaller gap = worse) — maximise distance between
  //        repeat PARTNERS first, since that's what players notice most
  //   T2  opponent back-to-back (gap == 1)  — avoided next
  //   T4  opponent spacing
  //   T5  lifetime partner/opponent balance
  let t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0;

  const pairGap = (lastRound: number | undefined) =>
    lastRound === undefined ? Infinity : s.round - lastRound;

  for (const g of games) {
    for (const team of [g.teamA, g.teamB]) {
      const k = pairKey(team[0], team[1]);
      const gap = pairGap(s.lastPartnerRound[k]);
      if (gap === 1) t1 += 1;
      // closeness within the target window contributes to spacing (quadratic).
      if (gap <= PARTNER_TARGET_GAP) {
        const closeness = PARTNER_TARGET_GAP - gap + 1; // 1..PARTNER_TARGET_GAP
        t3 += closeness * closeness;
      }
      t5 += s.partnerCount[k] || 0;
    }
    for (const a of g.teamA) for (const b of g.teamB) {
      const k = pairKey(a, b);
      const gap = pairGap(s.lastOpponentRound[k]);
      if (gap === 1) t2 += 1;
      if (gap <= OPP_RECENT_WINDOW) {
        const closeness = OPP_RECENT_WINDOW - gap + 1;
        t4 += closeness * closeness;
      }
      t5 += s.opponentCount[k] || 0;
    }
  }

  // Pack tiers into disjoint magnitude bands. Order of significance:
  // partner back-to-back (t1) > partner spacing (t3) > opponent back-to-back
  // (t2) > opponent spacing (t4) > lifetime balance (t5).
  return (
    t1 * 1_000_000_000 +
    t3 * 1_000_000 +
    t2 * 10_000 +
    t4 * 100 +
    t5
  );
}

function repairRound(
  s: SchedState,
  games: { teamA: number[]; teamB: number[]; court: number }[],
  _rng: () => number
): void {
  if (games.length < 2) return; // nothing to swap against on a single court

  // All swappable slots across all games.
  type Slot = { g: number; team: 'teamA' | 'teamB'; idx: number };
  const slots: Slot[] = [];
  games.forEach((g, gi) => {
    g.teamA.forEach((_, i) => slots.push({ g: gi, team: 'teamA', idx: i }));
    g.teamB.forEach((_, i) => slots.push({ g: gi, team: 'teamB', idx: i }));
  });

  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let i = 0; i < slots.length && !improved; i++) {
      for (let j = i + 1; j < slots.length && !improved; j++) {
        const A = slots[i], B = slots[j];
        if (A.g === B.g) continue; // swapping within the same game is pointless here
        const before = roundCost(s, games);
        const ga = games[A.g], gb = games[B.g];
        const tmp = ga[A.team][A.idx];
        ga[A.team][A.idx] = gb[B.team][B.idx];
        gb[B.team][B.idx] = tmp;
        const after = roundCost(s, games);
        if (after < before) {
          improved = true; // keep the swap, restart scan
        } else {
          // revert
          const t2 = ga[A.team][A.idx];
          ga[A.team][A.idx] = gb[B.team][B.idx];
          gb[B.team][B.idx] = t2;
        }
      }
    }
    if (!improved) break;
  }
}

function commitRound(
  s: SchedState,
  games: { teamA: number[]; teamB: number[]; court: number }[],
  sitting: number[]
): void {
  const played = new Set<number>();
  games.forEach((g) => {
    [...g.teamA, ...g.teamB].forEach((p) => {
      played.add(p);
      s.playCount[p] = (s.playCount[p] || 0) + 1;
    });
    // partner counts + last-partnered round
    const pa = pairKey(g.teamA[0], g.teamA[1]);
    const pb = pairKey(g.teamB[0], g.teamB[1]);
    s.partnerCount[pa] = (s.partnerCount[pa] || 0) + 1;
    s.partnerCount[pb] = (s.partnerCount[pb] || 0) + 1;
    s.lastPartnerRound[pa] = s.round;
    s.lastPartnerRound[pb] = s.round;
    // opponent counts + last-faced round (every A vs every B)
    g.teamA.forEach((a) =>
      g.teamB.forEach((b) => {
        const k = pairKey(a, b);
        s.opponentCount[k] = (s.opponentCount[k] || 0) + 1;
        s.lastOpponentRound[k] = s.round;
      })
    );
  });

  // sit / play streak bookkeeping
  played.forEach((p) => {
    s.consecutiveSitOut[p] = 0;
  });
  sitting.forEach((p) => {
    s.consecutiveSitOut[p] = (s.consecutiveSitOut[p] || 0) + 1;
    s.totalSitOut[p] = (s.totalSitOut[p] || 0) + 1;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Choose who sits this round (fairest first to play)
// ─────────────────────────────────────────────────────────────────────────────

function chooseSitting(
  s: SchedState,
  playerIds: number[],
  sittingCount: number,
  rng: () => number
): { playing: number[]; sitting: number[] } {
  if (sittingCount <= 0) return { playing: [...playerIds], sitting: [] };

  // Sort so the players MOST owed a game come first (they play).
  const ordered = shuffle(playerIds, rng).sort((a, b) => {
    // 1) Whoever has sat out more in a row plays first.
    const c = (s.consecutiveSitOut[b] || 0) - (s.consecutiveSitOut[a] || 0);
    if (c !== 0) return c;
    // 2) Whoever has played fewer total games plays first.
    const p = (s.playCount[a] || 0) - (s.playCount[b] || 0);
    if (p !== 0) return p;
    // 3) Whoever has sat out fewer times total should sit now.
    const t = (s.totalSitOut[a] || 0) - (s.totalSitOut[b] || 0);
    if (t !== 0) return t;
    return 0;
  });

  // `ordered` is sorted most-owed-a-game first. The clear cut is between the
  // players who MUST play (top, strictly higher priority) and those who MUST
  // sit (bottom). Players in the middle with EQUAL fairness priority form a
  // "bubble" we can choose freely from — use that freedom to avoid putting two
  // recent partners on court together (the single-court repeat problem).
  const needPlaying = ordered.length - sittingCount;

  // Group by identical fairness key so we only reorder true ties.
  const keyOf = (id: number) =>
    `${s.consecutiveSitOut[id] || 0}|${s.playCount[id] || 0}|${s.totalSitOut[id] || 0}`;

  // Find the tie-group straddling the play/sit boundary.
  let lo = needPlaying;
  while (lo > 0 && keyOf(ordered[lo - 1]) === keyOf(ordered[needPlaying])) lo--;
  let hi = needPlaying;
  while (hi < ordered.length && keyOf(ordered[hi]) === keyOf(ordered[needPlaying])) hi++;

  const lockedPlaying = ordered.slice(0, lo);
  const bubble = ordered.slice(lo, hi);
  const lockedSitting = ordered.slice(hi);
  const bubbleSlots = needPlaying - lockedPlaying.length; // how many from bubble play

  let playing: number[];
  let sitting: number[];

  if (bubble.length > 1 && bubbleSlots > 0 && bubbleSlots < bubble.length) {
    // Choose which bubble members play so the resulting playing set has the
    // lowest summed pairwise partner cost (favours fresh combinations).
    const best = chooseBubble(s, lockedPlaying, bubble, bubbleSlots);
    playing = [...lockedPlaying, ...best.play];
    sitting = [...best.sit, ...lockedSitting];
  } else {
    playing = ordered.slice(0, needPlaying);
    sitting = ordered.slice(needPlaying);
  }

  return { playing, sitting };
}

/**
 * From a tie-group `bubble`, pick `slots` players to join `locked` on court such
 * that the total recent-partner cost among the on-court set is minimised. Tries
 * all combinations (bubble is small — a single fairness tie-group), so this is
 * cheap. Returns the chosen play/sit split.
 */
function chooseBubble(
  s: SchedState,
  locked: number[],
  bubble: number[],
  slots: number
): { play: number[]; sit: number[] } {
  const combos: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === slots) { combos.push([...acc]); return; }
    for (let i = start; i < bubble.length; i++) { acc.push(bubble[i]); pick(i + 1, acc); acc.pop(); }
  };
  pick(0, []);

  let bestPlay = combos[0];
  let bestCost = Infinity;
  for (const combo of combos) {
    const onCourt = [...locked, ...combo];
    let cost = 0;
    for (let i = 0; i < onCourt.length; i++)
      for (let j = i + 1; j < onCourt.length; j++)
        cost += partnerCost(s, onCourt[i], onCourt[j]);
    if (cost < bestCost) { bestCost = cost; bestPlay = combo; }
  }
  const sit = bubble.filter((p) => !bestPlay.includes(p));
  return { play: bestPlay, sit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scheduler
// ─────────────────────────────────────────────────────────────────────────────

export function generateSchedule(
  playerIds: number[],
  numCourts: number,
  totalRounds?: number
): Round[] {
  const n = playerIds.length;
  if (n < 2) return [];
  if (n < 4) return generateSinglesSchedule(playerIds, numCourts, totalRounds);

  const gamesPerRound = Math.min(numCourts, Math.floor(n / 4));
  if (gamesPerRound === 0) return [];

  const needed = gamesPerRound * 4;
  const sittingCount = n - needed;

  // Enough rounds for good rotation; clamp to a sensible range.
  const target =
    totalRounds ?? Math.min(30, Math.max(12, n * 2));

  // Seed off the EFFECTIVE games-per-round (not the requested court count) so
  // that asking for more courts than the roster can fill (e.g. 5 players on 3
  // courts) collapses to the exact same well-spaced schedule as the achievable
  // configuration.
  const baseSeed = n * 1000003 + gamesPerRound * 9176 + 7;

  // Build the full schedule several times from different seeds and keep the
  // best one. The single-pass build can occasionally land on a seed-dependent
  // bad local optimum (notably on 1-court rosters, which have no cross-court
  // repair to fall back on). Trying a handful of seeds and scoring the whole
  // schedule makes the spacing consistently good for EVERY player/court combo,
  // not just lucky ones.
  let bestSchedule: Round[] | null = null;
  let bestScore = Infinity;
  const SEED_TRIES = 6;
  for (let t = 0; t < SEED_TRIES; t++) {
    const candidate = buildScheduleOnce(
      playerIds,
      gamesPerRound,
      sittingCount,
      target,
      baseSeed + t * 7919
    );
    const score = scheduleScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestSchedule = candidate;
    }
  }

  return bestSchedule ?? [];
}

/** Build one complete schedule from a given seed. */
function buildScheduleOnce(
  playerIds: number[],
  gamesPerRound: number,
  sittingCount: number,
  target: number,
  seed: number
): Round[] {
  const s = initState(playerIds);
  const rng = makeRng(seed);
  const result: Round[] = [];

  for (let r = 0; r < target; r++) {
    s.round = r + 1; // 1-based so "last round" gap math works (gap 1 = previous round)
    const { playing, sitting } = chooseSitting(s, playerIds, sittingCount, rng);
    // Use the clamped court count so the optimiser never tries to fill more
    // courts than the playing pool supports.
    const games = buildGames(s, playing, gamesPerRound, rng);

    repairRound(s, games, rng);

    const matchups: Matchup[] = games.map((g, i) => ({
      teamA: g.teamA,
      teamB: g.teamB,
      gameNumber: i + 1,
      courtNumber: g.court,
    }));

    result.push({ roundNumber: r + 1, matchups, sitting });
    commitRound(s, games, sitting);
  }

  return result;
}

/**
 * Score a complete schedule so we can compare seeds. Lower is better.
 * Priority (lexicographic): no partner back-to-backs, then largest minimum
 * partner-repeat gap, then fewest opponent back-to-backs, then fewest total
 * close partner repeats.
 */
function scheduleScore(schedule: Round[]): number {
  const pk = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-');
  const lastPartner: Record<string, number> = {};
  const lastOpp: Record<string, number> = {};
  let partnerB2B = 0;
  let oppB2B = 0;
  let minPartnerGap = Infinity;
  let closePartnerRepeats = 0; // partner repeats within PARTNER_TARGET_GAP

  schedule.forEach((round, idx) => {
    const rn = idx + 1;
    for (const m of round.matchups) {
      for (const team of [m.teamA, m.teamB]) {
        const k = pk(team[0], team[1]);
        if (lastPartner[k] !== undefined) {
          const gap = rn - lastPartner[k];
          if (gap === 1) partnerB2B++;
          if (gap < minPartnerGap) minPartnerGap = gap;
          if (gap <= PARTNER_TARGET_GAP) closePartnerRepeats++;
        }
        lastPartner[k] = rn;
      }
      for (const a of m.teamA) for (const b of m.teamB) {
        const k = pk(a, b);
        if (lastOpp[k] !== undefined && rn - lastOpp[k] === 1) oppB2B++;
        lastOpp[k] = rn;
      }
    }
  });

  // Larger minimum gap is better, so penalise small gaps. Cap so an all-unique
  // schedule (no repeats at all) scores best.
  const gapPenalty =
    minPartnerGap === Infinity ? 0 : Math.max(0, PARTNER_TARGET_GAP + 1 - minPartnerGap);

  return (
    partnerB2B * 1_000_000_000 +
    gapPenalty * 1_000_000 +
    oppB2B * 1_000 +
    closePartnerRepeats
  );
}

function generateSinglesSchedule(
  playerIds: number[],
  numCourts: number,
  totalRounds?: number
): Round[] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < playerIds.length; i++)
    for (let j = i + 1; j < playerIds.length; j++)
      pairs.push([playerIds[i], playerIds[j]]);
  const target = totalRounds ?? Math.max(8, pairs.length);
  return Array.from({ length: target }, (_, r) => {
    const pair = pairs[r % pairs.length];
    return {
      roundNumber: r + 1,
      matchups: [{ teamA: [pair[0]], teamB: [pair[1]], gameNumber: 1, courtNumber: 1 }],
      sitting: playerIds.filter((id) => !pair.includes(id)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function getRound(
  playerIds: number[],
  numCourts: number,
  roundIndex: number
): { round: Round | null; totalRounds: number; schedule: Round[] } {
  const schedule = generateSchedule(playerIds, numCourts);
  if (schedule.length === 0) return { round: null, totalRounds: 0, schedule: [] };
  const wrapped = ((roundIndex % schedule.length) + schedule.length) % schedule.length;
  return { round: schedule[wrapped], totalRounds: schedule.length, schedule };
}

export function getMatchupsForRound(
  playerIds: number[],
  roundIndex: number,
  pageSize = 4
): { matchups: Matchup[]; totalGames: number; totalRounds: number } {
  const { round, totalRounds } = getRound(playerIds, Math.ceil(pageSize / 4) || 1, roundIndex);
  if (!round) return { matchups: [], totalGames: 0, totalRounds: 0 };
  return { matchups: round.matchups, totalGames: round.matchups.length, totalRounds };
}
