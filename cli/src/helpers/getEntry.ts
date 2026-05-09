import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
import path from 'path';

export const getEntry = (metaUrl) => {
    const metaPath = fileURLToPath(metaUrl);
    const realArgv = realpathSync(process.argv[1]);
    return path.resolve(realArgv) === path.resolve(metaPath);
};

export default getEntry;
