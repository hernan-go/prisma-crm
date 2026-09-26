ALTER TABLE activities ADD COLUMN mode ENUM('group','individual') NOT NULL DEFAULT 'group';
UPDATE activities SET mode='individual' WHERE name='Informática';
