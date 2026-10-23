-- 010.sql - Recurring expense catalogue and canonical monthly expense.
-- First authorized execution: prisma_test only. Empty catalogue, no business-row backfill.
-- No DELIMITER/procedures. Compatible with the current semicolon-splitting runner.
-- MySQL 8.4 DDL commits implicitly. Do not assume transactional DDL rollback.
DROP TEMPORARY TABLE IF EXISTS recurring_010_guard;
CREATE TEMPORARY TABLE recurring_010_guard (
 ok TINYINT NOT NULL,
 CONSTRAINT chk_recurring_010_guard CHECK (ok=1)
);
-- Required baseline - no writes to business rows
INSERT INTO recurring_010_guard SELECT IF(DATABASE() IS NOT NULL
 AND EXISTS(SELECT 1 FROM schema_migrations WHERE name='009.sql')
 AND EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND ENGINE='InnoDB')
 AND EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND ENGINE='InnoDB')
 AND EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND COLUMN_NAME='id' AND DATA_TYPE='int' AND COLUMN_TYPE LIKE '%unsigned' AND IS_NULLABLE='NO')
 AND EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND COLUMN_NAME='period_id' AND DATA_TYPE='int' AND COLUMN_TYPE LIKE '%unsigned' AND IS_NULLABLE='NO'),1,0);

CREATE TABLE IF NOT EXISTS expense_recurring_concepts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(200) NOT NULL,
 icon_name VARCHAR(40) NOT NULL DEFAULT 'receipt',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_expense_recurring_name (name),
 CONSTRAINT chk_expense_recurring_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
 CONSTRAINT chk_expense_recurring_active CHECK (active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- An existing concept table must have the exact expected columns
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts' AND ENGINE='InnoDB' AND TABLE_COLLATION='utf8mb4_0900_ai_ci')
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts')=7
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts' AND IS_NULLABLE='NO' AND (
 (COLUMN_NAME='id' AND DATA_TYPE='int' AND COLUMN_TYPE LIKE '%unsigned' AND COLUMN_DEFAULT IS NULL AND EXTRA='auto_increment')
 OR (COLUMN_NAME='name' AND DATA_TYPE='varchar' AND CHARACTER_MAXIMUM_LENGTH=200 AND COLLATION_NAME='utf8mb4_0900_ai_ci' AND COLUMN_DEFAULT IS NULL AND EXTRA='')
 OR (COLUMN_NAME='icon_name' AND DATA_TYPE='varchar' AND CHARACTER_MAXIMUM_LENGTH=40 AND COLLATION_NAME='utf8mb4_0900_ai_ci' AND COLUMN_DEFAULT='receipt' AND EXTRA='')
 OR (COLUMN_NAME='active' AND DATA_TYPE='tinyint' AND COLUMN_TYPE='tinyint(1)' AND COLUMN_DEFAULT='1' AND EXTRA='')
 OR (COLUMN_NAME='sort_order' AND DATA_TYPE='smallint' AND COLUMN_TYPE LIKE '%unsigned' AND COLUMN_DEFAULT='0' AND EXTRA='')
 OR (COLUMN_NAME='created_at' AND DATA_TYPE='timestamp' AND DATETIME_PRECISION=0 AND LOWER(COLUMN_DEFAULT) IN ('current_timestamp','current_timestamp()') AND LOWER(EXTRA)='default_generated')
 OR (COLUMN_NAME='updated_at' AND DATA_TYPE='timestamp' AND DATETIME_PRECISION=0 AND LOWER(COLUMN_DEFAULT) IN ('current_timestamp','current_timestamp()') AND LOWER(EXTRA)='default_generated on update current_timestamp')
 ))=7,1,0);
-- Validate concept keys and reject an incompatible preexisting table
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts' AND INDEX_NAME='PRIMARY' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='id')
 AND EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts' AND INDEX_NAME='uq_expense_recurring_name' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='name')
 AND (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts')=2
 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='expense_recurring_concepts')=4,1,0);
-- Validate chk_expense_recurring_name
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc
 JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='expense_recurring_concepts' AND tc.CONSTRAINT_NAME='chk_expense_recurring_name'
 AND tc.CONSTRAINT_TYPE='CHECK' AND tc.ENFORCED='YES' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE),' ',''),'`',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')='char_lengthtrimname>0'),1,0);
-- Validate chk_expense_recurring_active
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc
 JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='expense_recurring_concepts' AND tc.CONSTRAINT_NAME='chk_expense_recurring_active'
 AND tc.CONSTRAINT_TYPE='CHECK' AND tc.ENFORCED='YES' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE),' ',''),'`',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')='activein0,1'),1,0);
