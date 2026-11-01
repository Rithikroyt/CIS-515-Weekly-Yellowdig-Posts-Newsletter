import type { WeekKind } from "@/lib/issues/catalog";

const PROV: Record<string, { cls: string; title: string }> = {
  "CODE-COUNTED": { cls: "badge-code", title: "Computed by deterministic code from the source data" },
  "AI-DRAFTED": { cls: "badge-ai", title: "Written by AI with evidence references that code checked" },
  "HUMAN-APPROVED": { cls: "badge-human", title: "A person approved this issue before publication" },
  "SOURCE-LINKED": { cls: "badge-code", title: "Links back to the original source" },
  "LIVE VERIFIED": { cls: "badge-ok", title: "Came from a real, authorized Yellowdig request" },
  "FIXTURE TESTED": { cls: "badge-ref", title: "Tested with synthetic fixture data only" },
  "REFERENCE ISSUE": { cls: "badge-ref", title: "Synthetic data that demonstrates the format; not real class data" },
};

export function Prov({ label }: { label: keyof typeof PROV | string }) {
  const p = PROV[label] ?? { cls: "", title: label };
  return <span className={"badge " + p.cls} title={p.title}>{label}</span>;
}

export const KIND_TEXT: Record<WeekKind, string> = {
  published: "Published",
  approved: "Approved",
  reference: "Reference issue",
  "in-review": "In review",
  draft: "Draft",
  failed: "Failed",
  invalid: "Unavailable",
  "not-generated": "Not generated",
};

const KIND_CLS: Record<WeekKind, string> = {
  published: "badge-ok", approved: "badge-ok", reference: "badge-ref", "in-review": "badge-review", draft: "badge-review",
  failed: "badge-fail", invalid: "badge-fail", "not-generated": "badge-none",
};

export function KindBadge({ kind }: { kind: WeekKind }) {
  return <span className={"badge " + KIND_CLS[kind]}>{KIND_TEXT[kind]}</span>;
}
