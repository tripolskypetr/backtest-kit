import * as functools_kit from 'functools-kit';

interface IOrderData {
    symbol: string;
    orderId: number;
    status: "FILLED" | "CANCELED" | "NEW";
    amount: string;
    executedQty: string;
    price: string;
    time: string;
    side: "BUY" | "SELL";
}

interface IDailyPnL {
    date: string;
    pnl: string;
    walletCost: string;
    amountQty: string;
    amountUSDT: string;
    averagePrice: string;
}

declare class WalletPrivateService {
    commitTrade: (symbol: string, amountUSDT: number, averagePrice: number, takeProfitPrice: number, stopLossPrice: number) => Promise<0 | {
        status: string;
        content: string;
    }>;
    commitCancel: (symbol: string, averagePrice: number) => Promise<number>;
    commitBuy: (symbol: string, amountUSDT: number, averagePrice: number) => Promise<number>;
    commitSell: (symbol: string, amountUSDT: number, averagePrice: number) => Promise<number>;
    fetchBalance: () => Promise<Record<string, {
        usdt: number;
        quantity: number;
    }>>;
    fetchPrice: (symbol: string) => Promise<number>;
    fetchFiat: () => Promise<number>;
    fetchOrders: ((symbol: string, limit: number) => Promise<IOrderData[]>) & functools_kit.IClearableTtl<string> & functools_kit.IControlMemoize<string, Promise<IOrderData[]>>;
    fetchPnl: ((symbol: string, limit: number) => Promise<IDailyPnL[]>) & functools_kit.IClearableTtl<string> & functools_kit.IControlMemoize<string, Promise<IDailyPnL[]>>;
    clear: () => void;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable<() => Promise<void>>;
}

declare class WalletPublicService {
    private readonly walletPrivateService;
    private getRunner;
    commitBuy: (symbol: string, amountUSDT: number) => Promise<number>;
    commitSell: (symbol: string, amountUSDT: number) => Promise<number>;
    commitTrade: (symbol: string, amountUSDT: number, takeProfitPrice: number, stopLossPrice: number) => Promise<0 | {
        status: string;
        content: string;
    }>;
    commitCancel: (symbol: string) => Promise<number>;
    fetchBalance: (symbol: string) => Promise<{
        usdt: number;
        quantity: number;
    }>;
    fetchOrders: (symbol: string, limit?: number) => Promise<IOrderData[]>;
    fetchPrice: (symbol: string) => Promise<number>;
    fetchFiat: (symbol: string) => Promise<number>;
    fetchPnl: (symbol: string, limit?: number) => Promise<IDailyPnL[]>;
    commitReload: (symbol: string) => Promise<void>;
}

declare const wallet: {
    walletPublicService: WalletPublicService;
    walletPrivateService: WalletPrivateService;
};

export { wallet as default, wallet };
