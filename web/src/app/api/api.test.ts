// API routes against a stubbed n8n webhook. No network, no real secrets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as generate } from "./generate/route";
import { GET as status } from "./generate/[runId]/route";
import { GET as newsletter } from "./newsletter/[runId]/route";
import { GET as pdf } from "./pdf/[runId]/route";
import { parseWeek } from "@/lib/weeks";

const SECRET = "test-secret-value-0123456789";
const RUN = "r_0123456789abcdef01234567";
const HTML = "<!doctype html>\n<html><body><p>Week 2</p></body></html>\n";
const params = (runId: string) => ({ params: Promise.resolve({ runId }) });
const post = (body: unknown) => new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) });
type Reply = { status?: number; json?: unknown; throws?: boolean };
let calls: Array<{ url: string; init: RequestInit }> = [];

function stubN8n(reply: (body: Record<string, unknown>) => Reply) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = reply(JSON.parse(String(init.body)));
    if (r.throws) throw new Error("connect ECONNREFUSED");
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }));
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("N8N_GENERATE_WEBHOOK_URL", "https://n8n.example.com/webhook/cis515-newsletter");
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("week validation", () => {
  it("accepts integers 1-5 only", () => {
    expect([1, 2, 3, 4, 5].map(parseWeek)).toEqual([1, 2, 3, 4, 5]);
    for (const bad of [0, 6, 2.5, "2", null, undefined, NaN, -1, true]) expect(parseWeek(bad)).toBeNull();
  });

  it("rejects invalid weeks and extra fields without calling n8n", async () => {
    stubN8n(() => ({}));
    for (const body of [{ week: 9 }, { week: "4" }, { week: 2.5 }, {}, { week: 2, html: "<b>x</b>" }, [2]]) {
      const res = await generate(post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_WEEK" });
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses weeks whose topic is not configured", async () => {
    stubN8n(() => ({}));
    const res = await generate(post({ week: 4 }));
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(0);
  });
});

describe("generate", () => {
  it("starts a run with the secret only in a header and returns a safe runId", async () => {
    stubN8n((b) => ({ json: { runId: b.runId, week: b.week, status: "queued" } }));
    const res = await generate(post({ week: 2 }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.runId).toMatch(/^r_[a-f0-9]{24}$/);
    expect(body).toEqual({ runId: body.runId, week: 2, status: "queued" });
    expect((calls[0].init.headers as Record<string, string>)["x-cis515-webhook-secret"]).toBe(SECRET);
    expect(String(calls[0].init.body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("returns the active run on a duplicate request", async () => {
    stubN8n((b) => ({ json: { runId: RUN, week: b.week, status: "fetching_yellowdig" } }));
    const body = await (await generate(post({ week: 2 }))).json();
    expect(body.runId).toBe(RUN);
    expect(body.status).toBe("fetching_yellowdig");
  });

  it("reports n8n unavailable without details", async () => {
    stubN8n(() => ({ throws: true }));
    const res = await generate(post({ week: 2 }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "N8N_UNAVAILABLE" });
  });

  it("reports missing configuration", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    stubN8n(() => ({}));
    const res = await generate(post({ week: 2 }));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe("status", () => {
  it("passes real backend states through", async () => {
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "evidence_review", errorCode: null } }));
    const body = await (await status(new Request("http://x"), params(RUN))).json();
    expect(body.status).toBe("evidence_review");
  });

  it("maps failure codes to safe values", async () => {
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "failed", errorCode: "Error: secret stack trace at line 3" } }));
    const body = await (await status(new Request("http://x"), params(RUN))).json();
    expect(body).toMatchObject({ status: "failed", errorCode: "GENERATION_FAILED" });
  });

  it("rejects malformed and unknown run ids", async () => {
    stubN8n(() => ({ json: { found: false } }));
    expect((await status(new Request("http://x"), params("../../etc"))).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect((await status(new Request("http://x"), params(RUN))).status).toBe(404);
  });

  it("rejects an n8n reply with an unknown state", async () => {
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "approved" } }));
    expect((await status(new Request("http://x"), params(RUN))).status).toBe(502);
  });
});

describe("newsletter html", () => {
  it("serves the same bytes inline and as a download, sandboxed", async () => {
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "ready", html: HTML } }));
    const inline = await newsletter(new Request("http://x/api/newsletter/" + RUN), params(RUN));
    const dl = await newsletter(new Request("http://x/api/newsletter/" + RUN + "?download=1"), params(RUN));
    expect(await inline.text()).toBe(HTML);
    expect(await dl.text()).toBe(HTML);
    expect(dl.headers.get("content-disposition")).toBe('attachment; filename="CIS515-Week-2-Newsletter.html"');
    expect(inline.headers.get("content-security-policy")).toContain("sandbox");
    expect(inline.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("is not served before the run is ready", async () => {
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "rendering" } }));
    expect((await newsletter(new Request("http://x"), params(RUN))).status).toBe(404);
  });
});

describe("pdf", () => {
  it("fails safely without losing the html", async () => {
    vi.stubEnv("CHROME_EXECUTABLE_PATH", "");
    vi.stubEnv("CHROMIUM_PACK_URL", "");
    stubN8n(() => ({ json: { runId: RUN, week: 2, status: "ready", html: HTML } }));
    const res = await pdf(new Request("http://x"), params(RUN));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "PDF_NOT_CONFIGURED" });
    const html = await newsletter(new Request("http://x"), params(RUN));
    expect(await html.text()).toBe(HTML);
  });

  it("rejects unknown run ids", async () => {
    stubN8n(() => ({ json: { found: false } }));
    expect((await pdf(new Request("http://x"), params("nope"))).status).toBe(404);
  });
});
