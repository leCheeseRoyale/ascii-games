import type { Tags } from "@shared/types";

export function createTags(...names: string[]): Tags {
  return { values: new Set(names) };
}
