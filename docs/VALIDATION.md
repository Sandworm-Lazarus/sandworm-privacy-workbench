# Validation record

Date: **2026-11-11** · Version: **0.1.0**

This record distinguishes automated local checks from browser observations and hosted CI. All examples used fabricated data.

## Automated local checks

Runtime: **Node.js 24.22.1**.

| Check | Result | Scope |
| --- | --- | --- |
| `npm test` | PASS — 59 tests | 37 engine tests and 22 controller tests, including 2 integration tests |
| Generated parser cases | PASS within the engine suite | 300 generated cases; not counted as 300 additional tests |
| Mutation probes | PASS within the engine suite | 816 mutation probes; not counted as 816 additional tests |
| `npm run verify` | PASS | Static application/repository verification, after correcting the verifier's matching expression |
| Golden example | PASS | Engine output matches the expected fixture bytes, including its final newline convention |

The automated suite checks redaction, strict parsing, Unicode, duplicate keys, resource limits, JSON number preservation, input/policy invalidation, review gating, asynchronous file import, and controller behavior. These results apply to the local runtime above; they do not establish execution on every supported Node or browser version.

## Browser observations

The application was exercised in **Chrome over local HTTP** from the development checkout.

| Interaction | Observed result |
| --- | --- |
| Built-in synthetic JSON example | 2 email replacements and 2 field replacements |
| Large JSON identifier | `900719925474099312345` retained in the output without rounding |
| Review gate | Copy/download remain gated until the user confirms review |
| Custom policy change | Previous result and review state are invalidated |
| Copy action | Browser reported the application's successful-copy status |
| File input | A local file was imported into the app |
| Downloaded JSON | Checked the actual 234-byte download: large identifier retained, synthetic credentials/emails removed, 2 email markers and 2 field markers present |
| Duplicate-key error | Rejected in the browser without echoing the malformed input payload |

These are observations of specific interaction paths, not a complete browser compatibility matrix. The successful-copy status is not an independent clipboard-history inspection. [The preview image](preview.png) uses synthetic data from the browser check.

## Verification limits

- The cloud browser blocked `file://` navigation under its environment policy. Direct-file offline launch is designed into the buildless application but was **not browser-verified in this environment**.
- Local HTTP browser checks are not proof that a page was loaded with networking disabled. The app has no content-upload integration, and its source/data flow is described in the [threat model](THREAT_MODEL.md).
- A GitHub workflow is included, but this local record does not claim that hosted CI passed. Consult the actual repository run for its outcome.
- No mobile-browser verification or broad cross-browser compatibility claim is made in this record.

For local HTTP use, Python 3 can serve the app without dependency installation:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Then open `http://127.0.0.1:8080`. `npm run serve` invokes the same Python command when Node.js/npm is available.
