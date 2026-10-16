/* 總覽分頁：總資產、走勢圖、市場燈號、下個開盤、今日成交、觀察名單 */
/* global nCond, NAMES, SECTOR */
import { useState } from "react";
import { useApp, Name, Empty, Spark, StatGrid } from "./common.jsx";
import { EquityChart } from "./Charts.jsx";
import { nf, sg, pct, cls, css, tvSymbol } from "../lib/format.js";
import { stats, mktLines, macroAt, macroCells, planOrders, watchlist } from "../lib/logic.js";

const RANGES = [[21, "1月"], [63, "3月"], [126, "6月"], [0, "全部"]];

// 總資產數字：平常顯示重播所在那天；手指滑過走勢圖時顯示滑到的那天（peek）
function Hero({ k, peek, mode }) {
  const { res } = useApp();
  const i = peek ?? k, s = res.snaps[i], cap = res.cfg.capital, gain = s.equity - cap;
  const ret = s.equity / cap - 1, bret = s.bench / res.benchBase - 1, diff = ret - bret;
  return (
    <div className={"hero" + (peek != null ? " peek" : "")}>
      <p className="lbl">{peek != null ? `${s.date} 收盤` : mode === "track" ? `${s.date} 收盤總資產（${res.startDate} 起算）` : `${s.date} 收盤總資產`}</p>
      <p className="big"><span className="cur">NT$</span><span>{nf(s.equity)}</span></p>
      <p className="chg"><span className={cls(gain)}>{gain > 0 ? "▲ " : gain < 0 ? "▼ " : ""}{sg(gain)}{nf(gain)}（{pct(ret)}）</span></p>
      <p className="vs">同期 0050 {pct(bret)}，代理人<span className={cls(diff)}>{diff >= 0 ? "領先" : "落後"} {Math.abs(diff * 100).toFixed(2)}%</span></p>
    </div>
  );
}

function Macro({ date }) {
  const { data } = useApp();
  const cells = macroCells(macroAt(data, date));
  if (!cells.length) return null;
  return (
    <div className="macro">
      {cells.map(([c, t, v, d]) => (
        <div key={t}><span className="k"><i className={c} />{t}</span><span className="v"><b>{v}</b>{d && <small>{d}</small>}</span></div>
      ))}
    </div>
  );
}

