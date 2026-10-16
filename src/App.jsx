/* 股智通 React 版：整個 App 的狀態與版面
   交易規則全部在 engine.js（跟 index.html 同一份程式碼），這裡只負責：
   讀資料 → 呼叫 runAgent() → 把結果交給各分頁元件顯示 */
/* global DEFAULT_CFG, PRESETS, AGENT_DEF, UNI_LABEL, STYLE_LABEL, setUniverse, fetchReal, demoData, runAgent */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppCtx, Icon } from "./components/common.jsx";
import Home from "./components/Home.jsx";
import Positions from "./components/Positions.jsx";
import Analysis from "./components/Analysis.jsx";
import Log from "./components/Log.jsx";
import Settings, { applyForm } from "./components/Settings.jsx";
import ChartSheet from "./components/ChartSheet.jsx";
import { ymd } from "./lib/format.js";

const DEFAULT_START = "2026-09-29";
const STORE_KEY = "agent-settings-react";   // 跟原版分開存，兩個網站的設定互不影響
const SPEEDS = [1, 3, 10];
const TABS = [["home", "總覽", Icon.home], ["pos", "持倉", Icon.pos], ["ana", "分析", Icon.ana], ["log", "紀錄", Icon.log]];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 設定：兩個代理人各自有股票池、風格、參數 ---------- */
const profileDefault = a => { const d = AGENT_DEF[a]; return { UNI: d.UNI, STYLE: d.STYLE, CFG: { ...DEFAULT_CFG, ...PRESETS[d.STYLE] } }; };
const profileOf = s => s.PROFILES[s.AGENT] || profileDefault(s.AGENT);

function loadSettings() {
  const s = { MODE: "track", START_DATE: DEFAULT_START, YEARS: 2, SRC: "real", AGENT: "momentum", PROFILES: {} };
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (o) {
      Object.assign(s, { MODE: o.MODE || s.MODE, START_DATE: o.START_DATE || s.START_DATE, YEARS: o.YEARS || s.YEARS, SRC: o.SRC === "demo" ? "demo" : "real" });
      s.AGENT = AGENT_DEF[o.AGENT] ? o.AGENT : "momentum";
      for (const a in o.PROFILES || {}) {   // 舊設定沒有的新參數，用該風格的預設值補上
        const p = o.PROFILES[a], base = PRESETS[p.STYLE] || PRESETS[(AGENT_DEF[a] || AGENT_DEF.momentum).STYLE];
        s.PROFILES[a] = { ...p, CFG: { ...DEFAULT_CFG, ...base, ...(p.CFG || {}) } };
      }
    }
  } catch (e) { /* 讀不到就用預設 */ }
  return s;
}
function saveSettings(s) {
  const PROFILES = { ...s.PROFILES, [s.AGENT]: profileOf(s) };
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, PROFILES })); } catch (e) { /* 私密瀏覽等情況存不了，沒關係 */ }
}
function rangeStart(s) {
  if (s.MODE === "track") return s.START_DATE;
  const d = new Date(); d.setFullYear(d.getFullYear() - s.YEARS); return ymd(d);
}

