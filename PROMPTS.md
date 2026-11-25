# Lab prompts

## Part 3.1 — Restore core playability

Begin Part 3.1 of Lab 05 — Restore core playability.



Read BUGS.md and PART2.md. Do not repeat the comprehensive bug audit.



Fix the following bugs sequentially:

1. BUG-002 — First level fails the unlock condition.
2. BUG-001 — Reversed movement arguments prevent intended slow motion.
3. BUG-003 — Horizontal look direction is reversed.

For each bug:

- Confirm the root cause and reproduction steps.
- Implement the smallest correct fix.
- Add a focused regression test where feasible.
- Run relevant automated checks.
- Update the corresponding BUGS.md entry with the root cause, fix and verification status.
- Provide manual gameplay verification instructions.
- Stop for my verification before fixing the next bug.

Preserve the original SUPERHOT-inspired gameplay mechanics, difficulty and balancing.



Append this prompt to PROMPTS.md, creating the file if necessary.



Do not fix unrelated bugs, repeat previous analysis, fabricate verification results or commit automatically.



Keep reports concise to conserve token usage.



Start with BUG-002 only.


## Part 3.1 — Browser feedback and BUG-003 priority

The first level now starts successfully, but I observed inverted horizontal mouse controls during manual gameplay testing.

Mark BUG-002 as manually verified and BUG-003 as browser-confirmed.

Fix BUG-003 before BUG-001 so that further gameplay testing is easier. Follow the established bug-fixing procedure and update BUGS.md and PROMPTS.md.

Do not change unrelated controls or gameplay mechanics. Stop for manual verification after the fix.


## Part 3 — Batch 1 completion

Complete Batch 1 of Part 3 — Core playability.



Address the following bugs:

- BUG-002: First-level unlock condition. Already addressed; retain the fix and verify its implementation.
- BUG-001: Reversed time-scaling arguments.
- BUG-003: Inverted horizontal mouse controls.

Complete the entire batch without stopping between individual fixes.



For each bug:

- Use the existing root cause and evidence in BUGS.md.
- Implement the smallest correct fix.
- Add focused regression tests where feasible.
- Run relevant automated validation.
- Document reproduction steps, root cause, implementation and verification status in BUGS.md.

Requirements:

- Preserve intentional SUPERHOT-inspired mechanics, difficulty and balancing.
- Do not fix bugs outside this batch.
- Do not repeat the comprehensive static audit.
- Do not fabricate browser verification results.
- Run npm run typecheck and npm run build.
- Append this prompt to PROMPTS.md.
- Do not commit automatically.
- Minimize token usage and inspect only relevant source files.

At completion, provide a concise summary of fixes, test results and a consolidated manual verification checklist.


## Part 3.2 — Physics and enemy navigation

Begin Part 3.2 — Physics and enemy navigation.



Read the relevant entries in BUGS.md and complete the following fixes in one batch:

- BUG-005: Invalid character spawn positions.
- BUG-004: Navigation grid selects ceiling tops instead of accessible floors.
- BUG-011: Nearby AI targets disable routing despite obstacles.

For each bug:

- Confirm the documented root cause.
- Implement the smallest robust fix.
- Add focused regression tests where feasible.
- Verify the fix independently.
- Update BUGS.md with reproduction steps, root cause, implementation and actual verification results.

Constraints:

- Preserve original level design, gameplay mechanics, enemy difficulty and balancing.
- Do not simplify levels or remove obstacles to make navigation easier.
- Do not weaken enemies.
- Preserve the Batch 1 fixes.
- Do not fix unrelated bugs.
- Do not repeat the comprehensive audit.
- Complete all three fixes without stopping between them.
- Run regression tests, npm run typecheck and npm run build.
- Append this prompt to PROMPTS.md.
- Do not commit automatically or fabricate manual browser verification.

Optimize token usage by inspecting only relevant files.



Provide a concise completion report and manual gameplay verification checklist.


## Part 4 — GitHub Pages deployment

Begin Part 4 of Lab 05 — GitHub Pages deployment.



Prepare the existing modular TypeScript application for automated deployment.



Requirements:

- Configure GitHub Actions to build and deploy the application to GitHub Pages automatically on every push to main.
- Create the necessary workflow under .github/workflows/.
- Install dependencies reproducibly using npm ci.
- Run regression tests and TypeScript checking before deployment.
- Build and deploy the dist directory.
- Ensure Vite asset paths work when hosted under the GitHub repository URL.
- Provide exact terminal commands for creating and connecting the remote GitHub repository.
- Explain any required GitHub Pages account settings.
- Append this prompt to PROMPTS.md.

Do not modify gameplay mechanics, perform additional bug audits or introduce unnecessary dependencies.



Do not claim deployment success before the live website has been verified.



Do not commit or push automatically.



Keep the completion report concise.
