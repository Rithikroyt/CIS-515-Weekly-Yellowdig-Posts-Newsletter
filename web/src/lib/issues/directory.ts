// Joins approved builds with their workflow profiles into flat, public-safe directory rows. Server-side only.
// Rows carry labels and booleans; no parameters, prompts, credentials or raw workflow content.
import type { SignalKey } from "../contracts";
import { DISPLAYABLE, loadAllWeeks, loadProfiles, type WeekKind } from "./catalog";

export type DirectoryRow = {
  week: number;
  kind: WeekKind;
  postId: string;
  title: string;
  author: string;
  category: string;
  oneLine: string;
  commentCount: number;
  sourceUrl: string | null;
  isSpotlight: boolean;
  signals: SignalKey[];
  profileId: string | null;
  aiProviders: string[];
  integrations: string[];
  triggers: string[];
  caps: { ai: boolean; code: boolean; human: boolean; gate: boolean; retry: boolean; boundedRetry: boolean; failure: boolean; api: boolean; email: boolean; store: boolean };
};

const shortType = (t: string) => t.slice(t.lastIndexOf(".") + 1);

export function directoryRows(): DirectoryRow[] {
  const rows: DirectoryRow[] = [];
  for (const entry of loadAllWeeks()) {
    if (!entry.issue || !DISPLAYABLE.has(entry.kind)) continue;
    const profiles = new Map(loadProfiles(entry).map((p) => [p.profileId, p]));
    for (const b of entry.issue.allBuilds) {
      const p = b.workflowProfileId ? profiles.get(b.workflowProfileId) : undefined;
      const c = p?.capabilities;
      rows.push({
        week: entry.week, kind: entry.kind, postId: b.postId, title: b.title, author: b.author, category: b.category,
        oneLine: b.oneLine, commentCount: b.commentCount, sourceUrl: b.sourceUrl, isSpotlight: b.isSpotlight, signals: b.signals,
        profileId: p ? p.profileId : null,
        aiProviders: p?.aiProviders ?? [],
        integrations: p?.integrations ?? [],
        triggers: p ? [...new Set(p.graph.nodes.filter((n) => n.category === "trigger").map((n) => shortType(n.type)))] : [],
        caps: {
          ai: !!c?.usesAI, code: !!c?.usesCode, human: !!c?.usesHumanApproval, gate: !!c?.hasValidationGate, retry: !!c?.usesRetry,
          boundedRetry: !!c?.hasBoundedRetry, failure: !!c?.hasExplicitFailureHandling, api: !!c?.usesExternalAPI, email: !!c?.usesEmail, store: !!c?.usesDataStore,
        },
      });
    }
  }
  return rows;
}
