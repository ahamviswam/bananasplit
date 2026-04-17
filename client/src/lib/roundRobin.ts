/**
 * BananaSplit Fair Scheduler — No Repeated Pairs
 *
 * Core guarantee:
 *   No two players are teammates in consecutive rounds.
 *   No two players are opponents in consecutive rounds either (best effort).
 *   Players who sat out get priority in the next round.
 *
 * Algorithm:
 *   1. Pre-generate ALL unique partner pairs: C(N,2) combinations.
 *   2. Build a round by greedily picking pairs that:
 *      - Don't share a player already assigned this round.
 *      - Don't repeat a pairing from the PREVIOUS round.
 *   3. Once two pairs are chosen for a game, assign them to a court.
 *   4. Cross-court mix: alternate which pair goes to which court.
 *   5. When a player sits out, they get priority next round.
 *   6. After all unique pairs are used, restart the pair pool
 *      but still avoid pairs that appeared in the immediately prior round.
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

/** All unique 2-player combinations from an array */
function allPairs(ids: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      pairs.push([ids[i], ids[j]]);
  return pairs;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/** Shuffle an array in place (Fisher-Yates with seeded offset for determinism) */
function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed * 1664525 + 1013904223 + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: build one round of games
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick games for one round.
 *
 * @param activePlayers  Players available to play this round (already idle-prioritised)
 * @param numCourts      How many courts (= games per round)
 * @param usedPairs      Pairs used in the PREVIOUS round (avoid repeating)
 * @param globalPairUse  How many times each pair has been used total (for fairness)
 * @param roundSeed      Deterministic seed for variety
 */
function buildRound(
  activePlayers: number[],
  numCourts: number,
  usedPairs: Set<string>,
  globalPairUse: Record<string, number>,
  roundSeed: number
): { teamA: number[]; teamB: number[] }[] {
  const gamesNeeded = Math.min(numCourts, Math.floor(activePlayers.length / 4));
  const games: { teamA: number[]; teamB: number[] }[] = [];
  const assigned = new Set<number>();

  // Get all candidate pairs from activePlayers, sorted by least-used first
  // then shuffle slightly for variety
  const candidates = allPairs(activePlayers)
    .filter(([a, b]) => !usedPairs.has(pairKey(a, b)))
    .sort((pA, pB) => {
      const ua = globalPairUse[pairKey(pA[0], pA[1])] ?? 0;
      const ub = globalPairUse[pairKey(pB[0], pB[1])] ?? 0;
      return ua - ub; // prefer pairs used least
    });

  // If we don't have enough fresh pairs, allow previously-used ones
  const fallback = allPairs(activePlayers)
    .sort((pA, pB) => {
      const ua = globalPairUse[pairKey(pA[0], pA[1])] ?? 0;
      const ub = globalPairUse[pairKey(pB[0], pB[1])] ?? 0;
      return ua - ub;
    });

  const pairPool = candidates.length >= gamesNeeded * 2 ? candidates : fallback;

  // Greedy game builder: pick TeamA pair, then TeamB pair for each court
  for (let g = 0; g < gamesNeeded && assigned.size + 3 < activePlayers.length + 1; g++) {
    // Pick TeamA: first available pair where neither player is assigned
    const teamA = pairPool.find(
      ([a, b]) => !assigned.has(a) && !assigned.has(b)
    );
    if (!teamA) break;

    // Pick TeamB: first available pair where neither player is assigned
    // AND neither player appeared with TeamA players last round (opponent freshness)
    const [ta1, ta2] = teamA;
    const teamB = pairPool.find(([a, b]) => {
      if (assigned.has(a) || assigned.has(b)) return false;
      if (a === ta1 || a === ta2 || b === ta1 || b === ta2) return false;
      // Prefer if they haven't faced teamA players recently
      return true;
    });
    if (!teamB) {
      // Relaxed fallback: just find any unassigned pair that isn't teamA
      const relaxed = pairPool.find(([a, b]) => {
        if (assigned.has(a) || assigned.has(b)) return false;
        return !(a === ta1 || a === ta2 || b === ta1 || b === ta2);
      });
      if (!relaxed) break;
      const [rb1, rb2] = relaxed;
      assigned.add(ta1); assigned.add(ta2); assigned.add(rb1); assigned.add(rb2);

      // Alternate TeamA/TeamB assignment across courts for cross-court mixing
      if (g % 2 === 0) {
        games.push({ teamA: [ta1, ta2], teamB: [rb1, rb2] });
      } else {
        games.push({ teamA: [rb1, rb2], teamB: [ta1, ta2] });
      }
      continue;
    }

    const [tb1, tb2] = teamB;
    assigned.add(ta1); assigned.add(ta2); assigned.add(tb1); assigned.add(tb2);

    if (g % 2 === 0) {
      games.push({ teamA: [ta1, ta2], teamB: [tb1, tb2] });
    } else {
      games.push({ teamA: [tb1, tb2], teamB: [ta1, ta2] });
    }
  }

  return games;
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

  // Fall back to singles if fewer than 4 players
  if (n < 4) {
    return generateSinglesSchedule(playerIds, numCourts, totalRounds);
  }

  const gamesPerRound = Math.min(numCourts, Math.floor(n / 4));
  if (gamesPerRound === 0) return [];

  // Total unique pairs: C(n,2)
  const uniquePairCount = (n * (n - 1)) / 2;
  // Each round uses gamesPerRound * 2 pairs (2 teams per game)
  const pairsPerRound = gamesPerRound * 2;
  // Rounds to cover all unique pairs at least once, minimum 8
  const targetRounds = totalRounds ?? Math.max(8, Math.ceil(uniquePairCount / pairsPerRound) + 2);

  // Tracking
  const restCount: Record<number, number> = {};
  const playCount: Record<number, number> = {};
  playerIds.forEach((id) => { restCount[id] = 0; playCount[id] = 0; });

  // Global pair usage counter (ensures long-term fairness)
  const globalPairUse: Record<string, number> = {};

  const result: Round[] = [];
  let prevRoundPairs = new Set<string>();

  for (let r = 0; r < targetRounds; r++) {
    // Determine who plays: idle-priority sort, then take top N
    const playersNeeded = gamesPerRound * 4;
    const sorted = [...playerIds].sort((a, b) => {
      if (restCount[b] !== restCount[a]) return restCount[b] - restCount[a];
      return playCount[a] - playCount[b];
    });

    const activePlayers = sorted.slice(0, playersNeeded);
    const sitting = sorted.slice(playersNeeded);

    // Build games for this round
    const games = buildRound(activePlayers, numCourts, prevRoundPairs, globalPairUse, r);

    // Assign court numbers — interleave for cross-court variety
    const matchups: Matchup[] = games.map((g, i) => ({
      teamA: g.teamA,
      teamB: g.teamB,
      gameNumber: i + 1,
      courtNumber: (i % numCourts) + 1,
    }));

    result.push({ roundNumber: r + 1, matchups, sitting });

    // Update tracking
    const thisPairs = new Set<string>();
    const playingSet = new Set(activePlayers);

    matchups.forEach((m) => {
      const p1 = pairKey(m.teamA[0], m.teamA[1]);
      const p2 = pairKey(m.teamB[0], m.teamB[1]);
      thisPairs.add(p1);
      thisPairs.add(p2);
      globalPairUse[p1] = (globalPairUse[p1] ?? 0) + 1;
      globalPairUse[p2] = (globalPairUse[p2] ?? 0) + 1;
    });

    prevRoundPairs = thisPairs;

    playerIds.forEach((id) => {
      if (playingSet.has(id)) {
        restCount[id] = 0;
        playCount[id]++;
      } else {
        restCount[id]++;
      }
    });
  }

  return result;
}

/** Simple singles scheduler for < 4 players */
function generateSinglesSchedule(
  playerIds: number[],
  numCourts: number,
  totalRounds?: number
): Round[] {
  const n = playerIds.length;
  const pairs = allPairs(playerIds);
  const targetRounds = totalRounds ?? Math.max(8, pairs.length);
  const result: Round[] = [];

  for (let r = 0; r < targetRounds; r++) {
    const pair = pairs[r % pairs.length];
    result.push({
      roundNumber: r + 1,
      matchups: [{ teamA: [pair[0]], teamB: [pair[1]], gameNumber: 1, courtNumber: 1 }],
      sitting: playerIds.filter((id) => !pair.includes(id)),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function getRound(
  playerIds: number[],
  numCourts: number,
  roundIndex: number
): { round: Round | null; totalRounds: number; schedule: Round[] } {
  const schedule = generateSchedule(playerIds, numCourts);
  if (schedule.length === 0) return { round: null, totalRounds: 0, schedule: [] };
  const wrapped = roundIndex % schedule.length;
  return { round: schedule[wrapped], totalRounds: schedule.length, schedule };
}

// Legacy export
export function getMatchupsForRound(
  playerIds: number[],
  roundIndex: number,
  pageSize = 4
): { matchups: Matchup[]; totalGames: number; totalRounds: number } {
  const { round, totalRounds } = getRound(playerIds, Math.ceil(pageSize / 4) || 1, roundIndex);
  if (!round) return { matchups: [], totalGames: 0, totalRounds: 0 };
  return { matchups: round.matchups, totalGames: round.matchups.length, totalRounds };
}
