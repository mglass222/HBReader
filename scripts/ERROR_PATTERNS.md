# HBReader Question Data Error Patterns

This file tracks data issues that should be caught by `scripts/check_questions.py`
or related cleanup scripts.

## Covered By Validation

- Duplicate question IDs across difficulty buckets.
- Duplicate normalized question text.
- Missing question or answer fields.
- Missing metadata for a question.
- Metadata entries without a matching question.
- Unknown region, time period, answer type, or subject theme.
- Blank `answer_type` values, reported as warnings by default and errors with `--strict`.
- Disallowed HTML tags or attributes in question/answer text.
- PDF page-header residue at the end of an answer (`Bee Final Round`, `Round 3`).
- Bracket markup from source packets (`[a]`, `[a/]`, `[i]…[i]`).

## Known Current Warnings

- `src/assets/nat_hist_bee_question_metadata.json` has five blank `answer_type` values.
  These should be classified before running `scripts/check_questions.py --strict`.

## Allowed Formatting

Only these HTML tags are expected in question and answer text:

- `<strong>`
- `<em>`
- `<u>`
- `<br>`

All attributes are considered invalid because the app only needs simple preserved
formatting from source PDFs.

## Intentional Packet Formatting (Do Not Strip)

Guided by official source PDFs (A-Set History Bee Semifinals; IHB Bowl Round 1):

| Feature | Meaning |
|---|---|
| `(+)` and `(*)` | Power cutoffs (early → mid → late scoring) |
| Bold from tossup start through power | Power region emphasis |
| Plain text after second power mark | End of power |
| Answer-line bold on required stem only | e.g. **Saud**i, **Mali**an, Kingdom of **Norway** |
| Italics for titles / foreign terms | e.g. *iklwa*, *The Moon is Down* |
| Giveaway wording as in packet | “For the point,” / “For the points,” / “For ten points,” |
| `[[pronunciation]]` guides | Reader aids |

## Extraction / OCR Artifacts (Fix With `scripts/fix_ocr_artifacts.py`)

Root cause: PDF text is extracted per span; the extractor joined spans with spaces,
which split bold stems from their suffixes and fragmented continuous power bold.

| Pattern | Example (broken → fixed) |
|---|---|
| Space after bold stem | `Saud i` → **Saud**i; `Maurya n Empire` → **Maurya**n Empire |
| Plural / suffix split | `doughboy s` → **doughboy**s; `Meng zi` → **Meng**zi |
| Span-joined “of” | `Republic o f Korea` → Republic of Korea |
| Fragmented adjacent tags | many `</strong> <strong>` → one continuous `<strong>…</strong>` |
| Leading space in tags | `<em> Title` → `<em>Title` |
| Space before punctuation | `Hawaii )` → `Hawaii)`; `</em> .` → `</em>.` |
| Ligatures | `ﬁnal` / `oﬃcials` → final / officials |
| Broken diaeresis / acute | `G¨unter` → Günter; `¨ Osterreich` → Österreich; `´ Evian` → Évian |
| Glued words | `offthe` → `off the` |
| Packet status junk | trailing `DRAFT` removed |
| Line-break hyphen | `ninety- year-old` → `ninety-year-old` |

### Fix command

```bash
python scripts/fix_ocr_artifacts.py           # apply to both Bee datasets
python scripts/fix_ocr_artifacts.py --dry-run # report only
```

Power-mark counts are verified before write; the script aborts if `(+)` / `(*)`
counts would change.

## Header Residue In Answers (Fix With `scripts/strip_header_residue.py`)

Found 2026-09-23. Page-header text was extracted onto the end of the answer line.
The answer checker treated the unbolded answer text as acceptable, so a guess of
`bee` or `round` was graded correct on these questions.

| Pattern | Count | Example (broken → fixed) |
|---|---|---|
| National finals header | 244 | `<strong>Indonesia</strong> Bee Final Round` → `<strong>Indonesia</strong>` |
| Finals header with level | (incl.) | `<strong>Fronde</strong> Bee Final Round - Varsity` → `<strong>Fronde</strong>` |
| US packet round number | 123 | `<strong>Lincoln Memorial</strong> Round 1` → `<strong>Lincoln Memorial</strong>` |

```bash
python3 scripts/strip_header_residue.py --dry-run  # report only
python3 scripts/strip_header_residue.py            # fix (backs up to backup/ first)
```

## Bracket Markup From Source Packets (Fixed By Hand)

Found 2026-09-23. Google Docs comment anchors and BBCode-style italics survived
extraction. In US F27 the `[a]` anchors also left the `<strong>` tag spanning into
the parenthesised alternate, so the PATRIOT Act answer could not be parsed.

| Question | Broken | Fixed |
|---|---|---|
| US F27 | `<strong>PATRIOT[a] Act (or United … by [a]Providing … Terrorism</strong>)` | `<strong>PATRIOT Act</strong> (or <strong>United … Terrorism</strong>)` |
| Nat (Spanish-American War) | `Guerra [a]hispano-americana` | `Guerra hispano-americana` |
| Nat (Nazi Party) | `<strong>Nazi[a/] Germany; accept [a]Third Reich</strong>` | `<strong>Nazi</strong> Germany; accept <strong>Third Reich</strong>` |
| Nat F1682 (question) | `[i]The Green Book[i]` | `<em>The Green Book</em>` |
| US P450 | `accept [i]Santa Clara County v. …` (unclosed) | `accept Santa Clara County v. …` |

