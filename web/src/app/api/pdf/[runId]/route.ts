// GET /api/pdf/[runId]: PDF of the run's stored newsletter HTML. Accepts no HTML from the browser.
// A PDF failure leaves the run and its HTML untouched.
import { NextResponse } from "next/server";
import { N8nError, RUN_ID_RE, errorBody, getArtifact } from "@/lib/server/n8n";
import { PdfError, htmlToPdf } from "@/lib/server/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!RUN_ID_RE.test(runId)) return NextResponse.json(errorBody("RUN_NOT_FOUND"), { status: 404 });
  let artifact;
  try {
    artifact = await getArtifact(runId);
  } catch (e) {
    const err = e instanceof N8nError ? e : new N8nError("N8N_UNAVAILABLE", 502);
    return NextResponse.json(errorBody(err.code), { status: err.httpStatus });
  }
  try {
    const pdf = await htmlToPdf(artifact.html);
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="CIS515-Week-' + artifact.week + '-Newsletter.pdf"',
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(errorBody(e instanceof PdfError ? e.code : "PDF_RENDER_FAILED"), { status: 503 });
  }
}
