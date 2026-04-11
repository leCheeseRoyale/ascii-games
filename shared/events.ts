import mitt from "mitt";

type EngineEvents = {
  "game:start": void;
  "game:resume": void;
  "game:restart": void;
  "game:pause": void;
  "scene:loaded": string;
  "engine:started": void;
  "engine:stopped": void;
  "engine:paused": void;
  "engine:resumed": void;
  // Turn management events
  "turn:start": number;
  "turn:end": number;
  "phase:enter": string;
  "phase:exit": string;
};

export const events = mitt<EngineEvents>();
