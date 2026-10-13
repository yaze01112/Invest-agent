"""
下載真實台股日K、月營收年增率、淨值比、融資使用率、法人買賣超，以及美債殖利率／匯率／費半，
輸出 data.json 給網頁使用。
FinMind 免費額度每小時約 300 次；到 GitHub「Settings → Secrets → Actions」新增 FINMIND_TOKEN（免費註冊）可以提高額度。
GitHub Actions 每個交易日收盤後自動執行；也可以在自己電腦跑：python update_data.py
"""
import json, os, sys, time, datetime as dt
import urllib.request, urllib.parse, urllib.error
import pandas as pd
import yfinance as yf

TECH = ["2330", "2454", "2317", "2382", "3231", "6669", "2356", "2376", "2357", "2377", "3017", "3324",
        "2308", "2345", "3037", "8046", "3189", "2379", "3034", "3661", "3443", "5269", "2303", "3711",
        "2327", "2383", "6274", "3529", "2449", "4966"]
MIXED = ["2330", "2317", "2454", "2308", "2382", "2303", "2881", "2882", "2891", "2886", "3711", "2412",
         "1301", "2002", "2603", "2609", "2615", "3231", "2357", "2376", "3037", "2345", "6669", "3017",
         "2379", "3008", "2395", "1216", "2207", "5871"]
# 景氣循環股（谷底反轉策略用）：記憶體、面板、鋼鐵、塑化、被動元件、水泥、航運
CYCLE = ["2408", "2344", "2337", "6770", "8299", "2409", "3481", "2002", "1301", "1303", "1326", "6505",
         "2327", "2492", "1101", "1102", "2603", "2609", "2615", "2606", "2637"]
BENCH = "0050"
OTC = {"3324", "6274", "3529", "8299"}  # 上櫃股票在 Yahoo 用 .TWO


def sym(code, otc=None):
    return code + (".TWO" if (code in OTC if otc is None else otc) else ".TW")


def to_dict(df):
    df = df.dropna()
    df = df[df["Volume"] > 0]
    r = lambda s: [round(float(x), 2) for x in s]
    return dict(dates=[d.strftime("%Y-%m-%d") for d in df.index], o=r(df["Open"]), h=r(df["High"]),
                l=r(df["Low"]), c=r(df["Close"]), v=[int(x) for x in df["Volume"]])


def download(symbols):
    raw = yf.download(symbols, period="3y", group_by="ticker", auto_adjust=True, progress=False, threads=True)
    out = {}
    for s in symbols:
        try:
            df = raw[s] if len(symbols) > 1 else raw
            if isinstance(df.columns, pd.MultiIndex):
                df = df.droplevel(0, axis=1) if df.columns.nlevels > 1 else df
            d = to_dict(df)
            if len(d["dates"]) >= 60:
                out[s] = d
        except Exception:
            pass
    return out


MACRO = {"tnx": "^TNX", "twd": "TWD=X", "sox": "^SOX"}  # 10 年期美債殖利率、美元兌台幣、費城半導體指數


class LimitHit(Exception):
    pass


def _clean_token(t):
    """容許貼上時多帶到「Bearer 」、引號、換行或空白。"""
    t = "".join((t or "").split())  # 去掉所有空白和換行
    t = t.strip("\"'")
    if t.lower().startswith("bearer"):
        t = t[6:]
    return t.lstrip(":")


TOKEN = {"value": _clean_token(os.environ.get("FINMIND_TOKEN")), "ok": None, "error": ""}


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


def finmind(dataset, code, start):
    url = "https://api.finmindtrade.com/api/v4/data?" + urllib.parse.urlencode(
        {k: v for k, v in dict(dataset=dataset, data_id=code, start_date=start).items() if v})
    if TOKEN["value"] and TOKEN["ok"] is not False:
        st, js = _get(url, TOKEN["value"])
        if st == 200 and js.get("status", 200) == 200:
            TOKEN["ok"] = True
            return js.get("data", [])
        if st in (402, 429) or js.get("status") in (402, 429):
            raise LimitHit(dataset)
        if TOKEN["ok"] is None:  # 第一次就失敗：token 可能無效，改用免費額度，不再用 token
            TOKEN["ok"] = False
            TOKEN["error"] = f"HTTP {st} {str(js.get('msg', ''))[:80]}"
            print(f"FinMind token 無法使用（{TOKEN['error']}），改用免費額度")
    st, js = _get(url, "")
    if st in (402, 429) or js.get("status") in (402, 429):
        raise LimitHit(dataset)
    if st != 200:
        raise RuntimeError(f"HTTP {st} {str(js.get('msg', ''))[:80]}")
    return js.get("data", [])


