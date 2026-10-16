/* =====================================================================
   股智通 投資代理人：策略引擎
   這個檔案是從 index.html 原封不動複製出來的代理人程式碼（選股、指標、買賣、停損），
   React 版畫面（react.html）只負責顯示，不會改到這裡的任何規則。
   下面「顯示用格式」兩行也是 index.html 原本就有的，引擎產生理由文字時會用到。
   ===================================================================== */
const nf=(v,d=0)=>Number(v).toLocaleString("zh-TW",{minimumFractionDigits:d,maximumFractionDigits:d});
const sg=v=>v>0?"+":"";

/* ================= 基本資料 ================= */
const UNIVERSES = {
 tech: [["2330","台積電"],["2454","聯發科"],["2317","鴻海"],["2382","廣達"],["3231","緯創"],["6669","緯穎"],
  ["2356","英業達"],["2376","技嘉"],["2357","華碩"],["2377","微星"],["3017","奇鋐"],["3324","雙鴻"],
  ["2308","台達電"],["2345","智邦"],["3037","欣興"],["8046","南電"],["3189","景碩"],["2379","瑞昱"],
  ["3034","聯詠"],["3661","世芯-KY"],["3443","創意"],["5269","祥碩"],["2303","聯電"],["3711","日月光投控"],
  ["2327","國巨"],["2383","台光電"],["6274","台燿"],["3529","力旺"],["2449","京元電子"],["4966","譜瑞-KY"]],
 mixed: [["2330","台積電"],["2317","鴻海"],["2454","聯發科"],["2308","台達電"],["2382","廣達"],
  ["2303","聯電"],["2881","富邦金"],["2882","國泰金"],["2891","中信金"],["2886","兆豐金"],
  ["3711","日月光投控"],["2412","中華電"],["1301","台塑"],["2002","中鋼"],["2603","長榮"],
  ["2609","陽明"],["2615","萬海"],["3231","緯創"],["2357","華碩"],["2376","技嘉"],
  ["3037","欣興"],["2345","智邦"],["6669","緯穎"],["3017","奇鋐"],["2379","瑞昱"],
  ["3008","大立光"],["2395","研華"],["1216","統一"],["2207","和泰車"],["5871","中租-KY"]],
 cycle: [["2408","南亞科"],["2344","華邦電"],["2337","旺宏"],["6770","力積電"],["8299","群聯"],
  ["2409","友達"],["3481","群創"],["2002","中鋼"],["1301","台塑"],["1303","南亞"],["1326","台化"],
  ["6505","台塑化"],["2327","國巨"],["2492","華新科"],["1101","台泥"],["1102","亞泥"],
  ["2603","長榮"],["2609","陽明"],["2615","萬海"],["2606","裕民"],["2637","慧洋-KY"]]};
const NAMES = Object.fromEntries([...UNIVERSES.tech,...UNIVERSES.mixed,...UNIVERSES.cycle]);
// 主動選股：股票池不是固定名單，而是每天從全市場挑成交值前 100 名（再加上固定名單），清單來自 data.json
UNIVERSES.active = [];
const UNI_LABEL = {tech:"科技股", mixed:"權值綜合", cycle:"循環股", active:"主動選股"};
function uniList(u){
  if(u!=="active") return UNIVERSES[u]||UNIVERSES.tech;
  if(REAL_RAW&&REAL_RAW.stocks) return Object.keys(REAL_RAW.stocks).map(c=>[c,(REAL_RAW.names&&REAL_RAW.names[c])||NAMES[c]||c]);
  const seen=new Set(); return [...UNIVERSES.tech,...UNIVERSES.mixed,...UNIVERSES.cycle].filter(([c])=>!seen.has(c)&&seen.add(c));
}
const SECTOR = {
  "2330":"晶圓代工","2303":"晶圓代工","3711":"封測","2449":"封測",
  "2454":"IC設計","2379":"IC設計","3034":"IC設計","3661":"IC設計","3443":"IC設計","5269":"IC設計","3529":"IC設計","4966":"IC設計",
  "2317":"AI伺服器","2382":"AI伺服器","3231":"AI伺服器","6669":"AI伺服器","2356":"AI伺服器",
  "2376":"電腦板卡","2357":"電腦板卡","2377":"電腦板卡","3017":"散熱","3324":"散熱",
  "2308":"電源元件","2327":"被動元件","2492":"被動元件","3037":"PCB載板","8046":"PCB載板","3189":"PCB載板","2383":"PCB載板","6274":"PCB載板",
  "2345":"網通","2412":"電信","3008":"光學","2395":"工業電腦",
  "2881":"金融","2882":"金融","2891":"金融","2886":"金融","5871":"金融",
  "2603":"航運","2609":"航運","2615":"航運","1301":"塑化鋼鐵","2002":"塑化鋼鐵","1216":"食品汽車","2207":"食品汽車",
  "2408":"記憶體","2344":"記憶體","2337":"記憶體","6770":"記憶體","8299":"記憶體","2409":"面板","3481":"面板",
  "1303":"塑化鋼鐵","1326":"塑化鋼鐵","6505":"塑化鋼鐵","1101":"水泥","1102":"水泥","2606":"散裝航運","2637":"散裝航運"};
