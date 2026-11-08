CREATE TABLE identity_users (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 display_name VARCHAR(200) NOT NULL,
 status VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'disabled',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CHECK (status IN ('enabled','disabled'))
) ENGINE=InnoDB;
CREATE TABLE identity_external_accounts (
 provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(provider,subject),
 UNIQUE KEY uq_identity_user_provider(user_id,provider),
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE identity_user_roles (
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 role VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(user_id,role),
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 CHECK (role IN ('admin','facilitator','participant'))
) ENGINE=InnoDB;
CREATE TABLE identity_sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 application VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 revoked_at BIGINT NULL,
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 INDEX idx_identity_session_user(user_id),
 INDEX idx_identity_session_expiry(expires_at),
 CHECK (expires_at > created_at),
 CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) ENGINE=InnoDB;
CREATE TABLE identity_audit_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 event VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 INDEX idx_identity_audit_user(user_id,id)
) ENGINE=InnoDB;
