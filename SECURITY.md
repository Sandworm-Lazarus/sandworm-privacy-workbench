# Security policy

Privacy Workbench handles user-supplied text in the browser. Read the [threat model](docs/THREAT_MODEL.md) before relying on its redaction rules.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option under the repository's Security tab when private vulnerability reporting is available. Include a minimal reproduction using fabricated values, the affected version or commit, browser version, expected behavior, and observed behavior.

If private reporting is unavailable, do not publish sensitive input or an unredacted log in an issue. A public report may use a minimal synthetic example that does not expose credentials, personal data, private files, or a live target. For a report that cannot be described safely in public, first request a private reporting channel without posting exploit-sensitive details.

Do not submit real secrets as proof. An example such as `demo@example.invalid` or `SYNTHETIC-EXAMPLE-ONLY` is enough to demonstrate most redaction failures.

## Supported scope

The current 0.1.x line is the initial supported release line. Reports about incorrect masking, unsafe rendering, input validation, stale-result export, unexpected transmission or persistence, and limit bypasses are relevant. Unsupported recognizers documented in the threat model are limitations rather than claims of protection.

Security fixes should include a regression test and a description of the affected behavior. This policy makes no promised response time or guarantee of complete anonymization.
