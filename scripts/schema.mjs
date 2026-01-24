import plantuml from "plantuml";
import fs from "fs/promises";

const umlSchema = await fs.readFile("./docs/uml.puml", "utf-8");
const umlSvg = await plantuml(umlSchema);
await fs.writeFile("./assets/uml.svg", umlSvg);

process.kill(process.pid);
