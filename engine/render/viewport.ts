/**
 * Viewport — tracks display dimensions, orientation, and safe-area insets
 * on mobile devices. Listens to `resize` and `orientationchange` events
 * and emits `viewport:resized` / `viewport:orientation` via the shared
 * event bus so games can react without installing their own listeners.
 *
 * Safe-area insets are resolved via a hidden probe element that reads the
 * computed `env(safe-area-inset-*)` CSS values. On devices without a notch
 * (or in non-browser envs), all insets are 0.
 */

import { events } from "@shared/events";

export type Orientation = "portrait" | "landscape";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export class Viewport {
  width = 0;
  height = 0;
  orientation: Orientation = "landscape";
  safeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  private probe: HTMLElement | null = null;
  private onResize: () => void;
  private destroyed = false;

  constructor() {
    this.onResize = () => this.refresh();
    if (typeof window !== "undefined") {
      this._installProbe();
      window.addEventListener("resize", this.onResize);
      window.addEventListener("orientationchange", this.onResize);
    }
    this.refresh(/* silent: */ true);
  }

  /**
   * Re-measure the viewport and emit events if anything changed. Called
   * automatically on resize/orientationchange; games can call it manually
   * after toggling fullscreen, pinch-zoom, etc.
   */
  refresh(silent = false): void {
    if (typeof window === "undefined") return;
    const prevOrientation = this.orientation;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.orientation = this.width >= this.height ? "landscape" : "portrait";
    this.safeArea = this._readSafeArea();
    if (silent) return;
    events.emit("viewport:resized", {
      width: this.width,
      height: this.height,
      orientation: this.orientation,
    });
    if (prevOrientation !== this.orientation) {
      events.emit("viewport:orientation", this.orientation);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.onResize);
      window.removeEventListener("orientationchange", this.onResize);
    }
    this.probe?.remove();
    this.probe = null;
  }

  private _installProbe(): void {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "0";
    el.style.height = "0";
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";
    // Read insets via padding — the CSS engine resolves env() at compute time.
    el.style.paddingTop = "env(safe-area-inset-top)";
    el.style.paddingRight = "env(safe-area-inset-right)";
    el.style.paddingBottom = "env(safe-area-inset-bottom)";
    el.style.paddingLeft = "env(safe-area-inset-left)";
    document.body?.appendChild(el);
    this.probe = el;
  }

  private _readSafeArea(): SafeAreaInsets {
    if (!this.probe || typeof getComputedStyle !== "function") {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const cs = getComputedStyle(this.probe);
    const parse = (v: string) => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      top: parse(cs.paddingTop),
      right: parse(cs.paddingRight),
      bottom: parse(cs.paddingBottom),
      left: parse(cs.paddingLeft),
    };
  }
}
