ALTER TABLE identity_audit_events
 DROP CHECK chk_identity_audit_operation,
 ADD CONSTRAINT chk_identity_audit_operation CHECK (operation_id IS NULL OR
   (details_json IS NOT NULL AND JSON_TYPE(details_json)='OBJECT' AND
    operation_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) ENFORCED;
