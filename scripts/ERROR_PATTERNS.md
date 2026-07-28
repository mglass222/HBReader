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
