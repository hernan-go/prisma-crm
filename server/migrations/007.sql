CREATE TABLE IF NOT EXISTS period_expense_categories (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 period_id INT UNSIGNED NOT NULL, name VARCHAR(200) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_expense_category_name(period_id,name),
 FOREIGN KEY(period_id) REFERENCES periods(id),
 CHECK(CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS period_expenses (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 category_id INT UNSIGNED NOT NULL,
 concept VARCHAR(200) NOT NULL, date DATE NOT NULL,
 amount DECIMAL(12,2) NOT NULL, notes TEXT NOT NULL,
 legacy_advertising_id INT UNSIGNED NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_expense_legacy_advertising(legacy_advertising_id),
 FOREIGN KEY(category_id) REFERENCES period_expense_categories(id) ON DELETE CASCADE,
 INDEX idx_expense_category_date(category_id,date),
 CHECK(amount > 0 OR (amount = 0 AND legacy_advertising_id IS NOT NULL))
) ENGINE=InnoDB;
START TRANSACTION;
INSERT INTO period_expense_categories(period_id,name)
 SELECT p.id,'Publicidad' FROM periods p
 WHERE EXISTS (SELECT 1 FROM advertising_investments a WHERE YEAR(a.date)=p.year AND MONTH(a.date)=p.month)
 AND NOT EXISTS (SELECT 1 FROM period_expense_categories c WHERE c.period_id=p.id AND c.name='Publicidad');
INSERT INTO period_expenses(category_id,concept,date,amount,notes,legacy_advertising_id,created_at,updated_at)
 SELECT c.id,a.concept,a.date,a.amount,a.notes,a.id,a.created_at,a.updated_at
 FROM advertising_investments a
 JOIN periods p ON p.year=YEAR(a.date) AND p.month=MONTH(a.date)
 JOIN period_expense_categories c ON c.period_id=p.id AND c.name='Publicidad'
 WHERE NOT EXISTS (SELECT 1 FROM period_expenses e WHERE e.legacy_advertising_id=a.id);
COMMIT;
