const { str } = require("functools-kit");

const symbol_list = [
  // Priority 50: Premium
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
      "Used as a reserve asset and a means of saving",
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
      "The foundation of the DeFi and NFT ecosystem",
      "Transition to Proof-of-Stake (Ethereum 2.0)",
      "The second-largest cryptocurrency by market capitalization"
    ),
  },
  {
    icon: "/icon/uni.png",
    logo: "/icon/128/uni.png",
    symbol: "UNIUSDT",
    displayName: "Uniswap",
    color: "#FF007A",
    priority: 50,
    description: str.newline(
      "Uniswap (UNI) - the largest decentralized exchange (DEX)",
      "Automated market maker (AMM) on Ethereum",
      "High liquidity and trading volumes",
      "Governance token for the Uniswap protocol"
    ),
  },
  // Priority 100: High
  {
    icon: "/icon/bnb.png",
    logo: "/icon/128/bnb.png",
    symbol: "BNBUSDT",
    color: "#F3BA2F",
    displayName: "BNB",
    priority: 100,
    description: str.newline(
      "Binance Coin - the native token of the largest exchange",
      "Used for discounts on fees",
      "Foundation of BNB Smart Chain for DApps",
      "Regular token burns reduce supply"
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
      "Popular platform for NFT and DeFi projects",
      "Low fees and fast transactions"
    ),
  },
  {
    icon: "/icon/ltc.png",
    logo: "/icon/128/ltc.png",
    symbol: "LTCUSDT",
    color: "#B8B8B8",
    displayName: "Litecoin",
    priority: 100,
    description: str.newline(
      "Litecoin (LTC) - one of the first alternative cryptocurrencies",
      "Based on Bitcoin's code but with faster block time (2.5 minutes)",
      "Low fees and high transaction speed",
      "Popular cryptocurrency for transfers and payments"
    ),
  },
  {
    icon: "/icon/bch.png",
    logo: "/icon/128/bch.png",
    symbol: "BCHUSDT",
    color: "#8DC351",
    displayName: "Bitcoin Cash",
    priority: 100,
    description: str.newline(
      "Bitcoin Cash (BCH) - a fork of Bitcoin created to increase network capacity",
      "Larger block size allows for more transactions",
      "Low fees and fast payment confirmations",
      "Popular among users for everyday payments"
    ),
  },
  {
    icon: "/icon/neo.png",
    logo: "/icon/128/neo.png",
    symbol: "NEOUSDT",
    color: "#58BF00",
    displayName: "NEO",
    priority: 100,
    description: str.newline(
      "NEO - a blockchain platform for creating digital assets and smart contracts",
      "Often referred to as 'Chinese Ethereum'",
      "Supports multiple programming languages for DApp development",
      "Uses a unique consensus mechanism called Delegated Byzantine Fault Tolerance (dBFT)"
    ),
  },
  {
    icon: "/icon/fil.png",
    logo: "/icon/128/fil.png",
    symbol: "FILUSDT",
    displayName: "Filecoin",
    color: "#0090FF",
    priority: 100,
    description: str.newline(
      "Filecoin (FIL) - a decentralized data storage network",
      "Utilizes free space on users' hard drives",
      "An alternative to centralized cloud storage",
      "Economically efficient and secure file storage"
    ),
  },
  {
    icon: "/icon/xmr.png",
    logo: "/icon/128/xmr.png",
    symbol: "XMRUSDT",
    displayName: "Monero",
    color: "#FF6600",
    priority: 100,
    description: str.newline(
      "Monero (XMR) - a cryptocurrency focused on privacy",
      "Complete anonymity of transactions and addresses",
      "Protection against tracking and blockchain analysis",
      "Popular among users who value confidentiality"
    ),
  },
  // Priority 150: Medium
  {
    icon: "/icon/xrp.png",
    logo: "/icon/128/xrp.png",
    symbol: "XRPUSDT",
    color: "#23292F",
    displayName: "Ripple",
    priority: 150,
    description: str.newline(
      "XRP - a digital asset for international payments",
      "Fast and cheap cross-border transfers",
      "Used by banks and financial institutions",
      "Low fees and transaction time of 3-5 seconds"
    ),
  },
  {
    icon: "/icon/avax.png",
    logo: "/icon/128/avax.png",
    symbol: "AVAXUSDT",
    color: "#E84142",
    displayName: "Avalanche",
    priority: 150,
    description: str.newline(
      "Avalanche (AVAX) - a high-performance blockchain for smart contracts",
      "Supports the creation of custom blockchains (Subnet)",
      "Fast and cheap transactions, high scalability",
      "Popular platform for DeFi and NFT projects"
    ),
  },
  {
    icon: "/icon/link.png",
    logo: "/icon/128/link.png",
    symbol: "LINKUSDT",
    color: "#375BD2",
    displayName: "Chainlink",
    priority: 150,
    description: str.newline(
      "Chainlink (LINK) - a decentralized oracle network",
      "Provides data transmission from the external world to smart contracts",
      "A key component of the DeFi ecosystem",
      "High security and reliability of data"
    ),
  },
  {
    icon: "/icon/dot.png",
    logo: "/icon/128/dot.png",
    symbol: "DOTUSDT",
    color: "#E6007A",
    displayName: "Polkadot",
    priority: 150,
    description: str.newline(
      "Polkadot (DOT) - a multi-chain blockchain platform",
      "Allows different blockchains to interact through parachains",
      "High scalability and security",
      "Actively used for creating decentralized applications and services"
    ),
  },
  {
    icon: "/icon/matic.png",
    logo: "/icon/128/matic.png",
    symbol: "MATICUSDT",
    displayName: "Polygon",
    color: "#8247E5",
    priority: 150,
    description: str.newline(
      "Polygon (MATIC) - a scaling solution for Ethereum",
      "Layer 2 with low fees and high speed",
      "Compatible with Ethereum and the DeFi ecosystem",
      "Used by many large projects and applications"
    ),
  },
  {
    icon: "/icon/aave.png",
    logo: "/icon/128/aave.png",
    symbol: "AAVEUSDT",
    displayName: "Aave",
    color: "#B6509E",
    priority: 150,
    description: str.newline(
      "Aave - a leading decentralized lending protocol",
      "Allows deposits and loans of cryptocurrencies",
      "Unique features: flash loans and credit delegation",
      "One of the largest DeFi projects by total value locked"
    ),
  },
  {
    icon: "/icon/ftc.png",
    logo: "/icon/128/ftc.png",
    symbol: "SUSDT",
    displayName: "Sonic",
    color: "#1969FF",
    priority: 150,
    description: str.newline(
      "Sonic (aka Fantom) - a high-speed platform for DeFi",
      "Directed acyclic graph (DAG) technology",
      "Transaction finality in less than 1 second",
      "Low fees and a growing ecosystem of applications"
    ),
  },

  // Priority 200: Low
  {
    icon: "/icon/doge.png",
    logo: "/icon/128/doge.png",
    symbol: "DOGEUSDT",
    color: "#C2A633",
    displayName: "Dogecoin",
    priority: 200,
    description: str.newline(
      "Dogecoin (DOGE) - a cryptocurrency created as a joke based on the popular meme with the Shiba Inu dog",
      "Fast and cheap transactions",
      "Actively supported by the community and celebrities",
      "Used for tips and micropayments"
    ),
  },
  {
    icon: "/icon/trx.png",
    logo: "/icon/128/trx.png",
    symbol: "TRXUSDT",
    color: "#EC0928",
    displayName: "TRON",
    priority: 200,
    description: str.newline(
      "TRON (TRX) - a blockchain platform for decentralized applications and smart contracts",
      "High throughput and low fees",
      "Popular for creating tokens and conducting fast transactions",
      "Actively developed and supported by a large community"
    ),
  },
  {
    icon: "/icon/ada.png",
    logo: "/icon/128/ada.png",
    symbol: "ADAUSDT",
    color: "#0033AD",
    displayName: "Cardano",
    priority: 200,
    description: str.newline(
      "Cardano (ADA) - a blockchain platform with a scientific approach to development",
      "Uses the Ouroboros consensus algorithm (Proof-of-Stake)",
      "Supports smart contracts and decentralized applications",
      "Focus on scalability, security, and sustainability"
    ),
  },
  {
    icon: "/icon/eos.png",
    logo: "/icon/128/eos.png",
    symbol: "EOSUSDT",
    color: "#19191A",
    displayName: "EOS",
    priority: 200,
    description: str.newline(
      "EOS - a high-performance blockchain platform for decentralized applications (DApps)",
      "Fast and free transactions thanks to delegated Proof-of-Stake (DPoS)",
      "Focused on scalability and developer convenience",
      "Popular among projects requiring high throughput"
    ),
  },
  {
    icon: "/icon/xlm.png",
    logo: "/icon/128/xlm.png",
    symbol: "XLMUSDT",
    color: "#19191A",
    displayName: "XLM",
    priority: 200,
    description: str.newline(
      "Stellar (XLM) - a platform for fast and cheap international transfers",
      "Focused on integration with financial institutions and banks",
      "Uses a unique consensus protocol called Stellar Consensus Protocol (SCP)",
      "Supports token creation and decentralized exchange"
    ),
  },
  {
    icon: "/icon/ksm.png",
    logo: "/icon/128/ksm.png",
    symbol: "KSMUSDT",
    displayName: "Kusama",
    color: "#000000",
    priority: 200,
    description: str.newline(
      "Kusama (KSM) - an experimental network of Polkadot",
      "A testing ground for new features before implementation in Polkadot",
      "Own ecosystem of parachains and projects",
      "Fast deployment and testing of innovations"
    ),
  },
  {
    icon: "/icon/comp.png",
    logo: "/icon/128/comp.png",
    symbol: "COMPUSDT",
    displayName: "Compound",
    color: "#00D395",
    priority: 200,
    description: str.newline(
      "Compound (COMP) - an automated lending protocol",
      "Algorithmic interest rates based on supply and demand",
      "Governance token for the Compound protocol",
      "One of the pioneers of the DeFi movement"
    ),
  },

  {
    icon: "/icon/atom.png",
    logo: "/icon/128/atom.png",
    symbol: "ATOMUSDT",
    displayName: "Cosmos",
    color: "#2E3148",
    priority: 250,
    description: str.newline(
      "Cosmos (ATOM) - a blockchain for inter-network communication",
      "Inter-Blockchain Communication (IBC) technology",
      "Allows independent blockchains to exchange data",
      "Foundation for an ecosystem of interconnected applications"
    ),
  },
  {
    icon: "/icon/algo.png",
    logo: "/icon/128/algo.png",
    symbol: "ALGOUSDT",
    displayName: "Algorand",
    color: "#000000",
    priority: 250,
    description: str.newline(
      "Algorand (ALGO) - a high-performance blockchain",
      "Pure Proof-of-Stake consensus",
      "Fast transactions with finality in less than 5 seconds",
      "Used for DeFi, NFTs, and government projects"
    ),
  },
  {
    icon: "/icon/miota.png",
    logo: "/icon/128/miota.png",
    symbol: "IOTAUSDT",
    displayName: "IOTA",
    color: "#282C37",
    priority: 250,
    description: str.newline(
      "IOTA - a distributed network for the Internet of Things (IoT)",
      "Tangle technology instead of blockchain for scalability",
      "Free microtransactions with no fees",
      "Focus on data, identity, and machine economy"
    ),
  },
  {
    icon: "/icon/vet.png",
    logo: "/icon/128/vet.png",
    symbol: "VETUSDT",
    displayName: "VeChain",
    color: "#00C1DE",
    priority: 250,
    description: str.newline(
      "VeChain (VET) - a blockchain for supply chains and logistics",
      "Used for tracking goods and verifying data",
      "Dual tokenomics: VET for speed, VTHO for gas",
      "Partnerships with major companies in the real sector"
    ),
  },
  {
    icon: "/icon/bat.png",
    logo: "/icon/128/bat.png",
    symbol: "BATUSDT",
    displayName: "Brave Reward",
    color: "#FF5000",
    priority: 250,
    description: str.newline(
      "Basic Attention Token (BAT) - a token for digital advertising in the Brave browser",
      "Rewards users for viewing ads",
      "Transparent and private advertising ecosystem",
      "Growing community of Brave Browser users"
    ),
  },
  {
    icon: "/icon/etc.png",
    logo: "/icon/128/etc.png",
    symbol: "ETCUSDT",
    displayName: "Ethereum Classic",
    color: "#328332",
    priority: 300,
    description: str.newline(
      "Ethereum Classic (ETC) - the original Ethereum chain",
      "Commitment to the principle 'code is law'",
      "Proof-of-Work consensus for maximum security",
      "One of the oldest smart contract platforms"
    ),
  },
  {
    icon: "/icon/dash.png",
    logo: "/icon/128/dash.png",
    symbol: "DASHUSDT",
    displayName: "Dash",
    color: "#008CE7",
    priority: 300,
    description: str.newline(
      "Dash - a cryptocurrency for fast and private payments",
      "InstantSend technology for instant transactions",
      "Two-tier network: miners and masternodes",
      "Popular in countries with unstable economies"
    ),
  },
  {
    icon: "/icon/zec.png",
    logo: "/icon/128/zec.png",
    symbol: "ZECUSDT",
    displayName: "Zcash",
    color: "#ECB244",
    priority: 300,
    description: str.newline(
      "Zcash (ZEC) - a cryptocurrency with optional privacy",
      "Uses zero-knowledge proofs (zk-SNARKs) technology",
      "Choice between transparent and shielded transactions",
      "Developed by world-class cryptographers"
    ),
  },
];

module.exports = symbol_list;
