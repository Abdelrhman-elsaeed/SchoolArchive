# AGENT.md - Agent Operating Rules

This document outlines the strict governance and operational rules that any AI agent or developer MUST adhere to when working on the **الأرشيف المدرسي العربي** (Arabic School Archive) repository.

## 1. Scope and Phasing Constraints
- **Phase Boundary Lock**: Work on ONLY the current active phase as documented in `ROADMAP.md` and `PROGRESS.md`. 
- **No Premature Implementation**: Never implement, stub, or prepare code for future phases unless explicitly instructed by the user.
- **Stop Conditions**: Immediately stop execution and ask the user for confirmation after completing the designated tasks of the current phase.

## 2. Codebase Interaction Rules
- **Look Before You Leap**: Inspect existing folders, controllers, services, DB schemas, configurations, and docs before proposing or implementing any changes. Do not invent commands, tools, or dependencies that are not present.
- **Preserve Existing Integrity**: Maintain and preserve working code paths, controllers, middleware, and documentation unless the current phase explicitly calls for their modification.
- **No Collateral Refactoring**: Do not refactor, clean up, or touch unrelated code files or files outside of the target component being modified. Keep edits precise.
- **Keep Design Simple**: Choose the simplest possible design that satisfies the requirements. Avoid over-engineering, extra abstraction layers, and unrequested design patterns.

## 3. Documentation and Verification Governance
- **No "Done" Without Docs**: Never report a phase or task as completed unless the documentation under `docs/agent/` (specifically `PROGRESS.md`, `BUGS.md`, and `LESSONS_LEARNED.md`) has been updated to reflect the new state, issues found, and lessons learned.
- **Checklist Tracking**: Create and update the `task.md` artifact in the brain folder as tasks are executed.
- **No Hidden Architectural Changes**: Any architectural changes, database updates, or logic flow changes must first be documented and approved in `DECISIONS.md` before coding.
- **Zero-Trust Assumptions**: Never make silent assumptions about environment settings, storage configurations, or third-party webhooks (e.g., n8n). When in doubt, document the questions or options first in `PROGRESS.md`.

## 4. Current Active Phase Rule
- **Active Phase**: **Phase 0 (Governance & Documentation)**.
- **Mandate**: Write documentation and system architecture logs ONLY. Under no circumstances should any ASP.NET Core controllers, DbContexts, React frontend pages, database migrations, or docker-compose settings be written, compiled, or configured during this phase.
