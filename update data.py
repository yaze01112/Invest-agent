"""
下載真實台股日K＋月營收年增率，輸出 data.json 給網頁使用。
GitHub Actions 每個交易日收盤後自動執行；也可以在自己電腦跑：python update_data.py
"""
import json, os, sys, time, datetime as dt
import urllib.request, urllib.parse
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


def month_revenue(code, start):
    """從 FinMind 抓月營收，回傳 [[可用日期, 年增率], ...]。
    營收在次月 10 日前公布，所以用次月 11 日當「可用日期」，回測才不會偷看未來。"""
    q = dict(dataset="TaiwanStockMonthRevenue", data_id=code, start_date=start)
    token = os.environ.get("FINMIND_TOKEN")  # 沒有也能用，有的話額度比較多
    if token:
        q["token"] = token
    url = "https://api.finmindtrade.com/api/v4/data?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=30) as r:
        rows = json.load(r).get("data", [])
    rev = {(int(x["revenue_year"]), int(x["revenue_month"])): float(x["revenue"]) for x in rows if x.get("revenue")}
    out = []
    for (y, m), v in sorted(rev.items()):
        prev = rev.get((y - 1, m))
        if not prev:
            continue
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append([f"{ny}-{nm:02d}-11", round(v / prev - 1, 4)])
    return out


def add_revenue(stocks):
    start = (dt.date.today() - dt.timedelta(days=365 * 4 + 40)).isoformat()
    ok = 0
    for code in stocks:
        try:
            r = month_revenue(code, start)
            if r:
                stocks[code]["rev"] = r
                ok += 1
        except Exception as e:
            print(f"{code} 月營收下載失敗：{e}")
        time.sleep(0.4)  # 放慢一點，避免超過 FinMind 免費額度
    print(f"月營收：{ok}/{len(stocks)} 檔")


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
    add_revenue(stocks)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    data = dict(stocks=stocks, bench=dict(dates=bench["dates"], c=bench["c"]), source="real",
                updated=now.strftime("%Y-%m-%d %H:%M"), last_date=bench["dates"][-1])
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"完成：{len(stocks)} 檔，最新交易日 {data['last_date']}，缺少 {[c for c in codes if c not in stocks and c != BENCH]}")


if __name__ == "__main__":
    main()
