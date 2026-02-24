import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from "path";
import { access } from "fs/promises";
import { constants } from "fs";
import dotenv from "dotenv";
import { inject } from '../../../lib/core/di';
import LoggerService from './LoggerService';
import TYPES from '../../../lib/core/types';
import { entrySubject } from '../../../config/emitters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

const REQUIRE_ENTRY_FACTORY = (filePath: string): boolean => {
    try {
        require(filePath);
        return true;
    } catch {
        return false;
    }
};

const IMPORT_ENTRY_FACTORY = async (filePath: string): Promise<void> => {
    await import(pathToFileURL(filePath).href);
};

const LOAD_ENTRY_FN = async (filePath: string): Promise<void> => {
    if (!REQUIRE_ENTRY_FACTORY(filePath)) {
        await IMPORT_ENTRY_FACTORY(filePath);
    }
};

let _is_launched = false;

export class ResolveService {

    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public readonly DEFAULT_TEMPLATE_DIR = path.resolve(__dirname, '..', 'template');
    public readonly OVERRIDE_TEMPLATE_DIR = path.resolve(process.cwd(), 'template');
    public readonly OVERRIDE_MODULES_DIR = path.resolve(process.cwd(), 'modules');

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
            dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
            dotenv.config({ path: path.join(moduleRoot, '.env'), override: true, quiet: true });
            await LOAD_ENTRY_FN(absolutePath);
            await entrySubject.next(absolutePath);
        }
        _is_launched = true;
    }

}

export default ResolveService;
