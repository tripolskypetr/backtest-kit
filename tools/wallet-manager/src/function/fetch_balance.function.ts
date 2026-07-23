import Binance from "node-binance-api";

const SYMBOL_LIST = [
  "BTCUSDT",
  "POLUSDT",
  "ZECUSDT",
  "HYPEUSDT",
  "DOGEUSDT",
  "SOLUSDT",
  "PENGUUSDT",
  "TRXUSDT",
  "HBARUSDT",
  "NEARUSDT",
  "FARTCOINUSDT",
  "ETHUSDT",
  "PUMPUSDT",
];

const balance = async (coinList: string[], binance: Binance) => {
  const registry = await binance.balance();
  const result = {};
  for (const coinName of coinList) {
    result[coinName] = 0;
    result[coinName] += Number(registry[coinName]?.available) || 0;
    result[coinName] += Number(registry[coinName]?.onOrder) || 0;
  }
  return result;
};

export const FETCH_BALANCE_FN = async (binance: Binance) => {
  const coinList = SYMBOL_LIST.map((symbol) => symbol.split("USDT").join(""));
  const registry = await balance(coinList, binance);
  const prices = await binance.prices();
  const result: Record<
    string,
    {
      usdt: number;
      quantity: number;
    }
  > = {};
  for (const coinName of coinList) {
    const symbol = `${coinName}USDT`;
    const quantity = registry[coinName] || 0;
    const price = prices[symbol] || 0;
    result[coinName] = {
      quantity,
      usdt: quantity * price,
    };
  }
  return result;
};

export default FETCH_BALANCE_FN;
