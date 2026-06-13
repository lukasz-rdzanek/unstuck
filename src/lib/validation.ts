import { z } from "zod";

/**
 * Postgres-lenient UUID string: accepts any 8-4-4-4-12 hex id (matching how
 * Postgres parses `uuid`), unlike the strict RFC-4122 `z.uuid()` which rejects
 * non-v4 ids. Single source for the routes that validate uuid params/bodies.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidString = z.string().regex(UUID_RE);
