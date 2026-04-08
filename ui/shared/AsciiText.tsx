import { COLORS } from "@shared/constants";
import type React from "react";
import type { CSSProperties } from "react";

export type AsciiTextSize = "sm" | "md" | "lg" | "xl";

interface AsciiTextProps {
  children: React.ReactNode;
  size?: AsciiTextSize;
  color?: string;
  blink?: boolean;
  glow?: boolean;
  style?: CSSProperties;
}

const sizeMap: Record<AsciiTextSize, string> = {
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "48px",
};

const glowSize: Record<AsciiTextSize, string> = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "16px",
};

// Inject blink keyframes once
let injected = false;
function injectKeyframes() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ascii-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function AsciiText({
  children,
  size = "md",
  color = COLORS.fg,
  blink = false,
  glow = false,
  style: extraStyle,
}: AsciiTextProps) {
  if (blink) injectKeyframes();

  const fontSize = sizeMap[size];
  const style: CSSProperties = {
    fontFamily: '"Fira Code", monospace',
    fontSize,
    color,
    lineHeight: 1.4,
    letterSpacing: "0.05em",
    whiteSpace: "pre",
    userSelect: "none",
    ...(blink ? { animation: "ascii-blink 1s step-end infinite" } : {}),
    ...(glow ? { textShadow: `0 0 ${glowSize[size]} ${color}` } : {}),
    ...extraStyle,
  };

  return <span style={style}>{children}</span>;
}
