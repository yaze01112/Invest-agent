/* 圖表元件：Chart.js（從 CDN 載入，全域變數 Chart）
   React 只負責「什麼時候畫、畫什麼資料」，實際畫圖交給 Chart.js */
/* global Chart */
import { useEffect, useRef } from "react";
import { css } from "../lib/format.js";

function setDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = css("--muted");
}

// 走勢線下方的淡色漸層
function areaFill(chart, col) {
  const a = chart.chartArea; if (!a) return "transparent";
  const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
  g.addColorStop(0, col + "2E"); g.addColorStop(1, col + "00"); return g;
}

/* 總資產走勢圖：代理人 vs 0050，以本金 = 100 換算。
   手指或滑鼠滑過時呼叫 onPeek(第幾天)，離開時 onPeek(null) */
export function EquityChart({ res, k, range, color, onPeek }) {
  const canvas = useRef(null), chart = useRef(null);
  const kRef = useRef(k), peekRef = useRef(onPeek);
  kRef.current = k; peekRef.current = onPeek;

  // 代理人結果改變時，重新建立圖表
  useEffect(() => {
    if (!window.Chart) return;
    setDefaults();
    const unpeek = () => {
      peekRef.current(null);
      requestAnimationFrame(() => { const c = chart.current; if (c && c.getActiveElements().length) { c.setActiveElements([]); c.draw(); } });
    };
    const eqFx = {
      id: "eqFx", afterDatasetsDraw(ch) {
        const { ctx, chartArea: a, scales: { x, y } } = ch; if (!a) return;
        ctx.save();
        const y0 = y.getPixelForValue(100);   // 本金基準線
        if (y0 >= a.top && y0 <= a.bottom) {
          ctx.strokeStyle = css("--faint"); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.left, y0); ctx.lineTo(a.right, y0); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = css("--muted"); ctx.font = "11px " + Chart.defaults.font.family; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
          ctx.fillText("本金", a.left + 4, y0 - 3);
        }
        const act = ch.getActiveElements(), d = ch.data.datasets[0];
        if (act.length) {
          const px = act[0].element.x, i = act[0].index;
          ctx.strokeStyle = css("--faint"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
          ctx.fillStyle = css("--muted"); ctx.font = "600 11px " + Chart.defaults.font.family; ctx.textBaseline = "top";
          ctx.textAlign = px < a.left + 50 ? "left" : px > a.right - 50 ? "right" : "center"; ctx.fillText(ch.data.labels[i], px, a.top - 16);
          const v = d.data[i]; if (v != null) { ctx.fillStyle = d.borderColor; ctx.beginPath(); ctx.arc(px, y.getPixelForValue(v), 4.5, 0, 7); ctx.fill(); }
        } else {
          let j = d.data.length - 1; while (j >= 0 && d.data[j] == null) j--;   // 最新一點加上光暈
          if (j >= 0 && x.getPixelForValue(j) <= a.right + 1) {
            const cx = x.getPixelForValue(j), cy = y.getPixelForValue(d.data[j]);
            ctx.fillStyle = d.borderColor + "33"; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fill();
            ctx.fillStyle = d.borderColor; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
          }
        }
        ctx.restore();
      },
    };
    const c = new Chart(canvas.current, {
      type: "line", plugins: [eqFx],
      data: {
        labels: res.snaps.map(s => s.date), datasets: [
          { label: "代理人", data: [], borderColor: css("--rise"), borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 0, tension: .18, fill: "start", cubicInterpolationMode: "monotone" },
          { label: "0050", data: [], borderColor: css("--bench"), borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0, tension: .18 }],
      },
      options: {
        maintainAspectRatio: false, animation: false, layout: { padding: { top: 22, right: 12, left: 4, bottom: 4 } },
        events: ["mousemove", "mouseout", "touchstart", "touchmove", "touchend"],
        interaction: { mode: "index", intersect: false }, hover: { mode: "index", intersect: false },
        onHover: (e, els) => {
          if (e.type === "mouseout" || e.type === "touchend" || !els.length) unpeek();
          else { const i = Math.min(els[0].index, kRef.current); peekRef.current(i === kRef.current ? null : i); }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, grace: "6%" } },
      },
    });
    chart.current = c;
    canvas.current.onmouseleave = unpeek;
    return () => { c.destroy(); chart.current = null; };
  }, [res]);

  // 重播到第 k 天、或切換區間時，只更新資料
  useEffect(() => {
    const c = chart.current; if (!c) return;
    const cap = res.cfg.capital, b0 = res.benchBase, ds = c.data.datasets[0];
    ds.data = res.snaps.map((x, i) => i <= k ? +(x.equity / cap * 100).toFixed(2) : null);
    ds.borderColor = color; ds.backgroundColor = ctx => areaFill(ctx.chart, color);
    c.data.datasets[1].data = res.snaps.map((x, i) => i <= k ? +(x.bench / b0 * 100).toFixed(2) : null);
    const L = c.data.labels, xs = c.options.scales.x;
    if (range > 0) { xs.min = L[Math.max(0, k - range)]; xs.max = L[k]; } else { delete xs.min; delete xs.max; }
    c.update("none");
  }, [res, k, range, color]);

  return <div className="chart chart-eq"><canvas ref={canvas} aria-label="資產走勢圖，手指滑過可看任一天" /></div>;
}

// 通用：月報酬長條圖、回撤面積圖
function useSimpleChart(build, update, deps) {
  const canvas = useRef(null), chart = useRef(null);
  useEffect(() => {
    if (!window.Chart) return;
    setDefaults();
    chart.current = new Chart(canvas.current, build());
    return () => { chart.current.destroy(); chart.current = null; };
  }, []);
  useEffect(() => { if (chart.current) { update(chart.current); chart.current.update("none"); } }, deps);
  return canvas;
}

export function MonthChart({ months, mret, res, k }) {
  const canvas = useSimpleChart(() => ({
    type: "bar", data: { labels: [], datasets: [{ data: [], borderRadius: 3 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw}%` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { grid: { color: css("--line") }, ticks: { callback: v => v + "%" } } },
    },
  }), c => {
    c.data.labels = months.map(m => m.slice(2).replace("-", "/"));
    c.data.datasets[0].data = mret;
    c.data.datasets[0].backgroundColor = mret.map(v => v >= 0 ? css("--rise") : css("--fall"));
  }, [res, k]);
  return <div className="chart" style={{ height: 190 }}><canvas ref={canvas} /></div>;
}

export function DrawdownChart({ dates, dd, res, k }) {
  const canvas = useSimpleChart(() => ({
    type: "line", data: { labels: [], datasets: [{ data: [], borderColor: css("--fall"), backgroundColor: css("--fall") + "33", fill: true, pointRadius: 0, borderWidth: 1.5 }] },
    options: {
      maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw}%` } } },
      scales: { x: { ticks: { maxTicksLimit: 4, maxRotation: 0 }, grid: { display: false } }, y: { grid: { color: css("--line") }, max: 0, ticks: { callback: v => v + "%" } } },
    },
  }), c => { c.data.labels = dates; c.data.datasets[0].data = dd; }, [res, k]);
  return <div className="chart" style={{ height: 140 }}><canvas ref={canvas} /></div>;
}
