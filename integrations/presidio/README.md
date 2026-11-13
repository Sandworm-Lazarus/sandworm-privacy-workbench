# Presidio Thai worker / ตัวปิดบังข้อมูลไทย

A local Python worker using **presidio-analyzer==2.2.366** and **presidio-anonymizer==2.2.366**, maintained by [Data Privacy Stack / Presidio](https://github.com/data-privacy-stack/presidio). Sandworm adds original Thai recognizers, bounded policy configuration, safe report export and an import/review workflow in Privacy Workbench. The browser remains independent: no Python server, network upload or API key is needed.

## Run and review

```sh
cd integrations/presidio
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python redact.py fixtures/input.txt --output report.local.json
.venv/bin/python redact.py fixtures/input.txt --policy fixtures/policy.example.json --output custom-report.local.json
.venv/bin/python validate.py
```

Open the repository's `dist/index.html` or serve it locally, then select **นำเข้ารายงาน Presidio**. Choose the new `.json` report. Import clears any original source and prior result from the screen, shows only redacted text and finding metadata, and requires review before copy/download. The importer accepts only the strict Sandworm schema 2, rejects extra raw fields/duplicate keys/invalid offsets, and limits files to 256 KiB. It does not authenticate the report's producer. Regenerate older schema 1 reports with this worker.

Python 3.11–3.14 is required. The recorded lock is from Python 3.12 Linux; on another supported platform use `requirements.txt` for the direct version pins and generate a reviewed platform-specific lock. Windows uses `.venv\Scripts\python.exe`. CLI file hardening is verified on Linux.

## Choose a policy

Copy `fixtures/policy.example.json` to a private `policy.local.json`:

```json
{
  "entities": ["THAI_ID", "THAI_MOBILE", "EMAIL_ADDRESS"],
  "minimum_score": 0.5,
  "custom_terms": ["บุคคลสมมติ ก", "INTERNAL-FIXTURE-ONLY"]
}
```

| Field | Behavior and limit |
| --- | --- |
| `entities` | Choose any subset of the three built-in entities. At least one entity or custom term is required. |
| `minimum_score` | 0.5 through 1.0. Mobile/email score 0.8, validated ID and literal score 1.0. Raising the threshold can leave more PII visible. Scores are recognizer heuristics, not calibrated probabilities. |
| `custom_terms` | Up to 64 unique exact, case-sensitive Unicode substrings; at most 80 characters each and 4,096 UTF-8 bytes combined. No blank/control-character terms. |

All fields are optional; absent fields use all built-ins, score 0.5, and no custom terms. Unknown keys and duplicate decoded JSON keys are rejected. Terms use literal substring search: `.*` matches the two literal characters, not a regular expression. Unicode normalization and word-boundary inference are not applied. These constraints avoid executing user regex or Python. Use `*.local.txt` for private inputs and `*.local.json` for policies/reports; these paths are ignored by Git. Keep real policy terms private; neither the terms nor any matched source text are included in the report.

## Detection scope

- ASCII, Thai digits, or mixed-script Thai mobile patterns: domestic 3-3-4 groups or international `+66` followed by 2-3-4 groups. Each group boundary permits one ordinary space or hyphen; contiguous forms remain supported.
- Thai ID patterns with ASCII/Thai/mixed digits, prefix 1–8 and a correct arithmetic checksum: contiguous or exact 1-4-5-2-1 grouping with one consistent ordinary space/hyphen separator.
- Bounded conservative ASCII email pattern.
- Optional exact literal terms, including Thai text.

A checksum-valid pattern is **not identity verification**. These are Sandworm recognizers, not comprehensive Thai NER. General names/addresses, arbitrary grouping, tabs/newlines between digits, fullwidth/other-script digits, images and OCR are outside this numeric recognizer. Thai digit translation changes exactly one code point to one ASCII digit; normalization does not compose/decompose text, delete separators or alter the original offset map. Numeric/ASCII identifier and version continuations are conservatively rejected. A trailing sentence period is preserved when followed by whitespace or end of input; `.2` and `.beta` continuations remain blocked. These boundaries may miss numbers touching ASCII prose. Invalid-checksum numbers remain in output. Review every result before sharing.

The worker passes only these explicit recognizers and a blank multilingual tokenizer to Presidio's actual `AnalyzerEngine` and `AnonymizerEngine`. It does not load pretrained NER or download models at runtime. Matched text becomes `[REDACTED]`. Input is bounded at 64 KiB UTF-8 and 1,000 findings; files must be regular files and output is created exclusively, with owner-only permissions on POSIX. Errors contain stable codes and never source fragments, policy terms or file paths.

Reports contain redacted text, input SHA-256, input character count, finding type/score/offset, enabled types and custom-term count. They do **not** contain an original text copy, matched values or custom-term list. Offsets count Unicode code points in the original text (not UTF-16 units or redacted output). Input hashes and offsets can disclose information and do not encrypt data; the browser drops the hash after validation. Undetected PII may remain in `redactedText`. Clearing does not guarantee secure erasure from process/browser/OS memory.

ภาษาไทย: รัน Presidio จริงในเครื่องหรือคลาวด์ของเรา เลือกกฎ ปรับเกณฑ์คะแนน และเพิ่มคำไทยแบบตรงตัวได้ แล้วนำรายงานที่ปิดบังแล้วกลับมาตรวจในหน้า Workbench ไม่ส่งต้นฉบับเข้าเบราว์เซอร์ผ่านช่องนำเข้ารายงาน และยังต้องตรวจทานก่อนแชร์ทุกครั้ง

## Verification and upstream attribution

```sh
# From repository root
npm test
npm run verify
npm run validate:presidio-ui
integrations/presidio/.venv/bin/python integrations/presidio/validate.py
```

The suite runs actual installed Presidio engines. It covers Thai checksum rejection, Unicode offsets, selection/threshold/literal policies, safe failure, symlink/FIFO rejection, overwrite protection, browser report validation, DOM text sinks, review gating and stale import races. A fresh-process smoke blocks socket connection attempts before package imports; it records zero attempts. `reports/validation.json` records tests and SHA-256 of exact integration sources/fixtures. Browser tests use a DOM harness; the new UI has not been visually browser-verified in this cloud session.

Original Sandworm worker/UI code: repository MIT license. Presidio packages are MIT licensed and installed with their own notices; no upstream source or model weights are vendored. Official upstream references reviewed 2026-11-11:

- [Current repository, transition notice and MIT license](https://github.com/data-privacy-stack/presidio)
- [Adding recognizers](https://github.com/data-privacy-stack/presidio/blob/main/docs/analyzer/adding_recognizers.md) — `PatternRecognizer`, `EntityRecognizer`, registry extension

Presidio is now under Data Privacy Stack. Legacy Microsoft links may redirect or be unavailable; use the current project links above.

## Thai numeric coverage — 2026-11-13

This change applies to the separate Presidio worker. The buildless browser PrivacyGuard still masks emails and selected JSON fields. Its Presidio report importer accepts both the earlier and expanded schema-2 scope labels, with the same strict entity/offset validation.

The labeled fixture dataset is explicitly **SYNTHETIC_ONLY**: constructed strings without person identities, 44 cases including Thai/ASCII mixed digits, formatted IDs/mobiles, terminal sentence periods, emoji/combining-text offsets, invalid checksums, longer numbers and version/identifier negatives. A checksum or phone-shaped fixture does not verify whether a number is assigned. Do not contact synthetic numbers.

Run in your worker/CI environment:

```sh
python integrations/presidio/validate.py
python integrations/presidio/evaluate.py integrations/presidio/fixtures/thai-numeric-synthetic.json --output synthetic-evaluation.local.json
```

Evaluation reports per-entity true positives, false positives, false negatives, precision and recall using exact original-code-point spans. Zero denominators are reported as null. Reports contain aggregate counts and the dataset hash, never source text, matched values, case offsets or raw exception text. These are fixture coverage measurements, not a production Thai PII benchmark.

The push/pull-request workflow uses the existing pinned Presidio lock, executes worker/browser contract tests, and publishes aggregate evaluation/validation artifacts. Hosted checks for this change are pending execution. Historical committed validation files describe earlier source; this document does not claim a new passing run.
