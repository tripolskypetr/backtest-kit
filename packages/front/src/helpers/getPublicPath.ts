import { createRequire } from "module";
import { join, dirname } from "path";

const require = createRequire(import.meta.url);

export function getPublicPath() {
    const modulePath = require.resolve('@backtest-kit/ui');
    const basePath = dirname(modulePath);
    return join(basePath, "./modules/frontend/build");
}

export default getPublicPath;
