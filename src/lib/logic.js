/* 畫面要顯示的統計與清單（從 index.html 的畫面程式碼搬過來，算法相同）。
   這裡只「讀」代理人跑完的結果 RES，不會改變任何交易。
   score、cycleTags、infoTags、nCond、sizeShares 來自 engine.js */
/* global score, cycleTags, infoTags, sizeShares */
import { nf, pct } from "./format.js";

// 到第 k 天為止的績效統計
export function stats(RES, k) {
  const sn = RES.snaps.slice(0, k + 1), cap = RES.cfg.capital;
  let peak = -Infinity, mdd = 0; const rets = [];
  sn.forEach((s, i) => { peak = Math.max(peak, s.equity); mdd = Math.min(mdd, s.equity / peak - 1); if (i) rets.push(s.equity / sn[i - 1].equity - 1); });
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / ((rets.length - 1) || 1));
  const sells = RES.trades.slice(0, sn[k].nTrades).filter(t => t.action === "SELL");
  return {
    mdd, sharpe: sd > 0 ? mean / sd * Math.sqrt(252) : 0,
    win: sells.length ? sells.filter(t => t.pnl > 0).length / sells.length : null, sells,
    ret: sn[k].equity / cap - 1, bret: sn[k].bench / RES.benchBase - 1,
  };
}

// 大盤／費半／籌碼濾網的說明文字（每行一個濾網）
export function mktLines(m) {
  const okM = m && (m.mOK ?? m.ok);
  const a = !m || !m.on ? "大盤濾網：關閉" : !(m.ma > 0) ? "大盤濾網：資料不足"
    : okM ? `大盤濾網 ✅ 0050（${nf(m.bench, 2)}）在 60 日均線（${nf(m.ma, 2)}）之上，可以買進`
      : `大盤濾網 ⛔ 0050（${nf(m.bench, 2)}）跌破 60 日均線（${nf(m.ma, 2)}），暫停新買進`;
  const lines = [a];
  if (m && m.xOn) lines.push(!(m.soxMA > 0) ? "費半濾網：資料不足" : m.xOK ? "費半濾網 ✅ 費半在 60 日均線之上" : "費半濾網 ⛔ 費半跌破 60 日均線，暫停新買進");
  if (m && m.cOn) lines.push(m.cOK ? "籌碼濾網 ✅ 外資期貨與現貨沒有同時偏空" : `籌碼濾網 ⛔ 外資期貨淨空 ${nf(m.tx)} 口、近 5 日賣超，暫停新買進`);
  return lines;
}

// 總體燈號：某一天的美債、匯率、費半、外資、融資、期貨
export function macroAt(DATA, date) {
  const M = (DATA && DATA.macro) || {}, out = {};
  for (const k of ["tnx", "twd", "sox", "fiall", "margin", "txfi"]) {
    const x = M[k]; if (!x || !x.dates || !x.dates.length) continue;
    let lo = 0, hi = x.dates.length - 1, j = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (x.dates[m] <= date) { j = m; lo = m + 1; } else hi = m - 1; }
    if (j < 20) continue;
    out[k] = {
      v: x.c[j], chg: x.c[j] - x.c[j - 20], pct: x.c[j] / x.c[j - 20] - 1,
      ma: j >= 59 ? x.c.slice(j - 59, j + 1).reduce((a, b) => a + b, 0) / 60 : NaN,
      sum5: x.c.slice(j - 4, j + 1).reduce((a, b) => a + b, 0),
    };
  }
  return out;
}

// 六個燈號要顯示的內容：顏色 c（g 綠 / y 黃 / r 紅）、標題、數值、補充
export function macroCells(m) {
  const sgn = v => v > 0 ? "+" : "", h = [];
  if (m.tnx) { const c = m.tnx.chg > 0.25 ? "r" : m.tnx.chg < -0.1 ? "g" : "y"; h.push([c, "美債10年", m.tnx.v.toFixed(2) + "%", `20日 ${sgn(m.tnx.chg)}${m.tnx.chg.toFixed(2)}`]); }
  if (m.twd) { const c = m.twd.pct < -0.02 ? "r" : m.twd.pct < -0.01 ? "y" : "g"; h.push([c, "美元/台幣", m.twd.v.toFixed(2), `20日 ${pct(m.twd.pct, 1)}`]); }
  if (m.sox) { const up = m.sox.v >= m.sox.ma, c = isNaN(m.sox.ma) ? "y" : up ? "g" : "r"; h.push([c, "費城半導體", nf(m.sox.v), isNaN(m.sox.ma) ? "" : up ? "60日線上" : "跌破60日線"]); }
  if (m.fiall) { const v = m.fiall.sum5, c = v > 0 ? "g" : v < -200 ? "r" : "y"; h.push([c, "外資近5日", `${sgn(v)}${nf(v)} 億`, v > 0 ? "買超" : "賣超"]); }
  if (m.margin) { const c = m.margin.pct > 0.08 ? "r" : m.margin.pct < -0.08 ? "y" : "g"; h.push([c, "融資餘額", `${nf(m.margin.v)} 億`, `20日 ${pct(m.margin.pct, 1)}`]); }
  if (m.txfi) { const v = m.txfi.v, c = v > -10000 ? "g" : v < -30000 ? "r" : "y"; h.push([c, "外資期貨", `${sgn(v)}${nf(v)} 口`, v >= 0 ? "淨多單" : "淨空單"]); }
  return h;
}