const N_COND = 6;
const nCond = cfg => N_COND + (cfg&&cfg.instBonus?1:0);   // 開啟法人加分時多 1 個條件
const PRESETS = {
  aggressive:   {maxPos:3, risk:3,   atrMult:2.5, maxHold:20, minScore:4, exitEma:20, minLots:500,  maxPerSector:1, mktFilter:1, longFilter:1, breakeven:1, cycleFilter:0, ddMin:50, macroFilter:0, revCross:0, revExit:0, pbrMax:0, muMax:0, instBonus:0, fullInvest:1, maxPct:50, park:1, chipFilter:0},
  conservative: {maxPos:4, risk:1.5, atrMult:2,   maxHold:10, minScore:5, exitEma:10, minLots:1000, maxPerSector:1, mktFilter:1, longFilter:1, breakeven:1, cycleFilter:0, ddMin:50, macroFilter:0, revCross:0, revExit:0, pbrMax:0, muMax:0, instBonus:0, fullInvest:1, maxPct:50, park:1, chipFilter:0},
  // 谷底反轉：營收年增率轉正＋股價離高點夠遠，再用技術面確認止跌（6 選 3）；抄底所以關掉大盤與長線濾網，抱比較久
  cycle:        {maxPos:4, risk:2,   atrMult:2.5, maxHold:60, minScore:3, exitEma:20, minLots:500,  maxPerSector:1, mktFilter:0, longFilter:0, breakeven:1, cycleFilter:1, ddMin:50,
                 macroFilter:0, revCross:1, revExit:1, pbrMax:0, muMax:30, instBonus:1, fullInvest:1, maxPct:50, park:1, chipFilter:0}};
const STYLE_LABEL = {aggressive:"積極", conservative:"保守", cycle:"谷底反轉", custom:"自訂"};
const DEFAULT_CFG = {capital:100000, discount:1, minFee:1, feeRate:0.001425, tax:0.003, minPrice:10, ...PRESETS.aggressive};
let UNI="active", UNIVERSE=[], STYLE="aggressive";
// 兩個代理人各自保存自己的股票池、風格和參數，切換時互不影響
const AGENT_DEF = {momentum:{UNI:"active", STYLE:"aggressive"}, cycle:{UNI:"active", STYLE:"cycle"}};
let AGENT="momentum", PROFILES={};

