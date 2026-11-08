CREATE TABLE identity_oidc_attempts (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 provider VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 purpose VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 application VARCHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 configuration_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 browser_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 nonce VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
 pkce_key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 pkce_encrypted VARCHAR(95) CHARACTER SET ascii COLLATE ascii_bin NULL,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 binding_operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 initiator_session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
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
 FOREIGN KEY(user_id) REFERENCES identity_users(id) ON DELETE RESTRICT,
 FOREIGN KEY(binding_operation_id) REFERENCES identity_binding_operations(id) ON DELETE RESTRICT,
 FOREIGN KEY(initiator_session_hash) REFERENCES identity_sessions(token_hash) ON DELETE RESTRICT,
 INDEX idx_oidc_expiry(expires_at),
 CHECK (provider='google' AND application='crm'),
 CHECK ((purpose='login' AND user_id IS NULL AND binding_operation_id IS NULL AND initiator_session_hash IS NULL)
     OR (purpose='binding' AND user_id IS NOT NULL AND binding_operation_id IS NOT NULL AND initiator_session_hash IS NULL)
     OR (purpose='reauth' AND user_id IS NOT NULL AND binding_operation_id IS NULL AND initiator_session_hash IS NOT NULL)),
 CHECK (expires_at>created_at AND expires_at<=created_at+300000),
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
     OR (status<>'verified' AND subject IS NULL AND token_issued_at IS NULL AND token_expires_at IS NULL AND authentication_time IS NULL))
) ENGINE=InnoDB;
