/**
 * Persistent high score tracking.
 * Stores a sorted leaderboard per game.
 */

import { load, save } from "./storage";

export interface ScoreEntry {
  score: number;
  name: string;
  date: string;
}

const SCORES_KEY = "highscores";

/** Get the high score leaderboard, sorted descending. */
export function getHighScores(max = 10): ScoreEntry[] {
  const scores = load<ScoreEntry[]>(SCORES_KEY) ?? [];
  return scores.slice(0, max);
}

/** Get the top high score, or 0 if none. */
export function getTopScore(): number {
  const scores = getHighScores(1);
  return scores.length > 0 ? scores[0].score : 0;
}

/** Submit a score. Returns true if it made the leaderboard. */
export function submitScore(score: number, name = "Player", max = 10): boolean {
  const scores = load<ScoreEntry[]>(SCORES_KEY) ?? [];
  const entry: ScoreEntry = {
    score,
    name,
    date: new Date().toISOString().split("T")[0],
  };

  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, max);
  save(SCORES_KEY, trimmed);

  return trimmed.some((e) => e === entry);
}

/** Check if a score would make the leaderboard. */
export function isHighScore(score: number, max = 10): boolean {
  const scores = getHighScores(max);
  if (scores.length < max) return true;
  return score > scores[scores.length - 1].score;
}

/** Clear all high scores. */
export function clearHighScores(): void {
  save(SCORES_KEY, []);
}
