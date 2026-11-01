-- Additive proposal inbox. No document content or periods are changed.
-- DDL commits implicitly. Inspect partial application before retrying.
CREATE TABLE knowledge_edit_proposals (
 proposal_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 document_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 base_revision INT UNSIGNED NOT NULL,
 base_content_version INT UNSIGNED NOT NULL,
 content_md MEDIUMTEXT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'pending',
 source VARCHAR(16) NOT NULL DEFAULT 'chatgpt',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 decided_at DATETIME(3) NULL,
 decided_by VARCHAR(24) NULL,
 result_revision INT UNSIGNED NULL,
 result_content_version INT UNSIGNED NULL,
 UNIQUE KEY uq_knowledge_proposal_request(request_id),
 KEY ix_knowledge_proposal_pending(document_id,status,created_at,proposal_id),
 CONSTRAINT fk_knowledge_proposal_document FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_knowledge_proposal_base FOREIGN KEY(document_id,base_content_version) REFERENCES knowledge_document_versions(document_id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT chk_knowledge_proposal_size CHECK(content_md IS NULL OR OCTET_LENGTH(content_md)<=524288),
 CONSTRAINT chk_knowledge_proposal_revision CHECK(base_revision>=1 AND base_content_version>=1),
 CONSTRAINT chk_knowledge_proposal_source CHECK(source='chatgpt'),
 CONSTRAINT chk_knowledge_proposal_resolution CHECK(
   (status='pending' AND content_md IS NOT NULL AND decided_at IS NULL AND decided_by IS NULL AND result_revision IS NULL AND result_content_version IS NULL)
   OR (status='approved' AND content_md IS NULL AND decided_at IS NOT NULL AND decided_by='administration' AND result_revision IS NOT NULL AND result_content_version IS NOT NULL)
   OR (status='rejected' AND content_md IS NULL AND decided_at IS NOT NULL AND decided_by='administration' AND result_revision IS NULL AND result_content_version IS NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
