import { z } from "zod";

export const UserRoleSchema = z.enum(["student", "instructor", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;
