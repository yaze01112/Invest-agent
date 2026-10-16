/* 分析分頁：月報酬、回撤、交易統計、出場原因／各股／族群損益 */
import { useApp, Empty, StatGrid } from "./common.jsx";
import { MonthChart, DrawdownChart } from "./Charts.jsx";
import { nf, sg, cls, nm } from "../lib/format.js";
import { analysis } from "../lib/logic.js";

// 左右延伸的長條：賺錢往右（紅），賠錢往左（綠）
function HBars({ rows }) {
  if (!rows.length) return <Empty>還沒有完成的交易。</Empty>;
  const mx = Math.max(...rows.map(r => Math.abs(r.v)), 1);
  return rows.map(r => {
    const w = Math.abs(r.v) / mx * 50;
    const st = r.v >= 0 ? { left: "50%", width: `${w}%`, background: "var(--rise)" } : { right: "50%", width: `${w}%`, background: "var(--fall)" };
    return (
      <div className="hbar" key={r.label}>
        <span className="n">{r.label}{r.sub && <><br /><span className="muted" style={{ fontSize: 11 }}>{r.sub}</span></>}</span>
        <span className="track"><i style={st} /></span>
        <span className={`v ${cls(r.v)}`}>{sg(r.v)}{nf(r.v)}</span>
      </div>
    );
  });
}

export default function Analysis({ k }) {
  const { res } = useApp();
  const empty = !res.snaps.length;
  const a = empty ? null : analysis(res, k);
  return (
    <>
      <h2>月報酬</h2>
      <MonthChart months={a ? a.months : []} mret={a ? a.mret : []} res={res} k={k} />
      <h2>回撤 <span>離最高點跌了多少</span></h2>
      <DrawdownChart dates={a ? a.dates : []} dd={a ? a.dd : []} res={res} k={k} />
      <h2>交易統計 <span>判斷策略是否可靠</span></h2>
      {a && <>
        <StatGrid id="tstats" style={{ marginTop: 4 }} items={[
          [a.n + " 筆", "樣本數"], [a.n ? sg(a.sw - a.sl) + nf((a.sw - a.sl) / a.n) : "—", "平均每筆損益（期望值）"],
          [a.avgL ? (a.avgW / a.avgL).toFixed(2) : "—", "盈虧比（均賺÷均賠）"], [a.sl ? (a.sw / a.sl).toFixed(2) : "—", "獲利因子（總賺÷總賠）"],
          [a.n ? a.avgDays.toFixed(1) + " 天" : "—", "平均持有"], [a.st.win == null ? "—" : (a.st.win * 100).toFixed(1) + "%", "勝率"]]} />
        <p className="note">{a.n < 30 ? `目前只有 ${a.n} 筆交易，樣本少於 30 筆，統計結果參考就好，不能下定論。`
          : "獲利因子大於 1 代表賺的比賠的多；期望值為正代表長期平均每筆是賺錢的。回測結果不代表未來。"}</p>
      </>}
      <h2>出場原因 <span>總損益</span></h2>
      <HBars rows={a ? a.byReason : []} />
      <h2>各股損益</h2>
      <HBars rows={a ? a.byStock.map(x => ({ label: nm(x.code), v: x.v })) : []} />
      <h2>族群損益 <span>看風險是否集中</span></h2>
      <HBars rows={a ? a.bySector : []} />
    </>
  );
}
