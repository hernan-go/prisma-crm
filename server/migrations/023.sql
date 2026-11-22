CREATE TABLE education_state (
 id TINYINT UNSIGNED PRIMARY KEY, revision INT UNSIGNED NOT NULL DEFAULT 0,
 CHECK(id=1)
) ENGINE=InnoDB;
INSERT INTO education_state(id) VALUES(1);
CREATE TABLE education_person_links (
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 person_id INT UNSIGNED NOT NULL UNIQUE, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE RESTRICT,
 CHECK(enabled IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE education_presential (
 person_id INT UNSIGNED NOT NULL, activity_id INT UNSIGNED NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(person_id,activity_id),
 FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE RESTRICT,
 FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE RESTRICT,
 CHECK(enabled IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE education_digital_rights (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 person_id INT UNSIGNED NOT NULL, activity_id INT UNSIGNED NOT NULL,
 starts_at BIGINT NOT NULL, ends_at BIGINT NOT NULL, revoked_at BIGINT NULL,
 verification_reference VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
 FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE RESTRICT,
 FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE RESTRICT,
 INDEX idx_education_right(person_id,activity_id,ends_at),
 CHECK(starts_at>=0 AND ends_at>starts_at), CHECK(revoked_at IS NULL OR revoked_at>=0)
) ENGINE=InnoDB;
CREATE TABLE education_operations (
 operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_json JSON NOT NULL, result_json JSON NOT NULL, created_at BIGINT NOT NULL,
 FOREIGN KEY(actor_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 CHECK(JSON_TYPE(request_json)='OBJECT'), CHECK(JSON_TYPE(result_json)='OBJECT')
) ENGINE=InnoDB;
