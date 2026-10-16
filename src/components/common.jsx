/* 共用的小元件：股票名稱、迷你走勢線、空白提示、圖示、AppContext */
/* global NAMES */
import { createContext, useContext } from "react";

// 整個 App 共用的資料與動作：代理人結果、原始資料、打開 K 線圖、跳出提示
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// 「台積電 2330」：名稱 + 小字代號
export function Name({ code }) {
  return NAMES[code] ? <>{NAMES[code]}<small>{code}</small></> : <>{code}</>;
}

export const Empty = ({ children }) => <p className="empty">{children}</p>;

// 迷你走勢線：最近 n 天收盤價；refPx 是參考價（例如成本），畫成虛線
export function Spark({ code, date, n = 40, refPx }) {
  const { res } = useApp();
  const s = res && res.S[code], i = s ? s.at.get(date) : undefined;
  if (i === undefined) return null;
  const a = s.c.slice(Math.max(0, i - n + 1), i + 1);
  if (a.length < 2) return null;
  let lo = Math.min(...a), hi = Math.max(...a);
  if (refPx > 0) { lo = Math.min(lo, refPx); hi = Math.max(hi, refPx); }
  const W = 72, H = 30, P = 2;
  const y = v => hi > lo ? (P + (H - 2 * P) * (1 - (v - lo) / (hi - lo))).toFixed(1) : H / 2;
  const x = j => (j / (a.length - 1) * W).toFixed(1);
  const up = a[a.length - 1] >= (refPx > 0 ? refPx : a[0]), col = up ? "var(--rise)" : "var(--fall)";
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {refPx > 0 && <line x1="0" x2={W} y1={y(refPx)} y2={y(refPx)} stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 3" />}
      <polyline points={a.map((v, j) => x(j) + "," + y(v)).join(" ")} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={y(a[a.length - 1])} r="2.4" fill={col} />
    </svg>
  );
}

// 統計格子：[數值, 標籤, 顏色class]
export function StatGrid({ items, id, style }) {
  return (
    <div className="stats" id={id} style={style}>
      {items.map(([v, l, c], i) => <div key={i}><b className={c || ""}>{v}</b><span>{l}</span></div>)}
    </div>
  );
}

export const Icon = {
  settings: <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  close: <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  play: <svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" /></svg>,
  pause: <svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z" /></svg>,
  home: <svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-9" /><path d="M15 7h5v5" /></svg>,
  pos: <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8 6V4h8v2" /></svg>,
  ana: <svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>,
  log: <svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
};
