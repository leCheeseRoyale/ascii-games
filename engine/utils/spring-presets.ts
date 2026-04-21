import type { Spring } from "@shared/types";

type SpringConfig = Pick<Spring, "strength" | "damping">;

export const SpringPresets = {
  stiff: { strength: 0.12, damping: 0.9 } as SpringConfig,
  snappy: { strength: 0.1, damping: 0.91 } as SpringConfig,
  bouncy: { strength: 0.08, damping: 0.88 } as SpringConfig,
  smooth: { strength: 0.06, damping: 0.93 } as SpringConfig,
  floaty: { strength: 0.04, damping: 0.95 } as SpringConfig,
  gentle: { strength: 0.02, damping: 0.97 } as SpringConfig,
} as const;