/* ================= 示範資料（固定亂數種子，每次結果一樣） ================= */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gauss(r){let u=0;while(!u)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r())}
// 固定從 2023-01-02 開始產生，之後每天收盤(14:30)後自然多一天，舊的日子不會變
function tradingDates(){
  const end=new Date();
  if(end.getHours()*60+end.getMinutes()<14*60+30) end.setDate(end.getDate()-1);
  end.setHours(12,0,0,0);
  const out=[], d=new Date(2023,0,2,12);
  while(d<=end){ if(d.getDay()%6) out.push(ymd(d)); d.setDate(d.getDate()+1); }
  return out;
}
function ymd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function hashSeed(t){let h=2166136261;for(const ch of t){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function demoData(){
  if(UNI==="active"&&!UNIVERSE.length) UNIVERSE=uniList("active");
  const tech=UNI==="tech", dates=tradingDates(), n=dates.length;
  const rm=rng(20230102), mkt=[]; let mt=0.0004;
  for(let i=0;i<n;i++){ if(rm()<0.02) mt=(rm()-0.4)*0.0025; mkt.push(mt+gauss(rm)*0.010); }
  const stocks={};
  UNIVERSE.forEach(([code])=>{
    const r=rng(hashSeed(code+(tech?"T":"M")));
    const beta=tech?1.0+r()*0.8:0.6+r()*0.8, vol=tech?0.018+r()*0.014:0.012+r()*0.013, baseV=(1500+r()*30000)*1000;
    let p=20+Math.pow(r(),2)*900, trend=0;
    const s={dates,o:[],h:[],l:[],c:[],v:[]};
    for(let i=0;i<n;i++){
      if(r()<0.035) trend=(r()-0.45)*(tech?0.011:0.008);
      const ret=beta*mkt[i]+trend+gauss(r)*vol;
      const o=p*(1+gauss(r)*0.004), c=p*Math.exp(ret);
      s.o.push(o); s.c.push(c);
      s.h.push(Math.max(o,c)*(1+Math.abs(gauss(r))*0.006));
      s.l.push(Math.min(o,c)*(1-Math.abs(gauss(r))*0.006));
      s.v.push(Math.round(baseV*(0.6+r()*0.8)*(1+Math.abs(ret)*40+(trend>0.002?0.5:0))));
      p=c;
    }
    s.rev=[]; // 示範用月營收年增率：大致跟著股價一年漲跌走，加一點雜訊
    for(let i=250;i<n;i++) if(dates[i].slice(5,7)!==dates[i-1].slice(5,7))
      s.rev.push([dates[i].slice(0,8)+"11", +(s.c[i-1]/s.c[i-251]-1+gauss(r)*0.08).toFixed(4)]);
    // 示範用：淨值比、融資使用率、外資／投信買賣超（張）
    const book=s.c[0]/(1+r()*2); s.pbr=[]; s.mu=[]; s.fi=[]; s.it=[]; let mu=8+r()*20;
    for(let i=0;i<n;i++){
      s.pbr.push(+(s.c[i]/(book*(1+i/n*0.15))).toFixed(2));
      mu=Math.min(60,Math.max(1,mu+gauss(r)*0.8)); s.mu.push(+mu.toFixed(1));
      const ret=i?s.c[i]/s.c[i-1]-1:0;
      s.fi.push(Math.round((ret*40+gauss(r))*baseV/1e6)); s.it.push(Math.round((ret*20+gauss(r)*0.6)*baseV/3e6));
    }
    stocks[code]=s;
  });
  let b=55; const bench={dates,c:[]};
  for(let i=0;i<n;i++){ b*=Math.exp(mkt[i]); bench.c.push(b); }
  const rq=rng(777), macro={tnx:{dates,c:[]},twd:{dates,c:[]},sox:{dates,c:[]}};
  let t=4.0,w=31,x=4000;
  for(let i=0;i<n;i++){ t=Math.max(2,t+gauss(rq)*0.04); w=w*Math.exp(gauss(rq)*0.003); x*=Math.exp(mkt[i]*1.6);
    macro.tnx.c.push(+t.toFixed(3)); macro.twd.c.push(+w.toFixed(3)); macro.sox.c.push(+x.toFixed(1)); }
  macro.fiall={dates,c:[]}; macro.margin={dates,c:[]}; macro.txfi={dates,c:[]};
  let mg=2500, tx=-20000;
  for(let i=0;i<n;i++){ macro.fiall.c.push(+(mkt[i]*8000+gauss(rq)*60).toFixed(1)); mg*=Math.exp(mkt[i]*0.8+gauss(rq)*0.004); macro.margin.c.push(+mg.toFixed(1));
    tx=Math.max(-60000,Math.min(20000,tx+mkt[i]*300000+gauss(rq)*1500)); macro.txfi.c.push(Math.round(tx)); }
  return {stocks,bench,macro,source:"demo"};
}

/* ================= 真實資料：同網站的 data.json（GitHub Actions 每天收盤後更新） ================= */
let REAL_RAW=null;
async function fetchReal(){
  if(!REAL_RAW){
    const res=await fetch("data.json?t="+Date.now(),{cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    REAL_RAW=await res.json();
    for(const [c,n] of Object.entries(REAL_RAW.names||{})) if(!NAMES[c]) NAMES[c]=n;
    for(const [c,k] of Object.entries(REAL_RAW.sectors||{})) if(!SECTOR[c]) SECTOR[c]=k;
  }
  if(UNI==="active") UNIVERSE=uniList("active");
  const stocks={};
  for(const [code] of UNIVERSE) if(REAL_RAW.stocks[code]) stocks[code]=adjust(JSON.parse(JSON.stringify(REAL_RAW.stocks[code])));
  if(Object.keys(stocks).length<5) throw new Error("資料太少");
  const H=REAL_RAW.active_hist;
  return {stocks,bench:REAL_RAW.bench,macro:REAL_RAW.macro||{},source:"real",updated:REAL_RAW.updated,
    hist:UNI==="active"&&H&&Object.keys(H).length?H:null};
}
// 台股漲跌幅限制 10%，開盤跳動超過 15% 視為分割/減資，往前調整價格
function adjust(s){
  for(let i=1;i<s.c.length;i++){
    const f=s.o[i]/s.c[i-1];
    if(f<0.85||f>1.15){ for(let j=0;j<i;j++){ s.o[j]*=f; s.h[j]*=f; s.l[j]*=f; s.c[j]*=f; s.v[j]=s.v[j]/f; } }
  }
  return s;
}

/* ================= 技術指標 ================= */
function ema(a,n){const k=2/(n+1),o=[a[0]];for(let i=1;i<a.length;i++)o.push(o[i-1]+k*(a[i]-o[i-1]));return o}
function rollMax(a,n){return a.map((_,i)=>i<n-1?NaN:Math.max(...a.slice(i-n+1,i+1)))}
function rollMean(a,n){let s=0;return a.map((x,i)=>{s+=x;if(i>=n)s-=a[i-n];return i<n-1?NaN:s/n})}
function indicators(s){
  const n=s.c.length, rsi=[NaN], obv=[0], atr=[s.h[0]-s.l[0]];
  let g=NaN,l=NaN;
  for(let i=1;i<n;i++){
    const d=s.c[i]-s.c[i-1], up=Math.max(d,0), dn=Math.max(-d,0);
    if(isNaN(g)){g=up;l=dn}else{g+=(up-g)/14;l+=(dn-l)/14}
    rsi.push(l===0?100:100-100/(1+g/l));
    obv.push(obv[i-1]+Math.sign(d)*s.v[i]);
    const tr=Math.max(s.h[i]-s.l[i],Math.abs(s.h[i]-s.c[i-1]),Math.abs(s.l[i]-s.c[i-1]));
    atr.push(atr[i-1]+(tr-atr[i-1])/14);
  }
  const hi=rollMax(s.h,20);
  const e12=ema(s.c,12), e26=ema(s.c,26), macd=e12.map((x,i)=>x-e26[i]), sig=ema(macd,9);
  Object.assign(s,{e5:ema(s.c,5),e10:ema(s.c,10),e20:ema(s.c,20),rsi,obv,obvH:rollMax(obv,20),atr,
    hist:macd.map((x,i)=>i<34?NaN:x-sig[i]),ma200:rollMean(s.c,200),
    vm5:rollMean(s.v,5),vm20:rollMean(s.v,20),hi20:[NaN,...hi.slice(0,-1)]});
  // 循環股訊號：最近 2 個月營收年增率都 > 0，且再往前 4 個月內曾經 ≤ 0（＝剛轉正）
  const rv=(s.rev||[]).slice().sort((a,b)=>a[0]<b[0]?-1:1);
  s.revYoY=[]; s.revTurn=[]; s.dd=[]; s.rev3=[]; s.rev12=[]; s.revUp=[]; s.revDownEvt=[]; s.revSlow=[];
  const avg=a=>a.reduce((t,v)=>t+v,0)/a.length;
  let k=0, lastK=-1;
  for(let i=0;i<n;i++){
    while(k<rv.length&&rv[k][0]<=s.dates[i]) k++;   // 只用當天以前已公布的營收
    const y=rv.slice(0,k).map(x=>x[1]);
    s.revYoY.push(y.length?y[y.length-1]:NaN);
    s.revTurn.push(y.length>=3&&y[y.length-1]>0&&y[y.length-2]>0&&y.slice(-6,-2).some(v=>v<=0));
    // 3 個月平均年增率 vs 12 個月平均：剛上穿＝景氣轉好，跌破＝景氣轉弱
    const a3=y.length>=12?avg(y.slice(-3)):NaN, a12=y.length>=12?avg(y.slice(-12)):NaN;
    const p3=y.length>=13?avg(y.slice(-4,-1)):NaN, p12=y.length>=13?avg(y.slice(-13,-1)):NaN;
    const pp3=y.length>=14?avg(y.slice(-5,-2)):NaN, pp12=y.length>=14?avg(y.slice(-14,-2)):NaN;
    s.rev3.push(a3); s.rev12.push(a12);
    s.revUp.push(a3>a12&&(p3<=p12||pp3<=pp12));                     // 最近 2 次公布內剛上穿
    s.revDownEvt.push(k!==lastK&&a3<a12&&p3>=p12);                   // 新營收公布當天剛跌破
    s.revSlow.push(y.length>=3&&y[y.length-1]<y[y.length-2]&&y[y.length-2]<y[y.length-3]); // 年增率連 2 個月下滑
    lastK=k;
    const hi=Math.max(...s.c.slice(Math.max(0,i-499),i+1));   // 近 2 年（約 500 個交易日）最高收盤
    s.dd.push(1-s.c[i]/hi);
  }
  // 淨值比在近 3 年的分位數（0＝最便宜，1＝最貴）；融資使用率沿用最近一筆
  s.pbrPct=new Array(n).fill(NaN); s.muL=new Array(n).fill(NaN); s.inst3=new Array(n).fill(false);
  if(s.pbr){
    for(let i=0;i<n;i++){
      const v=s.pbr[i]; if(v==null) continue;
      let lo=0,tot=0; for(let j=Math.max(0,i-749);j<=i;j+=3){ const w=s.pbr[j]; if(w!=null){tot++; if(w<v) lo++;} }
      if(tot>=40) s.pbrPct[i]=lo/tot;
    }
  }
  if(s.mu){ let m=NaN; for(let i=0;i<n;i++){ if(s.mu[i]!=null) m=s.mu[i]; s.muL[i]=m; } }
  if(s.fi||s.it){
    const pos3=a=>a&&((i)=>i>=2&&a[i]>0&&a[i-1]>0&&a[i-2]>0);
    const f=pos3(s.fi), t=pos3(s.it);
    for(let i=0;i<n;i++) s.inst3[i]=!!((f&&f(i))||(t&&t(i)));
  }
  s.at=new Map(s.dates.map((d,i)=>[d,i]));
  return s;
}
function cycleOK(s,i,cfg){ return (s.revTurn[i]||(cfg.revCross&&s.revUp[i]))&&s.dd[i]>=cfg.ddMin/100; }
function cycleTags(s,i){
  return [`營收年增${isNaN(s.revYoY[i])?"—":sg(s.revYoY[i])+(s.revYoY[i]*100).toFixed(1)+"%"}（${s.revTurn[i]?"連2月轉正":s.revUp[i]?"3M上穿12M":"未轉正"}）`,`距2年高點 -${(s.dd[i]*100).toFixed(0)}%`];
}
// 補充資訊：淨值比分位、融資使用率、營收趨勢（顯示用）
function infoTags(s,i){
  const t=[];
  if(!isNaN(s.pbrPct[i])) t.push(`淨值比 ${nf(s.pbr[i],2)}（3年${(s.pbrPct[i]*100).toFixed(0)}%分位）`);
  if(s.per&&s.per[i]!=null) t.push(`本益比 ${s.per[i]>0?nf(s.per[i],1):"虧損"}`);
  if(s.dy&&s.dy[i]!=null&&s.dy[i]>0) t.push(`殖利率 ${nf(s.dy[i],1)}%`);
  if(!isNaN(s.muL[i])) t.push(`融資使用率 ${s.muL[i].toFixed(0)}%`);
  if(!isNaN(s.rev3[i])) t.push(`營收3M ${(s.rev3[i]*100).toFixed(0)}% / 12M ${(s.rev12[i]*100).toFixed(0)}%`);
  if(s.revSlow[i]) t.push("營收成長連2月放緩");
  return t;
}
function score(s,i,cfg){
  const c={
    "EMA多頭排列": s.e5[i]>s.e10[i]&&s.e10[i]>s.e20[i]&&s.c[i]>s.e20[i],
    "爆量1.5倍": s.v[i]>1.5*s.vm5[i],
    "OBV創20日新高": s.obv[i]>=s.obvH[i],
    "RSI 50-70": s.rsi[i]>=50&&s.rsi[i]<=70,
    "突破20日高": s.c[i]>s.hi20[i],
    "MACD翻多": s.hist[i]>0&&s.hist[i]>s.hist[i-1],
  };
  if(cfg&&cfg.instBonus) c["法人連3日買超"]=s.inst3[i];
  const ok=Object.keys(c).filter(k=>c[k]);
  return [ok.length,ok];
}

/* ================= 代理人 ================= */
// 買幾股：滿倉模式把可用現金平均分給這批要買的股票（單檔不超過總資產的 maxPct%）；
// 關閉時用原本的風險控管（每筆最大虧損 risk%、單檔不超過 1/maxPos）
function sizeShares(cfg,eq,cash,px,dist,nLeft){
  const afford=(cash-cfg.minFee)/(px*(1+cfg.feeRate));
  if(cfg.fullInvest){
    const budget=Math.min(cash/Math.max(nLeft,1), eq*(cfg.maxPct||100)/100);
    return Math.floor(Math.min((budget-cfg.minFee)/(px*(1+cfg.feeRate)), afford));
  }
  return Math.floor(Math.min(eq*cfg.risk/100/dist, eq/cfg.maxPos/px, afford));
}
// 主動選股的「當天名單」：某一天只能從那天收盤時的成交值前 100 名裡挑新股票（名單每天存檔，不會事後改變）。
// 存檔開始之前的日子沒有名單，就用固定的科技、權值、循環股池。沒有存檔資料時（示範資料、舊版 data.json）不限制。
const FIXED_POOL=new Set([...UNIVERSES.tech,...UNIVERSES.mixed,...UNIVERSES.cycle].map(x=>x[0]));
function makeAllow(hist){
  if(!hist) return ()=>null;
  const days=Object.keys(hist).sort(), sets=days.map(d=>new Set(hist[d]));
  return date=>{
    let lo=0,hi=days.length-1,j=-1; while(lo<=hi){const m=(lo+hi)>>1; if(days[m]<=date){j=m;lo=m+1}else hi=m-1;}
    return j<0?FIXED_POOL:sets[j];
  };
}
function runAgent(data,cfg,startDate){
  const S={}; for(const code in data.stocks) S[code]=indicators(data.stocks[code]);
  const allowAt=makeAllow(data.hist);
  const dates=[...new Set(Object.values(S).flatMap(s=>s.dates))].sort();
  const benchAt=new Map(data.bench.dates.map((d,i)=>[d,data.bench.c[i]]));
  const bMA=rollMean(data.bench.c,60), benchMAAt=new Map(data.bench.dates.map((d,i)=>[d,bMA[i]]));
  let lastBMA=NaN;
  const M=data.macro||{}, soxAt=M.sox?new Map(M.sox.dates.map((d,i)=>[d,i])):null, soxMA=M.sox?rollMean(M.sox.c,60):null;
  let lastSox=NaN, lastSoxMA=NaN, lastTx=NaN, lastFi5=NaN;
  const txAt=M.txfi?new Map(M.txfi.dates.map((d,i)=>[d,M.txfi.c[i]])):null;
  const fi5At=M.fiall?new Map(M.fiall.dates.map((d,i)=>[d,i>=4?M.fiall.c.slice(i-4,i+1).reduce((a,b)=>a+b,0):NaN])):null;
  const mkt=()=>{
    const mOK=!cfg.mktFilter||!(lastBMA>0)||lastBench>=lastBMA, xOK=!cfg.macroFilter||!(lastSoxMA>0)||lastSox>=lastSoxMA;
    const cOK=!cfg.chipFilter||!(lastTx<-30000&&lastFi5<0);   // 籌碼濾網：外資期貨淨空單超過 3 萬口、且近 5 日現貨賣超 → 不買
    return {ok:mOK&&xOK&&cOK, mOK, xOK, cOK, cOn:!!cfg.chipFilter, tx:lastTx, fi5:lastFi5, bench:lastBench, ma:lastBMA, on:!!cfg.mktFilter, xOn:!!cfg.macroFilter, sox:lastSox, soxMA:lastSoxMA};
  };
  let cash=cfg.capital, pos={}, pBuys=[], pSells={}, lastBench=null, pre=null;
  const last={}, trades=[], snaps=[];
  const fee=a=>Math.max(Math.floor(a*cfg.feeRate*cfg.discount),cfg.minFee);
  // 閒置現金停泊在 0050：以 0050 收盤價買賣，ETF 證交稅 0.1%（回測近似，不列入交易紀錄和勝率）
  let etf=0, prevBench=null; const ETF_TAX=0.001;
  const etfSell=px=>{ if(etf>0&&px>0){ const amt=etf*px; cash+=amt-fee(amt)-Math.floor(amt*ETF_TAX); etf=0; } };
  const equity=()=>cash+etf*(lastBench||0)+Object.values(pos).reduce((t,p)=>t+p.shares*(last[p.code]??p.entry),0);
  function sell(code,px,date,reason){
    const p=pos[code]; delete pos[code];
    const amt=px*p.shares, f=fee(amt), tax=Math.floor(amt*cfg.tax);
    cash+=amt-f-tax;
    trades.push({date,code,action:"SELL",price:px,shares:p.shares,cost:f+tax,
      pnl:Math.round(amt-f-tax-p.entry*p.shares-p.buyFee),days:p.days,reason});
  }
  function scan(bars,date){
    const free=cfg.maxPos-Object.keys(pos).length+Object.keys(pSells).length, cands=[];
    if(!mkt().ok) return [];                      // 大盤在 60 日均線下：暫停新買進
    const allow=allowAt(date);                    // 這天收盤時的主動選股名單
    for(const code in bars){
      const s=S[code], i=bars[code];
      if(allow&&!allow.has(code)) continue;
      if(pos[code]||s.c[i]<cfg.minPrice||!(s.vm20[i]>=cfg.minLots*1000)||!(s.atr[i]>0)) continue;
      if(cfg.longFilter&&!(s.c[i]>s.ma200[i])) continue;   // 長線趨勢：站上 200 日均線
      if(cfg.cycleFilter&&!cycleOK(s,i,cfg)) continue;     // 谷底反轉：營收剛轉正＋離高點夠遠
      if(cfg.pbrMax>0&&!(s.pbrPct[i]<=cfg.pbrMax/100)) continue;   // 淨值比要在近 3 年低檔
      if(cfg.muMax>0&&s.muL[i]>cfg.muMax) continue;                  // 融資使用率太高不買（沒有資料就不擋）
      const [sc,rs]=score(s,i,cfg);
      if(sc>=cfg.minScore) cands.push({code,score:sc,reasons:cfg.cycleFilter?[...cycleTags(s,i),...rs]:rs,dist:cfg.atrMult*s.atr[i],vr:s.v[i]/s.vm5[i],px:s.c[i]});
    }
    cands.sort((a,b)=>b.score-a.score||b.vr-a.vr);
    // 同族群最多 maxPerSector 檔，降低持股相關性
    const cnt={}, pick=[];
    for(const c in pos) if(!pSells[c]){const k=SECTOR[c]||c;cnt[k]=(cnt[k]||0)+1}
    for(const o of cands){
      if(pick.length>=Math.max(free,0)) break;
      const k=SECTOR[o.code]||o.code;
      if((cnt[k]||0)>=cfg.maxPerSector) continue;
      cnt[k]=(cnt[k]||0)+1; pick.push(o);
    }
    return pick;
  }
  for(let di=30;di<dates.length;di++){
    const date=dates[di], bars={};
    for(const code in S){const i=S[code].at.get(date); if(i!==undefined) bars[code]=i;}
    prevBench=lastBench;
    if(benchAt.has(date)){ lastBench=benchAt.get(date); lastBMA=benchMAAt.get(date); }
    if(soxAt&&soxAt.has(date)){ const j=soxAt.get(date); lastSox=M.sox.c[j]; lastSoxMA=soxMA[j]; }
    if(txAt&&txAt.has(date)) lastTx=txAt.get(date);
    if(fi5At&&fi5At.has(date)) lastFi5=fi5At.get(date);
    // 起算日之前：只看盤、不交易（起算日前一天收盤決定第一批買單）
    if(startDate&&date<startDate){ pBuys=scan(bars,date); pre={date,bench:lastBench,mkt:mkt(),pBuys:pBuys.map(o=>({...o}))}; continue; }
    // 1) 開盤賣出
    for(const code of Object.keys(pSells)){
      if(pos[code]&&bars[code]!==undefined) sell(code,S[code].o[bars[code]],date,pSells[code]);
      if(!pos[code]) delete pSells[code];
    }
    // 2) 開盤買進（有買單時先賣掉停泊的 0050，用昨天收盤價近似）
    if(etf>0&&pBuys.length) etfSell(prevBench);
    const eq=equity();
    const todo=pBuys.filter(o=>bars[o.code]!==undefined&&!pos[o.code]);
    for(let bi=0;bi<todo.length;bi++){
      const o=todo[bi], s=S[o.code], i=bars[o.code];
      if(Object.keys(pos).length>=cfg.maxPos) break;
      const px=s.o[i], nLeft=Math.min(todo.length-bi, cfg.maxPos-Object.keys(pos).length);
      const shares=sizeShares(cfg,eq,cash,px,o.dist,nLeft);
      if(shares<1) continue;
      const f=fee(px*shares); cash-=px*shares+f;
      pos[o.code]={code:o.code,shares,entry:px,stop:px-o.dist,r0:o.dist,be:false,exitLine:NaN,entryDate:date,days:0,buyFee:f,reasons:o.reasons};
      trades.push({date,code:o.code,action:"BUY",price:px,shares,cost:f,reason:`${o.score}/${nCond(cfg)} 分：`+o.reasons.join("、")});
    }
    pBuys=[];
    // 3) 盤中停損
    for(const code of Object.keys(pos)){
      const i=bars[code]; if(i===undefined) continue;
      const s=S[code];
      if(s.l[i]<=pos[code].stop){ sell(code,Math.min(s.o[i],pos[code].stop),date,pos[code].be?"保本停損":"觸及ATR停損"); delete pSells[code]; }
    }
    // 4) 收盤：移動停損、出場判斷
    for(const code in bars) last[code]=S[code].c[bars[code]];
    for(const code in pos){
      const i=bars[code]; if(i===undefined) continue;
      const s=S[code], p=pos[code];
      p.days++;
      p.stop=Math.max(p.stop,s.c[i]-cfg.atrMult*s.atr[i]);
      if(cfg.breakeven&&!p.be&&s.c[i]>=p.entry+1.5*p.r0){ p.be=true; p.stop=Math.max(p.stop,p.entry*1.006); } // 賺到 1.5R：停損移到成本（含交易成本）
      p.exitLine=cfg.exitEma===20?s.e20[i]:s.e10[i];
      if(s.c[i]<p.exitLine) pSells[code]=`收盤跌破EMA${cfg.exitEma}`;
      else if(cfg.revExit&&s.revDownEvt[i]) pSells[code]="營收3M跌破12M";
      else if(p.days>=cfg.maxHold) pSells[code]=`持有滿${cfg.maxHold}天`;
    }
    // 5) 收盤：選股
    pBuys=scan(bars,date);
    // 6) 收盤：閒置現金超過總資產 5% 就買 0050 停泊
    if(cfg.park&&lastBench>0){ const eq2=equity();
      if(cash>eq2*0.05){ const u=Math.floor((cash-cfg.minFee)/(lastBench*(1+cfg.feeRate))); if(u>0){ cash-=u*lastBench+fee(u*lastBench); etf+=u; } } }
    snaps.push({date,equity:equity(),cash,etfVal:etf*(lastBench||0),bench:lastBench,mkt:mkt(),nTrades:trades.length,
      pos:Object.values(pos).map(p=>({...p,price:last[p.code]})),pBuys:pBuys.map(o=>({...o})),pSells:{...pSells}});
  }
  const firstB=snaps.find(s=>s.bench!=null)?.bench;
  snaps.forEach(s=>{if(s.bench==null)s.bench=firstB});
  const benchBase=(pre&&pre.bench)||firstB;
  return {snaps,trades,cfg,pre,startDate,benchBase,S,allowAt};
}

/* ================= React 版用的接口（只是設定股票池，不影響策略） ================= */
function setUniverse(u){ UNI=UNIVERSES[u]?u:"active"; UNIVERSE=uniList(UNI); return UNI; }
function currentUniverse(){ return UNI; }
