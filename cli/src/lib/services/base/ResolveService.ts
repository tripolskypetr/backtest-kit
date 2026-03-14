import path from "path";
import { access } from "fs/promises";
import { constants } from "fs";
import dotenv from "dotenv";
import { Log } from "backtest-kit";
import { inject } from '../../../lib/core/di';
import LoggerService from './LoggerService';
import TYPES from '../../../lib/core/types';
import { entrySubject } from '../../../config/emitters';
import LoaderService from './LoaderService';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _is_launched = false;

export class ResolveService {

    readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    readonly loaderService = inject<LoaderService>(TYPES.loaderService);

    public readonly DEFAULT_TEMPLATE_DIR = path.resolve(__dirname, '..', 'template');
    public readonly OVERRIDE_TEMPLATE_DIR = path.resolve(process.cwd(), 'template');
    public readonly OVERRIDE_MODULES_DIR = path.resolve(process.cwd(), 'modules');

    public getIsLaunched = () => {
        this.loggerService.log("resolveService getIsLaunched");
        return _is_launched;
    }

    public attachEntryPoint = async (entryPoint: string) => {
        this.loggerService.log("resolveService attachEntryPoint");
        if (_is_launched) {
            throw new Error("Entry point is already attached. Multiple entry points are not allowed.");
        }
        const absolutePath = path.resolve(entryPoint);
        await access(absolutePath, constants.F_OK | constants.R_OK);
        const moduleRoot = path.dirname(absolutePath);
        {
            const cwd = process.cwd();
            process.chdir(moduleRoot);
            cwd !== moduleRoot && Log.useJsonl();
            dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
            dotenv.config({ path: path.join(moduleRoot, '.env'), override: true, quiet: true });
            this.loaderService.import(absolutePath);
            await entrySubject.next(absolutePath);
        }
        _is_launched = true;
    }

}

export default ResolveService;
