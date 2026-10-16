/* 設定面板：資料來源、股票池、策略參數。按「重新執行代理人」才會套用 */
/* global PRESETS, nCond */
import { useState, useEffect } from "react";
import { Icon } from "./common.jsx";

// 每個參數欄位：[名稱, 標題, 說明, 種類（num / dec / onoff / 選項陣列）, 輸入限制]
const SPEC = [
  ["capital", "本金", "", "num", { step: 10000, min: 10000 }],
  ["maxPos", "最多同時持有", "檔", "num", { min: 1, max: 10 }],
  ["risk", "每筆最大虧損", "本金的 %", "dec", { step: 0.5, min: 0.5, max: 5 }],
  ["atrMult", "停損距離", "幾倍 ATR", "dec", { step: 0.5, min: 0.5, max: 5 }],
  ["maxHold", "最長持有", "交易日", "num", { min: 1, max: 60 }],
  ["exitEma", "出場均線", "收盤跌破就賣", [["10", "EMA10（跑得快）"], ["20", "EMA20（抱得久）"]]],
  ["minLots", "最低成交量", "20 日均量，張", "num", { step: 100, min: 0 }],
  ["minScore", "進場門檻", "6 個條件要符合幾個", "num", { min: 1, max: 7 }],
  ["maxPerSector", "同族群最多", "檔，避免押在同一產業", "num", { min: 1, max: 5 }],
  ["mktFilter", "大盤濾網", "0050 跌破 60 日均線就不買", "onoff"],
  ["longFilter", "長線濾網", "股價要在 200 日均線之上", "onoff"],
  ["cycleFilter", "循環濾網", "營收年增率連 2 月轉正才買", "onoff"],
  ["ddMin", "距高點跌幅", "%，股價要比近 2 年高點低這麼多", "num", { step: 5, min: 0, max: 90 }],
  ["fullInvest", "滿倉模式", "現金平均買進訊號股，盡量不留現金", "onoff"],
  ["maxPct", "單檔上限", "滿倉時一檔最多占總資產 %", "num", { step: 5, min: 10, max: 100 }],
  ["park", "閒置現金買 0050", "沒訊號時先停在 0050，有訊號再換股", "onoff"],
  ["chipFilter", "籌碼濾網", "外資期貨淨空 3 萬口以上且近 5 日賣超就不買", "onoff"],
  ["macroFilter", "費半濾網", "費城半導體跌破 60 日均線就不買", "onoff"],
  ["revCross", "營收 3M/12M 進場", "谷底條件也接受 3 月均上穿 12 月均", "onoff"],
  ["revExit", "營收轉弱出場", "營收 3 月均跌破 12 月均就賣", "onoff"],
  ["pbrMax", "淨值比低檔", "近 3 年分位 %，0＝不限", "num", { step: 5, min: 0, max: 100 }],
  ["muMax", "融資使用率上限", "%，超過不買，0＝不限", "num", { step: 5, min: 0, max: 100 }],
  ["instBonus", "法人加分", "外資或投信連 3 日買超算 1 個條件", "onoff"],
  ["breakeven", "保本停損", "賺到 1.5 倍風險後停損移到成本", "onoff"],
  ["discount", "手續費折扣", "例：0.28 代表 2.8 折", "dec", { step: 0.01, min: 0.1, max: 1 }],
];
const FIELDS = ["capital", "maxPos", "risk", "atrMult", "maxHold", "minScore", "discount", "minLots", "maxPerSector", "ddMin", "pbrMax", "muMax", "maxPct"];
const PFIELDS = ["maxPos", "risk", "atrMult", "maxHold", "minScore", "minLots", "maxPerSector", "ddMin", "pbrMax", "muMax", "maxPct"];
const TOGGLES = ["mktFilter", "longFilter", "breakeven", "cycleFilter", "macroFilter", "revCross", "revExit", "instBonus", "fullInvest", "park", "chipFilter"];
const PRESET_KEYS = new Set([...PFIELDS, "exitEma", ...TOGGLES]);   // 改了這些就變成「自訂」

