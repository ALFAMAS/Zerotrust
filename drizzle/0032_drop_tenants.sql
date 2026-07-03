-- ARCH-1: remove orphaned enterprise `tenants` table; organizations is the tenancy boundary.
DROP TABLE IF EXISTS "tenants";
