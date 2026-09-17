---
trigger: always_on
description: Mandatory rule to always refer to agent.md before taking any action, implementing features, or making architectural decisions
---

# Principal Rule: Mandatory Adherence to agent.md

**Rule:** You MUST always refer to and strictly follow [agent.md](file:///Users/shivaniyerram/Desktop/Projects/EHR/ehr-platform/agent.md) before executing, implementing, planning, or deciding anything in this workspace.

### Core Tenets Defined in `agent.md`:
1. **Source of Truth:**
   - [project_docs/EHR_Architecture_Document.md](file:///Users/shivaniyerram/Desktop/Projects/EHR/ehr-platform/project_docs/EHR_Architecture_Document.md) is the absolute, unalterable architectural source of truth. It must never be contradicted, altered, or bypassed.
   - All architectural boundaries, service scopes, schemas, and pipeline stages must strictly follow this document and the accompanying project specifications ([EHR_Clinical_NLP_HL7_Project_Scope (1).md](file:///Users/shivaniyerram/Desktop/Projects/EHR/ehr-platform/project_docs/EHR_Clinical_NLP_HL7_Project_Scope%20(1).md) and [EHR_Timeline_and_Milestones.md](file:///Users/shivaniyerram/Desktop/Projects/EHR/ehr-platform/project_docs/EHR_Timeline_and_Milestones.md)).

2. **Mandatory Progress Logging:**
   - All agents and developers MUST log their completed work in [progress.md](file:///Users/shivaniyerram/Desktop/Projects/EHR/ehr-platform/progress.md).
   - Whenever any significant chunk of work is finished, an entry must be prepended to the top of `progress.md` (directly below the header) so the team maintains an audit log of what was completed and what remains.

3. **Execution Guardrails:**
   - Never make assumptions that contradict `agent.md` or the reference architecture.
   - Cross-check requirements with `agent.md` at every step of development.

4. **Git Commits & Pushes:**
   - MUST ALWAYS ask for explicit user confirmation before committing or pushing changes to the GitHub repository. Never commit or push automatically.