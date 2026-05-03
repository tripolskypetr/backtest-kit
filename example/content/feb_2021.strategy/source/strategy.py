import json, sys

candles = json.loads(sys.stdin.read())
closes = [c["close"] for c in candles]

# простой пример — EMA crossover сигнал
def ema(data, period):
    k = 2 / (period + 1)
    result = [data[0]]
    for price in data[1:]:
        result.append(price * k + result[-1] * (1 - k))
    return result

ema9  = ema(closes, 9)
ema21 = ema(closes, 21)

signal = "BUY" if ema9[-1] > ema21[-1] else "SELL"

print(json.dumps({
    "signal": signal,
    "ema9":  round(ema9[-1], 4),
    "ema21": round(ema21[-1], 4),
}))
