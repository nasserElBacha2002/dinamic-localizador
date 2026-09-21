# Security invariant

NO CLIENT REQUEST MAY AUTHORITATIVELY DEFINE ATTENDANCE VALIDATION STATE.

Client evidence: latitude, longitude, receivedAt, operationId, employeeId, optional sourceMessageSid.
Server-derived: distanceMeters, locationStatus, validationStatus, punctualityStatus, validationReason.
