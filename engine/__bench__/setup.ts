/**
 * Bench preload — installs canvas/DOM stubs so pretext and AsciiRenderer can run
 * under Bun without a real browser. Width is proportional to text length so
 * layout produces realistic line counts.
 */

const FONT_SIZE_RE = /(\d+(?:\.\d+)?)px/;

function fontSizeOf(font: string): number {
  const m = font.match(FONT_SIZE_RE);
  return m ? Number.parseFloat(m[1]) : 16;
}

function makeCtx() {
  const ctx: any = {
    font: '16px "Fira Code", monospace',
    fillStyle: "#fff",
    strokeStyle: "#fff",
    textAlign: "center",
    textBaseline: "middle",
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    canvas: null,
  };
  ctx.measureText = (text: string) => ({ width: text.length * fontSizeOf(ctx.font) * 0.6 });
  // All draw/state methods are no-ops — we're benching CPU work, not GPU.
  for (const name of [
    "save",
    "restore",
    "translate",
    "scale",
    "rotate",
    "setTransform",
    "transform",
    "fillRect",
    "fillText",
    "strokeRect",
    "strokeText",
    "clearRect",
    "beginPath",
    "closePath",
    "moveTo",
    "lineTo",
    "arc",
    "rect",
    "stroke",
    "fill",
    "drawImage",
  ]) {
    ctx[name] = () => {};
  }
  return ctx;
}

const sharedCtx = makeCtx();

class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return sharedCtx;
  }
}

(globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

(globalThis as any).window = (globalThis as any).window ?? {
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
};

export function makeCanvas(width = 800, height = 600) {
  const ctx = makeCtx();
  const canvas: any = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: () => ctx,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    style: {},
  };
  ctx.canvas = canvas;
  return canvas as HTMLCanvasElement;
}
