CREATE TABLE portal_access_state (
 id TINYINT UNSIGNED PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 pilot_sealed BOOLEAN NOT NULL DEFAULT FALSE,
 admissions_open BOOLEAN NOT NULL DEFAULT FALSE,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 security_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
 emergency_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CHECK (id=1), CHECK (enabled IN (0,1)), CHECK (pilot_sealed IN (0,1)),
 CHECK (admissions_open=0), CHECK (enabled=0 OR pilot_sealed=1)
) ENGINE=InnoDB;
INSERT INTO portal_access_state(id) VALUES (1);
CREATE TABLE identity_instructor_links (
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 instructor_id INT UNSIGNED NOT NULL UNIQUE,
 pilot_slot TINYINT UNSIGNED NOT NULL UNIQUE,
 status VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'disabled',
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 min_login_seq BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(instructor_id) REFERENCES instructors(id) ON DELETE RESTRICT,
 CHECK (pilot_slot IN (1,2)), CHECK (status IN ('enabled','disabled')),
 CHECK (revision>0), CHECK (min_login_seq>0)
) ENGINE=InnoDB;
CREATE TABLE identity_portal_oidc_attempts (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 provider VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 application VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 configuration_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 browser_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 nonce VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 pkce_key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 pkce_encrypted VARCHAR(95) CHARACTER SET ascii COLLATE ascii_bin NULL,
 begin_seq BIGINT UNSIGNED NOT NULL,
 emergency_epoch BIGINT UNSIGNED NOT NULL,
 expected_crm_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 issued_session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 status VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 claimed_at BIGINT NULL,
 verified_at BIGINT NULL,
 consumed_at BIGINT NULL,
 invalidated_at BIGINT NULL,
 subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
 token_issued_at BIGINT NULL,
 token_expires_at BIGINT NULL,
 authentication_time BIGINT NULL,
 FOREIGN KEY(expected_crm_user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(issued_session_hash) REFERENCES identity_sessions(token_hash) ON DELETE RESTRICT,
 INDEX idx_portal_oidc_cleanup(status,expires_at),
 CHECK (provider='google' AND application='portal'),
 CHECK (created_at>=0 AND expires_at>created_at AND expires_at<=created_at+300000),
 CHECK (claimed_at IS NULL OR claimed_at>=created_at),
 CHECK (verified_at IS NULL OR (claimed_at IS NOT NULL AND verified_at>=claimed_at)),
 CHECK (consumed_at IS NULL OR (verified_at IS NOT NULL AND consumed_at>=verified_at)),
 CHECK (invalidated_at IS NULL OR invalidated_at>=created_at),
 CHECK ((status='pending' AND claimed_at IS NULL AND verified_at IS NULL AND consumed_at IS NULL AND invalidated_at IS NULL)
     OR (status='claimed' AND claimed_at IS NOT NULL AND verified_at IS NULL AND consumed_at IS NULL AND invalidated_at IS NULL)
     OR (status='verified' AND verified_at IS NOT NULL AND consumed_at IS NULL AND invalidated_at IS NULL)
     OR (status='consumed' AND consumed_at IS NOT NULL AND invalidated_at IS NULL)
     OR (status='invalidated' AND invalidated_at IS NOT NULL AND consumed_at IS NULL)),
 CHECK ((status='pending' AND nonce IS NOT NULL AND pkce_key_id IS NOT NULL AND pkce_encrypted IS NOT NULL)
     OR (status<>'pending' AND nonce IS NULL AND pkce_key_id IS NULL AND pkce_encrypted IS NULL)),
 CHECK ((status='verified' AND subject IS NOT NULL AND token_issued_at IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at>token_issued_at)
     OR (status<>'verified' AND subject IS NULL AND token_issued_at IS NULL AND token_expires_at IS NULL AND authentication_time IS NULL)),
 CHECK ((status='consumed' AND issued_session_hash IS NOT NULL) OR (status<>'consumed' AND issued_session_hash IS NULL))
) ENGINE=InnoDB;
ALTER TABLE identity_audit_events
 ADD COLUMN details_json JSON NULL,
 ADD COLUMN operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD UNIQUE KEY uq_identity_audit_operation(operation_id),
 ADD CONSTRAINT chk_identity_audit_operation CHECK (operation_id IS NULL OR
   (details_json IS NOT NULL AND JSON_TYPE(details_json)='OBJECT' AND
    operation_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
 ADD CONSTRAINT chk_identity_audit_details_size CHECK (details_json IS NULL OR JSON_STORAGE_SIZE(details_json)<=16384);
