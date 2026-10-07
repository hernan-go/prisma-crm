-- DDL commits implicitly in MySQL. Each step can be retried before registration.
CREATE TABLE IF NOT EXISTS period_memberships (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 person_id INT UNSIGNED NOT NULL,
 period_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_membership_person_period (person_id,period_id),
 INDEX idx_membership_period (period_id),
 FOREIGN KEY(person_id) REFERENCES people(id),
 FOREIGN KEY(period_id) REFERENCES periods(id)
) ENGINE=InnoDB;

INSERT INTO period_memberships(person_id,period_id)
 SELECT legacy.person_id,legacy.period_id
 FROM (
   SELECT person_id,period_id FROM enrollments
   UNION
   SELECT person_id,period_id FROM monthly_accounts
 ) legacy
 WHERE NOT EXISTS (
   SELECT 1 FROM period_memberships m
   WHERE m.person_id=legacy.person_id AND m.period_id=legacy.period_id
 );

SET @membership_ddl = IF(
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='enrollments' AND CONSTRAINT_NAME='fk_enrollment_membership'),
 'SELECT 1',
 'ALTER TABLE enrollments ADD CONSTRAINT fk_enrollment_membership FOREIGN KEY(person_id,period_id) REFERENCES period_memberships(person_id,period_id)'
);
PREPARE membership_statement FROM @membership_ddl;
EXECUTE membership_statement;
DEALLOCATE PREPARE membership_statement;

SET @membership_ddl = IF(
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='monthly_accounts' AND CONSTRAINT_NAME='fk_account_membership'),
 'SELECT 1',
 'ALTER TABLE monthly_accounts ADD CONSTRAINT fk_account_membership FOREIGN KEY(person_id,period_id) REFERENCES period_memberships(person_id,period_id)'
);
PREPARE membership_statement FROM @membership_ddl;
EXECUTE membership_statement;
DEALLOCATE PREPARE membership_statement;
