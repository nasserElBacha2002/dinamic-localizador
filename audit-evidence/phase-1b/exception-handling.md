# Exception handling

- HTTP: `errorHandler` maps AppError/Zod; generic 500 without stack to clients (1A discarded stack leak).
- Scanner `exceptions`: 27 medium hits — many intentional Result/null; validated TPs: silent `[]` on absence impact failure; env fallback on settings load (CQ-005/006).
- WhatsApp correlate `.catch(() => undefined)` after timeout — fire-and-forget (CQ-008).
