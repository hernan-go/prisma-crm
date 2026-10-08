-- Pause application writes before running. MySQL DDL is not rolled back.
-- Every durable step is retryable. The runner registers only a completed migration.
DROP TEMPORARY TABLE IF EXISTS payment_recipient_guard;
CREATE TEMPORARY TABLE payment_recipient_guard (
 ok TINYINT NOT NULL,
 CONSTRAINT chk_009_preflight CHECK (ok=1)
);
INSERT INTO payment_recipient_guard
 SELECT IF(
 EXISTS(SELECT 1 FROM schema_migrations WHERE name='008.sql') AND
 EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_memberships') AND
 NOT EXISTS(SELECT 1 FROM payments WHERE method IS NULL OR method NOT IN ('cash','transfer')) AND
 NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='recipient' AND
 (DATA_TYPE<>'varchar' OR CHARACTER_MAXIMUM_LENGTH<>6 OR COLLATION_NAME<>'ascii_bin' OR COLUMN_DEFAULT IS NOT NULL OR EXTRA<>'')), 1, 0);

SET @recipient_ddl = IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='recipient'),
 'SELECT 1',
 'ALTER TABLE payments ADD COLUMN recipient VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NULL'
);
PREPARE recipient_statement FROM @recipient_ddl;
EXECUTE recipient_statement;
DEALLOCATE PREPARE recipient_statement;

INSERT INTO payment_recipient_guard
 SELECT IF(NOT EXISTS(SELECT 1 FROM payments WHERE recipient IS NOT NULL AND recipient NOT IN ('jesica','hernan')),1,0);

-- An existing named constraint must have exactly the expected semantics.
INSERT INTO payment_recipient_guard
 SELECT IF(NOT EXISTS(
 SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc
 LEFT JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='payments' AND tc.CONSTRAINT_NAME='chk_payment_recipient' AND
 (tc.CONSTRAINT_TYPE<>'CHECK' OR tc.ENFORCED<>'YES' OR cc.CHECK_CLAUSE IS NULL OR
 REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE),' ',''),'`',''),'(',''),')',''),'_ascii',''),CHAR(10),''),CHAR(92),''),'_utf8mb4','')<>'recipientin''jesica'',''hernan''')
 ),1,0);
-- Explicit self-assignment prevents ON UPDATE CURRENT_TIMESTAMP during backfill.
UPDATE payments
 SET recipient=CASE method WHEN 'cash' THEN 'jesica' WHEN 'transfer' THEN 'hernan' END,
 updated_at=updated_at
 WHERE recipient IS NULL AND method IN ('cash','transfer');

INSERT INTO payment_recipient_guard
 SELECT IF(NOT EXISTS(SELECT 1 FROM payments WHERE recipient IS NULL OR recipient NOT IN ('jesica','hernan')),1,0);

SET @recipient_ddl = IF(
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND CONSTRAINT_NAME='chk_payment_recipient'),
 'SELECT 1',
 'ALTER TABLE payments ADD CONSTRAINT chk_payment_recipient CHECK (recipient IN (_ascii''jesica'',_ascii''hernan''))'
);
PREPARE recipient_statement FROM @recipient_ddl;
EXECUTE recipient_statement;
DEALLOCATE PREPARE recipient_statement;

SET @recipient_ddl = IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='recipient' AND IS_NULLABLE='NO'),
 'SELECT 1',
 'ALTER TABLE payments MODIFY COLUMN recipient VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'
);
PREPARE recipient_statement FROM @recipient_ddl;
EXECUTE recipient_statement;
DEALLOCATE PREPARE recipient_statement;

INSERT INTO payment_recipient_guard
 SELECT IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='recipient' AND IS_NULLABLE='NO' AND COLUMN_DEFAULT IS NULL) AND
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND CONSTRAINT_NAME='chk_payment_recipient' AND CONSTRAINT_TYPE='CHECK' AND ENFORCED='YES') AND
 NOT EXISTS(SELECT 1 FROM payments WHERE recipient IS NULL OR recipient NOT IN ('jesica','hernan')),1,0);
DROP TEMPORARY TABLE payment_recipient_guard;
