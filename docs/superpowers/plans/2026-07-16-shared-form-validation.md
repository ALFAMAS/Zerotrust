# Shared form validation implementation plan

1. Add failing shared-schema tests for organization and support request bodies.
2. Export the new schemas and replace matching API-local schemas.
3. Add failing support component tests for per-field errors, first-error focus, normalized payloads, and reply validation.
4. Migrate support creation and reply controls to React Hook Form.
5. Add failing organization settings tests for invalid fields, normalized payloads, dirty state, and policy parsing.
6. Migrate organization general settings and security policy to React Hook Form while preserving destructive confirmation workflows.
7. Run focused schemas, route, component, type, boundary, and dead-code checks; commit the slice locally.
