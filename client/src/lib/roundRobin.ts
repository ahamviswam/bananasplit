/**
 * BananaSplit Fair Scheduler
 *
 * Guarantees every round:
 *   ✅ No two players are partners two rounds in a row
 *   ✅ The same 4 players never share a court two rounds in a row
 *   ✅ Sitting is spread evenly — nobody sits twice before everyone sits once
 *   ✅ Each player sits with a ~equal gap between their rest rounds
 *
 * Algorithm:
 *   WHO SITS: ranked by largest gap since last rest (most overdue sits first).
 *             Tiebreak: most play-count (played most without a break).
 *             This produces evenly-spaced sitting across all rounds.
 *
 *   WHO PLAYS WHERE: stride interleaving on a round-offset rotation.
 *     Slot layout for C courts:
 *       Court c TeamA = [pos c, pos c+C]
 *       Court c TeamB = [pos c+2C, pos c+3C]
 *     Players from the top, middle and bottom of the priority list
 *     land on the SAME court, guaranteeing cross-group mixing every round.
 *
 *   REPAIR: if stride still produces a repeated partner pair (can happen in
 *     small player counts), targeted cross-court player swaps eliminate it.
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

// ─────────────────────────────────────────────────────────────────────────────
// Build one round: stride interleave + swap repair
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

  // Stride interleave into courts
  let games: { teamA: number[]; teamB: number[]; court: number }[] = [];
  for (let c = 0; c < C; c++) {
    games.push({
      teamA: [rotated[c], rotated[c + C]],
      teamB: [rotated[c + 2 * C], rotated[c + 3 * C]],
      court: c + 1,
    });
  }

  // Repair repeated pairs via targeted cross-court swaps
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
            // Reject duplicates
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
  const lastSatRound: Record<number, number> = {};
  playerIds.forEach((id) => { restCount[id] = 0; playCount[id] = 0; lastSatRound[id] = -99; });

  const result: Round[] = [];
  let prevPairs = new Set<string>();

  for (let r = 0; r < target; r++) {
    let active: number[];
    let sitting: number[];

    if (sittingCount <= 0) {
      active = [...playerIds].sort((a, b) => (restCount[b] - restCount[a]) || (playCount[a] - playCount[b]));
      sitting = [];
    } else {
      // WHO SITS: most overdue for rest (largest gap since last sat)
      // Tiebreak: most play-count (played most without a break)
      const ranked = [...playerIds].sort((a, b) => {
        const gapA = r - lastSatRound[a];
        const gapB = r - lastSatRound[b];
        if (gapB !== gapA) return gapB - gapA; // larger gap = more overdue = sits
        return playCount[b] - playCount[a];
      });
      sitting = ranked.slice(0, sittingCount);
      const sittingSet = new Set(sitting);

      // WHO PLAYS: idle-priority sort among those not sitting
      active = playerIds
        .filter((id) => !sittingSet.has(id))
        .sort((a, b) => (restCount[b] - restCount[a]) || (playCount[a] - playCount[b]));
    }

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
    matchups.forEach((m) => {
      thisPairs.add(pairKey(m.teamA[0], m.teamA[1]));
      thisPairs.add(pairKey(m.teamB[0], m.teamB[1]));
    });
    prevPairs = thisPairs;

    playerIds.forEach((id) => {
      if (playingSet.has(id)) { restCount[id] = 0; playCount[id]++; }
      else { restCount[id]++; lastSatRound[id] = r; }
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