const NOTE_DATA = ["真實台股讀取網站上每天收盤後自動更新的 data.json（還原權息的日K）。找不到時會暫時改用示範資料。「從起算日開始」時，代理人只用起算日之前的資料算指標，起算日開盤才開始交易；示範資料每天收盤後會多一天模擬行情。", "主動選股：每個交易日收盤後，把全市場近 20 日平均成交值前 100 名存檔，代理人那天只能從那天的名單買新股票，名單存了就不會再改，所以過去的交易不會因為今天的名單變了而跟著變。2026-09-01 以前沒有存檔，改用固定的科技、權值、循環股池。"];
const NOTE_RULES = ["進場前先過三道濾網：大盤（0050 在 60 日均線之上）、長線趨勢（個股在 200 日均線之上）、族群分散（同族群最多 1 檔）。再看 6 個條件：EMA5＞EMA10＞EMA20 且站上 EMA20、成交量＞5日均量 1.5 倍、OBV 創 20 日新高、RSI 介於 50–70、收盤突破前 20 日高點、MACD 柱狀體翻正且放大，不只靠單一指標。賺到 1.5 倍風險後停損移到成本。收盤後決定，隔天開盤價成交；跌破 ATR 停損立即出場，收盤跌破出場均線或持有期滿則隔天開盤賣出。積極風格：集中 3 檔、每筆風險 3%、6 選 4 進場、停損 2.5 倍 ATR、跌破 EMA20 才賣、最多抱 20 天。成本已計入手續費與 0.3% 證交稅。", "谷底反轉風格（建議搭配景氣循環股）：先過循環濾網，最近 2 個月營收年增率都轉正、而且股價比近 2 年高點跌超過 50%，再看上面 6 個條件符合 3 個確認止跌；因為是抄底，關掉大盤和長線濾網，最多抱 60 天。營收用次月 11 日之後才算「已知」，回測不會偷看未來。產業報價止跌目前沒有自動資料，請自己另外確認。", "其他指標（預設只在谷底反轉開啟）：營收 3 月均上穿 12 月均也算谷底訊號、營收 3 月均跌破 12 月均出場、融資使用率上限 30%、外資或投信連 3 日買超加 1 分；費半濾網和淨值比低檔預設關閉，可自己打開。滿倉模式：收盤後選出的股票，隔天開盤把可用現金平均分配買進，單檔最多占總資產 50%（可調到 100%），關閉時改回原本「每筆最大虧損」的資金控管。閒置現金買 0050：沒有買進訊號時，超過總資產 5% 的現金會在收盤買 0050，有新買單時先賣掉 0050 再買股票（回測用收盤價近似，0050 的買賣不列入交易紀錄和勝率）。首頁六個燈號：美債 10 年殖利率、美元兌台幣、費城半導體，以及 FinMind 的外資近 5 日買賣超、全市場融資餘額、外資台指期淨未平倉。籌碼濾網（預設關閉）：外資期貨淨空單超過 3 萬口、而且近 5 日現貨賣超時暫停買進。觀察名單另外顯示本益比和殖利率，只供參考。"];
const Lines = ({ parts }) => <p className="note">{parts.map((t, i) => <span key={i}>{i > 0 && <br />}{t}</span>)}</p>;

const Field = ({ label, small, children, style }) => (
  <label className="field" style={style}><span>{label}{small && <small>{small}</small>}</span>{children}</label>
);

// 把目前設定轉成表單用的字串
function toForm(settings, profile) {
  const f = { uni: profile.UNI, src: settings.SRC, mode: settings.MODE, start: settings.START_DATE, years: String(settings.YEARS), style: profile.STYLE };
  for (const [k] of SPEC) f[k] = String(profile.CFG[k] ?? 0);
  return f;
}

