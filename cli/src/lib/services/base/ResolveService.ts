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
import BabelService from './BabelService';
import fs from "fs/promises";
import { getErrorMessage } from 'functools-kit';

declare const __IS_ESM__: boolean;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

const REQUIRE_ENTRY_FACTORY = (filePath: string): boolean => {
    if (__IS_ESM__) {
        return false;
    }
    try {
        require(filePath);
        return true;
    } catch {
        return false;
    }
};

const IMPORT_ENTRY_FACTORY = async (filePath: string): Promise<boolean> => {
    if (!__IS_ESM__) {
        return false;
    }
    try {
        await import(pathToFileURL(filePath).href);
        return true;
    } catch {
        return false;
    }
};

const BABEL_ENTRY_FACTORY = async (filePath: string, self: ResolveService): Promise<boolean> => {
    const code = await fs.readFile(filePath, "utf-8");
    try {
        await self.babelService.transpileAndRun(code);
        return true;
    } catch (error) {
        console.log(getErrorMessage(error));
        return false;
    }
};

const LOAD_ENTRY_FN = async (filePath: string, self: ResolveService): Promise<void> => {
    if (REQUIRE_ENTRY_FACTORY(filePath)) {
        return;
    }
    if (await IMPORT_ENTRY_FACTORY(filePath)) {
        return;
    }
    if (await BABEL_ENTRY_FACTORY(filePath, self)) {
        return;
    }
    throw new Error(`Failed to load entry point: ${filePath}`);
};

let _is_launched = false;

export class ResolveService {

    readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    readonly babelService = inject<BabelService>(TYPES.babelService);

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
            await LOAD_ENTRY_FN(absolutePath, this);
            await entrySubject.next(absolutePath);
        }
        _is_launched = true;
    }

}

export default ResolveService;
