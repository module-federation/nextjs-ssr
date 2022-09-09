import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import globals from "rollup-plugin-node-globals";
import builtins from "rollup-plugin-node-builtins";
import { terser } from "rollup-plugin-terser";

export default {
  input: "flushChunksOrig.js",
  output: {
    file: "flushChunks.js",
    format: "cjs",
  },
  external: ["fs", "path", "react", "crypto", "next"], // tells Rollup 'I know what I'm doing here'
  plugins: [
    nodeResolve({ preferBuiltins: true }), // or `true`
    commonjs(),
    globals({
      dirname: false,
      process: false,
    }),
    builtins(),
  ],
};
