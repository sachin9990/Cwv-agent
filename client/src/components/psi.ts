import { API_BASE } from "../lib/api";

export type PsiStrategy = "mobile" | "desktop";
export type PsiChoice = PsiStrategy | "both";

export type PsiNodeRef = { selector?: string; snippet?: string; nodeLabel?: string };
export type PsiDetailItem = {
  url?: string;
  totalBytes?: number;
  wastedBytes?: number;
  wastedMs?: number;
  score?: number;
  label?: string;
  groupLabel?: string;
  duration?: number;
  transferSize?: number;
  node?: PsiNodeRef;
};
export type PsiDetails = {
  type?: string;
  items: PsiDetailItem[];
  totalItems: number;
  overallSavingsMs?: number | null;
  overallSavingsBytes?: number | null;
};
export type PsiAudit = {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
  details?: PsiDetails | null;
};
export type PsiThirdPartyScript = {
  url: string;
  blockingTime: number;
  mainThreadTime: number;
  transferSize: number;
};
export type PsiThirdPartyEntity = {
  entity: string;
  blockingTime: number;
  mainThreadTime: number;
  transferSize: number;
  scripts: PsiThirdPartyScript[];
};
export type PsiThirdParties = {
  title: string;
  displayValue: string;
  totalBlockingTime: number;
  totalMainThreadTime: number;
  totalTransferSize: number;
  entityCount: number;
  entities: PsiThirdPartyEntity[];
};

export type PsiResult =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; audits: PsiAudit[]; thirdParties: PsiThirdParties | null };

export type PsiState = {
  choice: PsiChoice;
  collapsed?: boolean;
  mobile?: PsiResult;
  desktop?: PsiResult;
};

export const PSI_STRATEGY_STORAGE_KEY = "cwv-psi-strategy";
export const DEFAULT_PSI_CHOICE: PsiChoice = "mobile";

export function readPsiChoice(): PsiChoice {
  const stored = sessionStorage.getItem(PSI_STRATEGY_STORAGE_KEY);
  return stored === "mobile" || stored === "desktop" || stored === "both"
    ? stored
    : DEFAULT_PSI_CHOICE;
}

export function writePsiChoice(choice: PsiChoice) {
  sessionStorage.setItem(PSI_STRATEGY_STORAGE_KEY, choice);
}

export function shortenUrl(url: string, max = 64): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const head = u.host;
    const tailLen = Math.max(8, max - head.length - 3);
    return path.length > tailLen ? `${head}…${path.slice(-tailLen)}` : `${head}${path}`;
  } catch {
    return url.slice(0, max - 1) + "…";
  }
}

export function formatKb(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`;
}

export async function fetchPsi(
  url: string,
  strategy: PsiStrategy,
  metric?: string | null,
): Promise<{ audits: PsiAudit[]; thirdParties: PsiThirdParties | null }> {
  const params = new URLSearchParams({ url, strategy });
  if (metric) params.set("metric", metric);
  const resp = await fetch(`${API_BASE}/get-pagespeed?${params.toString()}`);
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail ?? `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return { audits: data.recommendations, thirdParties: data.thirdParties ?? null };
}
