import peerDepsExternal from "rollup-plugin-peer-deps-external";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import path from "path";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: path.join("build", "index.mjs"),
        format: "esm",
      },
      {
        file: path.join("build", "index.cjs"),
        format: "commonjs",
      },
    ],
    plugins: [
      peerDepsExternal({
        includeDependencies: true,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        noEmit: true,
      }),
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
