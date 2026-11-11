# Browser QA scope

The v0.1.1 theme had desktop/mobile browser checks recorded in `VALIDATION.md`. Those observations predate the Presidio report interface and do not validate it.

For v0.2.0 the cloud browser runtime was unavailable. No preview browser, screenshot or visual QA is claimed for the new interface. Automated DOM-controller tests cover importing a real-engine synthetic report, clearing source, report findings, review-before-export, malformed/oversized rejection and stale reads after clear. Static checks verify local assets, script syntax, CSP and absence of network/storage APIs.

Manual follow-up: use a synthetic schema 2 report at desktop and narrow mobile widths, confirm the findings table scrolls, inspect Thai text and keyboard focus, confirm the output panel/review controls are reachable, import invalid data, and clear while an import is pending. No real PII belongs in screenshots.
