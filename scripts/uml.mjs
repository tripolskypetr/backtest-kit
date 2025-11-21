import { trycatch } from "functools-kit";
import { writeFile } from "fs/promises";
import * as moduleData from "../build/index.mjs";

{
  Object.assign(globalThis, moduleData);
}

const UML_STEP = "\t";
const UML_BULLET = "•";
const MAX_NESTING = 8;

const toUML = async () => {
  const getNodes = (targetObj) =>
    Object.getOwnPropertyNames(targetObj).filter(
      trycatch(
        (propertyName) =>
          targetObj[propertyName].name && propertyName.endsWith("Service"),
        { defaultValue: false }
      )
    );

  const lines = [];
  const process = (entry, keys, level = 0) => {
    for (const key of keys) {
      const targetObj = Object.getPrototypeOf(entry[key]);
      const nodes = getNodes(targetObj);
      const space = [...new Array(level)].fill(UML_STEP).join("");
      if (nodes.length && level < MAX_NESTING) {
        lines.push(`${space}${String(key)}:`);
        lines.push(`${space}${UML_STEP}${UML_BULLET} ${String(key)}: ""`);
        process(targetObj, nodes, level + 1);
      } else {
        lines.push(`${space}${String(key)}: ""`);
      }
    }
  };
  process(
    lib,
    Object.keys(lib).filter((key) => key.includes("Global"))
  );

  const result = ["@startyaml", ...lines, "@endyaml"].join("\n");

  await writeFile("./docs/uml.puml", result);
};

moduleData.MethodContextService.runInContext(() => {
  moduleData.ExecutionContextService.runInContext(() => {
    toUML(lib);
  }, {});
}, {});
