# Development notes

## 0.1.1 — 2026-11-11

The Workbench adopts the dark cyber theme of [Sandworm Lazarus](https://sandworm-lazarus.pages.dev/). The page uses the reference's dark navy, coral, cyan, and green palette with angular headings, thin panel borders, and clipped-corner primary controls. The layout is adapted to the local redaction workflow, with separate source and result panels, visible rule controls, and review before export.

### Authored presentation changes

- Reworked the page layout and responsive styles for the Sandworm visual identity.
- Created `dist/network.svg` as original decorative network artwork for this app.
- Kept the redaction engine and browser workflow intact: email and selected-field masking, source visibility, input-safe errors, resource limits, result invalidation, and review-gated export.
- Kept all runtime assets local. No external font service, analytics, or additional runtime dependency was introduced.

### Fonts and attribution

The app bundles seven unmodified WOFF2 files: Chakra Petch 700 in Thai and Latin subsets; Anuphan 400 and 600 in Thai and Latin subsets; and JetBrains Mono 400 in a Latin subset. These match the reference site's public-facing font assets. Each downloaded file's WOFF2 signature and Git blob hash were checked against the source.

The fonts total 84,020 bytes and use `font-display: swap`. Full SIL Open Font License 1.1 notices are kept in both `docs/fonts/` and `dist/fonts/`, so the standalone static distribution carries its licenses. [Third-party notices](../THIRD_PARTY_NOTICES.md) lists the font authors and official license sources. Application code and original artwork remain under the repository's MIT license.

This release changes presentation without changing the documented matching rules or processing limits. Theme and browser verification evidence belongs in [VALIDATION.md](VALIDATION.md); the initial 0.1.0 results below remain a historical record.

## 0.1.0 — 2026-11-11

Privacy Workbench turns an existing authored redaction utility into a browser application for preparing shareable logs and JSON. The source is maintained as a standalone project under Sandworm-Lazarus.

### Authored changes

- A browser-native redaction engine with explicit input, output, depth, and node limits.
- Strict JSON parsing with duplicate decoded-key rejection and preservation of number tokens.
- A local file/paste workflow with source and result inspection.
- Explicit review before export, with result invalidation when the source or policy changes.
- Fabricated test inputs, reproducible development checks, and documented limitations.

The conceptual predecessor is [`scripts/privacy_guard.py`](https://github.com/Sandworm-Lazarus/sandworm-arsenal/blob/main/scripts/privacy_guard.py) in Sandworm Arsenal. That code and the new browser code are authored work; the cataloged third-party skills and tools in the parent repository remain their respective authors' work.

### Deliberate behavior differences

| Area | Earlier Python utility | Browser Workbench |
| --- | --- | --- |
| Field matching | Unicode `casefold()` | ASCII letter folding; other characters exact |
| JSON numbers | Python numeric representations | Original valid JSON number tokens retained |
| Delivery | Python API and CLI | Buildless local browser interface |
| Export | Program output | User review and explicit copy/download |

These are separate implementations. Tests of the browser tool do not establish identical behavior with Python or validate any upstream third-party tool.

### Structure

| Path | Purpose |
| --- | --- |
| `dist/` | Complete browser application; keep its files together |
| `dist/privacy-guard.js` | Reusable engine with browser and Node exports |
| `tests/` | Automated tests using synthetic data |
| `scripts/` | Repository verification helpers |
| `docs/THREAT_MODEL.md` | Data flow, protections, assumptions, and limits |
| `docs/VALIDATION.md` | Recorded local test results and browser verification limits |

### Local verification

Use Node.js 20 or newer:

```sh
npm test
npm run verify
```

No dependency installation or build is required. Inspect `package.json` for the current check entry points. The app is designed to open directly from `dist/index.html` without Node; that launch method remains unverified in this cloud environment. The browser-tested method serves `dist/` over local HTTP with Python 3 (`npm run serve` is an optional wrapper).

Useful manual browser checks include text and JSON input, file selection and drop, adding a field, invalid JSON, changing a rule after processing, source visibility, review gating, copy/download, and clearing state. Inspect the result using fabricated data; never put real secrets into test fixtures or screenshots.

### Evidence discipline

Record which checks actually ran and their environment. Unit-test results, static checks, browser interactions, network observations, and hosted CI are different evidence. A successful local check must not be described as a successful hosted workflow. Example email addresses use reserved `.invalid` domains and are not real contacts.

The initial run passed 59 tests on Node.js 24.22.1 and the static verifier. [VALIDATION.md](VALIDATION.md) records the browser observations and the environment's restriction on direct-file navigation. The UI custom-field entry trims comma-separated names, and browser file/text handling normalizes a BOM and line endings; these boundaries are documented explicitly.

### Contribution boundaries

Keep processing local and avoid introducing analytics, remote fonts/scripts, persistence of submitted data, or automatic uploads. Changes to recognizers or limits need boundary and regression tests. Any future third-party code must retain its license and attribution; do not describe renamed external code as wholly original.
