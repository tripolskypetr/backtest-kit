#!/usr/bin/env node
// Контрольный шлюз локализации. Запуск: node scripts/verify-locales.mjs
// Не грепает исходники словарей, а транспилирует их esbuild-ом и исполняет,
// после чего сравнивает реальные объекты LOCALE. Падает с кодом 1 при любой проблеме.
import { execSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "ru", "tr", "zh", "hi", "es", "pt"];

// Значения, которым разрешено совпадать с английским ключом в любой локали
const TECH_WHITELIST = new Set([
  "$", "%", "PNL", "PnL", "P&L", "P&L ($)", "PNL $", "PNL %", "PNL ($)", "SL", "TP",
  "DCA", "KPI", "PP", "PL", "PP/PL", "USDT", "RUB", "JSON", "JSONL", "Markdown", "PDF",
  "KPI", "Backtest Kit", "GitHub", "English", "ms", "min", "h", "m", "s", "N/A", "Ok",
  "LONG", "SHORT", "Empty", "breadcrumb",
]);

const tmp = mkdtempSync(join(tmpdir(), "locales-"));
const dicts = {};
try {
  for (const lang of LOCALES) {
    const src = join(ROOT, `src/i18n/locale/locale.${lang}.ts`);
    const out = join(tmp, `${lang}.mjs`);
    execSync(`npx esbuild ${src} --format=esm --outfile=${out}`, { cwd: ROOT, stdio: "pipe" });
    dicts[lang] = (await import(pathToFileURL(out))).LOCALE;
    // дубликаты ключей молча схлопываются при исполнении — ловим их по исходнику
    const raw = readFileSync(src, "utf8");
    const rawKeys = [...raw.matchAll(/^\s{2}(?:"((?:[^"\\]|\\.)*)"|([A-Za-z][\w.!?]*)):/gm)]
      .map((m) => (m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2]));
    if (rawKeys.length !== Object.keys(dicts[lang]).length) {
      const seen = new Set(), dups = [];
      for (const k of rawKeys) { if (seen.has(k)) dups.push(k); seen.add(k); }
      fail(`${lang}: дубликаты ключей: ${dups.join(", ")}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let failed = false;
function fail(msg) { failed = true; console.error(`✗ ${msg}`); }

const en = dicts.en;
const enKeys = new Set(Object.keys(en));

// 1. Паритет ключей с эталоном
for (const lang of LOCALES.slice(1)) {
  const keys = new Set(Object.keys(dicts[lang]));
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  if (missing.length) fail(`${lang}: нет ключей (${missing.length}): ${missing.slice(0, 5).join(" | ")}${missing.length > 5 ? " …" : ""}`);
  if (extra.length) fail(`${lang}: лишние ключи (${extra.length}): ${extra.slice(0, 5).join(" | ")}`);
}

// 2. Пустые значения там, где en непустой
for (const lang of LOCALES.slice(1)) {
  for (const [k, v] of Object.entries(dicts[lang])) {
    if (en[k]?.trim() && !String(v).trim()) fail(`${lang}: пустое значение у "${k}"`);
  }
}

// 3. Алфавит: перевод действительно на целевом языке
const SCRIPTS = { ru: /[ЁёА-я]/, zh: /[一-鿿]/, hi: /[ऀ-ॿ]/ };
for (const [lang, re] of Object.entries(SCRIPTS)) {
  const values = Object.entries(dicts[lang]).filter(([k, v]) => v.trim() && !TECH_WHITELIST.has(k) && /[A-Za-z]{3}/.test(en[k] || ""));
  const wrongScript = values.filter(([, v]) => !re.test(v));
  const ratio = wrongScript.length / Math.max(values.length, 1);
  if (ratio > 0.05)
    fail(`${lang}: ${wrongScript.length}/${values.length} значений без символов целевого алфавита: ${wrongScript.slice(0, 5).map(([k]) => `"${k}"`).join(" | ")}`);
}

// 4. Значения, оставшиеся английскими (кандидаты на непереведённое) — не фейл, а отчёт
for (const lang of LOCALES.slice(1)) {
  const same = Object.entries(dicts[lang])
    .filter(([k, v]) => v === en[k] && !TECH_WHITELIST.has(k) && /[A-Za-z]{4}/.test(en[k] || ""))
    .map(([k]) => k);
  if (same.length) console.warn(`⚠ ${lang}: значений, идентичных английским: ${same.length}${same.length <= 10 ? ` → ${same.join(" | ")}` : ` (первые 10) → ${same.slice(0, 10).join(" | ")}`}`);
}

// 5. Каждый t("...") в коде имеет ключ в словаре
const files = execSync(`find src -name "*.ts" -o -name "*.tsx"`, { cwd: ROOT }).toString().trim().split("\n");
const used = new Set();
for (const f of files) {
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) used.add(m[1].replace(/\\"/g, '"'));
}
const uncovered = [...used].filter((k) => !enKeys.has(k));
if (uncovered.length) fail(`в коде есть t() без ключа в словаре (${uncovered.length}): ${uncovered.slice(0, 10).join(" | ")}`);

console.log(`\nЛокали: ${LOCALES.map((l) => `${l}=${Object.keys(dicts[l]).length}`).join(" ")}; t()-литералов в коде: ${used.size}`);
if (failed) { console.error("\nПРОВЕРКА НЕ ПРОЙДЕНА"); process.exit(1); }
console.log("Все проверки пройдены");
