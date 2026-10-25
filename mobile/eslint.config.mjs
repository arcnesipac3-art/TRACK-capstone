// @ts-check
import expoConfig from "eslint-config-expo/flat";

export default [
  ...expoConfig,
  {
    ignores: ["dist/*", "node_modules/*"],
  },
];
