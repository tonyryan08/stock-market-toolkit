/**
 * Week 6: the narrative — Claude writes it, the fact sheet binds it.
 *
 * One call to the Claude Messages API per company per data-day (the route
 * caches by the sheet's fingerprint). The model is told, in binding terms,
 * to use only the numbered facts, to cite fact ids on every paragraph, and
 * never to recommend. Then the answer is CHECKED (explain.ts/checkGrounding):
 * a number from nowhere, an unknown fact id or advice-shaped language is
 * flagged on the page — the class's audit exercise — and if the answer is
 * malformed the plain template narrative is served instead.
 *
 * The fetch is injectable so the whole path is testable without a key.
 */

import type { FactSheet, Narrative } from "./explain";

export const DEFAULT_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const SYSTEM_PROMPT = `You write for adult beginners on a community course called "Intro to the Stock Market". You are given a numbered FACT SHEET about one company: its accounts, the results of two Benjamin Graham screens (the defensive investor's seven tests, the enterprising investor's six), the kinds of fail the course recognises, and where each failed test's bar sits in numbers. Write a short explanation of what the screens say about this company and why.

Rules, all binding:
1. Use only the facts on the sheet. Add no number, date, event, product, person, place or news that is not on it. If the sheet does not say why something happened, say that it does not say.
2. Every paragraph lists the fact ids it rests on. Every number you write must appear in a fact you cite for that paragraph.
3. Never recommend. No buy, sell, hold, avoid, target, forecast, "undervalued", "overvalued", "bargain", "opportunity", and no prediction of price or earnings. The reader decides; you explain.
4. Plain words, short sentences, British and Irish spelling. Gloss any term of art the first time. 140 to 220 words in total, in 3 or 4 paragraphs.
5. Order: (1) what the two screens say, with the scores; (2) what each failed test means, in the sheet's own terms; (3) what would have to change for the failed tests to pass, using the bars, saying plainly that a bar is where the test sits and not what the share is worth; (4) one sentence on what the sheet cannot tell you: why the numbers are what they are, or what happens next.
6. Then one open question for the reader, at most 20 words, that cannot be answered from the sheet alone. It goes in the "question" field only: the paragraphs contain no question, and do not repeat or introduce it.
7. The course's line is "education, not advice". Nothing you write may read as a tip.

Output JSON only, nothing before or after it, exactly this shape:
{"paragraphs":[{"text":"…","facts":["F1","F13"]}],"question":"…"}`;

export function sheetAsText(s: FactSheet): string {
  const lines = s.facts.map((f) => `${f.id}: ${f.text}`);
  const kinds = s.kinds.length
    ? `\nKinds of fail identified by the course (each with the facts behind it):\n` +
      s.kinds.map((k) => `- ${k.label} [${k.facts.join(", ")}]: ${k.meaning} (Graham: ${k.graham})`).join("\n")
    : "\nNo fail kinds identified.";
  return `FACT SHEET for ${s.name ?? s.symbol} (${s.symbol}), data as of ${s.asOf.priceDate ?? "the latest cached close"}:\n${lines.join("\n")}${kinds}\n\nWrite the explanation now. JSON only.`;
}

/** The JSON shape the API is asked to guarantee (structured outputs). */
export const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
        },
        required: ["text", "facts"],
        additionalProperties: false,
      },
    },
    question: { type: "string" },
  },
  required: ["paragraphs", "question"],
  additionalProperties: false,
} as const;

export type ClaudeResult =
  | { ok: true; narrative: Narrative; usage: { input: number; output: number }; ms: number }
  | { ok: false; reason: string; status?: number; ms: number };

export type ClaudeOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
  timeoutMs?: number;
  /** Test hook only: point the call at a stub server (EXPLAIN_API_URL in .dev.vars). */
  apiUrl?: string;
};

/** Pull the first balanced JSON object out of a model reply (tolerates code fences and prose). */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function validateNarrative(raw: unknown, model: string): Narrative | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { paragraphs?: unknown; question?: unknown };
  if (!Array.isArray(o.paragraphs) || o.paragraphs.length < 2 || o.paragraphs.length > 6) return null;
  const paragraphs = [];
  for (const p of o.paragraphs as unknown[]) {
    if (!p || typeof p !== "object") return null;
    const q = p as { text?: unknown; facts?: unknown };
    if (typeof q.text !== "string" || !q.text.trim() || q.text.length > 900) return null;
    const facts = Array.isArray(q.facts) ? q.facts.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()) : [];
    paragraphs.push({ text: q.text.trim(), facts });
  }
  const question = typeof o.question === "string" ? o.question.trim().slice(0, 240) : "";
  if (!question) return null;
  return { paragraphs, question, source: "claude", model };
}

export async function claudeNarrative(sheet: FactSheet, opts: ClaudeOptions): Promise<ClaudeResult> {
  const t0 = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await f(opts.apiUrl ?? API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        // Current models think before answering by default and the thinking
        // tokens count toward max_tokens: 800 was spent on reasoning and the
        // JSON was cut off (stop_reason max_tokens, seen live 19 Oct 2026).
        // Writing four paragraphs from a numbered sheet needs no reasoning
        // budget, so thinking is off (accepted on Haiku 5.5 at default effort)
        // and the ceiling leaves room for a verbose answer.
        max_tokens: opts.maxTokens ?? 2000,
        thinking: { type: "disabled" },
        // No `temperature`: the API rejects it for current models (400, seen
        // live the same day). The system prompt does the constraining.
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: sheetAsText(sheet) }],
        // Structured output: the API guarantees the shape, so a stray sentence
        // or a code fence can no longer make the answer unparseable.
        output_config: { format: { type: "json_schema", schema: NARRATIVE_SCHEMA } },
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, reason: `network: ${String((err as Error).message ?? err)}`.slice(0, 200), ms: Date.now() - t0 };
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { type?: string; message?: string } };
      detail = `${j.error?.type ?? ""} ${j.error?.message ?? ""}`.trim();
    } catch { /* body unreadable */ }
    // Never echo a key; the API never returns one, but the rule stands for every provider notice.
    return { ok: false, status: res.status, reason: `HTTP ${res.status} ${detail}`.trim().slice(0, 200), ms: Date.now() - t0 };
  }

  let body: { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, reason: "unparseable response body", ms: Date.now() - t0 };
  }
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  const narrative = validateNarrative(extractJson(text), model);
  const usage = { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 };
  if (!narrative) return { ok: false, reason: `malformed narrative (stop_reason ${body.stop_reason ?? "?"})`, ms: Date.now() - t0 };
  return { ok: true, narrative, usage, ms: Date.now() - t0 };
}
