# AGENTS.md

## Engineering Guidelines
- No external dependencies.
- Use the current coding standards.
- Keep code simple, readable, and easy to maintain.
- Prefer the standard library and existing project code over adding new tooling.
- Make small, focused changes and avoid unnecessary abstractions.
- Read `implementation/NOTES.md` before planning any improvement.
- Keep `implementation/NOTES.md` updated after each code improvement.
- Use the `AHRM` as a reference before implementing any Atari 800 XL PAL machine related hardware emulation.

## Cross-port documentation rule

When a change or investigation establishes a confirmed finding, correction,
tool/workflow lesson, or other fact that can help more than this repository,
update the authoritative shared documentation in the same session and
regenerate any derived copies. Always do this; do not leave transferable
findings only in chat, code, or generated output. Keep project-specific details
in the local canonical document and upstream the reusable rule with its
evidence, scope, and status.
