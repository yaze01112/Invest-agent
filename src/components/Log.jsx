/* 紀錄分頁：所有買賣紀錄，可篩選、分批載入 */
import { useState, useEffect, Fragment } from "react";
import { useApp, Name, Empty } from "./common.jsx";
import { nf, sg, cls } from "../lib/format.js";

const FILTERS = [["ALL", "全部"], ["BUY", "買進"], ["SELL", "賣出"]];

export default function Log({ k }) {
  const { res, openChart } = useApp();
  const [filter, setFilter] = useState("ALL");
  const [shown, setShown] = useState(40);
  useEffect(() => setShown(40), [res]);   // 代理人重跑時回到前 40 筆

  const rows = res.snaps.length
    ? res.trades.slice(0, res.snaps[k].nTrades).filter(t => filter === "ALL" || t.action === filter).reverse()
    : [];
  let lastD = "";
  return (
    <>
      <h2>交易紀錄</h2>
      <div className="chips" role="group" aria-label="篩選">
        {FILTERS.map(([f, l]) => <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(40); }}>{l}</button>)}
      </div>
      {rows.length ? rows.slice(0, shown).map((t, i) => {
        const b = t.action === "BUY", head = t.date !== lastD; lastD = t.date;
        return (
          <Fragment key={i}>
            {head && <p className="day">{t.date}</p>}
            <div className="tr" onClick={() => openChart(t.code)}>
              <span className={`act ${b ? "buy" : "sell"}`}>{b ? "買" : "賣"}</span>
              <div><div className="t"><Name code={t.code} /></div><div className="d">{t.reason}</div></div>
              {b ? <div className="p">{nf(t.price, 2)}<small>{nf(t.shares)} 股</small></div>
                : <div className={`p ${cls(t.pnl)}`}>{sg(t.pnl)}{nf(t.pnl)}<small>賣在 {nf(t.price, 2)}，抱 {t.days} 天</small></div>}
            </div>
          </Fragment>
        );
      }) : <Empty>還沒有交易紀錄。</Empty>}
      {rows.length > shown && <button className="more" onClick={() => setShown(shown + 40)}>再看 {Math.min(40, rows.length - shown)} 筆</button>}
    </>
  );
}
