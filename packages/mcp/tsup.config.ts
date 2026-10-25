import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: { composite: false },
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [
    /^@node-i3x\//,
  ],
});
