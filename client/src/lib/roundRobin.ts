/**
 * Fair Round-Robin Scheduler for Pickleball
 *
 * Core design goals:
 * 1. Players from ALL courts are mixed every round — no player stays stuck
 *    on the same court with the same group.
 * 2. Every player faces different opponents and partners each round.
 * 3. Players who sat out get priority next round (idle-first).
 * 4. Uses the "polygon / circle rotation" method — the standard algorithm
 *    for round-robin tournaments — applied across all courts at once.
 *
 * Polygon rotation (N players):
 *   - Fix player[0], rotate the other N-1 players clockwise each round.
 *   - This produces N-1 unique rounds where every pair of players meets exactly once.
 *   - After selecting which players play this round, interleave them across
 *     courts so Court 1 ≠ Court 2 ≠ Court 3 in composition.
 *
 * Team assignment within a round:
 *   - After rotation, the N active players are interleaved across courts:
 *     slot 0→Court1 teamA, slot 1→Court2 teamA, ..., slot C→Court1 teamB ...
 *   - This guarantees players from different "rotation positions" are on
 *     the same court, mixing partners and opponents every round.
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
// Polygon rotation — the standard round-robin engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given N players, produce all unique rotation orders using the polygon method.
 * Returns an array of N-1 (or N if odd) rotation arrays, each containing
 * all N player IDs in a rotation-derived order.
 */
function buildRotations(players: number[]): number[][] {
  const n = players.length;
  if (n < 2) return [];

  // For odd N, add a "bye" slot (null=-1) to make it even
  const ring = n % 2 === 0 ? [...players] : [...players, -1];
  const size = ring.length;
  const rounds: number[][] = [];

  // Fix ring[0], rotate ring[1..] clockwise each round
  // Produces size-1 rounds
  for (let r = 0; r < size - 1; r++) {
    // Build this rotation: fix position 0, rotate the rest
    const rotated = [ring[0]];
    for (let i = 1; i < size; i++) {
      // Position i in this rotation = ring[(i - 1 + r) % (size - 1) + 1]
      // Standard polygon: slot j gets ring[((j - 1 + r) % (size - 1)) + 1]
      rotated.push(ring[((i - 1 + r) % (size - 1)) + 1]);
    }
    // Remove bye placeholder
    rounds.push(rotated.filter((id) => id !== -1));
  }
  return rounds;
}

/**
 * Assign players to courts with cross-court interleaving.
 *
 * Given `playing` = [P1, P2, P3, P4, P5, P6, P7, P8] and 2 courts:
 * Instead of Court1=[P1,P2,P3,P4] Court2=[P5,P6,P7,P8],
 * interleave by position:
 *   Court1 TeamA = [pos0, pos2] = [P1, P3]
 *   Court2 TeamA = [pos1, pos3] = [P2, P4]
 *   Court1 TeamB = [pos4, pos6] = [P5, P7]
 *   Court2 TeamB = [pos5, pos7] = [P6, P8]
 *
 * This means each court has players from across the rotation — not just
 * consecutive blocks — so partners and opponents change every round.
 */
function assignToCourts(
  playing: number[],
  numCourts: number,
  isDoubles: boolean
): { teamA: number[]; teamB: number[]; court: number }[] {
  const playersPerGame = isDoubles ? 4 : 2;
  const gamesThisRound = Math.floor(playing.length / playersPerGame);
  const results: { teamA: number[]; teamB: number[]; court: number }[] = [];

  if (isDoubles) {
    // Interleave: fill TeamA slots across all courts first, then TeamB slots
    // TeamA slot for court c = positions [c, c + numCourts]
    // TeamB slot for court c = positions [c + 2*numCourts, c + 3*numCourts]
    for (let c = 0; c < gamesThisRound; c++) {
      const court = (c % numCourts) + 1;
      // Interleaved positions for this game:
      // Instead of 4 consecutive, pick from spread positions
      const pos = [
        c,                              // TeamA player 1
        c + gamesThisRound,             // TeamA player 2
        c + gamesThisRound * 2,         // TeamB player 1
        c + gamesThisRound * 3,         // TeamB player 2
      ];
      // Bounds check
      if (pos[3] >= playing.length) {
        // Fall back to consecutive if out of bounds
        const base = c * 4;
        if (base + 3 < playing.length) {
          results.push({
            teamA: [playing[base], playing[base + 1]],
            teamB: [playing[base + 2], playing[base + 3]],
            court,
          });
        }
      } else {
        results.push({
          teamA: [playing[pos[0]], playing[pos[1]]],
          teamB: [playing[pos[2]], playing[pos[3]]],
          court,
        });
      }
    }
  } else {
    // Singles: interleave pairs
    for (let c = 0; c < gamesThisRound; c++) {
      const court = (c % numCourts) + 1;
      const p1 = playing[c];
      const p2 = playing[c + gamesThisRound];
      if (p1 !== undefined && p2 !== undefined) {
        results.push({ teamA: [p1], teamB: [p2], court });
      }
    }
  }

  return results;
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

  const isDoubles = n >= 4;
  const playersPerGame = isDoubles ? 4 : 2;
  const maxPlayersPerRound = numCourts * playersPerGame;
  const gamesPerRound = Math.min(numCourts, Math.floor(n / playersPerGame));

  if (gamesPerRound === 0) return [];

  // Build the full polygon rotation table
  // Each entry = a rotation order of all (or most) players
  const rotations = buildRotations(playerIds);
  // How many rounds to generate — cycle through rotations enough times
  const targetRounds = totalRounds ?? Math.max(rotations.length, Math.ceil((n * 4) / gamesPerRound));

  // Track rest/play for idle-priority
  const restCount: Record<number, number> = {};
  const playCount: Record<number, number> = {};
  playerIds.forEach((id) => { restCount[id] = 0; playCount[id] = 0; });

  const result: Round[] = [];

  for (let r = 0; r < targetRounds; r++) {
    // Get base rotation for this round (cycle through rotations)
    const baseRotation = rotations[r % rotations.length] ?? [...playerIds];

    // How many players actually play this round
    const neededPlayers = gamesPerRound * playersPerGame;
    const sittingCount = baseRotation.length - neededPlayers;

    let playing: number[];
    let sitting: number[];

    if (sittingCount <= 0) {
      // Everyone plays — use rotation order directly for maximum mixing
      playing = [...baseRotation];
      sitting = [];
    } else {
      // Some players sit out. Apply idle-priority only to decide WHO sits,
      // but preserve rotation interleaving for those who play.
      // Step 1: find who has the most rest (they must play)
      const byRest = [...baseRotation].sort((a, b) => {
        if (restCount[b] !== restCount[a]) return restCount[b] - restCount[a];
        return playCount[a] - playCount[b];
      });
      // The players who sit = those with the least rest time
      const sittingSet = new Set(byRest.slice(neededPlayers));
      // Preserve rotation order among those who play (keeps cross-court mixing)
      playing = baseRotation.filter((id) => !sittingSet.has(id));
      sitting = baseRotation.filter((id) => sittingSet.has(id));
    }

    // Assign to courts with cross-court interleaving
    const courtAssignments = assignToCourts(playing, numCourts, isDoubles);

    const matchups: Matchup[] = courtAssignments.map((g, i) => ({
      teamA: g.teamA,
      teamB: g.teamB,
      gameNumber: i + 1,
      courtNumber: g.court,
    }));

    result.push({ roundNumber: r + 1, matchups, sitting });

    // Update rest/play counts
    const playingSet = new Set(playing);
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
