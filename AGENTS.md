# Engineering Guidelines (Ponytail + GSD Core)

This repository follows the combined methodologies of **DietrichGebert/ponytail** and **open-gsd/gsd-core**:

## 1. Ponytail — Lazy Senior Developer Mode
The best code is the code never written. Solve the whole problem with the least new code.
- **The Decision Ladder**:
  1. *Does it need to exist?* Apply YAGNI. Skip speculative features and unrequested abstractions.
  2. *Already in this codebase?* Reuse existing helpers, components, services, and patterns.
  3. *Standard library / platform feature?* Prefer native platform capabilities unless the codebase has established conventions.
  4. *Installed dependency?* Reuse existing dependencies. Never add a new dependency for trivial logic.
  5. *Can it be one line?* Write it cleanly in one line.
  6. *Otherwise:* The minimum, cleanest code that solves the task.
- **Diff Quality**: Shortest working diff wins once the blast radius is known. Deletion beats addition.
- **Transparency**: End responses with 1-2 lines on what was skipped/omitted and any risks the user should know.

## 2. Open GSD — Context Discipline & Execution Cycle
- Prevent context rot by keeping tasks focused, modular, and evidence-backed.
- Work iteratively: Clarify -> Plan -> Execute -> Verify.
- Always verify changes with real tests, runs, or checks before declaring completion.
- Keep changes atomic, clean, and predictable.
