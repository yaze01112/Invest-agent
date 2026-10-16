/* 持倉分頁：每檔持股的成本、現價、停損、持有天數、會賣出的情況 */
/* global NAMES */
import { useApp, Empty, Spark } from "./common.jsx";
import { nf, sg, pct, cls } from "../lib/format.js";
import { posWarn } from "../lib/logic.js";

function Holding({ p, date }) {
  const { res, openChart } = useApp();
  const cfg = res.cfg;
  const pnl = (p.price - p.entry) * p.shares, pr = p.price / p.entry - 1, room = p.price / p.stop - 1, lock = (p.stop - p.entry) * p.shares;
  const warn = posWarn(res, p.code, date);
  return (
    <div className="pos" onClick={() => openChart(p.code)}>
      <div className="pos-top">
        <div>
          <div className="nm">{NAMES[p.code] || p.code}<small>{p.code}</small>{p.be && <em className="be">已保本</em>}</div>
          <div className="sub">{nf(p.shares)} 股，市值 NT${nf(p.price * p.shares)}，{p.entryDate} 進場</div>
        </div>
        <Spark code={p.code} date={date} n={Math.max(p.days + 10, 20)} refPx={p.entry} />
        <div className={`pl ${cls(pnl)}`}>{sg(pnl)}{nf(pnl)}<small>{pct(pr)}</small></div>
      </div>
      <div className="kv">
        <div><span>成本</span><b>{nf(p.entry, 2)}</b></div>
        <div><span>現價</span><b className={cls(pnl)}>{nf(p.price, 2)}</b></div>
        <div><span>停損</span><b>{nf(p.stop, 2)}</b><small>{lock > 0 ? `已鎖住 +${nf(lock)}` : `再跌 ${(room / (1 + room) * 100).toFixed(1)}% 出場`}</small></div>
      </div>
      <div className="hold">
        <span>持有第 {p.days} 天</span>
        <span className="bar"><i style={{ width: `${Math.min(100, p.days / cfg.maxHold * 100)}%` }} /></span>
        <span>最多 {cfg.maxHold} 天</span>
      </div>
      <div className="why">
        買進理由：{p.reasons.join("、")}<br />
        會賣出的情況：盤中跌破 {nf(p.stop, 2)}，或收盤跌破 EMA{cfg.exitEma}（{nf(p.exitLine, 2)}）{cfg.revExit ? "，或營收3M跌破12M" : ""}
        {warn.length > 0 && <><br /><b className="rise">⚠ {warn.join("・")}</b></>}
      </div>
    </div>
  );
}

export default function Positions({ k, toLatest }) {
  const { res } = useApp();
  if (!res.snaps.length) {
    return (
      <>
        <h2>持倉 <span>現金 NT${nf(res.cfg.capital)}</span></h2>
        <p className="tvhint">點任一檔股票，可以看 TradingView K 線圖</p>
        <Empty>還沒開始交易，目前全部是現金。</Empty>
      </>
    );
  }
  const s = res.snaps[k], latest = k === res.snaps.length - 1;
  const etf = s.etfVal > 0 && (
    <div className="pos etf"><div className="pos-top">
      <div><div className="nm">元大台灣50<small>0050</small></div><div className="sub">沒有買進訊號時，閒置現金先停在這裡，有新買單會先賣掉</div></div>
      <div className="pl">NT${nf(s.etfVal)}<small className="muted">占總資產 {(s.etfVal / s.equity * 100).toFixed(0)}%</small></div>
    </div></div>
  );
  return (
    <>
      <h2>持倉 <span>{s.date}{latest ? "（最新）" : ""}　現金 NT${nf(s.cash)}{s.etfVal > 0 ? `　0050 停泊 NT$${nf(s.etfVal)}` : ""}</span></h2>
      <p className="tvhint">點任一檔股票，可以看 TradingView K 線圖</p>
      {!latest && <button className="more" style={{ marginTop: 0 }} onClick={toLatest}>這是 {s.date} 的持股，回到最新一天</button>}
      {s.pos.length ? <>{s.pos.map(p => <Holding key={p.code} p={p} date={s.date} />)}{etf}</>
        : etf || <Empty>這天空手，等代理人找到符合條件的股票。</Empty>}
    </>
  );
}
