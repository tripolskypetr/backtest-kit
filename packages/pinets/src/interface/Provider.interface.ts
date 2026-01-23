export interface IProvider {
    getMarketData(tickerId: string, timeframe: string, limit?: number, sDate?: number, eDate?: number): Promise<any>;
    getSymbolInfo(tickerId: string): Promise<any>;
}
