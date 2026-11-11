# Threat model

Privacy Workbench reduces accidental disclosure when preparing a text or JSON copy for sharing. Its rules are deliberately bounded and inspectable. A successful run means the selected transformations completed; it does not certify that the result contains no sensitive information.

## Data flow and trust boundary

1. The user supplies a file or text through the browser interface.
2. The app validates its input limits and, in JSON mode, the complete JSON structure.
3. The engine replaces recognized email values and selected field values.
4. The user inspects the output and confirms review.
5. Copy or download exports the processed output on an explicit user action.

The application does not send input, output, field values, or filenames to a server. It has no telemetry, API integration, persistent browser storage, or service worker. Temporary input and output exist in the browser's memory and interface while the app is in use.

The downloaded app is designed to perform this workflow offline. The initial browser checks used local HTTP; direct `file://` navigation was blocked by the test environment and remains unverified here. A hosted page still uses the network to load its assets and may pass through hosting authentication. Infrastructure requests and access logs are outside the redaction engine. Browser extensions, developer tools, the operating system, and browser history/clipboard behavior are also outside its control.

## Risks addressed

| Risk | Control | Remaining limitation |
| --- | --- | --- |
| Accidental sharing of supported email addresses | Bounded ASCII email recognition in text and JSON string values | Internationalized or unusual formats can remain |
| Sensitive structured values | Exact selected field names replace the whole value or subtree | Unselected fields and JSON keys remain |
| Exporting a result produced by old rules or old input | Input/rule changes invalidate the result and review state | The user still decides whether the current result is appropriate to share |
| Malformed or ambiguous JSON | Strict syntax and duplicate decoded-key rejection | Valid JSON may still contain sensitive unselected data |
| Corruption of large identifiers | Number tokens are retained rather than parsed as JavaScript numbers | Consumers of the exported JSON may subsequently round numbers |
| Large or deeply nested input | Input/output byte budgets, depth and node limits | Limits reduce work; they are not browser process isolation |
| Error messages disclose raw input | Stable, payload-free errors | Input is still visible in the source pane when displayed |

## Matching policy

- Emails use a conventional ASCII pattern, not a complete RFC mailbox parser or a named-entity recognition model.
- JSON fields match the entire decoded key. ASCII letters are compared without case; all other characters match exactly. No Unicode normalization is applied.
- Sensitive JSON field values are replaced regardless of their original type. A selected container is replaced as one value.
- JSON keys are preserved, including keys that themselves contain email addresses or other identifying text.
- Free-form names, phone numbers, postal addresses, payment details, arbitrary tokens, and contextual identities are outside the default recognizers.
- The custom-field interface separates names at commas and trims surrounding whitespace. Keys containing commas or leading/trailing whitespace cannot be selected through that interface; the engine API accepts a list of exact names.

These omissions are part of the product contract. Configure appropriate fields and inspect the complete output before sharing it. Masking is not evidence of anonymization, legal compliance, or protection against re-identification.

## Operational limits

Input and output are each bounded to 1 MiB measured as UTF-8. JSON has a maximum root-relative depth of 32 and a maximum of 50,000 value nodes. Entire sensitive subtrees are validated before they are replaced. Duplicate keys are checked after JSON escape decoding, so differently spelled escapes cannot bypass the duplicate-key rule.

File import removes an initial UTF-8 byte-order mark, and the browser text area normalizes line endings. Plain-text exports are processed copies, not byte-preserving archival copies. JSON number tokens are preserved; whitespace and string-escape representation may change during formatting.

Clearing resets the app's visible data and export state. It does not securely overwrite browser memory, remove clipboard history, erase a downloaded file, or undo a prior share. Use fabricated content in bug reports and recordings.

## Assumptions and non-goals

The user runs a trusted copy of the app in a trusted browser on a trusted device. An altered application, malicious extension, compromised dependency supply path, or hostile operating system can observe data before redaction. There are no runtime third-party dependencies, but source authenticity still matters.

This project does not provide encryption, a secrets vault, a sandbox for executing files, an antivirus scanner, an authorization system, or automatic recognition of every sensitive value. It never needs to execute the file being processed.

## Verification scope

Automated tests exercise fabricated inputs and explicit rules. Static verification and browser checks should be reported separately from engine unit tests. Network observations establish behavior only for the tested browser paths; source review and the documented data flow provide additional evidence. Hosted CI success must be confirmed from the actual run, not inferred from the presence of a workflow. See [VALIDATION.md](VALIDATION.md) for the recorded scope of this release's checks.

## Optional Presidio worker and report import

The separate Python worker can read originals in the local/cloud environment selected by its operator. It uses pinned Presidio packages, a blank tokenizer and explicit Thai/literal recognizers; no model service or download is used at runtime. Configurations accept bounded literal terms rather than executable regex/code. Linux input reads reject symlinks, FIFO and non-regular files. Report output is exclusive and owner-only on POSIX.

The browser report importer clears its current original text and accepts only schema 2 redacted output and metadata. Extra raw-source fields, duplicate keys and invalid offsets are rejected without rendering them. The original input hash is discarded after validation. Finding metadata is text-only; downloaded output remains behind the review gate. Reports are untrusted user-supplied claims, not attestations, and undetected private information may remain in their text. Neither clearing nor output permissions provides secure memory/storage erasure.
