CREATE TABLE facilitator_accounts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 offering_id INT UNSIGNED NOT NULL, instructor_id INT UNSIGNED NOT NULL,
 amount_due DECIMAL(12,2) NULL, notes TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(offering_id,instructor_id),
 FOREIGN KEY(offering_id) REFERENCES period_activities(id),
 FOREIGN KEY(instructor_id) REFERENCES instructors(id), CHECK(amount_due >= 0)
) ENGINE=InnoDB;
CREATE TABLE facilitator_payments (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id INT UNSIGNED NOT NULL,
 date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL, notes TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(account_id) REFERENCES facilitator_accounts(id),
 CHECK(amount > 0), INDEX idx_facilitator_payment_account(account_id,date)
) ENGINE=InnoDB;
