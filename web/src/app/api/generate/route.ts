// POST /api/generate {week}: validates the week server-side and starts workflow 05. Returns {runId, status}.
import { NextResponse } from "next/server";
import { N8nError, errorBody, startGeneration } from "@/lib/server/n8n";
import { parseWeek, weekConfig } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
  const week = keys && keys.length === 1 && keys[0] === "week" ? parseWeek((body as { week: unknown }).week) : null;
  if (week === null) return NextResponse.json(errorBody("INVALID_WEEK"), { status: 400 });
  if (!weekConfig(week).topic) return NextResponse.json(errorBody("WEEK_NOT_CONFIGURED"), { status: 409 });
  try {
    const run = await startGeneration(week);
    return NextResponse.json({ runId: run.runId, week: run.week, status: run.status }, { status: 202 });
  } catch (e) {
    const err = e instanceof N8nError ? e : new N8nError("N8N_UNAVAILABLE", 502);
    return NextResponse.json(errorBody(err.code), { status: err.httpStatus });
  }
}
