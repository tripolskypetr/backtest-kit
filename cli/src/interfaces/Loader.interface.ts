import { IBabel } from "./Babel.interface";
import { ILogger } from "./Logger.interface";

export interface ILoaderParams {
    path: string;
    logger: ILogger;
    babel: IBabel;
}

export interface ILoader {
    import(filePath: string): any;
    check(filePath: string): boolean;
}
