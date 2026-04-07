import { IBabel } from "./Babel.interface";
import { ILogger } from "./Logger.interface";
import { IResolve } from "./Resolve.interface";

export interface ILoaderParams {
    path: string;
    logger: ILogger;
    babel: IBabel;
    resolve: IResolve;
}

export interface ILoader {
    import(filePath: string): any;
    check(filePath: string): boolean;
}
