-- Monthly recurring configuration. No economic data is changed.
-- DDL is durable on MySQL. Stop writers until the runner records success.
CREATE TEMPORARY TABLE recurring_011_guard (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO recurring_011_guard SELECT IF(EXISTS(SELECT 1 FROM schema_migrations WHERE name='010.sql'),1,0);
SET @run_recurring_011 = NOT EXISTS(SELECT 1 FROM schema_migrations WHERE name='011.sql');
CREATE TABLE IF NOT EXISTS period_recurring_settings (
 period_id INT UNSIGNED NOT NULL PRIMARY KEY,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CONSTRAINT fk_recurring_settings_period FOREIGN KEY(period_id) REFERENCES periods(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS period_recurring_concepts (
 period_id INT UNSIGNED NOT NULL,
 recurring_concept_id INT UNSIGNED NOT NULL,
 position INT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(period_id,recurring_concept_id),
 UNIQUE KEY uq_recurring_period_position(period_id,position),
 KEY ix_recurring_period_concept(recurring_concept_id),
 CONSTRAINT chk_recurring_period_position CHECK(position>=1),
 CONSTRAINT fk_recurring_presence_settings FOREIGN KEY(period_id) REFERENCES period_recurring_settings(period_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_recurring_presence_concept FOREIGN KEY(recurring_concept_id) REFERENCES expense_recurring_concepts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
-- Reject incompatible partial structures before inserting configuration.
INSERT INTO recurring_011_guard SELECT IF(
 (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('period_recurring_settings','period_recurring_concepts') AND ENGINE='InnoDB')=2
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_recurring_settings')=2
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='period_recurring_concepts')=5
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('period_recurring_settings','period_recurring_concepts') AND IS_NULLABLE='NO' AND ((COLUMN_NAME IN ('period_id','recurring_concept_id','position') AND COLUMN_TYPE='int unsigned' AND COLUMN_DEFAULT IS NULL AND EXTRA='') OR (COLUMN_NAME='revision' AND COLUMN_TYPE='bigint unsigned' AND COLUMN_DEFAULT='0' AND EXTRA='') OR (COLUMN_NAME='created_at' AND DATA_TYPE='timestamp' AND DATETIME_PRECISION=0 AND LOWER(COLUMN_DEFAULT) IN ('current_timestamp','current_timestamp()') AND LOWER(EXTRA)='default_generated') OR (COLUMN_NAME='updated_at' AND DATA_TYPE='timestamp' AND DATETIME_PRECISION=0 AND LOWER(COLUMN_DEFAULT) IN ('current_timestamp','current_timestamp()') AND LOWER(EXTRA)='default_generated on update current_timestamp')))=7,1,0);
INSERT INTO recurring_011_guard SELECT IF((SELECT COUNT(*) FROM (
 SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('period_recurring_settings','period_recurring_concepts') GROUP BY TABLE_NAME,INDEX_NAME
 HAVING SUM(SUB_PART IS NOT NULL)=0 AND MIN(IS_VISIBLE)='YES' AND MIN(INDEX_TYPE)='BTREE' AND (
 (TABLE_NAME='period_recurring_settings' AND INDEX_NAME='PRIMARY' AND MAX(NON_UNIQUE)=0 AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)='period_id') OR
 (TABLE_NAME='period_recurring_concepts' AND INDEX_NAME='PRIMARY' AND MAX(NON_UNIQUE)=0 AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)='period_id,recurring_concept_id') OR
 (TABLE_NAME='period_recurring_concepts' AND INDEX_NAME='uq_recurring_period_position' AND MAX(NON_UNIQUE)=0 AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)='period_id,position') OR
 (TABLE_NAME='period_recurring_concepts' AND INDEX_NAME='ix_recurring_period_concept' AND MIN(NON_UNIQUE)=1 AND GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)='recurring_concept_id'))
 ) valid_indexes)=4,1,0);
INSERT INTO recurring_011_guard SELECT IF((SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS r JOIN information_schema.KEY_COLUMN_USAGE k ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA AND k.TABLE_NAME=r.TABLE_NAME AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME WHERE r.CONSTRAINT_SCHEMA=DATABASE() AND r.DELETE_RULE='RESTRICT' AND r.UPDATE_RULE='RESTRICT' AND k.ORDINAL_POSITION=1 AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND (
 (r.TABLE_NAME='period_recurring_settings' AND k.COLUMN_NAME='period_id' AND k.REFERENCED_TABLE_NAME='periods' AND k.REFERENCED_COLUMN_NAME='id') OR
 (r.TABLE_NAME='period_recurring_concepts' AND k.COLUMN_NAME='period_id' AND k.REFERENCED_TABLE_NAME='period_recurring_settings' AND k.REFERENCED_COLUMN_NAME='period_id') OR
 (r.TABLE_NAME='period_recurring_concepts' AND k.COLUMN_NAME='recurring_concept_id' AND k.REFERENCED_TABLE_NAME='expense_recurring_concepts' AND k.REFERENCED_COLUMN_NAME='id')))=3,1,0);
INSERT INTO recurring_011_guard SELECT IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME='period_recurring_concepts' AND t.CONSTRAINT_NAME='chk_recurring_period_position' AND t.ENFORCED='YES' AND REPLACE(REPLACE(REPLACE(REPLACE(c.CHECK_CLAUSE,'`',''),' ',''),'(',''),')','')='position>=1'),1,0);
CREATE TEMPORARY TABLE recurring_011_expected (period_id INT UNSIGNED,recurring_concept_id INT UNSIGNED,position INT UNSIGNED,PRIMARY KEY(period_id,recurring_concept_id));
INSERT INTO recurring_011_expected
 SELECT p.id,r.id,ROW_NUMBER() OVER(PARTITION BY p.id ORDER BY r.sort_order,r.id)
 FROM periods p CROSS JOIN expense_recurring_concepts r
 WHERE @run_recurring_011 AND (r.active=1 OR EXISTS(SELECT 1 FROM period_expense_categories c WHERE c.period_id=p.id AND c.recurring_concept_id=r.id));
START TRANSACTION;
INSERT INTO recurring_011_guard SELECT IF(NOT @run_recurring_011 OR (
 NOT EXISTS(SELECT 1 FROM period_recurring_settings WHERE revision<>0)
 AND NOT EXISTS(SELECT 1 FROM period_recurring_concepts x LEFT JOIN recurring_011_expected e ON e.period_id=x.period_id AND e.recurring_concept_id=x.recurring_concept_id WHERE e.period_id IS NULL OR e.position<>x.position)),1,0);
INSERT INTO period_recurring_settings(period_id) SELECT p.id FROM periods p WHERE @run_recurring_011 AND NOT EXISTS(SELECT 1 FROM period_recurring_settings s WHERE s.period_id=p.id);
INSERT INTO period_recurring_concepts(period_id,recurring_concept_id,position)
 SELECT e.period_id,e.recurring_concept_id,e.position FROM recurring_011_expected e WHERE NOT EXISTS(SELECT 1 FROM period_recurring_concepts x WHERE x.period_id=e.period_id AND x.recurring_concept_id=e.recurring_concept_id);
INSERT INTO recurring_011_guard SELECT IF(NOT @run_recurring_011 OR ((SELECT COUNT(*) FROM period_recurring_settings)=(SELECT COUNT(*) FROM periods) AND (SELECT COUNT(*) FROM period_recurring_concepts)=(SELECT COUNT(*) FROM recurring_011_expected)),1,0);
COMMIT;
DROP TEMPORARY TABLE recurring_011_expected;
DROP TEMPORARY TABLE recurring_011_guard;
