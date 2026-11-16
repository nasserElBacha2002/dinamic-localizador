/*
  Rollback: 165_billing_subscription_term_commercial_audit.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_billing_subscriptions_company_admin_request'
      AND object_id = OBJECT_ID(N'dbo.billing_subscriptions')
)
BEGIN
    DROP INDEX UX_billing_subscriptions_company_admin_request ON dbo.billing_subscriptions;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bst_subscription_admin_request'
      AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
)
BEGIN
    DROP INDEX UX_bst_subscription_admin_request ON dbo.billing_subscription_terms;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_key') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscriptions DROP COLUMN admin_request_key;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'admin_request_key') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN admin_request_key;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'created_by_user_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN created_by_user_id;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_reference') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_reference;
END;
GO