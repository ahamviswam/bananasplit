/**
 * Fair Round-Robin Scheduler for Pickleball
 *
 * Core rules:
 * 1. Each "round" runs `numCourts` games simultaneously.
 * 2. Each game uses 4 players (2v2 doubles) or 2 players (1v1 singles if < 4).
 * 3. Players who sat out the longest are ALWAYS scheduled first (idle-priority).
 * 4. Within players of equal wait-time, pairings rotate to ensure variety.
 * 5. "Next Round" advances to the next batch — previous idle players play first.
 *
 * Algorithm:
 *  - Maintain a `restCount` for every player (how many rounds they've sat out).
 *  - Each round: sort players descending by restCount, pick the top N needed.
 *  - Pair those players into teams using a balanced rotation (not pure combinations)
 *    so the same teams don't repeat back-to-back.
 *  - After each round, increment restCount for everyone who sat out, reset to 0
 *    for everyone who played.
 *  - Pre-compute a fixed sequence of `totalRounds` rounds for stable pagination.
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
  sitting: number[]; // player IDs sitting this round
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pair up an even-length array into doubles games using balanced rotation.
 *  E.g. [P1,P2,P3,P4] → P1+P2 vs P3+P4, then next call: P1+P3 vs P2+P4 etc.
 *  `rotationSeed` ensures variety across rounds. */
function pairIntoGames(
  players: number[],
  rotationSeed: number
): { teamA: number[]; teamB: number[] }[] {
  // Use a seeded rotation: shift the array by rotationSeed positions then pair
  const n = players.length;
  const rotated = [
    ...players.slice(rotationSeed % n),
    ...players.slice(0, rotationSeed % n),
  ];

  const games: { teamA: number[]; teamB: number[] }[] = [];
  for (let i = 0; i + 3 < rotated.length; i += 4) {
    // Alternate pairing style based on rotation to avoid always same pairs
    const [a, b, c, d] = rotated.slice(i, i + 4);
    const style = Math.floor(rotationSeed / Math.max(1, n / 4)) % 3;
    if (style === 0) games.push({ teamA: [a, b], teamB: [c, d] });
    else if (style === 1) games.push({ teamA: [a, c], teamB: [b, d] });
    else games.push({ teamA: [a, d], teamB: [b, c] });
  }
  return games;
}

/** Singles: pair players into 1v1 games */
function pairSingles(players: number[]): { teamA: number[]; teamB: number[] }[] {
  const games: { teamA: number[]; teamB: number[] }[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    games.push({ teamA: [players[i]], teamB: [players[i + 1]] });
  }
  return games;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a sequence of rounds for a session.
 *
 * @param playerIds   All participant IDs
 * @param numCourts   Number of courts available (games per round)
 * @param totalRounds How many rounds to pre-compute (default: enough for everyone to play ~3 times)
 */
export function generateSchedule(
  playerIds: number[],
  numCourts: number,
  totalRounds?: number
): Round[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const isDoubles = n >= 4;
  const playersPerGame = isDoubles ? 4 : 2;
  const playersPerRound = Math.min(numCourts * playersPerGame, n);
  // Round down to nearest valid game count
  const gamesPerRound = Math.floor(playersPerRound / playersPerGame);

  if (gamesPerRound === 0) return [];

  // Default: enough rounds so every player plays at least 4 times
  const rounds = totalRounds ?? Math.max(8, Math.ceil((n * 4) / gamesPerRound));

  // restCount[id] = how many consecutive rounds this player has sat out
  const restCount: Record<number, number> = {};
  playerIds.forEach((id) => (restCount[id] = 0));

  // playCount[id] = total games played (for tie-breaking)
  const playCount: Record<number, number> = {};
  playerIds.forEach((id) => (playCount[id] = 0));

  const result: Round[] = [];

  for (let r = 0; r < rounds; r++) {
    // Sort players: most rested first, then fewest games played as tie-breaker
    const sorted = [...playerIds].sort((a, b) => {
      if (restCount[b] !== restCount[a]) return restCount[b] - restCount[a];
      return playCount[a] - playCount[b];
    });

    // Pick the top players needed for this round
    const needed = gamesPerRound * playersPerGame;
    const playing = sorted.slice(0, needed);
    const sitting = sorted.slice(needed);

    // Generate game pairings with rotation for variety
    const pairs = isDoubles
      ? pairIntoGames(playing, r)
      : pairSingles(playing);

    let gameNum = 1;
    const matchups: Matchup[] = pairs.map((p, i) => ({
      ...p,
      gameNumber: gameNum++,
      courtNumber: (i % numCourts) + 1,
    }));

    result.push({
      roundNumber: r + 1,
      matchups,
      sitting,
    });

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

/**
 * Get a single round by index (0-based, wraps around).
 * This is what the UI calls to display the current page.
 */
export function getRound(
  playerIds: number[],
  numCourts: number,
  roundIndex: number
): {
  round: Round | null;
  totalRounds: number;
  schedule: Round[];
} {
  const schedule = generateSchedule(playerIds, numCourts);
  if (schedule.length === 0) return { round: null, totalRounds: 0, schedule: [] };

  const wrapped = roundIndex % schedule.length;
  return {
    round: schedule[wrapped],
    totalRounds: schedule.length,
    schedule,
  };
}

// Keep old export for any remaining references
export function getMatchupsForRound(
  playerIds: number[],
  roundIndex: number,
  pageSize = 4
): { matchups: import("./roundRobin").Matchup[]; totalGames: number; totalRounds: number } {
  const { round, totalRounds } = getRound(playerIds, Math.ceil(pageSize / 4) || 1, roundIndex);
  if (!round) return { matchups: [], totalGames: 0, totalRounds: 0 };
  return {
    matchups: round.matchups,
    totalGames: round.matchups.length,
    totalRounds,
  };
}
