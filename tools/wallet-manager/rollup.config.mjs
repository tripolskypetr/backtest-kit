import peerDepsExternal from "rollup-plugin-peer-deps-external";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import terser from "@rollup/plugin-terser";
import path from "path";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: path.join("build", "index.mjs"),
        sourcemap: false,
        format: "esm",
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
      terser({
        compress: {
          booleans: true, // Optimize boolean expressions
          collapse_vars: true, // Collapse single-use variables
          comparisons: true, // Optimize comparisons
          computed_props: true, // Optimize computed properties
          conditionals: true, // Optimize conditionals
          dead_code: true, // Remove unreachable code
          drop_console: true, // Remove console statements
          drop_debugger: true, // Remove debugger statements
          evaluate: true, // Evaluate constant expressions
          hoist_funs: true, // Hoist function declarations
          hoist_props: true, // Hoist properties
          hoist_vars: false, // Avoid hoisting vars (safer)
          if_return: true, // Optimize if-return patterns
          inline: 3, // Inline functions aggressively (3 = multiple passes)
          join_vars: true, // Join consecutive var declarations
          keep_fargs: false, // Remove unused function arguments
          loops: true, // Optimize loops
          negate_iife: true, // Negate IIFEs for shorter code
          passes: 3, // Run compression multiple times for better results
          properties: true, // Optimize property access
          pure_getters: true, // Treat getters as pure
          reduce_funcs: true, // Optimize function expressions
          reduce_vars: true, // Reduce variables
          sequences: true, // Join consecutive statements
          side_effects: true, // Remove side-effect-free code
          switches: true, // Optimize switch statements
          toplevel: false, // Avoid toplevel optimizations (safer)
          typeofs: true, // Optimize typeof checks
          drop_console: false, // Important for pm2 logs
        },
        format: {
          ascii_only: true, // 🔐 Force all non-ASCII (e.g., Cyrillic) to be escaped
        },
        mangle: true, // Mangle variable names
      })
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
