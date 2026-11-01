// GET /api/generate/[runId]: the run's real backend state, as reported by workflow 05.
import { NextResponse } from "next/server";
import { N8nError, RUN_ID_RE, errorBody, getStatus } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!RUN_ID_RE.test(runId)) return NextResponse.json(errorBody("RUN_NOT_FOUND"), { status: 404 });
  try {
    const s = await getStatus(runId);
    return NextResponse.json({ runId: s.runId, week: s.week, status: s.status, errorCode: s.errorCode, omittedClaims: s.omittedClaims }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const err = e instanceof N8nError ? e : new N8nError("N8N_UNAVAILABLE", 502);
    return NextResponse.json(errorBody(err.code), { status: err.httpStatus });
  }
}
