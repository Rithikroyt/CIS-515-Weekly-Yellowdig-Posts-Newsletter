// The single node classifier. Every n8n type → category, integration and AI provider lives here.
// Unknown types are "other" and get no capabilities.
import type { NodeCategory } from "./types";

export const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Trigger", ai_model: "AI / LLM", ai_agent: "AI Agent", ai_component: "AI component (memory, tool, vector store)",
  code: "Code", validation: "Validation", human_review: "Human Review", email: "Email", messaging: "Messaging",
  http_api: "HTTP / External API", database: "Database", data_store: "Data Table / Storage", file: "File / Document",
  spreadsheet: "Spreadsheet", calendar: "Calendar", search_rss: "Search / RSS", control_flow: "Control Flow",
  transform: "Data transform", merge: "Merge", wait: "Wait", error_handling: "Error Handling", other: "Other",
};

const BASE = "n8n-nodes-base.";
const LC = "@n8n/n8n-nodes-langchain.";

/** Base n8n node → [category, integration]. Triggers reuse the integration of their base node. */
const BASE_TYPES: Record<string, [NodeCategory, string | null]> = {
  manualTrigger: ["trigger", null], scheduleTrigger: ["trigger", null], cron: ["trigger", null], interval: ["trigger", null],
  webhook: ["trigger", null], formTrigger: ["trigger", null], executeWorkflowTrigger: ["trigger", null],
  errorTrigger: ["error_handling", null], stopAndError: ["error_handling", null],
  code: ["code", null], function: ["code", null], functionItem: ["code", null],
  if: ["control_flow", null], switch: ["control_flow", null], filter: ["control_flow", null], splitInBatches: ["control_flow", null],
  executeWorkflow: ["control_flow", null], respondToWebhook: ["control_flow", null], noOp: ["control_flow", null],
  merge: ["merge", null], wait: ["wait", null],
  set: ["transform", null], itemLists: ["transform", null], aggregate: ["transform", null], splitOut: ["transform", null],
  sort: ["transform", null], limit: ["transform", null], removeDuplicates: ["transform", null], dateTime: ["transform", null],
  renameKeys: ["transform", null], summarize: ["transform", null], html: ["transform", null], markdown: ["transform", null],
  xml: ["transform", null], crypto: ["transform", null],
  gmail: ["email", "Gmail"], emailSend: ["email", "Email (SMTP)"], emailReadImap: ["email", "Email (IMAP)"],
  microsoftOutlook: ["email", "Microsoft Outlook"], sendGrid: ["email", "SendGrid"], mailgun: ["email", "Mailgun"],
  slack: ["messaging", "Slack"], telegram: ["messaging", "Telegram"], discord: ["messaging", "Discord"],
  microsoftTeams: ["messaging", "Microsoft Teams"], twilio: ["messaging", "Twilio"], whatsApp: ["messaging", "WhatsApp"],
  mattermost: ["messaging", "Mattermost"], googleChat: ["messaging", "Google Chat"],
  httpRequest: ["http_api", "HTTP API"], graphql: ["http_api", "GraphQL API"],
  postgres: ["database", "Postgres"], mySql: ["database", "MySQL"], mongoDb: ["database", "MongoDB"], supabase: ["database", "Supabase"],
  redis: ["database", "Redis"], microsoftSql: ["database", "Microsoft SQL"], airtable: ["database", "Airtable"],
  notion: ["database", "Notion"], baserow: ["database", "Baserow"], nocoDb: ["database", "NocoDB"],
  dataTable: ["data_store", "n8n Data Table"],
  googleSheets: ["spreadsheet", "Google Sheets"], microsoftExcel: ["spreadsheet", "Microsoft Excel"],
  googleCalendar: ["calendar", "Google Calendar"],
  rssFeedRead: ["search_rss", "RSS"],
  readWriteFile: ["file", null], readBinaryFile: ["file", null], writeBinaryFile: ["file", null], extractFromFile: ["file", null],
  convertToFile: ["file", null], googleDrive: ["file", "Google Drive"], dropbox: ["file", "Dropbox"], awsS3: ["file", "AWS S3"],
  googleDocs: ["file", "Google Docs"],
  aiTransform: ["ai_model", null],
};

