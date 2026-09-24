# Week 2 — Data-Provider Verification Record

**Purpose:** Decision log #5 (the universe) and week 3's D1 schema freeze are gated on these findings. Complete this before any week-3 build. Record findings inline and **commit the completed record** — evidence, not folklore.

**Prerequisites:** keys in `.dev.vars`, `npm run dev` running, browser at `http://localhost:8787`. Checks VC-06 to VC-08 call provider URLs directly — paste them into the browser with your key substituted. Budget note: this whole record costs ~12–15 Alpha Vantage calls; run it on a day the class isn't using the ration.

**Published terms at time of writing (Aug 2026) — confirm against reality below:** Alpha Vantage free ≈ 25 requests/day, 5/minute, limits arriving as HTTP 200 + "Note"/"Information" text. FMP free ≈ 250 requests/day via `/stable/...` endpoints, ~5 years of annual statements for US companies, 500MB/30-day bandwidth.

---

## The checks

| ID | Check | How | Expected | **Finding (date, result)** |
|---|---|---|---|---|
| VC-01 | Alpha Vantage key valid | `/api/quote/AAPL` | `price` block populated with plausible numbers | |
| VC-02 | AV limit behaviour | After heavy use (or deliberately on a spent day), repeat VC-01 | `warnings` contains an "Alpha Vantage notice:" with their rate-limit prose — record the exact wording | |
| VC-03 | FMP key valid | Same `/api/quote/AAPL` call | `company` block populated (name, sector, market cap) | |
| VC-04 | Unknown ticker fails politely | `/api/quote/ZZZZZZ9` | Graceful 502 JSON with warnings; no crash, no stack trace | |
| VC-05 | UK coverage | `/api/quote/TSCO.LON` | AV price present. Note whether FMP wants a different spelling (try `TSCO.L` via VC-06's FMP search) | |
| VC-06 | Irish symbol discovery | AV: `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=ryanair&apikey=KEY` · FMP: `https://financialmodelingprep.com/stable/search-symbol?query=ryanair&apikey=KEY` — repeat for Kerry Group, Bank of Ireland | Working symbol per provider per company, or "not covered". Try both the Dublin listing and any US ADR that appears | |
| VC-07 | **FMP statements depth (screener-critical)** | `https://financialmodelingprep.com/stable/income-statement?symbol=AAPL&apikey=KEY` | Count the annual periods returned on the free plan. Published claim ≈ 5. Graham's earnings-stability criterion assumes 10 → if 5, week 5's criterion adapts (5-year stability, openly noted) — a decision-log entry either way | |
| VC-08 | Non-US fundamentals | Same income-statement call for the best Irish/UK symbol from VC-06 | Data, empty, or a paywall message — verbatim | |

---

## Findings → decisions (fill after the table)

**Universe recommendation (feeds decision log #5):**
Working assumption was US large-cap subset + recognisable Irish/UK names. Based on VC-05/06/08, the recommended universe is:
_…_

**Week-3 schema notes (feeds the D1 design):**
Years of fundamentals actually available: _…_ · Symbol dialect differences to store (AV symbol vs FMP symbol per company): _…_ · Anything else the schema must accommodate: _…_

**Week-5 criterion adaptation (if VC-07 < 10 years):**
_…_

---

*When complete: commit as "Week 2: provider verification record — findings", update decision log #5 in `docs/syllabus.md`, and tick the corresponding BUILD-LOG box. This record is the toolkit's raw-materials certificate.*
