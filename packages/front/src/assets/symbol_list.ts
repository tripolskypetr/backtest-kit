import { str } from "functools-kit";
import { SymbolModel } from "src/model/Symbol.model";

export const symbol_list: SymbolModel[] = [
  {
    icon: "/icon/btc.png",
    logo: "/icon/128/btc.png",
    symbol: "BTCUSDT",
    displayName: "Bitcoin",
    color: "#F7931A",
    priority: 50,
    description: str.newline(
      "Bitcoin - the first and most popular cryptocurrency",
      "Digital gold with a limited supply of 21 million coins",
      "Used as a reserve asset and a store of value",
      "Highly liquid market with large trading volumes"
    ),
  },
  {
    icon: "/icon/eth.png",
    logo: "/icon/128/eth.png",
    symbol: "ETHUSDT",
    color: "#6F42C1",
    displayName: "Ethereum",
    priority: 50,
    description: str.newline(
      "Ethereum - a blockchain platform for smart contracts",
      "The foundation of DeFi and NFT ecosystems",
      "Transition to Proof-of-Stake (Ethereum 2.0)",
      "Second largest cryptocurrency by market capitalization"
    ),
  },
  {
    icon: "/icon/bnb.png",
    logo: "/icon/128/bnb.png",
    symbol: "BNBUSDT",
    color: "#F3BA2F",
    displayName: "BNB",
    priority: 50,
    description: str.newline(
      "Binance Coin - the native token of the largest exchange",
      "Used for trading fee discounts",
      "Core of BNB Smart Chain for decentralized apps (DApps)",
      "Regular token burns reduce the circulating supply"
    ),
  },
  {
    icon: "/icon/xrp.png",
    logo: "/icon/128/xrp.png",
    symbol: "XRPUSDT",
    color: "#23292F",
    displayName: "Ripple",
    priority: 100,
    description: str.newline(
      "XRP - a digital asset for international payments",
      "Fast and low-cost cross-border transfers",
      "Used by banks and financial institutions",
      "Low fees and transaction times of 3-5 seconds"
    ),
  },
  {
    icon: "/icon/sol.png",
    logo: "/icon/128/sol.png",
    symbol: "SOLUSDT",
    color: "#00e676",
    displayName: "Solana",
    priority: 100,
    description: str.newline(
      "Solana - a high-performance blockchain",
      "Up to 65,000 transactions per second",
      "A popular platform for NFT and DeFi projects",
      "Low fees and fast transaction confirmation"
    ),
  },
];

export default symbol_list;
