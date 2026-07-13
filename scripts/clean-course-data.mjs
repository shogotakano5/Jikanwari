/**
 * public/data/asahikawa-courses-*.json のクリーニングスクリプト。
 *
 * シラバスサイトからのスクレイピング時に混入したゴミをすべての文字列フィールドから
 * 除去する。科目データの内容（テキスト）は一切変更しない。
 *
 * 除去対象:
 * - HTMLタグ（`<div class="...">` `<p><span>` `<font>` `<li>` 等）
 * - HTMLコメント／インラインJS断片（`<!-- jq$(document).ready(...); //-->` 等）
 * - <style> の中身が素のテキストとして混入したCSSルール（`.none_display { display:none; }` 等）
 * - HTML実体参照（`&nbsp;` `&quot;` `&amp;` 等）
 * - 科目名(name)に付いた改行・連続空白の洪水（`数学Ⅰａ \r\n\r\n ...` → `数学Ⅰａ`）
 *
 * 実行: node scripts/clean-course-data.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * シラバス詳細ページは本文をJS（`jq$(function(){ var subjectCon = "本文"; ... });`）で
 * 埋め込んでいるため、<script>の中身がそのままテキストとして混入していることがある。
 * スキャフォールディングを捨てて `var subjectCon = "..."` の本文だけを取り出す。
 */
function unwrapEmbeddedJs(text) {
  return text.replace(/jq\$\(function\(\)\{[\s\S]*?\}\);?/g, (block) => {
    const m = block.match(/var\s+\w+\s*=\s*"([\s\S]*?)";/);
    if (!m) return "";
    let content = m[1];
    // 元ページでは decodeURIComponent() を通しているため、%エスケープが残っていれば復号する
    if (/%[0-9A-Fa-f]{2}/.test(content)) {
      try {
        content = decodeURIComponent(content);
      } catch {
        // 復号できない%はそのまま残す
      }
    }
    return content + "\n";
  });
}

function sanitizeText(value) {
  let text = value;
  text = unwrapEmbeddedJs(text);
  // HTMLコメント（スクリプト断片を含む）
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // <style>/<script> ブロックは中身ごと除去
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  // 素のテキストとして混入したCSSルール（`.none_display { ... }` 等のセレクタ+ブロック）
  text = text.replace(/(^|\n)\s*[.#]?[\w-]+\s*\{[^{}]*\}/g, "$1");
  // ブロック要素の終わりは改行として保持し、リスト項目は「・」で残す
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "・");
  // 残りのタグをすべて除去（閉じ > が無いまま文字列が切れているタグ断片も対象）
  text = text.replace(/<\/?[a-zA-Z][^>]*(>|$)/g, "");
  text = decodeEntities(text);
  // 空白の整理（行頭インデント・行末空白・連続空行・混入した見出し）
  text = text
    .replace(/\r/g, "")
    .replace(/[ \t　]+\n/g, "\n")
    .replace(/\n[ \t　]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:^|\n)実務経験\s*$/, "")
    .trim();
  return text;
}

/** 科目名・教員名など1行であるべきフィールドは、改行・連続空白を単一スペースへ潰す */
function sanitizeInline(value) {
  return sanitizeText(value).replace(/\s+/g, " ").trim();
}

const INLINE_FIELDS = new Set(["name", "teacher", "day", "period", "semester", "faculty", "department", "category"]);

function cleanRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      out[key] = INLINE_FIELDS.has(key) ? sanitizeInline(value) : sanitizeText(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = cleanRecord(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === "string" ? sanitizeText(v) : v));
    } else {
      out[key] = value;
    }
  }
  return out;
}

for (const year of [2023, 2024, 2025, 2026]) {
  const path = new URL(`../public/data/asahikawa-courses-${year}.json`, import.meta.url).pathname;
  if (!existsSync(path)) continue;
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`${year}: skip (empty)`);
    continue;
  }
  const cleaned = data.map(cleanRecord);
  writeFileSync(path, JSON.stringify(cleaned, null, 2) + "\n");
  console.log(`${year}: ${cleaned.length} records cleaned`);
}
