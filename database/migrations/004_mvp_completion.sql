IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(150) NOT NULL,
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(30) NOT NULL DEFAULT 'ADMIN',
        active BIT NOT NULL DEFAULT 1,
        last_login_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_users_role CHECK (role IN ('ADMIN'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_users_email'
      AND object_id = OBJECT_ID('users')
)
BEGIN
    CREATE UNIQUE INDEX UQ_users_email ON users (email);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_reviews')
BEGIN
    CREATE TABLE attendance_reviews (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        attendance_id UNIQUEIDENTIFIER NOT NULL,
        reviewed_by UNIQUEIDENTIFIER NOT NULL,
        previous_validation_status NVARCHAR(30) NOT NULL,
        new_validation_status NVARCHAR(30) NOT NULL,
        decision NVARCHAR(30) NOT NULL,
        reason NVARCHAR(1000) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_attendance_reviews_attendance
            FOREIGN KEY (attendance_id) REFERENCES attendance_records(id),
        CONSTRAINT FK_attendance_reviews_user
            FOREIGN KEY (reviewed_by) REFERENCES users(id),
        CONSTRAINT CK_attendance_reviews_decision
            CHECK (decision IN ('APPROVE', 'REJECT')),
        CONSTRAINT CK_attendance_reviews_new_status
            CHECK (new_validation_status IN ('VALID', 'REJECTED'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_reviews_attendance_id'
      AND object_id = OBJECT_ID('attendance_reviews')
)
BEGIN
    CREATE INDEX IX_attendance_reviews_attendance_id
        ON attendance_reviews (attendance_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records')
      AND name = 'reviewed_by'
)
BEGIN
    ALTER TABLE attendance_records ADD reviewed_by UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_attendance_records_reviewed_by'
)
BEGIN
    ALTER TABLE attendance_records
        ADD CONSTRAINT FK_attendance_records_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records')
      AND name = 'reviewed_at'
)
BEGIN
    ALTER TABLE attendance_records ADD reviewed_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records')
      AND name = 'review_reason'
)
BEGIN
    ALTER TABLE attendance_records ADD review_reason NVARCHAR(1000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('audit_logs')
      AND name = 'user_id'
)
BEGIN
    ALTER TABLE audit_logs ADD user_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_audit_logs_user'
)
BEGIN
    ALTER TABLE audit_logs
        ADD CONSTRAINT FK_audit_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'google_place_id'
)
BEGIN
    ALTER TABLE stores ADD google_place_id NVARCHAR(255) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_stores_google_place_id'
      AND object_id = OBJECT_ID('stores')
)
BEGIN
    CREATE INDEX IX_stores_google_place_id ON stores (google_place_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_messages')
      AND name = 'processing_status'
)
BEGIN
    ALTER TABLE whatsapp_messages ADD processing_status NVARCHAR(30) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_messages')
      AND name = 'processing_error_code'
)
BEGIN
    ALTER TABLE whatsapp_messages ADD processing_error_code NVARCHAR(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_messages')
      AND name = 'processed_at'
)
BEGIN
    ALTER TABLE whatsapp_messages ADD processed_at DATETIME2 NULL;
END;
GO