function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q), f = () => setM(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, [q]);
  return m;
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [data, setData] = useState(null);       // 股價資料
  const [res, setRes] = useState(null);         // 代理人跑完的結果
  const [k, setK] = useState(0);                // 重播到第幾天
  const [loading, setLoading] = useState("準備中");
  const [tab, setTab] = useState("home");
  const [range, setRange] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sp, setSp] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [tvCode, setTvCode] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const dataRef = useRef(null), toastTimer = useRef(null);
  const desk = useMedia("(min-width:1000px)");

  const toast = useCallback(msg => {
    setToastMsg(msg); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 4500);
  }, []);

  /* ---------- 執行代理人 ---------- */
  const run = useCallback(async (s, refetch) => {
    setPlaying(false);
    const p = profileOf(s);
    setUniverse(p.UNI);
    let D = refetch ? null : dataRef.current;
    if (!D) {
      if (s.SRC === "real") {
        setLoading("讀取真實股價");
        try { D = await fetchReal(); }
        catch (e) { toast("找不到真實股價資料，先顯示示範資料。放上 GitHub Pages 並跑過第一次更新後就會是真實股價。"); }
      }
      if (!D) { setLoading("產生示範資料"); await sleep(30); D = demoData(); }
    }
    setLoading("代理人交易中"); await sleep(30);
    const cfg = { ...DEFAULT_CFG, ...p.CFG };
    const R = runAgent(D, { ...cfg }, rangeStart(s));
    if (cfg.cycleFilter && !Object.values(D.stocks).some(x => x.rev && x.rev.length))
      toast("還沒有月營收資料，循環濾網會擋掉所有股票。等 GitHub 下次自動更新後就會有。");
    dataRef.current = D;
    setData(D); setRes(R); setK(Math.max(R.snaps.length - 1, 0));
    setLoading(null);
    saveSettings(s);
  }, [toast]);

  useEffect(() => { run(settings, true); }, []);   // 第一次打開

  const switchAgent = a => {
    if (a === settings.AGENT || loading) return;
    const next = { ...settings, PROFILES: { ...settings.PROFILES, [settings.AGENT]: profileOf(settings) }, AGENT: a };
    setSettings(next); run(next, true);
  };
  const apply = f => {
    const { next, refetch } = applyForm(f, settings, profileOf(settings), DEFAULT_START);
    setSheet(false); setSettings(next); run(next, refetch);
  };

  /* ---------- 重播 ---------- */
  const last = res ? Math.max(res.snaps.length - 1, 0) : 0;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setK(x => Math.min(x + SPEEDS[sp], last)), 80);
    return () => clearInterval(id);
  }, [playing, sp, last]);
  useEffect(() => { if (playing && k >= last) setPlaying(false); }, [k, playing, last]);
  const togglePlay = () => {
    if (!res || !res.snaps.length) return;
    if (!playing && k >= last) setK(0);
    setPlaying(!playing);
  };

  const openChart = useCallback(code => { setPlaying(false); setTvCode(code); }, []);
  const ctx = useMemo(() => ({ res, data, openChart, toast }), [res, data, openChart, toast]);

  const profile = profileOf(settings);
  const empty = res && !res.snaps.length;
  const show = id => desk || tab === id;   // 電腦版四個分頁同時顯示
  const section = (id, el) => <section className={"tab" + (tab === id ? " on" : "")} id={"t-" + id}>{res && show(id) && el}</section>;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="wrap">
        <header className="top">
          <div className="brand"><b>股智通</b><span>AI 投資代理人</span></div>
          <button className="icon" aria-label="設定" onClick={() => { setPlaying(false); setSheet(true); }}>{Icon.settings}</button>
        </header>
        <div className="agentbar">
          <div className="agents" role="group" aria-label="選擇代理人">
            <button aria-pressed={settings.AGENT === "momentum"} onClick={() => switchAgent("momentum")}>短線動能</button>
            <button aria-pressed={settings.AGENT === "cycle"} onClick={() => switchAgent("cycle")}>谷底反轉</button>
          </div>
          <p className="src">{res && data ? `${UNI_LABEL[profile.UNI]}｜${STYLE_LABEL[profile.STYLE] || "自訂"}｜${data.source === "real" ? "真實" : "示範"}` : ""}</p>
        </div>
        <a className="v929" href="index.html">原版網站（非 React）→</a>

        {section("home", <Home k={k} mode={settings.MODE} range={range} setRange={setRange} />)}
        {section("pos", <Positions k={k} toLatest={() => { setPlaying(false); setK(last); }} />)}
        {section("ana", <Analysis k={k} />)}
        {section("log", <Log k={k} />)}

        <p className="foot">{data && data.source === "real" && <>股價更新於 {data.updated}<br /></>}課堂作業模擬結果，不構成投資建議。React 版。</p>
      </div>

      <div className="player"><div className="wrap">
        <button className="play" aria-label={playing ? "暫停" : "播放"} onClick={togglePlay}>{playing ? Icon.pause : Icon.play}</button>
        <span className="dk">{res && !empty ? res.snaps[k].date : ""}</span>
        <div className="scrub">
          <input type="range" min="0" max={last} value={k} aria-label="日期" onChange={e => { setPlaying(false); setK(+e.target.value); }} />
          <div><span>{res ? (res.snaps.length ? res.snaps[0].date : res.startDate) : ""}</span><span>{res && !empty ? res.snaps[last].date : ""}</span></div>
        </div>
        <button className="speed" aria-label="播放速度" onClick={() => setSp((sp + 1) % SPEEDS.length)}>{SPEEDS[sp]}x</button>
      </div></div>

      <nav><div className="wrap" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>{icon}{label}</button>
        ))}
      </div></nav>

      <Settings open={sheet} onClose={() => setSheet(false)} settings={settings} profile={profile} onApply={apply} />
      <ChartSheet code={tvCode} k={k} onClose={() => setTvCode(null)} />

      <div className={"loading" + (loading ? " on" : "")}><div><b>股智通</b><p>{loading}</p><div className="ln"><i /></div></div></div>
      <div className={"toast" + (toastMsg ? " on" : "")} role="status">{toastMsg}</div>
    </AppCtx.Provider>
  );
}
