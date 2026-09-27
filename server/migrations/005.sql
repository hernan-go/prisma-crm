ALTER TABLE instructors ADD COLUMN surname VARCHAR(100) NOT NULL DEFAULT '', ADD COLUMN dni VARCHAR(30) NOT NULL DEFAULT '', ADD COLUMN phone VARCHAR(60) NOT NULL DEFAULT '', ADD COLUMN email VARCHAR(254) NOT NULL DEFAULT '', ADD COLUMN address VARCHAR(2000) NOT NULL DEFAULT '', ADD COLUMN ever_used BOOLEAN NOT NULL DEFAULT FALSE, DROP INDEX name;
ALTER TABLE activities MODIFY instructor_id INT UNSIGNED NULL, ADD COLUMN ever_used BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE period_activities (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 period_id INT UNSIGNED NOT NULL, activity_id INT UNSIGNED NOT NULL,
 name VARCHAR(180) NOT NULL, mode ENUM('group','individual') NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, ever_used BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(period_id,activity_id),
 FOREIGN KEY(period_id) REFERENCES periods(id), FOREIGN KEY(activity_id) REFERENCES activities(id)
) ENGINE=InnoDB;
CREATE TABLE period_activity_days (
 offering_id INT UNSIGNED NOT NULL, day TINYINT UNSIGNED NOT NULL,
 PRIMARY KEY(offering_id,day), FOREIGN KEY(offering_id) REFERENCES period_activities(id), CHECK(day BETWEEN 0 AND 6)
) ENGINE=InnoDB;
CREATE TABLE activity_schedules (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, offering_id INT UNSIGNED NOT NULL,
 day TINYINT UNSIGNED NOT NULL, start CHAR(5) NOT NULL, end CHAR(5) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, ever_used BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(offering_id) REFERENCES period_activities(id), INDEX idx_schedule_offering(offering_id),
 CHECK(day BETWEEN 0 AND 6), CHECK(end > start)
) ENGINE=InnoDB;
CREATE TABLE schedule_instructors (
 schedule_id INT UNSIGNED NOT NULL, instructor_id INT UNSIGNED NOT NULL,
 display_name VARCHAR(201) NOT NULL,
 PRIMARY KEY(schedule_id,instructor_id), FOREIGN KEY(schedule_id) REFERENCES activity_schedules(id), FOREIGN KEY(instructor_id) REFERENCES instructors(id)
) ENGINE=InnoDB;
ALTER TABLE enrollment_slots ADD COLUMN schedule_id INT UNSIGNED NULL, ADD CONSTRAINT fk_enrollment_schedule FOREIGN KEY(schedule_id) REFERENCES activity_schedules(id);
INSERT INTO period_activities(period_id,activity_id,name,mode,ever_used)
 SELECT DISTINCT e.period_id,a.id,a.name,a.mode,TRUE FROM enrollments e JOIN activities a ON a.id=e.activity_id;
INSERT INTO period_activity_days(offering_id,day)
 SELECT o.id,d.day FROM period_activities o JOIN activity_allowed_days d ON d.activity_id=o.activity_id;
INSERT IGNORE INTO period_activity_days(offering_id,day)
 SELECT o.id,s.day FROM enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id JOIN period_activities o ON o.period_id=e.period_id AND o.activity_id=e.activity_id;
INSERT INTO activity_schedules(offering_id,day,start,end,ever_used)
 SELECT DISTINCT o.id,s.day,s.start,s.end,TRUE FROM enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id JOIN period_activities o ON o.period_id=e.period_id AND o.activity_id=e.activity_id;
INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name)
 SELECT s.id,i.id,i.name FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id JOIN activities a ON a.id=o.activity_id JOIN instructors i ON i.id=a.instructor_id;
UPDATE enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id JOIN period_activities o ON o.period_id=e.period_id AND o.activity_id=e.activity_id JOIN activity_schedules t ON t.offering_id=o.id AND t.day=s.day AND t.start=s.start AND t.end=s.end SET s.schedule_id=t.id;
ALTER TABLE enrollment_slots DROP FOREIGN KEY fk_enrollment_schedule;
ALTER TABLE enrollment_slots MODIFY schedule_id INT UNSIGNED NOT NULL;
ALTER TABLE enrollment_slots ADD CONSTRAINT fk_enrollment_schedule FOREIGN KEY(schedule_id) REFERENCES activity_schedules(id);
UPDATE activities a SET ever_used=TRUE WHERE EXISTS(SELECT 1 FROM period_activities o WHERE o.activity_id=a.id);
UPDATE instructors i SET ever_used=TRUE WHERE EXISTS(SELECT 1 FROM activities a WHERE a.instructor_id=i.id) OR EXISTS(SELECT 1 FROM schedule_instructors s WHERE s.instructor_id=i.id);
