type Coin = string;
type Symbol = string;

export const getCoinName = (symbol: Symbol): Coin => {
  return symbol.split("USDT").join("");
};

export default getCoinName;
