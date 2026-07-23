import { isObject } from "functools-kit";
import readline from "readline";
import fs from "fs";

import "../build/index.mjs";

const main = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("repl => ", async (input) => {
      if (input.startsWith("exit")) {
        rl.close();
        return;
      }

      try {
        const output = await eval(input);
        console.log(
          isObject(output) ? JSON.stringify(output, null, 2) : output
        );
      } catch (error) {
        console.log(error);
      } finally {
        askQuestion();
      }
    });
  };

  askQuestion();

  rl.on("close", () => {
    process.exit(0);
  });
};

main();

// @ts-ignore
globalThis.fs = fs;
