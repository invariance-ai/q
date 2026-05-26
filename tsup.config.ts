import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  target: "node20",
  sourcemap: true,
  // Ink + React (and the SDKs) stay external and are installed from npm,
  // which avoids duplicate-React issues in the chat TUI.
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
