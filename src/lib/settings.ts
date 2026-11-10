/**
 * Integer settings from the environment. "0" is a value — it switches a ration off — and only an
 * unset, blank or non-numeric string falls back to the default. QUOTE_DAILY_CAP read this way since
 * OI-24; EXPLAIN_DAILY_CAP and SMALLCAP_AV_CALLS used `parseInt(x) || default`, under which "0"
 * silently became the default (Phase 3 review N3). One function, three settings.
 */
export function intSetting(raw: string | undefined | null, fallback: number): number {
  const s = (raw ?? "").trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : fallback;
}
