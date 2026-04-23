import { defineConfig } from "tsup";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

export default defineConfig({
  tsconfig: resolve(__dirname, "tsconfig.json"),
  entry: {
    index: resolve(root, "engine/index.ts"),
    store: resolve(root, "ui/store.ts"),
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  noExternal: ["lz-string"],
  external: [
    "react",
    "react-dom",
  ],
  esbuildOptions(options) {
    options.alias = {
      "@shared": resolve(root, "shared"),
      "@engine": resolve(root, "engine"),
    };
  },
});
