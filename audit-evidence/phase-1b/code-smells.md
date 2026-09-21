# Code smells (impactful only)

| Smell | Where | Consequence |
|-------|-------|-------------|
| Divergent Change (geofence margin) | bot-runtime vs company defaults vs geolocation.service | Different radius/margin depending on path |
| Long Method / God Module | checkout/assignment/reminder services | Regression risk |
| Shotgun Surgery (permissions) | Many route files + constants | Adding permission requires many edits (mitigated by catalog) |
| Magic env defaults on failure | bot-runtime-settings catch | Silent behavior change |
| Primitive Obsession (status strings) | Scattered enums | Attendance lacks shared transition table |
| Feature Envy | Services assembling SQL-like filters | Some logic belongs in repos (already often does) |

Cosmetic smells omitted.
