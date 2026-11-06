ALTER TABLE periods
  ADD event_sequence INT UNSIGNED NOT NULL DEFAULT 0,
  ADD event_delete_receipts JSON NULL;

ALTER TABLE special_events
  ADD event_number INT UNSIGNED NULL,
  ADD location VARCHAR(200) NOT NULL DEFAULT '';

UPDATE special_events e
JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY period_id ORDER BY id) n FROM special_events) numbered ON numbered.id=e.id
SET e.event_number=numbered.n, e.updated_at=e.updated_at;

UPDATE periods p
JOIN (SELECT period_id, MAX(event_number) n FROM special_events GROUP BY period_id) numbers ON numbers.period_id=p.id
SET p.event_sequence=numbers.n;

ALTER TABLE special_events
  MODIFY event_number INT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uq_event_period_number (period_id,event_number),
  ADD CONSTRAINT ck_event_number CHECK(event_number>0);
