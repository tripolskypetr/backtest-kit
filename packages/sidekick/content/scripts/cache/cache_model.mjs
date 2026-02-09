import { Ollama } from "ollama";

const MODEL_NAME = "glm-4.7-flash:q4_K_M";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

console.log(`Loading model ${MODEL_NAME}`);

const pull = async () => {
  const response = await ollama.pull({
    model: MODEL_NAME,
    stream: true,
  });

  for await (const part of response) {
    if (!part.completed || !part.total) {
      continue;
    }

    // Calculate progress percentage
    const progress =
      part.total > 0 ? ((part.completed / part.total) * 100).toFixed(1) : 0;

    // Create simple progress bar
    const barLength = 40;
    const filledLength = Math.round((barLength * part.completed) / part.total);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    // Display progress
    process.stdout.write(`\r[${bar}] ${progress}% ${part.status}`);

    if (part.status === "success") {
      console.log("\nModel pulled successfully!");
      break;
    }
  }

  console.log("Done!");
};

await pull();