-- Never accept an incompatible preexisting reference column
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND COLUMN_NAME='recurring_concept_id'
 AND (DATA_TYPE<>'int' OR COLUMN_TYPE NOT LIKE '%unsigned' OR IS_NULLABLE<>'YES' OR COLUMN_DEFAULT IS NOT NULL OR EXTRA<>'')),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND COLUMN_NAME='recurring_concept_id'),'SELECT 1','ALTER TABLE period_expense_categories ADD COLUMN recurring_concept_id INT UNSIGNED NULL DEFAULT NULL');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- No duplicate links or orphaned concept references
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM period_expense_categories WHERE recurring_concept_id IS NOT NULL GROUP BY period_id,recurring_concept_id HAVING COUNT(*)>1)
 AND NOT EXISTS(SELECT 1 FROM period_expense_categories c LEFT JOIN expense_recurring_concepts r ON r.id=c.recurring_concept_id WHERE c.recurring_concept_id IS NOT NULL AND r.id IS NULL),1,0);
-- Validate an existing named unique index before skipping
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND INDEX_NAME='uq_expense_category_recurring')
 OR EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND INDEX_NAME='uq_expense_category_recurring' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='period_id,recurring_concept_id'),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND INDEX_NAME='uq_expense_category_recurring'),'SELECT 1','ALTER TABLE period_expense_categories ADD UNIQUE KEY uq_expense_category_recurring (period_id,recurring_concept_id)');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Validate an existing named FK before skipping
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND CONSTRAINT_NAME='fk_expense_category_recurring')
 OR EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS rc
 JOIN information_schema.KEY_COLUMN_USAGE k ON k.CONSTRAINT_SCHEMA=rc.CONSTRAINT_SCHEMA AND k.TABLE_NAME=rc.TABLE_NAME AND k.CONSTRAINT_NAME=rc.CONSTRAINT_NAME
 WHERE rc.CONSTRAINT_SCHEMA=DATABASE() AND rc.TABLE_NAME='period_expense_categories' AND rc.CONSTRAINT_NAME='fk_expense_category_recurring'
 AND rc.REFERENCED_TABLE_NAME='expense_recurring_concepts' AND rc.UNIQUE_CONSTRAINT_NAME='PRIMARY' AND rc.DELETE_RULE='RESTRICT' AND rc.UPDATE_RULE='RESTRICT'
 AND k.COLUMN_NAME='recurring_concept_id' AND k.ORDINAL_POSITION=1 AND k.POSITION_IN_UNIQUE_CONSTRAINT=1
 AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='expense_recurring_concepts' AND k.REFERENCED_COLUMN_NAME='id'
 AND (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k2 WHERE k2.CONSTRAINT_SCHEMA=DATABASE() AND k2.TABLE_NAME='period_expense_categories' AND k2.CONSTRAINT_NAME='fk_expense_category_recurring')=1),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND CONSTRAINT_NAME='fk_expense_category_recurring'),'SELECT 1','ALTER TABLE period_expense_categories ADD CONSTRAINT fk_expense_category_recurring FOREIGN KEY (recurring_concept_id) REFERENCES expense_recurring_concepts(id) ON DELETE RESTRICT ON UPDATE RESTRICT');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Final reference integrity checks
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expense_categories' AND INDEX_NAME='uq_expense_category_recurring' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='period_id,recurring_concept_id')
 AND EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS rc
 JOIN information_schema.KEY_COLUMN_USAGE k ON k.CONSTRAINT_SCHEMA=rc.CONSTRAINT_SCHEMA AND k.TABLE_NAME=rc.TABLE_NAME AND k.CONSTRAINT_NAME=rc.CONSTRAINT_NAME
 WHERE rc.CONSTRAINT_SCHEMA=DATABASE() AND rc.TABLE_NAME='period_expense_categories' AND rc.CONSTRAINT_NAME='fk_expense_category_recurring'
 AND rc.REFERENCED_TABLE_NAME='expense_recurring_concepts' AND rc.UNIQUE_CONSTRAINT_NAME='PRIMARY' AND rc.DELETE_RULE='RESTRICT' AND rc.UPDATE_RULE='RESTRICT'
 AND k.COLUMN_NAME='recurring_concept_id' AND k.ORDINAL_POSITION=1 AND k.POSITION_IN_UNIQUE_CONSTRAINT=1
 AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='expense_recurring_concepts' AND k.REFERENCED_COLUMN_NAME='id'
 AND (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k2 WHERE k2.CONSTRAINT_SCHEMA=DATABASE() AND k2.TABLE_NAME='period_expense_categories' AND k2.CONSTRAINT_NAME='fk_expense_category_recurring')=1),1,0);