def month_revenue(code, start):
    """月營收，回傳 [[可用日期, 年增率], ...]。
    營收在次月 10 日前公布，所以用次月 11 日當「可用日期」，回測才不會偷看未來。"""
    rows = finmind("TaiwanStockMonthRevenue", code, start)
    rev = {(int(x["revenue_year"]), int(x["revenue_month"])): float(x["revenue"]) for x in rows if x.get("revenue")}
    out = []
    for (y, m), v in sorted(rev.items()):
        prev = rev.get((y - 1, m))
        if not prev:
            continue
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append([f"{ny}-{nm:02d}-11", round(v / prev - 1, 4)])
    return out


def daily_fields(code, start):
    """淨值比、融資使用率(%)、外資與投信買賣超(張)，依日期整理成 dict。"""
    out = {}
    for x in finmind("TaiwanStockPER", code, start):  # 同一份資料有淨值比、本益比、殖利率
        d = out.setdefault(x["date"], {})
        if x.get("PBR"):
            d["pbr"] = round(float(x["PBR"]), 2)
        if x.get("PER"):
            d["per"] = round(float(x["PER"]), 1)
        if x.get("dividend_yield") is not None:
            d["dy"] = round(float(x["dividend_yield"]), 2)
    time.sleep(0.3)
    for x in finmind("TaiwanStockMarginPurchaseShortSale", code, start):
        lim = float(x.get("MarginPurchaseLimit") or 0)
        if lim > 0:
            out.setdefault(x["date"], {})["mu"] = round(float(x.get("MarginPurchaseTodayBalance") or 0) / lim * 100, 1)
    time.sleep(0.3)
    for x in finmind("TaiwanStockInstitutionalInvestorsBuySell", code, start):
        k = "fi" if x.get("name", "").startswith("Foreign_Investor") else "it" if x.get("name") == "Investment_Trust" else None
        if k:
            d = out.setdefault(x["date"], {})
            d[k] = d.get(k, 0) + round((float(x.get("buy") or 0) - float(x.get("sell") or 0)) / 1000)
    return out


def latest_rev_date(today):
    """最近一次「已公布」月營收的可用日期：每月 11 日起才算上個月營收已公布。"""
    y, m = (today.year, today.month) if today.day >= 11 else ((today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12))
    return f"{y}-{m:02d}-11"


def add_finmind(stocks, prev=None):
    today = dt.date.today()
    rstart = (today - dt.timedelta(days=365 * 4 + 40)).isoformat()
    dstart = (today - dt.timedelta(days=365 * 3 + 10)).isoformat()
    ok = dict(rev=0, daily=0, rev_cached=0)
    stop = set()
    need = latest_rev_date(today)
    prev_st = (prev or {}).get("stocks", {})
    last_err = ""
    for code, s in stocks.items():
        old_rev = (prev_st.get(code) or {}).get("rev")
        if old_rev and old_rev[-1][0] >= need:  # 這個月的營收已經抓過，沿用就好，省額度
            s["rev"] = old_rev
            ok["rev"] += 1; ok["rev_cached"] += 1
        elif "rev" not in stop:
            try:
                r = month_revenue(code, rstart)
                if r:
                    s["rev"] = r
                    ok["rev"] += 1
            except LimitHit:
                stop.add("rev"); print("FinMind 額度用完（月營收），之後的股票先跳過")
            except Exception as e:
                last_err = f"月營收 {code}: {e}"
                print(f"{code} 月營收下載失敗：{e}")
            time.sleep(0.3)
        if "daily" not in stop:
            try:
                f = daily_fields(code, dstart)
                if f:
                    for k in ("pbr", "per", "dy", "mu", "fi", "it"):  # 對齊股價日期，沒有資料就填 null
                        s[k] = [f.get(d, {}).get(k) for d in s["dates"]]
                    ok["daily"] += 1
            except LimitHit:
                stop.add("daily"); print("FinMind 額度用完（淨值比／融資／法人），之後的股票先跳過")
            except Exception as e:
                last_err = f"淨值比等 {code}: {e}"
                print(f"{code} 淨值比／融資／法人下載失敗：{e}")
            time.sleep(0.3)
    print(f"月營收：{ok['rev']}/{len(stocks)} 檔（沿用 {ok['rev_cached']} 檔），淨值比／融資／法人：{ok['daily']}/{len(stocks)} 檔")
    # 更新狀態（不含 token 本身），放在 data.json 最前面方便檢查
    return dict(token=bool(TOKEN["value"]), token_ok=TOKEN["ok"], token_error=TOKEN["error"], rev=ok["rev"], rev_cached=ok["rev_cached"],
                daily=ok["daily"], total=len(stocks), limit_hit=sorted(stop), error=last_err[:120])


