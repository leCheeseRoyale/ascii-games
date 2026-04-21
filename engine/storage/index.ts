export {
  type GameStateSources,
  type RehydratedGameState,
  type RehydrateOptions,
  rehydrateGameState,
  type SerializedGameState,
  serializeGameState,
} from "./game-state";
export {
  clearHighScores,
  getHighScores,
  getTopScore,
  isHighScore,
  type ScoreEntry,
  submitScore,
} from "./high-scores";
export {
  clearAll,
  has,
  load,
  loadCompressed,
  remove,
  save,
  saveCompressed,
  setStoragePrefix,
} from "./storage";