/** LangChain nodes that call a model or are an agent. */
const LC_AGENTS = new Set(["agent", "agentTool", "openAiAssistant"]);
const LC_MODEL_NODES = new Set([
  "chainLlm", "chainSummarization", "chainRetrievalQa", "informationExtractor", "textClassifier", "sentimentAnalysis",
  "openAi", "anthropic", "googleGemini", "mistralAi", "ollama",
]);
const LC_COMPONENT_PREFIXES = ["memory", "vectorStore", "embeddings", "retriever", "outputParser", "textSplitter", "document", "tool", "mcpClient", "rerank"];

const PROVIDERS: Array<[RegExp, string]> = [
  [/azureopenai/i, "Azure OpenAI"], [/openai/i, "OpenAI"], [/anthropic|claude/i, "Anthropic"],
  [/gemini|googlepalm|vertex/i, "Google Gemini"], [/mistral/i, "Mistral"], [/groq/i, "Groq"], [/ollama/i, "Ollama"],
  [/deepseek/i, "DeepSeek"], [/openrouter/i, "OpenRouter"], [/bedrock/i, "AWS Bedrock"], [/cohere/i, "Cohere"], [/xai|grok/i, "xAI"],
];

export type Classification = { category: NodeCategory; integration: string | null; aiProvider: string | null; baseCategory: NodeCategory };

const HUMAN_RESUME = new Set(["webhook", "form"]);

/** Classifies one node from its type and (sanitized) parameters only. Never from its name. */
export function classifyNode(type: string, parameters: Record<string, unknown>): Classification {
  let base: Classification = { category: "other", integration: null, aiProvider: null, baseCategory: "other" };
  if (type.startsWith(BASE)) {
    const short = type.slice(BASE.length);
    const hit = BASE_TYPES[short];
    if (hit) base = { category: hit[0], integration: hit[1], aiProvider: null, baseCategory: hit[0] };
    else if (short.endsWith("Trigger")) {
      const of = BASE_TYPES[short.slice(0, -"Trigger".length)];
      base = { category: "trigger", integration: of ? of[1] : null, aiProvider: null, baseCategory: "trigger" };
    }
  } else if (type.startsWith(LC)) {
    const short = type.slice(LC.length);
    const provider = PROVIDERS.find(([re]) => re.test(short))?.[1] ?? null;
    if (short === "chatTrigger" || short === "manualChatTrigger" || short === "mcpTrigger") base = { category: "trigger", integration: null, aiProvider: null, baseCategory: "trigger" };
    else if (LC_AGENTS.has(short)) base = { category: "ai_agent", integration: null, aiProvider: short === "openAiAssistant" ? "OpenAI" : null, baseCategory: "ai_agent" };
    else if (short.startsWith("lmChat") || short.startsWith("lm") || LC_MODEL_NODES.has(short)) {
      const isConnector = short.startsWith("lm");
      // Model connectors (lmChat*) are sub-nodes that feed an agent/chain; root model nodes call the model themselves.
      base = { category: isConnector ? "ai_component" : "ai_model", integration: null, aiProvider: provider, baseCategory: isConnector ? "ai_component" : "ai_model" };
    } else if (LC_COMPONENT_PREFIXES.some((p) => short.startsWith(p))) base = { category: "ai_component", integration: null, aiProvider: null, baseCategory: "ai_component" };
  }
  // Structural human-in-the-loop overrides, read from parameters (not names).
  const op = typeof parameters.operation === "string" ? parameters.operation : "";
  const resume = typeof parameters.resume === "string" ? parameters.resume : "";
  if (op === "sendAndWait" || type === BASE + "form" || (type === BASE + "wait" && HUMAN_RESUME.has(resume))) {
    return { ...base, category: "human_review" };
  }
  return base;
}

export const GATE_TYPES = new Set([BASE + "if", BASE + "switch", BASE + "filter"]);
export const LOOP_TYPES = new Set([BASE + "splitInBatches"]);
export const ACTION_CATEGORIES = new Set<NodeCategory>(["email", "messaging", "http_api", "database", "data_store", "spreadsheet", "calendar", "file"]);
export const AI_CATEGORIES = new Set<NodeCategory>(["ai_model", "ai_agent"]);