// 表單 → 新的設定（算法跟 index.html 的「重新執行代理人」一樣）
export function applyForm(f, settings, profile, defaultStart) {
  const CFG = { ...profile.CFG, exitEma: +f.exitEma };
  FIELDS.forEach(k => {
    const v = parseFloat(f[k]);
    if (!isNaN(v) && (v > 0 || ["minLots", "ddMin", "pbrMax", "muMax"].includes(k)))
      CFG[k] = ["maxPos", "maxHold", "minScore", "maxPerSector"].includes(k) ? Math.round(v) : v;
  });
  TOGGLES.forEach(t => CFG[t] = +f[t]);
  CFG.minScore = Math.min(nCond(CFG), CFG.minScore);
  const next = {
    ...settings, MODE: f.mode, START_DATE: f.start || defaultStart, SRC: f.src, YEARS: +f.years,
    PROFILES: { ...settings.PROFILES, [settings.AGENT]: { UNI: f.uni, STYLE: f.style, CFG } },
  };
  const refetch = f.src !== settings.SRC || f.uni !== profile.UNI;
  return { next, refetch };
}

export default function Settings({ open, onClose, settings, profile, onApply }) {
  const [f, setF] = useState(null);
  useEffect(() => { if (open) setF(toForm(settings, profile)); }, [open]);
  if (!f) return <div className="sheet-bg" />;

  const set = (k, v) => setF(old => ({ ...old, [k]: v, ...(PRESET_KEYS.has(k) ? { style: "custom" } : {}) }));
  const pickStyle = st => {
    const p = PRESETS[st];
    if (!p) return setF(old => ({ ...old, style: st }));
    const upd = { style: st };
    [...PFIELDS, "exitEma", ...TOGGLES].forEach(k => upd[k] = String(p[k]));
    setF(old => ({ ...old, ...upd }));
  };
  const input = (k, kind, attrs) => {
    if (kind === "onoff") return <select value={f[k]} onChange={e => set(k, e.target.value)}><option value="1">開</option><option value="0">關</option></select>;
    if (Array.isArray(kind)) return <select value={f[k]} onChange={e => set(k, e.target.value)}>{kind.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    return <input type="number" inputMode={kind === "dec" ? "decimal" : "numeric"} {...attrs} value={f[k]} onChange={e => set(k, e.target.value)} />;
  };

  return (
    <div className={"sheet-bg" + (open ? " on" : "")} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label="設定">
        <div className="grab" />
        <h3>設定 <button className="icon" onClick={onClose} aria-label="關閉">{Icon.close}</button></h3>
        <p className="sec-title">資料</p>
        <Field label="股票池">
          <select value={f.uni} onChange={e => set("uni", e.target.value)}>
            <option value="tech">科技股 30 檔</option><option value="mixed">權值綜合 30 檔</option>
            <option value="cycle">景氣循環股 21 檔</option><option value="active">主動選股（每天的成交值前 100）</option>
          </select>
        </Field>
        <Field label="資料來源">
          <select value={f.src} onChange={e => set("src", e.target.value)}><option value="real">真實台股</option><option value="demo">示範資料</option></select>
        </Field>
        <Field label="績效計算">
          <select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="track">從起算日開始</option><option value="backtest">回測過去幾年</option></select>
        </Field>
        {f.mode === "track"
          ? <Field label="起算日" small="本金從這天開始算"><input type="date" style={{ width: 160 }} value={f.start} onChange={e => set("start", e.target.value)} /></Field>
          : <Field label="回測期間"><select value={f.years} onChange={e => set("years", e.target.value)}><option value="1">1 年</option><option value="2">2 年</option><option value="3">3 年</option></select></Field>}
        <Lines parts={NOTE_DATA} />

        <p className="sec-title">策略</p>
        <Field label="風格" small="切換會套用整組參數">
          <select value={f.style} onChange={e => pickStyle(e.target.value)}>
            <option value="aggressive">積極</option><option value="conservative">保守</option><option value="cycle">谷底反轉</option><option value="custom">自訂</option>
          </select>
        </Field>
        {SPEC.map(([k, label, small, kind, attrs]) => <Field key={k} label={label} small={small}>{input(k, kind, attrs)}</Field>)}
        <button className="primary" onClick={() => onApply(f)}>重新執行代理人</button>
        <Lines parts={NOTE_RULES} />
      </div>
    </div>
  );
}
