declare module "zzfx" {
  export function zzfx(...params: number[]): AudioBufferSourceNode;
  export const ZZFX: {
    x: AudioContext;
    volume: number;
  };
}

declare module "@zzfx-studio/zzfxm" {
  // biome-ignore lint/suspicious/noExplicitAny: zzfxm uses loose array types internally
  export type Channel = any;
  // biome-ignore lint/suspicious/noExplicitAny: zzfxm uses loose array types internally
  export type Instrument = any;
  // biome-ignore lint/suspicious/noExplicitAny: zzfxm uses loose array types internally
  export type Pattern = any;
  export const ZZFXM: {
    // biome-ignore lint/suspicious/noExplicitAny: zzfxm build/play accept loose arrays
    build(...args: any[]): any[][];
    // biome-ignore lint/suspicious/noExplicitAny: zzfxm build/play accept loose arrays
    play(samples: any[][], volume?: number, ...args: any[]): AudioBufferSourceNode;
  };
  // biome-ignore lint/suspicious/noExplicitAny: zzfxm internal
  export function zzfxP(...args: any[]): AudioBufferSourceNode;
}
