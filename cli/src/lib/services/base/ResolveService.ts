import { fileURLToPath, pathToFileURL } from 'url';
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
            process.chdir(moduleRoot);
            dotenv.config({ path: path.join(moduleRoot, '.env') });
            await import(pathToFileURL(absolutePath).href);
            await entrySubject.next(absolutePath);
        }
        _is_launched = true;
    }

}

export default ResolveService;
