/* 點股票時跳出的 TradingView K 線圖 */
/* global SECTOR */
import { useEffect, useRef } from "react";
import { useApp, Icon } from "./common.jsx";
import { nf, nm, tvSymbol } from "../lib/format.js";

export default function ChartSheet({ code, k, onClose }) {
  const { res } = useApp();
  const box = useRef(null);
  const sym = code ? tvSymbol(code) : "";

  // TradingView 的嵌入圖表要用它自己的 script 產生，所以在這裡手動放進去
  useEffect(() => {
    if (!code || !box.current) return;
    const el = box.current; el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "tradingview-widget-container";
    const inner = document.createElement("div"); inner.className = "tradingview-widget-container__widget"; inner.style.height = "100%";
    wrap.appendChild(inner);
    const sc = document.createElement("script");
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"; sc.async = true;
    sc.textContent = JSON.stringify({
      autosize: true, symbol: sym, interval: "D", timezone: "Asia/Taipei",
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", style: "1", locale: "zh_TW",
      allow_symbol_change: true, hide_side_toolbar: true, calendar: false, support_host: "https://www.tradingview.com",
    });
    wrap.appendChild(sc); el.appendChild(wrap);
    return () => { el.innerHTML = ""; };
  }, [code]);

  const s = code && res && res.snaps.length ? res.snaps[k] : null, p = s ? s.pos.find(x => x.code === code) : null;
  return (
    <div className={"sheet-bg" + (code ? " on" : "")} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tv" role="dialog" aria-label="K 線圖">
        <div className="grab" />
        <h3><span>{code ? nm(code) : "K 線圖"}</span><button className="icon" onClick={onClose} aria-label="關閉">{Icon.close}</button></h3>
        <p className="note">{p
          ? `代理人持有 ${nf(p.shares)} 股，成本 ${nf(p.entry, 2)}，停損 ${nf(p.stop, 2)}，收盤跌破 EMA${res.cfg.exitEma}（${nf(p.exitLine, 2)}）會賣出。`
          : code ? `${SECTOR[code] || ""}　${sym}` : ""}</p>
        <div id="tv-box" ref={box} />
        <a className="primary tv-open" target="_blank" rel="noopener" href={"https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(sym)}>在 TradingView 開啟完整圖表</a>
        <p className="note">圖表由 TradingView 提供。如果圖表區顯示無法載入，按上面按鈕到 TradingView 看。</p>
      </div>
    </div>
  );
}
