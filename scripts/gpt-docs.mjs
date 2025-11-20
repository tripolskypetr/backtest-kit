import { globSync } from "glob";
import { basename, join, extname, resolve } from "path";
import { str, retry } from "functools-kit";
import { Ollama } from "ollama";
import { Agent, setGlobalDispatcher } from "undici";
import fs from "fs";

setGlobalDispatcher(
  new Agent({
    headersTimeout: 60 * 60 * 1000,
    bodyTimeout: 0,
  })
);

const MODULE_NAME = "agent-swarm-kit";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

const DISALLOWED_TEXT = ["Summary:", "System:", "#"];

const GPT_CLASS_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading backtest framework with several sentences in more human way";

const GPT_INTERFACE_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading backtest framework with several sentences in more human way";

const GPT_FUNCTION_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading backtest framework with several sentences in more human way";

const HEADER_CONTENT =
  "# agent-swarm-kit api reference\n" +
  "\n" +
  "![schema](../assets/uml.svg)\n" +
  "\n" +
  "**Overall Architecture:**\n" +
  "\n" +
  "This system built around a distributed, asynchronous architecture. Agents communicate via a message queue, and their interactions are orchestrated through a series of tools and processes. The core concept is to allow agents to perform tasks independently while still being part of a larger, coordinated system.\n" +
  "\n" +
  "**Core Concepts & Relationships**\n" +
  "\n" +
  "* **Swarm Orchestration:** The entire framework is built around orchestrating agents to perform tasks.\n" +
  "* **Agent as the Central Unit:** The `IAgent` is the fundamental building block – the individual agent that executes tasks.\n" +
  "* **Communication (Bus):** The `IAgentParams` interface highlights the importance of the `bus` (a messaging system) for agents to communicate and coordinate.\n" +
  "* **History Management:** The `IAgent` and `IAgentParams` emphasize the agent's ability to operate without relying on conversation history (using the `run` method).\n" +
  "* **Tool Execution:** The `IAgent`’s `call` and `execute` methods are central to running tools within the agent.\n" +
  "* **Schema & Configuration:** The `IAgentSchema` defines the configuration for each agent, including its tools, prompt, and completion mechanism.\n" +
  "\n" +
  "**Interface Breakdown & Key Responsibilities**\n" +
  "\n" +
  "Here’s a summary of each interface and its role:\n" +
  "\n" +
  "* **`IAgent`:** The core runtime agent.  Handles independent execution, tool calls, message commitment, and lifecycle management.\n" +
  "* **`IAgentParams`:**  Provides the agent with the necessary parameters for operation, including its ID, logging, communication channel, and history management.\n" +
  "* **`IAgentSchema`:** Defines the configuration settings for an agent (tools, prompt, completion mechanism).\n" +
  "* **`IAgentSchemaCallbacks`:**  Provides callbacks for managing different stages of an agent’s lifecycle (init, run, output, etc.).\n" +
  "* **`IAgentConnectionService`:** A type definition for an `AgentConnectionService` – a service that manages connections between the agents.\n" +
  "\n" +
  "**Workflow Implications**\n" +
  "\n" +
  "Based on these interfaces, here’s a workflow:\n" +
  "\n" +
  "1. **Agent Configuration:** An `IAgentSchema` is created to define the agent’s settings.\n" +
  "2. **Agent Instantiation:** An `IAgent` instance is created based on the schema.\n" +
  "3. **Agent Execution:** The `IAgent`’s `execute` method is called to initiate independent operation.\n" +
  "4. **Tool Calls:**  The `IAgent` uses `call` to execute tools.\n" +
  "5. **Message Handling:** The `IAgent` uses `commitToolOutput`, `commitSystemMessage`, and `commitUserMessage` to manage messages.\n" +
  "6. **Communication:** The `IAgent` uses the `bus` (via `IAgentParams`) to communicate with other agents.\n" +
  "\n" +
  "**Key Concepts & Implications:**\n" +
  "\n" +
  "* **State Management:** Agents maintain their own state (conversation history, tool outputs, etc.).\n" +
  "* **Decoupling:** The interfaces are designed to decouple different components of the system. This allows for flexibility and easier maintenance.\n" +
  "* **Event-Driven Architecture:** The use of callbacks suggests an event-driven architecture, where components communicate through events rather than direct calls.\n" +
  "* **State Management:** The interfaces highlight the importance of managing the agent's state, including conversation history, tool output, and system messages.\n" +
  "* **Tool Integration:** The `tools` property in `IAgentParams` indicates a system designed to integrate with external tools.\n" +
  "* **Asynchronous Communication:** Agents communicate asynchronously via a bus, allowing them to operate independently.\n" +
  "* **Flexibility:** The system is designed to be flexible, a\n" +
  "\n" +
  "**Potential Use Cases:**\n" +
  "\n" +
  "This architecture could be used for a wide range of applications, including:\n" +
  "\n" +
  "* **Chatbots:**  Agents could be used to power conversational AI systems.\n" +
  "* **Content Generation:** Agents could be used to generate text, images, or other content.\n" +
  "* **Data Analysis:** Agents could be used to analyze data and generate insights.\n";

