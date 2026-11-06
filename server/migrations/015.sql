-- Additive event expense association. No backfill or financial value changes.
-- DDL commits implicitly. Inspect partial application before retrying.
ALTER TABLE period_expenses
 ADD COLUMN special_event_id INT UNSIGNED NULL,
 ADD COLUMN voided_at DATETIME(3) NULL,
 ADD COLUMN void_reason VARCHAR(2000) NULL,
 ADD KEY ix_expense_event(special_event_id),
 ADD CONSTRAINT fk_expense_event FOREIGN KEY(special_event_id) REFERENCES special_events(id) ON DELETE RESTRICT,
 ADD CONSTRAINT chk_expense_void CHECK(
   (voided_at IS NULL AND void_reason IS NULL) OR
   (voided_at IS NOT NULL AND void_reason IS NOT NULL AND CHAR_LENGTH(TRIM(void_reason))>0)
 );
