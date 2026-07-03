-- Align inventory operation late-arrival defaults with existing WhatsApp late grace
-- for companies that customized late_grace before inventory defaults were exposed in UI.
USE dinamic_attendance;
GO

UPDATE company_settings
SET default_late_arrival_tolerance_minutes = late_grace_minutes
WHERE default_late_arrival_tolerance_minutes = 90
  AND late_grace_minutes <> 90;
GO
