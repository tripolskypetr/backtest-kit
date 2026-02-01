import { globSync } from "glob";
import { unlinkSync } from "fs";

for (const modulePath of globSync(`./build/**/*.d.ts`)) {
    console.log(modulePath);
    unlinkSync(modulePath);
}

for (const modulePath of globSync(`./build/**/*.map`)) {
    console.log(modulePath);
    unlinkSync(modulePath);
}

for (const modulePath of globSync(`./build/**/package.json`)) {
    console.log(modulePath);
    unlinkSync(modulePath);
}

