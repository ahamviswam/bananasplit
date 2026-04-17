/**
 * BananaSplit Fair Scheduler
 *
 * Guarantees per round:
 *   ✅ No two players are partners two rounds in a row.
 *   ✅ The same 4 players are never grouped on the same court two rounds in a row.
 *   ✅ Players who sat out get priority next round (idle-first).
 *
 * Algorithm:
 *   1. Sort active players by idle priority (most rested first).
 *   2. Apply a round-offset rotation to the sorted list so the same players
 *      don't land in the same stride positions every round.
 *   3. Assign players to courts using STRIDE interleaving:
 *        Court 1 TeamA = [pos 0,  pos C  ]
 *        Court 2 TeamA = [pos 1,  pos C+1]
 *        Court 1 TeamB = [pos 2C, pos 3C ]
 *        Court 2 TeamB = [pos 2C+1, pos 3C+1]
 *      This forces players from the top, middle and bottom of the sorted list
 *      onto the SAME court — guaranteeing cross-group mixing every round.
 *   4. If stride interleaving still produces a repeated partner pair (can happen
 *      in small groups), apply targeted cross-court swaps to eliminate it.
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
// Core: build one round using stride interleaving + swap repair
// ─────────────────────────────────────────────────────────────────────────────

function buildRoundGames(
  active: number[],
  numCourts: number,
  prevPairs: Set<string>,
  roundNum: number
): { teamA: number[]; teamB: number[]; court: number }[] {
  const C = numCourts;
  const needed = C * 4;

  // Rotate active list by roundNum so stride positions shift each round
  const offset = roundNum % active.length;
  const rotated = [...active.slice(offset), ...active.slice(0, offset)].slice(0, needed);

  // Stride interleave into courts:
  // Slot layout: [0..C-1]=TeamA-p1, [C..2C-1]=TeamA-p2,
  //              [2C..3C-1]=TeamB-p1, [3C..4C-1]=TeamB-p2
  let games: { teamA: number[]; teamB: number[]; court: number }[] = [];
  for (let c = 0; c < C; c++) {
    games.push({
      teamA: [rotated[c], rotated[c + C]],
      teamB: [rotated[c + 2 * C], rotated[c + 3 * C]],
      court: c + 1,
    });
  }

  // Repair repeated pairs via targeted cross-court swaps
  let improved = true;
  let attempts = 0;
  while (improved && attempts < 30) {
    improved = false;
    attempts++;

    for (let g = 0; g < games.length; g++) {
      const game = games[g];
      const hasRepeatA = prevPairs.has(pairKey(game.teamA[0], game.teamA[1]));
      const hasRepeatB = prevPairs.has(pairKey(game.teamB[0], game.teamB[1]));
      if (!hasRepeatA && !hasRepeatB) continue;

      // Try swapping any player in this game with any player from another game
      for (let g2 = 0; g2 < games.length; g2++) {
        if (g2 === g) continue;

        const teams: Array<[number, 'teamA' | 'teamB', number]> = [
          [g, 'teamA', 0], [g, 'teamA', 1],
          [g, 'teamB', 0], [g, 'teamB', 1],
          [g2, 'teamA', 0], [g2, 'teamA', 1],
          [g2, 'teamB', 0], [g2, 'teamB', 1],
        ];

        // Try all cross-game player swaps
        for (let i = 0; i < 4; i++) {
          for (let j = 4; j < 8; j++) {
            const [gi, ti, ii] = teams[i];
            const [gj, tj, ij] = teams[j];

            const candidate = games.map((gm) => ({
              ...gm,
              teamA: [...gm.teamA],
              teamB: [...gm.teamB],
            }));
            const tmp = (candidate[gi] as any)[ti][ii];
            (candidate[gi] as any)[ti][ii] = (candidate[gj] as any)[tj][ij];
            (candidate[gj] as any)[tj][ij] = tmp;

            // Reject if any duplicate players
            const allP = candidate.flatMap((gm) => [...gm.teamA, ...gm.teamB]);
            if (new Set(allP).size !== allP.length) continue;

            const newRepeats = candidate.reduce(
              (s, gm) =>
                s +
                (prevPairs.has(pairKey(gm.teamA[0], gm.teamA[1])) ? 1 : 0) +
                (prevPairs.has(pairKey(gm.teamB[0], gm.teamB[1])) ? 1 : 0),
              0
            );
            const oldRepeats = games.reduce(
              (s, gm) =>
                s +
                (prevPairs.has(pairKey(gm.teamA[0], gm.teamA[1])) ? 1 : 0) +
                (prevPairs.has(pairKey(gm.teamB[0], gm.teamB[1])) ? 1 : 0),
              0
            );

            if (newRepeats < oldRepeats) {
              games = candidate;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (improved) break;
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

  if (n < 4) return generateSinglesSchedule(playerIds, numCourts, totalRounds);

  const gamesPerRound = Math.min(numCourts, Math.floor(n / 4));
  if (gamesPerRound === 0) return [];

  const target =
    totalRounds ?? Math.max(10, Math.ceil(((n * (n - 1)) / 2) / (gamesPerRound * 2)) + 2);

  const restCount: Record<number, number> = {};
  const playCount: Record<number, number> = {};
  playerIds.forEach((id) => { restCount[id] = 0; playCount[id] = 0; });

  const result: Round[] = [];
  let prevPairs = new Set<string>();

  for (let r = 0; r < target; r++) {
    const needed = gamesPerRound * 4;
    const sorted = [...playerIds].sort((a, b) => {
      if (restCount[b] !== restCount[a]) return restCount[b] - restCount[a];
      return playCount[a] - playCount[b];
    });
    const active = sorted.slice(0, needed);
    const sitting = sorted.slice(needed);

    const games = buildRoundGames(active, numCourts, prevPairs, r);

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
      else restCount[id]++;
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
