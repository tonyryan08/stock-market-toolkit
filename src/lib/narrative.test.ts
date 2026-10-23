/**
 * Week 6: the Claude call, exercised without a key — a fake fetch returns what
 * the API would, and we check what the module does with it.
 */
import { describe, it, expect } from "vitest";
import { claudeNarrative, extractJson, validateNarrative, sheetAsText, SYSTEM_PROMPT } from "./narrative";
import { buildFactSheet, checkGrounding } from "./explain";
import type { ScreenInput } from "./graham";
import type { FundamentalsYear } from "./ratios";

const yr = (fy: number, eps: number, over: Partial<FundamentalsYear> = {}): FundamentalsYear => ({
  fiscalYear: String(fy), periodEnd: `${fy}-12-31`, revenue: 2e9, netIncome: eps * 50e6, epsDiluted: eps,
  currentAssets: 400, currentLiabilities: 150, totalAssets: null, totalLiabilities: null,
  longTermDebt: 100, equity: 2000, sharesDiluted: 50, goodwillAndIntangibles: 200, ...over,
});
const input: ScreenInput = {
  symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive",
  years: [yr(2025, 5), yr(2024, 4.6), yr(2023, 4.4), yr(2022, 4), yr(2021, 3.8)],
  dividendsPerYear: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(2010 + i), 1])),
  lastExDate: "2026-09-10", today: "2026-10-19", lastClose: 80, currentYear: 2026,
};
const sheet = buildFactSheet(input, "2026-10-16");

const apiReply = (text: string, status = 200, usage = { input_tokens: 1500, output_tokens: 300 }) =>
  new Response(JSON.stringify(status === 200
    ? { type: "message", content: [{ type: "text", text }], stop_reason: "end_turn", usage }
    : { type: "error", error: { type: status === 401 ? "authentication_error" : "overloaded_error", message: "nope" } }),
  { status, headers: { "content-type": "application/json" } });

const good = JSON.stringify({
  paragraphs: [
    { text: "Good Co fails two or more tests on the defensive screen, 5 of 7, and 4 of 6 on the enterprising screen.", facts: ["F1", "F11", "F12"] },
    { text: "Every business test passes; only the two price tests fail. The share is priced for growth the defensive investor does not pay for in advance.", facts: ["F11"] },
    { text: "The sheet cannot say why the price is where it is, or what happens next.", facts: ["F11"] },
  ],
  question: "What growth is Good Co's price assuming?",
});

describe("the prompt and the sheet text", () => {
  it("binds the model to the sheet and forbids advice", () => {
    expect(SYSTEM_PROMPT).toMatch(/Use only the facts on the sheet/);
    expect(SYSTEM_PROMPT).toMatch(/Never recommend/);
    expect(SYSTEM_PROMPT).toMatch(/JSON only/);
    expect(SYSTEM_PROMPT).toMatch(/"question" field only/); // v0.7.3: the live NVDA page showed the question twice — in the last paragraph and in the field
  });
  it("sends every fact with its id, and the kinds", () => {
    const t = sheetAsText(sheet);
    for (const f of sheet.facts) expect(t).toContain(`${f.id}: `);
    expect(t).toMatch(/Kinds of fail identified/);
    expect(t).toMatch(/Fails only on price/);
  });
});

describe("claudeNarrative with a fake API", () => {
  it("sends the right request and returns a validated narrative with usage", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init! };
      return apiReply(good);
    }) as typeof fetch;
    const r = await claudeNarrative(sheet, { apiKey: "sk-test", fetchImpl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.narrative.source).toBe("claude");
    expect(r.narrative.model).toBe("claude-haiku-5-5");
    expect(r.narrative.paragraphs).toHaveLength(3);
    expect(r.usage).toEqual({ input: 1500, output: 300 });
    expect(seen!.url).toBe("https://api.anthropic.com/v1/messages");
    const h = seen!.init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-test");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.temperature).toBeUndefined(); // deprecated on current models — the live API returned 400 when it was sent (19 Oct 2026)
    expect(body.max_tokens).toBe(2000);
    expect(body.thinking).toEqual({ type: "disabled" }); // thinking is on by default and eats max_tokens (seen live: stop_reason max_tokens)
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.required).toEqual(["paragraphs", "question"]);
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.messages[0].content).toContain("F1: Good Co (GOOD)");
    // and the grounding check accepts it (numbers 5, 7, 4, 6 are counts/thresholds; nothing invented)
    expect(checkGrounding(r.narrative, sheet).clean).toBe(true);
  });

  it("tolerates code fences and prose around the JSON", async () => {
    const fetchImpl = (async () => apiReply("Here you go:\n```json\n" + good + "\n```\nHope that helps.")) as typeof fetch;
    const r = await claudeNarrative(sheet, { apiKey: "k", fetchImpl });
    expect(r.ok).toBe(true);
  });

  it("reports HTTP errors without throwing, and never includes the key", async () => {
    const fetchImpl = (async () => apiReply("", 401)) as typeof fetch;
    const r = await claudeNarrative(sheet, { apiKey: "sk-secret", fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
    expect(r.reason).toMatch(/authentication_error/);
    expect(r.reason).not.toContain("sk-secret");
  });

  it("a malformed answer is rejected, not served", async () => {
    const fetchImpl = (async () => apiReply("The company looks fine to me.")) as typeof fetch;
    const r = await claudeNarrative(sheet, { apiKey: "k", fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/malformed/);
  });

  it("a network failure is a reason, not a crash", async () => {
    const fetchImpl = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
    const r = await claudeNarrative(sheet, { apiKey: "k", fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/network/);
  });

  it("respects a model override", async () => {
    let model = "";
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => { model = JSON.parse(String(init!.body)).model; return apiReply(good); }) as typeof fetch;
    await claudeNarrative(sheet, { apiKey: "k", fetchImpl, model: "claude-sonnet-5-5" });
    expect(model).toBe("claude-sonnet-5-5");
  });
});

describe("extractJson / validateNarrative", () => {
  it("rejects shapes the page cannot render", () => {
    expect(validateNarrative(extractJson("{}"), "m")).toBeNull();
    expect(validateNarrative(extractJson('{"paragraphs":[{"text":"one","facts":["F1"]}],"question":"q"}'), "m")).toBeNull(); // too few
    expect(validateNarrative(extractJson('{"paragraphs":[{"text":"a","facts":[]},{"text":"b"}],"question":""}'), "m")).toBeNull(); // no question
    const ok = validateNarrative(extractJson('{"paragraphs":[{"text":"a","facts":["f1"]},{"text":"b","facts":[]}],"question":"q?"}'), "m");
    expect(ok?.paragraphs[0].facts).toEqual(["F1"]); // ids normalised to upper case
  });
});
