import Binance from "node-binance-api";

export const FETCH_FIAT_FN = async (binance: Binance): Promise<number> => {
  const account = await binance.account();
  const usdtBalance = account.balances.find((balance) => balance.asset === "USDT");

  if (!usdtBalance) {
    return 0;
  }

  return parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
};

export default FETCH_FIAT_FN;