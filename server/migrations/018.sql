CREATE TABLE identity_institution (
 id TINYINT UNSIGNED PRIMARY KEY,
 initialized BOOLEAN NOT NULL DEFAULT FALSE,
 legacy_retired BOOLEAN NOT NULL DEFAULT FALSE,
 admin_one CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 admin_two CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 CHECK (id=1), CHECK (admin_one IS NULL OR admin_two IS NULL OR admin_one<>admin_two),
 FOREIGN KEY(admin_one) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(admin_two) REFERENCES identity_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
INSERT INTO identity_institution(id) VALUES (1);
CREATE TABLE identity_binding_operations (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 purpose VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
 candidate_at BIGINT NULL,
 expected_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
 consumed_at BIGINT NULL, revoked_at BIGINT NULL,
 CHECK (purpose IN ('initial','replace')),
 CHECK (expires_at>created_at),
 CHECK ((subject IS NULL AND candidate_at IS NULL) OR (subject IS NOT NULL AND candidate_at IS NOT NULL)),
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 INDEX idx_binding_user(user_id)
) ENGINE=InnoDB;