console.log("Loading model");

const pull = async () => {
  const response = await ollama.pull({
    model: "gemma3:12b",
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

const generateDescription = retry(
  async (filePath, prompt) => {
    console.log(`Generating content for ${resolve(filePath)}`);

    const data = fs.readFileSync(filePath).toString();

    const messages = [
      {
        content: prompt,
        role: "system",
      },
      {
        content: str.newline(
          'Do not write the header like "Okay, here’s a human-friendly summary".',
          'Do not write the header like "Okay, this is a comprehensive overview".',
          "Write the countent only like you are writing doc file directly.",
          `Write the human text only without markdown symbols epecially like: ${DISALLOWED_TEXT.map(
            (v) => `"${v}"`
          ).join(", ")}`,
          `You still can use lists and new lines if need`,
          "Do not write any headers started with #",
          'Never recommend anything else like "Would you like me to:"',
          "Never ask me about any information",
          "Never say ok or confirm you doing something"
        ),
        role: "system",
      },
      {
        content: data,
        role: "user",
      },
    ];

    let content;
    console.time("EXECUTE");
    try {
      const {
        message: { content: c },
      } = await ollama.chat({
        model: "gemma3:12b",
        keep_alive: "8h",
        options: {
          num_ctx: 48_000,
        },
        messages,
      });
      content = c;
    } catch (error) {
      console.error(`Caught an error for ${filePath}`, error);
      throw error;
    } finally {
      console.timeEnd("EXECUTE");
    }

    if (
      DISALLOWED_TEXT.some((text) =>
        content.toLowerCase().includes(text.toLowerCase())
      )
    ) {
      console.warn(`Found disallowed symbols for ${filePath}`);
      let result;
      console.time("EXECUTE");
      try {
        const {
          message: { content: r },
        } = await ollama.chat({
          model: "gemma3:12b",
          keep_alive: "8h",
          options: {
            num_ctx: 48_000,
          },
          messages: [
            ...messages,
            {
              content,
              role: "assistant",
            },
            {
              content:
                "I found dissalowed symbols in the output. Write the result correct",
              role: "user",
            },
          ],
        });
        result = r;
      } catch (error) {
        console.error(`Caught an error for ${filePath} (fix attempt)`);
        throw error;
      } finally {
        console.timeEnd("EXECUTE");
      }
      return result;
    }

    return content;
  },
  Number.POSITIVE_INFINITY,
  5_000
);

const outputPath = join(process.cwd(), "docs", `internals.md`);
const output = [];

{
  const classList = globSync(`./docs/functions/*`);
  output.push(`# ${MODULE_NAME} functions`);
  output.push("");
  if (!classList.length) {
    output.push("No data available");
  }
  for (const classPath of classList) {
    const className = basename(classPath, extname(classPath));
    const content = await generateDescription(classPath, GPT_FUNCTION_PROMPT);
    if (content.trim()) {
      output.push(`## Function ${className}`);
      output.push("");
      output.push(content);
      output.push("");
    }
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  const classList = globSync(`./docs/classes/*`);
  output.push(`# ${MODULE_NAME} classes`);
  output.push("");
  if (!classList.length) {
    output.push("No data available");
  }
  for (const classPath of classList) {
    const className = basename(classPath, extname(classPath));
    const content = await generateDescription(classPath, GPT_CLASS_PROMPT);
    if (content.trim()) {
      output.push(`## Class ${className}`);
      output.push("");
      output.push(content);
      output.push("");
    }
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  const interfaceList = globSync(`./docs/interfaces/*`);
  output.push(`# ${MODULE_NAME} interfaces`);
  output.push("");
  if (!interfaceList.length) {
    output.push("No data available");
  }
  for (const interfacePath of interfaceList) {
    const interfaceName = basename(interfacePath, extname(interfacePath));
    const content = await generateDescription(
      interfacePath,
      GPT_INTERFACE_PROMPT
    );
    if (content.trim()) {
      output.push(`## Interface ${interfaceName}`);
      output.push("");
      output.push(content);
      output.push("");
    }
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  output.unshift("");
  output.unshift(HEADER_CONTENT);
}
{
  output.unshift("");
  output.unshift("---");
  output.unshift(`group: docs`);
  output.unshift(`title: docs/internals`);
  output.unshift("---");
}

fs.writeFileSync(outputPath, output.join("\n"));
