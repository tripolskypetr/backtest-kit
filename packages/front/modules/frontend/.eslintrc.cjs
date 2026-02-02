module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:react-hooks/recommended",
  ],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "no-undef": "off",
    "no-redeclare": "off",
    "no-empty-pattern": "off",
    "no-comments/disallowComments": [
      "error",
      {
        allow: [
          "TODO",
          "FIXME",
          "NOTE",
          "DEBUG",
          "eslint-disable",
          "eslint-disable-next-line",
          "eslint-disable no-unused-vars",
          "@ts-ignore",
          "@ts-nocheck",
        ],
      },
    ],
    "no-loss-of-precision": "off",
    "no-async-promise-executor": "off",
    "no-unsafe-finally": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error"],
    "@typescript-eslint/lines-between-class-members": "error",
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "variable",
        format: ["camelCase", "PascalCase", "UPPER_CASE", "snake_case"],
      },
      {
        selector: "function",
        format: ["camelCase", "PascalCase"],
      },
      {
        selector: "typeLike",
        format: ["PascalCase", "snake_case", "UPPER_CASE"],
      },
    ],
    "prettier/prettier": ["error", { endOfLine: "auto" }],
    "max-lines": [
      "error",
      {
        skipComments: false,
        max: 550,
      },
    ],
    "max-lines-per-function": [
      "error",
      {
        skipComments: false,
        max: 350,
      },
    ],
    "max-params": [
      "error",
      {
        max: 5,
      },
    ],
    "jsdoc/no-types": "error",
  },
  ignorePatterns: ["build", ".eslintrc.cjs", "*.d.ts"],
  parser: "@typescript-eslint/parser",
  plugins: ["jsdoc", "prettier", "no-comments", "@typescript-eslint"],
};