-- Keep the existing category FK and cascades unchanged
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND COLUMN_NAME='category_id' AND REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='period_expense_categories' AND REFERENCED_COLUMN_NAME='id'),1,0);
-- Validate preexisting canonical marker
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND COLUMN_NAME='recurring_single' AND (DATA_TYPE<>'tinyint' OR COLUMN_TYPE<>'tinyint(1)' OR IS_NULLABLE<>'NO' OR COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT<>'0' OR EXTRA<>'')),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND COLUMN_NAME='recurring_single'),'SELECT 1','ALTER TABLE period_expenses ADD COLUMN recurring_single BOOLEAN NOT NULL DEFAULT FALSE');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Validate preexisting generated key before skipping
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND COLUMN_NAME='recurring_single_category_id' AND (DATA_TYPE<>'int' OR COLUMN_TYPE NOT LIKE '%unsigned' OR IS_NULLABLE<>'YES' OR COLUMN_DEFAULT IS NOT NULL OR EXTRA<>'VIRTUAL GENERATED' OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(GENERATION_EXPRESSION),' ',''),'`',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')<>'ifrecurring_single=1,category_id,null')),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND COLUMN_NAME='recurring_single_category_id'),'SELECT 1','ALTER TABLE period_expenses ADD COLUMN recurring_single_category_id INT UNSIGNED GENERATED ALWAYS AS (IF(recurring_single=1,category_id,NULL)) VIRTUAL');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Legacy rows remain unmarked - do not classify or merge them
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM period_expenses WHERE recurring_single NOT IN (0,1))
 AND NOT EXISTS(SELECT 1 FROM period_expenses WHERE recurring_single=1 GROUP BY category_id HAVING COUNT(*)>1)
 AND NOT EXISTS(SELECT 1 FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE e.recurring_single=1 AND c.recurring_concept_id IS NULL),1,0);
-- Validate existing canonical unique index
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND INDEX_NAME='uq_period_expense_recurring_single') OR EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND INDEX_NAME='uq_period_expense_recurring_single' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='recurring_single_category_id'),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND INDEX_NAME='uq_period_expense_recurring_single'),'SELECT 1','ALTER TABLE period_expenses ADD UNIQUE KEY uq_period_expense_recurring_single (recurring_single_category_id)');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Validate existing marker CHECK without involving FK columns
INSERT INTO recurring_010_guard SELECT IF(NOT EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND CONSTRAINT_NAME='chk_period_expense_recurring_single') OR EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='period_expenses' AND tc.CONSTRAINT_NAME='chk_period_expense_recurring_single' AND tc.CONSTRAINT_TYPE='CHECK' AND tc.ENFORCED='YES' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE),' ',''),'`',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')='recurring_singlein0,1'),1,0);
SET @recurring_010_ddl = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND CONSTRAINT_NAME='chk_period_expense_recurring_single'),'SELECT 1','ALTER TABLE period_expenses ADD CONSTRAINT chk_period_expense_recurring_single CHECK (recurring_single IN (0,1))');
PREPARE recurring_010_statement FROM @recurring_010_ddl;
EXECUTE recurring_010_statement;
DEALLOCATE PREPARE recurring_010_statement;
-- Final single canonical movement constraints
INSERT INTO recurring_010_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_expenses' AND INDEX_NAME='uq_period_expense_recurring_single' GROUP BY INDEX_NAME HAVING MIN(NON_UNIQUE)=0 AND MAX(NON_UNIQUE)=0 AND SUM(SUB_PART IS NOT NULL)=0 AND MIN(INDEX_TYPE)='BTREE' AND MIN(IS_VISIBLE)='YES' AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')='recurring_single_category_id') AND EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='period_expenses' AND tc.CONSTRAINT_NAME='chk_period_expense_recurring_single' AND tc.CONSTRAINT_TYPE='CHECK' AND tc.ENFORCED='YES' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE),' ',''),'`',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')='recurring_singlein0,1'),1,0);
-- No seeds, business-row UPDATE/DELETE/INSERT, period creation or migration registration.
-- The existing runner registers 010.sql only after all statements succeed.
DROP TEMPORARY TABLE recurring_010_guard;