// 下個開盤要下的單（股數用昨收估算，跟代理人同一套算法）
export function planOrders(RES, snap, pre) {
  const cfg = RES.cfg, pos = snap ? snap.pos : [], pS = snap ? snap.pSells : {}, pB = snap ? snap.pBuys : (pre ? pre.pBuys : []);
  let cash = snap ? snap.cash + (snap.etfVal || 0) * (1 - cfg.feeRate - 0.001) : cfg.capital; const eq = snap ? snap.equity : cfg.capital;
  const sells = [], buys = []; let held = 0;
  for (const p of pos) { if (pS[p.code]) { sells.push({ code: p.code, shares: p.shares, reason: pS[p.code] }); cash += p.shares * p.price * (1 - cfg.feeRate - cfg.tax); } else held++; }
  for (let bi = 0; bi < pB.length; bi++) {
    const o = pB[bi];
    if (held >= cfg.maxPos) break;
    const px = o.px, sh = sizeShares(cfg, eq, cash, px, o.dist, Math.min(pB.length - bi, cfg.maxPos - held));
    if (!(sh >= 1)) continue;
    cash -= sh * px * (1 + cfg.feeRate); held++;
    buys.push({ code: o.code, shares: sh, px, score: o.score, reasons: o.reasons });
  }
  return { sells, buys, etfSell: !!(snap && snap.etfVal > 0 && buys.length) };
}

// 觀察名單：依代理人的條件，列出這天分數最高的 5 檔（只是觀察，不影響交易）
export function watchlist(RES, date, snap) {
  const cfg = RES.cfg, out = [], held = new Set((snap ? snap.pos : []).map(p => p.code)), allow = RES.allowAt(date);
  for (const code in RES.S) {
    if (allow && !allow.has(code)) continue;
    const s = RES.S[code], i = s.at.get(date); if (i === undefined) continue;
    const [sc, rs] = score(s, i, cfg);
    const cyc = cfg.cycleFilter ? { turn: !!s.revTurn[i], deep: s.dd[i] >= cfg.ddMin / 100, tags: cycleTags(s, i) } : null;
    out.push({
      code, sc, rs: cyc ? [...cyc.tags, ...rs] : rs, info: infoTags(s, i),
      pbrBad: cfg.pbrMax > 0 && !(s.pbrPct[i] <= cfg.pbrMax / 100), muBad: cfg.muMax > 0 && s.muL[i] > cfg.muMax,
      px: s.c[i], chg: i ? s.c[i] / s.c[i - 1] - 1 : 0, vr: s.v[i] / s.vm5[i], cyc,
      longOK: !cfg.longFilter || s.c[i] > s.ma200[i], liq: s.vm20[i] >= cfg.minLots * 1000, held: held.has(code),
    });
  }
  const cy = x => x.cyc ? (x.cyc.turn && x.cyc.deep ? 2 : x.cyc.turn || x.cyc.deep ? 1 : 0) : 0;
  out.sort((a, b) => cy(b) - cy(a) || b.sc - a.sc || b.vr - a.vr);
  return out.slice(0, 5);
}

// 持股警示：營收轉弱、融資偏高
export function posWarn(RES, code, date) {
  const S = RES.S[code], i = S && S.at.get(date); if (i === undefined) return [];
  const w = [];
  if (S.revSlow[i]) w.push("營收年增率連 2 個月下滑");
  if (S.rev3[i] < S.rev12[i]) w.push("營收3M低於12M");
  if (S.muL[i] > 40) w.push(`融資使用率 ${S.muL[i].toFixed(0)}% 偏高`);
  return w;
}

// 分析頁：月報酬、回撤、交易統計、依出場原因／個股／族群分組
export function analysis(RES, k) {
  const sn = RES.snaps.slice(0, k + 1), st = stats(RES, k), cap = RES.cfg.capital;
  const mEnd = {}; sn.forEach(s => mEnd[s.date.slice(0, 7)] = s.equity);
  const months = Object.keys(mEnd); let prev = cap;
  const mret = months.map(m => { const r = mEnd[m] / prev - 1; prev = mEnd[m]; return +(r * 100).toFixed(2); });
  let peak = -Infinity; const dd = sn.map(s => { peak = Math.max(peak, s.equity); return +((s.equity / peak - 1) * 100).toFixed(2); });
  const byR = {}, byS = {}, byG = {};
  st.sells.forEach(t => {
    (byR[t.reason] ??= { v: 0, n: 0 }).v += t.pnl; byR[t.reason].n++;
    byS[t.code] = (byS[t.code] || 0) + t.pnl;
    const g = SECTOR[t.code] || "其他"; (byG[g] ??= { v: 0, n: 0 }).v += t.pnl; byG[g].n++;
  });
  const n = st.sells.length, wins = st.sells.filter(t => t.pnl > 0), loss = st.sells.filter(t => t.pnl <= 0);
  const sw = wins.reduce((a, t) => a + t.pnl, 0), sl = -loss.reduce((a, t) => a + t.pnl, 0);
  const avgW = wins.length ? sw / wins.length : 0, avgL = loss.length ? sl / loss.length : 0;
  return {
    st, months, mret, dd, dates: sn.map(s => s.date), n, sw, sl, avgW, avgL,
    avgDays: n ? st.sells.reduce((a, t) => a + t.days, 0) / n : 0,
    byReason: Object.entries(byR).map(([k, o]) => ({ label: k, v: o.v, sub: o.n + " 筆" })).sort((a, b) => b.v - a.v),
    byStock: Object.entries(byS).map(([c, v]) => ({ code: c, v })).sort((a, b) => b.v - a.v),
    bySector: Object.entries(byG).map(([k, o]) => ({ label: k, v: o.v, sub: o.n + " 筆" })).sort((a, b) => b.v - a.v),
  };
}
/* global SECTOR */
