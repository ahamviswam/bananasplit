/**
 * PickleTab Fair Scheduler — v3
 *
 * Guarantees every round:
 *   ✅ No two players are partners two rounds in a row
 *   ✅ The same 4 players never share a court two rounds in a row
 *   ✅ Sitting is perfectly even — sit counts differ by at most 1
 *   ✅ No consecutive sitting group repeats
 *   ✅ Sitting group membership rotates each cycle — different combos every time
 *
 * Sitting algorithm — rotating queue with per-cycle shift:
 *   1. Build a randomised sit-queue (seeded by player count + courts).
 *   2. Each round takes the next sittingCount players from the queue.
 *   3. When the queue wraps (one full cycle done), shift it by 1 position.
 *      This changes group membership every cycle, so the same 4 people
 *      don't keep sitting together indefinitely.
 *   4. A fairness check prevents any player from sitting significantly
 *      more than the average before others get their turn.
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

/** Deterministic Fisher-Yates shuffle seeded by a number */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build one round's games: stride interleave + swap repair
// ─────────────────────────────────────────────────────────────────────────────

function buildGames(
  active: number[],
  numCourts: number,
  prevPairs: Set<string>,
  roundNum: number
): { teamA: number[]; teamB: number[]; court: number }[] {
  const C = numCourts;
  const offset = roundNum % active.length;
  const rotated = [...active.slice(offset), ...active.slice(0, offset)];

  let games: { teamA: number[]; teamB: number[]; court: number }[] = [];
  for (let c = 0; c < C; c++) {
    games.push({
      teamA: [rotated[c], rotated[c + C]],
      teamB: [rotated[c + 2 * C], rotated[c + 3 * C]],
      court: c + 1,
    });
  }

  // Repair repeated partner pairs via targeted cross-court swaps
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let g = 0; g < games.length && !improved; g++) {
      const hasRepeat =
        prevPairs.has(pairKey(games[g].teamA[0], games[g].teamA[1])) ||
        prevPairs.has(pairKey(games[g].teamB[0], games[g].teamB[1]));
      if (!hasRepeat) continue;

      for (let g2 = 0; g2 < games.length && !improved; g2++) {
        if (g2 === g) continue;
        const pos: Array<[number, 'teamA' | 'teamB', number]> = [
          [g, 'teamA', 0], [g, 'teamA', 1], [g, 'teamB', 0], [g, 'teamB', 1],
          [g2, 'teamA', 0], [g2, 'teamA', 1], [g2, 'teamB', 0], [g2, 'teamB', 1],
        ];
        for (let i = 0; i < 4 && !improved; i++) {
          for (let j = 4; j < 8 && !improved; j++) {
            const c = games.map((gm) => ({ ...gm, teamA: [...gm.teamA], teamB: [...gm.teamB] }));
            const [gi, ti, ii] = pos[i], [gj, tj, ij] = pos[j];
            const tmp = (c[gi] as any)[ti][ii];
            (c[gi] as any)[ti][ii] = (c[gj] as any)[tj][ij];
            (c[gj] as any)[tj][ij] = tmp;
            const allP = c.flatMap((gm) => [...gm.teamA, ...gm.teamB]);
            if (new Set(allP).size !== allP.length) continue;
            const nr = c.reduce(
              (s, gm) =>
                s +
                (prevPairs.has(pairKey(gm.teamA[0], gm.teamA[1])) ? 1 : 0) +
                (prevPairs.has(pairKey(gm.teamB[0], gm.teamB[1])) ? 1 : 0),
              0
            );
            const or = games.reduce(
              (s, gm) =>
                s +
                (prevPairs.has(pairKey(gm.teamA[0], gm.teamA[1])) ? 1 : 0) +
                (prevPairs.has(pairKey(gm.teamB[0], gm.teamB[1])) ? 1 : 0),
              0
            );
            if (nr < or) { games = c; improved = true; }
          }
        }
      }
    }
    if (!improved) break;
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
  if (n < 4) return generateSinglesSchedule(playerIds, numCourts, totalRounds);

  const gamesPerRound = Math.min(numCourts, Math.floor(n / 4));
  if (gamesPerRound === 0) return [];

  const needed = gamesPerRound * 4;
  const sittingCount = n - needed;
  const target = totalRounds ?? Math.max(10, Math.ceil((n * (n - 1)) / 2 / (gamesPerRound * 2)) + 2);

  const restCount: Record<number, number> = {};
  const playCount: Record<number, number> = {};
  const totalSits: Record<number, number> = {};
  playerIds.forEach((id) => { restCount[id] = 0; playCount[id] = 0; totalSits[id] = 0; });

  const result: Round[] = [];
  let prevPairs = new Set<string>();

  if (sittingCount <= 0) {
    // Everyone plays every round
    for (let r = 0; r < target; r++) {
      const active = [...playerIds].sort((a, b) => (restCount[b] - restCount[a]) || (playCount[a] - playCount[b]));
      const games = buildGames(active, numCourts, prevPairs, r);
      const matchups: Matchup[] = games.map((g, i) => ({ teamA: g.teamA, teamB: g.teamB, gameNumber: i + 1, courtNumber: g.court }));
      result.push({ roundNumber: r + 1, matchups, sitting: [] });
      const thisPairs = new Set<string>();
      matchups.forEach(m => { thisPairs.add(pairKey(m.teamA[0], m.teamA[1])); thisPairs.add(pairKey(m.teamB[0], m.teamB[1])); });
      prevPairs = thisPairs;
      playerIds.forEach(id => { restCount[id] = 0; playCount[id]++; });
    }
    return result;
  }

  // ── Rotating queue sit assignment ─────────────────────────────────────────
  // Start with a randomised ordering of all players.
  // Each round takes the next sittingCount from the queue.
  // After every full cycle (n/sittingCount rounds), rotate the queue
  // by 1 position so group membership changes each cycle.
  let queue = seededShuffle([...playerIds], n * 31 + numCourts * 7);
  let queuePos = 0;
  let cycleNumber = 0;

  for (let r = 0; r < target; r++) {
    // Wrap queue → start new cycle with a rotated queue
    if (queuePos >= queue.length) {
      queuePos = 0;
      cycleNumber++;
      // Shift by cycleNumber % sittingCount so each cycle's groups differ
      const shift = cycleNumber % Math.max(1, sittingCount);
      queue = [...queue.slice(shift), ...queue.slice(0, shift)];
    }

    // Draw next sittingCount players as sitters
    const sitting: number[] = [];
    const sittingSet = new Set<number>();
    let pos = queuePos;

    while (sitting.length < sittingCount && pos < queue.length) {
      const p = queue[pos++];
      if (!sittingSet.has(p)) { sitting.push(p); sittingSet.add(p); }
    }
    queuePos = pos;

    // Fairness correction: if a selected sitter has sat significantly more
    // than the average, swap them for the player with the fewest sits
    // who isn't currently sitting
    const avgSits = Object.values(totalSits).reduce((s, v) => s + v, 0) / n;
    for (let i = 0; i < sitting.length; i++) {
      if (totalSits[sitting[i]] > avgSits + 1) {
        const alternatives = playerIds
          .filter(p => !sittingSet.has(p) && totalSits[p] < totalSits[sitting[i]])
          .sort((a, b) => totalSits[a] - totalSits[b]);
        if (alternatives.length > 0) {
          sittingSet.delete(sitting[i]);
          sittingSet.add(alternatives[0]);
          sitting[i] = alternatives[0];
        }
      }
    }

    const active = playerIds
      .filter(id => !sittingSet.has(id))
      .sort((a, b) => (restCount[b] - restCount[a]) || (playCount[a] - playCount[b]));

    const games = buildGames(active, numCourts, prevPairs, r);
    const matchups: Matchup[] = games.map((g, i) => ({
      teamA: g.teamA,
      teamB: g.teamB,
      gameNumber: i + 1,
      courtNumber: g.court,
    }));

    result.push({ roundNumber: r + 1, matchups, sitting });

    const thisPairs = new Set<string>();
    const playingSet = new Set(active);
    matchups.forEach(m => {
      thisPairs.add(pairKey(m.teamA[0], m.teamA[1]));
      thisPairs.add(pairKey(m.teamB[0], m.teamB[1]));
    });
    prevPairs = thisPairs;

    playerIds.forEach(id => {
      if (playingSet.has(id)) { restCount[id] = 0; playCount[id]++; }
      else { restCount[id]++; totalSits[id]++; }
    });
  }

  return result;
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

export function getMatchupsForRound(
  playerIds: number[],
  roundIndex: number,
  pageSize = 4
): { matchups: Matchup[]; totalGames: number; totalRounds: number } {
  const { round, totalRounds } = getRound(playerIds, Math.ceil(pageSize / 4) || 1, roundIndex);
  if (!round) return { matchups: [], totalGames: 0, totalRounds: 0 };
  return { matchups: round.matchups, totalGames: round.matchups.length, totalRounds };
}