def market_chips(start):
    """全市場籌碼（各 1 次請求）：外資現貨買賣超（億元）、融資餘額（億元）、外資台指期淨未平倉（口）。"""
    out = {}

    def series(name, d):
        if d:
            ks = sorted(d)
            out[name] = dict(dates=ks, c=[round(d[k], 2) for k in ks])

    try:
        d = {}
        for x in finmind("TaiwanStockTotalInstitutionalInvestors", "", start):
            if str(x.get("name", "")).startswith("Foreign_Investor"):
                d[x["date"]] = d.get(x["date"], 0) + (float(x.get("buy") or 0) - float(x.get("sell") or 0)) / 1e8
        series("fiall", d)
    except Exception as e:
        print(f"全市場法人下載失敗：{e}")
    try:
        d = {}
        for x in finmind("TaiwanStockTotalMarginPurchaseShortSale", "", start):
            if x.get("name") == "MarginPurchaseMoney" and x.get("TodayBalance") is not None:
                d[x["date"]] = float(x["TodayBalance"]) / 1e8
        series("margin", d)
    except Exception as e:
        print(f"全市場融資下載失敗：{e}")
    try:
        d = {}
        for x in finmind("TaiwanFuturesInstitutionalInvestors", "TX", start):
            who = str(x.get("institutional_investors", ""))
            if "外資" in who or "Foreign" in who:
                d[x["date"]] = d.get(x["date"], 0) + float(x.get("long_open_interest_balance_volume") or 0) - float(x.get("short_open_interest_balance_volume") or 0)
        series("txfi", d)
    except Exception as e:
        print(f"外資期貨下載失敗：{e}")
    print(f"全市場籌碼：{list(out)}")
    return out


def macro():
    out = {}
    for k, sy in MACRO.items():
        try:
            df = yf.download(sy, period="3y", auto_adjust=True, progress=False)
            c = df["Close"]
            if isinstance(c, pd.DataFrame):
                c = c.iloc[:, 0]
            c = c.dropna()
            if len(c) >= 60:
                out[k] = dict(dates=[d.strftime("%Y-%m-%d") for d in c.index], c=[round(float(x), 3) for x in c])
        except Exception as e:
            print(f"{sy} 下載失敗：{e}")
    print(f"總體指標：{list(out)}")
    return out


ACTIVE_N = 100  # 主動選股：全市場成交值前幾名


def previous_data():
    """讀取網站上一次發佈的 data.json；這次抓不到的資料（額度用完、網路錯誤）就沿用上次的。"""
    repo = os.environ.get("GITHUB_REPOSITORY", "yaze01112/Invest-agent")
    owner, name = repo.split("/", 1)
    url = f"https://{owner.lower()}.github.io/{name}/data.json?t={int(time.time())}"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            d = json.load(r)
        print(f"讀到上次的資料：{len(d.get('stocks', {}))} 檔")
        return d
    except Exception as e:
        print(f"讀不到上次的資料：{e}")
        return {}


def fill_from_previous(stocks, prev):
    """這次沒抓到的月營收、淨值比、融資、法人，用上次的資料依日期補上。"""
    ps, n = prev.get("stocks", {}), 0
    for c, s in stocks.items():
        old = ps.get(c)
        if not old:
            continue
        if not s.get("rev") and old.get("rev"):
            s["rev"] = old["rev"]; n += 1
        if "pbr" not in s and old.get("pbr"):
            pos = {d: i for i, d in enumerate(old.get("dates", []))}
            for k in ("pbr", "per", "dy", "mu", "fi", "it"):
                if old.get(k):
                    s[k] = [old[k][pos[d]] if d in pos and pos[d] < len(old[k]) else None for d in s["dates"]]
    if n:
        print(f"沿用上次的月營收：{n} 檔")


