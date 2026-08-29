# Repo Trading Quiz

A self-study quiz on repo trading, collateral management and the Swiss repo market
infrastructure — built as a static site with **no backend**. Questions and answers live in
a single JSON file, everything else is vanilla HTML, CSS and JavaScript, and progress is
kept in the browser's `localStorage`.

**230 questions · 9 topics · 38 subtopics · 3 difficulty levels**

## Topics

| Topic | Questions | Covers |
|---|---:|---|
| Repo Fundamentals | 29 | What a repo is, roles, legal and economic nature, instruments, accounting |
| Pricing & Mechanics | 28 | Haircuts, margin, repo rates, clean/dirty price, day counts, date conventions |
| Collateral Management | 26 | Baskets, eligibility, triparty, allocation, substitution, re-use, optimisation |
| SIX Repo & CO:RE | 46 | Trading model, contract types, baskets, currencies, cut-offs, fees, OTC spot market |
| Swiss Market Infrastructure | 24 | Swiss Value Chain, SIX SIS, SIC, custody and post-trade, SARON |
| Regulation & Reporting | 21 | SFTR, Basel III, CSDR, GMRA, FinfraG |
| Central Banks & Monetary Policy | 19 | SNB operations, LSFF, standing facilities, transmission |
| Products & Strategies | 19 | GC vs specials, SFT product types, trading strategies |
| Risk & Lifecycle | 18 | Counterparty risk, default management, CCPs, lifecycle, operations |

Difficulty is graded **Foundational (1) · Practitioner (2) · Advanced (3)**.

## Game modes

| Mode | What it does |
|---|---|
| **Quick Five** | Five random questions across all topics and difficulties |
| **Topic Round** | Drill one topic, optionally narrowed to a subtopic, with a difficulty filter |
| **Weak Spots** | Questions you last got wrong, topped up with ones you have never seen |
| **Daily Challenge** | Ten questions, deterministic for the calendar date |
| **Sudden Death** | Keep going until the first wrong answer; best streak is remembered |
| **Time Attack** | Three minutes, as many correct answers as possible |

The home screen is just the mode list — pick one and go. Progress and sources sit behind
quiet links at the bottom. After a round you can immediately replay the questions you missed.

Every answer shows an explanation and cites its sources. Keyboard: <kbd>1</kbd>–<kbd>4</kbd>
to answer, <kbd>Enter</kbd> to continue, <kbd>Esc</kbd> to end a round.

## Running it

The app fetches `data/questions.json`, which browsers block for `file://` URLs, so serve
the folder over HTTP:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` validates the catalogue and publishes the repository root
on every push to `main`. Enable it once under **Settings → Pages → Build and deployment →
Source: GitHub Actions**. No build step is involved — what is in the repo is what is served.

## Adding or editing questions

All content lives in [`data/questions.json`](data/questions.json):

```jsonc
{
  "id": "q001",                    // unique, assigned in file order
  "topic": "sixplatform",          // must match a topic id in meta
  "subtopic": "Contract Types",    // must be listed on that topic
  "difficulty": 2,                 // 1 foundational · 2 practitioner · 3 advanced
  "question": "…",
  "options": ["…", "…", "…", "…"], // exactly four; order is shuffled at runtime
  "answer": 0,                     // index into options, before shuffling
  "explanation": "…",              // shown after answering
  "sources": ["six-repo-spec"]     // one or more keys from the "sources" map
}
```

Validate after editing:

```bash
python3 tools/validate.py
```

It checks structure, option counts, answer indices, unknown topics, undeclared subtopics,
unknown source keys, duplicate question text and the declared question count. CI runs the
same script before deploying.

## Sources

Each question carries one or more source keys, resolved through the `sources` map in the
JSON and listed in the app's **Sources** view:

| Key | Source |
|---|---|
| `six-repo-spec` | SIX Repo AG – Product Specification for the CH Repo Market |
| `six-otc-spec` | SIX SIS AG – Product Specification for the OTC Spot Market |
| `six-pricelist` | SIX Repo AG – Price List, valid from 1 January 2024 |
| `snb` | Swiss National Bank – monetary policy instruments |
| `icma-gmra` | ICMA – GMRA and European repo market practice |
| `basel` | Basel Committee / BIS standards (LCR, NSFR, leverage ratio) |
| `sftr` | SFTR / ESMA reporting framework |
| `csdr` | CSDR settlement discipline regime |
| `finfrag` | FinfraG / FMIA and the FINMA framework |
| `pretrained` | General market knowledge from model pretraining — established convention rather than a cited document |

Questions tagged `pretrained` reflect standard market practice rather than a specific
document. They are flagged as such deliberately: verify against a primary source before
relying on them professionally.

## Disclaimer

Study material, provided without warranty. Not legal, tax or investment advice. Product
specifications, fee schedules and regulation change — the SIX documents underpinning many
questions are dated editions, so always check the current primary source (SIX, SNB, ICMA,
FINMA) before relying on anything here at work.
