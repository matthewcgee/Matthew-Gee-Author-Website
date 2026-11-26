-- Acuitas data service: PostgreSQL schema (PostgreSQL 12 or later, including
-- Azure Database for PostgreSQL). Safe to run more than once.
--
-- Grant the service's database login SELECT, INSERT, UPDATE and DELETE on these
-- tables and USAGE on the sequence, and nothing else (in particular, not
-- TRUNCATE, which bypasses the audit trigger).

CREATE SEQUENCE IF NOT EXISTS acuitas_seq AS bigint;

CREATE TABLE IF NOT EXISTS acuitas_records (
  collection  varchar(64)  NOT NULL,
  id          varchar(128) NOT NULL,
  data        jsonb        NOT NULL,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  varchar(256),
  CONSTRAINT pk_acuitas_records PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS acuitas_versions (
  collection  varchar(64) NOT NULL,
  seq         bigint      NOT NULL,
  CONSTRAINT pk_acuitas_versions PRIMARY KEY (collection)
);

-- The audit log is append-only: no UPDATE or DELETE of an audit entry, by
-- anyone, through the service or directly in the database.
CREATE OR REPLACE FUNCTION acuitas_audit_append_only() RETURNS trigger AS $$
BEGIN
  IF OLD.collection = 'auditLog' THEN
    RAISE EXCEPTION 'Acuitas audit entries are append-only.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_acuitas_audit_append_only ON acuitas_records;
CREATE TRIGGER tr_acuitas_audit_append_only
  BEFORE UPDATE OR DELETE ON acuitas_records
  FOR EACH ROW EXECUTE FUNCTION acuitas_audit_append_only();
