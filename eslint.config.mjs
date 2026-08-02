import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // GH Actions 수집기 등 Node 실행 스크립트 — fetch·process 같은 Node 전역 허용
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // public/ 정적 스크립트는 브라우저에서 직접 로드 — document·window 같은 브라우저 전역 허용
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    // 서비스워커는 self·clients 스코프
    files: ["public/crowd-sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "extension/**", ".plasmo/**"],
  },
)
