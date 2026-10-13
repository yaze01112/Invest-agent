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


TOKEN = {"value": (os.environ.get("FINMIND_TOKEN") or "").strip(), "ok": None, "error": ""}


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
        dict(dataset=dataset, data_id=code, start_date=start))
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
    for x in finmind("TaiwanStockPER", code, start):
        if x.get("PBR"):
            out.setdefault(x["date"], {})["pbr"] = round(float(x["PBR"]), 2)
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


def add_finmind(stocks):
    today = dt.date.today()
    rstart = (today - dt.timedelta(days=365 * 4 + 40)).isoformat()
    dstart = (today - dt.timedelta(days=365 * 3 + 10)).isoformat()
    ok = dict(rev=0, daily=0)
    stop = set()
    last_err = ""
    for code, s in stocks.items():
        if "rev" not in stop:
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
                    for k in ("pbr", "mu", "fi", "it"):  # 對齊股價日期，沒有資料就填 null
                        s[k] = [f.get(d, {}).get(k) for d in s["dates"]]
                    ok["daily"] += 1
            except LimitHit:
                stop.add("daily"); print("FinMind 額度用完（淨值比／融資／法人），之後的股票先跳過")
            except Exception as e:
                last_err = f"淨值比等 {code}: {e}"
                print(f"{code} 淨值比／融資／法人下載失敗：{e}")
            time.sleep(0.3)
    print(f"月營收：{ok['rev']}/{len(stocks)} 檔，淨值比／融資／法人：{ok['daily']}/{len(stocks)} 檔")
    # 更新狀態（不含 token 本身），放在 data.json 最前面方便檢查
    return dict(token=bool(TOKEN["value"]), token_ok=TOKEN["ok"], token_error=TOKEN["error"], rev=ok["rev"],
                daily=ok["daily"], total=len(stocks), limit_hit=sorted(stop), error=last_err[:120])


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


def main():
    codes = sorted(set(TECH + MIXED + CYCLE)) + [BENCH]
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
    status = add_finmind(stocks)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    data = dict(finmind=status, stocks=stocks, bench=dict(dates=bench["dates"], c=bench["c"]), macro=macro(), source="real",
                updated=now.strftime("%Y-%m-%d %H:%M"), last_date=bench["dates"][-1])
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"完成：{len(stocks)} 檔，最新交易日 {data['last_date']}，缺少 {[c for c in codes if c not in stocks and c != BENCH]}")


if __name__ == "__main__":
    main()
