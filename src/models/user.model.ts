// Forwarding module — user records are now stored in PostgreSQL via Drizzle
export { usersTable as UserModel } from "../db/schema";
export type { User as UserDocument } from "../shared/types";
