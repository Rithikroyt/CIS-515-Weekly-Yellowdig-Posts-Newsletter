// Pipelines reconstructed from post text. Invented post text only.
import { describe, expect, it } from "vitest";
import { describedPipeline } from "./described-pipeline";

const labels = (body: string) => describedPipeline(body).map((s) => s.label);

describe("describedPipeline", () => {
  it("puts the start first, middle steps in the order the post names them, and the person and the result last", () => {
    expect(labels("I built a review desk. Customers send feedback through a form. Gemini scores sentiment, and a Code node assigns a priority. " +
      "An IF node routes urgent reviews to manager review before the team gets an email.")).toEqual(["Form", "Score", "Sentiment", "Code", "Human review", "Email"]);
  });

  it("closes a chat channel with a reply", () => {
    expect(labels("Students ask questions in Telegram. The agent searches a knowledge base of official documents, and guardrails check every answer."))
      .toEqual(["Telegram", "AI agent", "Knowledge search", "Check", "Telegram reply"]);
  });

  it("names APIs from the post, without leading filler words", () => {
    expect(labels("A schedule runs each night. The Open Library API returns books, the TMDB API adds films, and an agent writes the list.")).toEqual(["Schedule", "Open Library API", "TMDB API", "AI agent"]);
  });

  it("ignores sentences about plans and suggestions", () => {
    expect(labels("A webhook receives orders and a Code node totals them in Google Sheets. Next I would add human approval and Slack alerts. A classmate suggested an email digest."))
      .toEqual(["Webhook", "Code", "Google Sheets"]);
  });

  it("keeps an email start and an email result apart", () => {
    expect(labels("When a new email arrives, an agent drafts a reply and a validation step checks it, then Gmail sends it.")).toEqual(["Email in", "AI agent", "Draft", "Check", "Email"]);
    expect(labels("When a new email arrives, an agent drafts a reply and a validation step checks it.")).toEqual(["Email in", "AI agent", "Draft", "Check"]);
  });

  it("gives no pipeline when the post says too little", () => {
    expect(describedPipeline("This week I explored the governance risks of adding many tools to one agent.")).toEqual([]);
    expect(describedPipeline("")).toEqual([]);
  });

  it("never returns more than six steps", () => {
    expect(describedPipeline("A form starts it. Supabase, Postgres, Google Sheets, Notion and a data table feed a calculator, an agent, a judge and a Code node, with a fallback. Then a manager approves and an email goes out.").length).toBeLessThanOrEqual(6);
  });
});