def market_list():
    """FinMind 台股總覽：代號、名稱、產業、上市或上櫃（只要 1 次請求）。只留 4 位數普通股，排除 ETF。"""
    info = {}
    for x in finmind("TaiwanStockInfo", "", ""):
        c = str(x.get("stock_id", ""))
        if len(c) == 4 and c.isdigit() and not c.startswith("0") and x.get("type") in ("twse", "tpex") and c not in info:
            info[c] = dict(name=x.get("stock_name", c), sector=x.get("industry_category", ""), otc=x.get("type") == "tpex")
    return info


def pick_active(info, n=ACTIVE_N):
    """用近 20 個交易日的平均成交值（收盤價 × 成交量）排名，取前 n 名。"""
    syms = {sym(c, v["otc"]): c for c, v in info.items()}
    raw = yf.download(list(syms), period="2mo", group_by="ticker", auto_adjust=True, progress=False, threads=True)
    value = {}
    for s_, c in syms.items():
        try:
            df = raw[s_].dropna().tail(20)
            if len(df) >= 10:
                value[c] = float((df["Close"] * df["Volume"]).mean())
        except Exception:
            pass
    top = sorted(value, key=value.get, reverse=True)[:n]
    print(f"主動選股：全市場 {len(info)} 檔，有成交資料 {len(value)} 檔，取成交值前 {len(top)} 名")
    return top


def main():
    prev = previous_data()
    info, active = {}, []
    try:
        info = market_list()
        for c, v in info.items():
            if v["otc"]:
                OTC.add(c)
        active = pick_active(info)
    except Exception as e:
        print(f"主動選股失敗：{e}")
    if not active and prev.get("active"):  # 這次選不出來就沿用上次的名單
        active = prev["active"]
        info = {c: dict(name=prev.get("names", {}).get(c, c), sector=prev.get("sectors", {}).get(c, ""), otc=False) for c in prev.get("names", {})}
        print(f"沿用上次的主動選股名單：{len(active)} 檔")
    fixed = sorted(set(TECH + MIXED + CYCLE))
    codes = sorted(set(fixed + active)) + [BENCH]
    got = download([sym(c) for c in codes])
    stocks = {c: got[sym(c)] for c in codes if sym(c) in got}
    missing = [c for c in codes if c not in stocks]
    if missing:  # 換另一個市場代號再試一次
        alt = download([sym(c, otc=c not in OTC) for c in missing])
        for c in missing:
            if sym(c, otc=c not in OTC) in alt:
                stocks[c] = alt[sym(c, otc=c not in OTC)]
    if BENCH not in stocks or len(stocks) < 20:
        sys.exit(f"下載失敗，只拿到 {len(stocks)} 檔，不更新 data.json")
    bench = stocks.pop(BENCH)
    status = add_finmind(stocks, prev)
    fill_from_previous(stocks, prev)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    names = {c: info[c]["name"] for c in stocks if c in info}
    sectors = {c: info[c]["sector"] for c in stocks if c in info and info[c]["sector"]}
    mk = macro()
    try:
        mk.update(market_chips((dt.date.today() - dt.timedelta(days=365 * 3 + 10)).isoformat()))
    except LimitHit:
        print("FinMind 額度用完（全市場籌碼）")
    for k in ("fiall", "margin", "txfi"):  # 這次沒抓到就沿用上次的
        if k not in mk and prev.get("macro", {}).get(k):
            mk[k] = prev["macro"][k]
    status["market"] = [k for k in ("fiall", "margin", "txfi") if k in mk]
    data = dict(finmind=status, active=[c for c in active if c in stocks], names=names, sectors=sectors, stocks=stocks, bench=dict(dates=bench["dates"], c=bench["c"]), macro=mk, source="real",
                updated=now.strftime("%Y-%m-%d %H:%M"), last_date=bench["dates"][-1])
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"完成：{len(stocks)} 檔，最新交易日 {data['last_date']}，缺少 {[c for c in codes if c not in stocks and c != BENCH]}")


if __name__ == "__main__":
    main()
