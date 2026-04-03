import peerDepsExternal from "rollup-plugin-peer-deps-external";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import replace from "@rollup/plugin-replace";
import path from "path";
import pkg from "./package.json" with { type: 'json' };

export default [
  {
    input: "src/index.ts",
    output: {
      file: path.join("build", "index.mjs"),
      banner: "#!/usr/bin/env node",
      format: "esm",
    },
    plugins: [
      peerDepsExternal({ includeDependencies: true }),
      replace({
        preventAssignment: true,
        __IS_ESM__: "true",
        __PACKAGE_VERSION__: JSON.stringify(pkg.version),
      }),
      typescript({ tsconfig: "./tsconfig.json", noEmit: true }),
    ],
  },
  {
    input: "src/index.ts",
    output: {
      file: path.join("build", "index.cjs"),
      banner: "#!/usr/bin/env node",
      format: "commonjs",
    },
    plugins: [
      peerDepsExternal({ includeDependencies: true }),
      replace({
        preventAssignment: true,
        __IS_ESM__: "false",
        __PACKAGE_VERSION__: JSON.stringify(pkg.version),
      }),
      typescript({ tsconfig: "./tsconfig.json", noEmit: true }),
    ],
  },
  {
    input: "src/index.ts",
    output: {
      file: "./types.d.ts",
      format: "es",
    },
    plugins: [dts()],
  },
];