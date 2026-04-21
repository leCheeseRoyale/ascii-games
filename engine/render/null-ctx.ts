/**
 * Null rendering context and canvas for headless engine mode.
 * All drawing operations are no-ops; measurement returns zero-width.
 */

export function createNullCtx(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop) {
      if (prop === "canvas")
        return { clientWidth: 800, clientHeight: 600, width: 800, height: 600 };
      if (prop === "measureText") return () => ({ width: 0 });
      return () => {};
    },
  });
}

export function createNullCanvas(width = 800, height = 600): HTMLCanvasElement {
  return {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    style: {},
    getContext: () => createNullCtx(),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}
