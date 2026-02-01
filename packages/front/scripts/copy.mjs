import { globSync } from "glob";
import { basename } from "path";

import { sync as rimraf } from "rimraf";

import touch from "touch";
import fs from "fs";

const createCopy = (prefix = "modules") => {
    for (const modulePath of globSync(`./${prefix}/*`, { onlyDirectories: true })) {
        const moduleName = basename(modulePath);
        fs.mkdirSync(`./build/${prefix}/${moduleName}/build`, { recursive: true });
        if (fs.existsSync(`./${prefix}/${moduleName}/build`)) {
            fs.cpSync(`./${prefix}/${moduleName}/build`, `./build/${prefix}/${moduleName}/build`, { recursive: true });
        }
        if (fs.existsSync(`./${prefix}/${moduleName}/package.json`)) {
            fs.copyFileSync(`./${prefix}/${moduleName}/package.json`, `./build/${prefix}/${moduleName}/package.json`);
        }
        if (fs.existsSync(`./${prefix}/${moduleName}/types.d.ts`)) {
            fs.copyFileSync(`./${prefix}/${moduleName}/types.d.ts`, `./build/${prefix}/${moduleName}/types.d.ts`);
        }
    }
}

rimraf("build/modules");
touch("./build/.gitkeep");

createCopy("modules")
