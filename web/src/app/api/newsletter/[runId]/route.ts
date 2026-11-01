// GET /api/newsletter/[runId][?download=1]: the run's final newsletter HTML. The preview iframe and the HTML
// download both use this route, so they serve the same bytes.
import { N8nError, RUN_ID_RE, HTML_HEADERS, getArtifact } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!RUN_ID_RE.test(runId)) return new Response("Not found", { status: 404 });
  try {
    const a = await getArtifact(runId);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(a.html, {
      headers: { ...HTML_HEADERS, "content-disposition": (download ? "attachment" : "inline") + '; filename="CIS515-Week-' + a.week + '-Newsletter.html"' },
    });
  } catch (e) {
    const status = e instanceof N8nError ? e.httpStatus : 502;
    return new Response(status === 404 ? "Not found" : "Newsletter unavailable", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
