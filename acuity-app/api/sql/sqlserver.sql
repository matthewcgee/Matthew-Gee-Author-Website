-- Acuitas data service: Microsoft SQL Server 2016+ / Azure SQL Database schema.
-- Safe to run more than once. Run in SQL Server Management Studio, Azure Data
-- Studio or sqlcmd (the GO lines separate batches).
--
-- Grant the service's database user SELECT, INSERT, UPDATE and DELETE on these
-- tables and UPDATE on the sequence, and nothing else (no ALTER or DDL rights,
-- so the audit trigger cannot be disabled by the service).

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = N'acuitas_seq' AND schema_id = SCHEMA_ID(N'dbo'))
  CREATE SEQUENCE dbo.acuitas_seq AS bigint START WITH 1 INCREMENT BY 1;
GO

IF OBJECT_ID(N'dbo.acuitas_records', N'U') IS NULL
  CREATE TABLE dbo.acuitas_records (
    collection  nvarchar(64)  COLLATE Latin1_General_100_BIN2 NOT NULL,
    id          nvarchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    data        nvarchar(max) NOT NULL CONSTRAINT ck_acuitas_records_json CHECK (ISJSON(data) = 1),
    updated_at  datetime2     NOT NULL CONSTRAINT df_acuitas_records_updated DEFAULT SYSUTCDATETIME(),
    updated_by  nvarchar(256) NULL,
    CONSTRAINT pk_acuitas_records PRIMARY KEY (collection, id)
  );
GO

IF OBJECT_ID(N'dbo.acuitas_versions', N'U') IS NULL
  CREATE TABLE dbo.acuitas_versions (
    collection  nvarchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    seq         bigint       NOT NULL,
    CONSTRAINT pk_acuitas_versions PRIMARY KEY (collection)
  );
GO

-- The audit log is append-only: no UPDATE or DELETE of an audit entry, by
-- anyone, through the service or directly in the database.
CREATE OR ALTER TRIGGER dbo.tr_acuitas_audit_append_only
ON dbo.acuitas_records
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted WHERE collection = N'auditLog')
    THROW 51000, N'Acuitas audit entries are append-only.', 1;
END;
GO
