import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import globals from "rollup-plugin-node-globals";
import builtins from "rollup-plugin-node-builtins";
import { obfuscator } from "rollup-obfuscator";

export default {
  input: "index.js",
  output: {
    file: "bundle.js",
    format: "cjs",
  },
  external: ["fs", "path", "webpack", "crypto"], // tells Rollup 'I know what I'm doing here'
  plugins: [
    nodeResolve({ preferBuiltins: true }), // or `true`
    commonjs(),
    globals({
      dirname: false,
    }),
    builtins(),
    obfuscator(),
  ],
};
