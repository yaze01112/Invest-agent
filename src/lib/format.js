/* 顯示用的小工具（跟 index.html 原本的算法一樣）
   NAMES 來自 engine.js（全域變數） */
/* global NAMES */

export const nf = (v, d = 0) => Number(v).toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
export const sg = v => v > 0 ? "+" : "";
export const pct = (v, d = 2) => v == null || isNaN(v) ? "—" : sg(v) + (v * 100).toFixed(d) + "%";
export const cls = v => v > 0 ? "rise" : v < 0 ? "fall" : "";
export const nm = c => NAMES[c] ? `${NAMES[c]} ${c}` : c;
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// 上櫃股票在 TradingView 用 TPEX，其餘用 TWSE
const OTC_CODES = new Set(["3324", "6274", "3529"]);
export const tvSymbol = c => (OTC_CODES.has(c) ? "TPEX:" : "TWSE:") + c;

export function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
