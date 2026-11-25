/* DIN-473: replacement absence correlation + manual-link alert type */

IF COL_LENGTH(N'dbo.replacement_requests', N'absence_request_id') IS NULL
  ALTER TABLE dbo.replacement_requests ADD absence_request_id UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = N'FK_replacement_requests_absence_request'
    AND parent_object_id = OBJECT_ID(N'dbo.replacement_requests')
)
BEGIN
  ALTER TABLE dbo.replacement_requests
    ADD CONSTRAINT FK_replacement_requests_absence_request
    FOREIGN KEY (company_id, absence_request_id)
    REFERENCES dbo.absence_requests(company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_waan_alert_type' AND parent_object_id=OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications'))
BEGIN
  ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_alert_type;
END;
GO
ALTER TABLE dbo.whatsapp_admin_alert_notifications ADD CONSTRAINT CK_waan_alert_type CHECK (alert_type IN (
 N'EMPLOYEE_UNAVAILABLE',N'MISSING_CHECKIN_AFTER_OPERATION',N'FORWARDED_LOCATION_REJECTED',N'ABSENCE_REQUEST_PENDING',N'ATTENDANCE_THRESHOLD_CROSSED',N'ATTENDANCE_CONFIRMATION_MISSING',N'MISSING_CHECKIN_AFTER_START',N'MISSING_CHECKOUT_AFTER_END',N'REPLACEMENT_REQUEST',N'REPLACEMENT_MANUAL_LINK'));
GO