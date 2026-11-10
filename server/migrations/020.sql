ALTER TABLE identity_oidc_attempts
 ADD COLUMN issued_session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD UNIQUE KEY uq_identity_oidc_issued_session (issued_session_hash),
 ADD CONSTRAINT fk_identity_oidc_issued_session FOREIGN KEY (issued_session_hash)
 REFERENCES identity_sessions(token_hash) ON DELETE RESTRICT,
 ADD CONSTRAINT chk_identity_oidc_issued_session CHECK
 (issued_session_hash IS NULL OR (purpose='login' AND status='consumed'));
