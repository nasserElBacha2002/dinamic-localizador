# Coupling / cohesion

- **High cohesion:** `absence-transitions.ts`, `attendance-validation.ts`, import strategies.
- **Low cohesion / high coupling:** WhatsApp bot router + flows + reminder + cost ledger (many collaborators).
- **Circular risk:** Contained by layering (routes→services→repos); architecture scanner watches forbidden imports.
- **Frontend:** `scopedApiClient` reduces accidental global API coupling; active company in localStorage couples UI session to tenant selection.