const Mkt = ({ m }) => <p className="mkt">{mktLines(m).map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</p>;

// 下個開盤的買賣單，可以複製到 TradingView 下模擬單
function Plan({ snap, pre }) {
  const { res, openChart, toast } = useApp();
  const pl = planOrders(res, snap, pre);
  if (!pl.sells.length && !pl.buys.length) return <Empty>不動作，繼續觀察。</Empty>;
  const copy = async () => {
    const txt = [...pl.sells.map(x => `賣 ${tvSymbol(x.code)} ${NAMES[x.code] || ""} ${x.shares} 股（${x.reason}）`),
      ...pl.buys.map(x => `買 ${tvSymbol(x.code)} ${NAMES[x.code] || ""} ${x.shares} 股（昨收 ${x.px.toFixed(2)}）`)].join("\n");
    try { await navigator.clipboard.writeText(txt); toast("已複製，可以貼到 LINE 或備忘錄"); }
    catch (e) { prompt("複製下面的文字：", txt); }
  };
  const Row = ({ buy, code, main, children }) => (
    <div className="order" onClick={() => openChart(code)}>
      <span className={`act plan ${buy ? "buy" : "sell"}`}>{buy ? "買" : "賣"}</span>
      <div><div className="t"><Name code={code} /></div><div className="r">{children}</div></div>
      <div className="amt">{main}<small>{tvSymbol(code)}</small></div>
    </div>
  );
  return (
    <>
      {pl.etfSell && <p className="note">開盤先賣掉停泊的 0050，換成下面的股票。</p>}
      {pl.sells.map(x => <Row key={"s" + x.code} code={x.code} main={`${nf(x.shares)} 股`}>全部賣出：{x.reason}</Row>)}
      {pl.buys.map(x => (
        <Row key={"b" + x.code} buy code={x.code} main={`${nf(x.shares)} 股`}>
          約 {nf(x.px * x.shares)} 元（昨收 {nf(x.px, 2)}）<br />{x.score}/{nCond(res.cfg)} 分：{x.reasons.join("、")}
        </Row>
      ))}
      <button className="more" onClick={copy}>複製下單清單</button>
    </>
  );
}

// 觀察名單：分數最高的 5 檔
function Watch({ date, snap, mk }) {
  const { res, openChart } = useApp();
  const w = watchlist(res, date, snap), N = nCond(res.cfg);
  if (!w.length) return <Empty>沒有資料。</Empty>;
  return (
    <>
      {w.map((x, n) => {
        const tags = [x.held && "持有中", x.cyc && !x.cyc.turn && "營收未轉正", x.cyc && !x.cyc.deep && "離高點跌幅不足", x.pbrBad && "淨值比不夠低",
          x.muBad && "融資太高", !x.longOK && "未站上200日線", !x.liq && "成交量不足", (mk && !mk.ok) && "大盤濾網中"].filter(Boolean);
        const pass = x.sc >= res.cfg.minScore;
        return (
          <div className="order" key={x.code} onClick={() => openChart(x.code)}>
            <span className="act rank">{n + 1}</span>
            <div>
              <div className="t"><Name code={x.code} /><small>{SECTOR[x.code] || ""}</small></div>
              <div className="r">{x.rs.join("、") || "沒有符合的條件"}{x.info.length > 0 && <><br />{x.info.join("、")}</>}</div>
              {tags.length > 0 && <div className="tags">{tags.map(t => <b key={t}>{t}</b>)}</div>}
            </div>
            <div className="side">
              <Spark code={x.code} date={date} n={30} />
              <div className="amt">
                <div className={"dots" + (pass ? " pass" : "")} title={`${x.sc}/${N} 個條件`}>
                  {Array.from({ length: N }, (_, j) => <i key={j} className={j < x.sc ? "on" : ""} />)}
                </div>
                {nf(x.px, 2)}<small className={cls(x.chg)}>{pct(x.chg)}</small>
              </div>
            </div>
          </div>
        );
      })}
      <p className="note">依代理人的 {N} 個條件排名，只供觀察。分數達 {res.cfg.minScore} 分、又通過濾網和族群限制，代理人才會真的買進。</p>
    </>
  );
}

// 這天的成交
function Today({ k }) {
  const { res, openChart } = useApp();
  const s = res.snaps[k], prev = k ? res.snaps[k - 1].nTrades : 0, today = res.trades.slice(prev, s.nTrades);
  if (!today.length) return <Empty>這天沒有成交。</Empty>;
  return today.map((t, i) => {
    const b = t.action === "BUY";
    return (
      <div className="order" key={i} onClick={() => openChart(t.code)}>
        <span className={`act ${b ? "buy" : "sell"}`}>{b ? "買" : "賣"}</span>
        <div><div className="t"><Name code={t.code} /></div><div className="r">{t.reason}</div></div>
        <div className={`amt ${b ? "" : cls(t.pnl)}`}>{b ? nf(t.price, 2) : sg(t.pnl) + nf(t.pnl)}<small>{nf(t.shares)} 股{b ? "" : "，賣在 " + nf(t.price, 2)}</small></div>
      </div>
    );
  });
}

export default function Home({ k, mode, range, setRange }) {
  const { res } = useApp();
  const [peek, setPeek] = useState(null);

  // 還沒到起算日：顯示本金和第一批買單
  if (!res.snaps.length) {
    const cap = res.cfg.capital, sd = res.startDate, pre = res.pre;
    return (
      <>
        <div className="hero">
          <p className="lbl">績效起算日 {sd}</p>
          <p className="big"><span className="cur">NT$</span><span>{nf(cap)}</span></p>
          <p className="chg"><span className="muted">尚未開始</span></p>
          <p className="vs">{sd} 收盤（14:30）後會出現第一天的績效</p>
        </div>
        <StatGrid items={[["—", "最大回撤"], ["—", "勝率"], ["—", "夏普值"], ["0 筆", "完成交易"]]} />
        <h2>市場與濾網</h2>
        <Mkt m={pre && pre.mkt} />
        <h2>下個開盤 <span>代理人已決定，可照著到 TradingView 下模擬單</span></h2>
        <Plan snap={null} pre={pre} />
        <h2>這天的成交 <span /></h2>
        <Empty>還沒有交易日。</Empty>
        <h2>觀察名單 <span>{pre ? `${pre.date} 收盤` : ""}</span></h2>
        {pre && <Watch date={pre.date} snap={null} mk={pre.mkt} />}
      </>
    );
  }

  const s = res.snaps[k], st = stats(res, k);
  const color = st.ret >= 0 ? css("--rise") : css("--fall");
  return (
    <>
      <Hero k={k} peek={peek} mode={mode} />
      <EquityChart res={res} k={k} range={range} color={color} onPeek={setPeek} />
      <div className="under">
        <div className="legend"><span><i style={{ borderTopColor: color }} />代理人</span><span><i className="b" />0050 買進持有</span></div>
        {res.snaps.length > 30 && (
          <div className="ranges" role="group" aria-label="圖表區間">
            {RANGES.map(([r, l]) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>)}
          </div>
        )}
      </div>
      <StatGrid items={[[pct(st.mdd), "最大回撤", "fall"], [st.win == null ? "—" : (st.win * 100).toFixed(1) + "%", "勝率"],
        [k >= 19 ? st.sharpe.toFixed(2) : "—", "夏普值"], [st.sells.length + " 筆", "完成交易"]]} />

      <h2>市場與濾網</h2>
      <Macro date={s.date} />
      <Mkt m={s.mkt} />

      <h2>下個開盤 <span>代理人已決定，可照著到 TradingView 下模擬單</span></h2>
      <Plan snap={s} />
      <h2>這天的成交 <span>{s.date}</span></h2>
      <Today k={k} />
      <h2>觀察名單 <span>{s.date} 收盤</span></h2>
      <Watch date={s.date} snap={s} mk={s.mkt} />
    </>
  );
}
