CREATE TABLE payment_receipts (
 number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 original_person_id INT UNSIGNED NOT NULL,
 original_period_id INT UNSIGNED NOT NULL,
 original_payment_id INT UNSIGNED NOT NULL,
 original_account_id INT UNSIGNED NOT NULL,
 payment_id INT UNSIGNED NULL,
 account_id INT UNSIGNED NULL,
 status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 active_payment_id INT UNSIGNED GENERATED ALWAYS AS (IF(status='active',payment_id,NULL)) STORED,
 snapshot_json JSON NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 issued_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 ended_at TIMESTAMP(3) NULL,
 ended_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 reason VARCHAR(2000) NULL,
 replaces BIGINT UNSIGNED NULL,
 replaced_by BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_receipt_active_payment(active_payment_id),
 UNIQUE KEY uq_receipt_predecessor(replaces),
 UNIQUE KEY uq_receipt_successor(replaced_by),
 INDEX idx_receipt_history(original_person_id,original_period_id,number),
 FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
 FOREIGN KEY(account_id) REFERENCES monthly_accounts(id) ON DELETE RESTRICT,
 FOREIGN KEY(replaces) REFERENCES payment_receipts(number) ON DELETE RESTRICT,
 FOREIGN KEY(replaced_by) REFERENCES payment_receipts(number) ON DELETE RESTRICT,
 CHECK(status IN ('active','void','replaced')),
 CHECK(status <> 'active' OR (payment_id IS NOT NULL AND account_id IS NOT NULL AND ended_at IS NULL AND ended_by IS NULL AND reason IS NULL AND replaced_by IS NULL)),
 CHECK(status = 'active' OR (ended_at IS NOT NULL AND ended_by IS NOT NULL AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>0)),
 CHECK((status='replaced') = (replaced_by IS NOT NULL))
) ENGINE=InnoDB;
CREATE TABLE payment_receipt_operations (
 operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json JSON NOT NULL,
 evidence_json JSON NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TRIGGER payment_receipts_no_delete BEFORE DELETE ON payment_receipts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Issued receipts cannot be deleted';
CREATE TRIGGER payment_receipts_immutable BEFORE UPDATE ON payment_receipts FOR EACH ROW SET NEW.snapshot_json=IF(NEW.number=OLD.number AND NEW.snapshot_json=OLD.snapshot_json AND ((NEW.payment_id <=> OLD.payment_id) OR (OLD.status<>'active' AND NEW.payment_id IS NULL)) AND ((NEW.account_id <=> OLD.account_id) OR (OLD.status<>'active' AND NEW.account_id IS NULL)) AND (OLD.status='active' OR (NEW.ended_at=OLD.ended_at AND NEW.ended_by=OLD.ended_by AND NEW.reason=OLD.reason)) AND NEW.original_person_id=OLD.original_person_id AND NEW.original_period_id=OLD.original_period_id AND NEW.original_payment_id=OLD.original_payment_id AND NEW.original_account_id=OLD.original_account_id AND NEW.actor_id=OLD.actor_id AND NEW.issued_at=OLD.issued_at AND (NEW.replaces <=> OLD.replaces) AND ((NEW.replaced_by <=> OLD.replaced_by) OR (OLD.replaced_by IS NULL AND NEW.replaced_by>OLD.number AND EXISTS (SELECT 1 FROM payment_receipts successor WHERE successor.number=NEW.replaced_by AND successor.replaces=OLD.number AND successor.original_person_id=OLD.original_person_id AND successor.original_period_id=OLD.original_period_id))) AND (NEW.status=OLD.status OR (OLD.status='active' AND NEW.status IN ('void','replaced')) OR (OLD.status='void' AND NEW.status='replaced')),NEW.snapshot_json,NULL);
CREATE TRIGGER payment_receipts_chain_insert BEFORE INSERT ON payment_receipts FOR EACH ROW SET NEW.snapshot_json=IF(NEW.status='active' AND NEW.replaced_by IS NULL AND (NEW.replaces IS NULL OR ((NEW.number=0 OR NEW.number>NEW.replaces) AND EXISTS (SELECT 1 FROM payment_receipts predecessor WHERE predecessor.number=NEW.replaces AND predecessor.status='void' AND predecessor.replaced_by IS NULL AND predecessor.original_person_id=NEW.original_person_id AND predecessor.original_period_id=NEW.original_period_id))),NEW.snapshot_json,NULL);
