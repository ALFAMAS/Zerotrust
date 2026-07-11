"use client";

import { acceptOrgInviteSchema } from "@zerotrust/shared-types";
import type { AcceptInviteInput } from "./types";

export { acceptOrgInviteSchema };

export function validateAcceptInviteInput(input: AcceptInviteInput) {
  return acceptOrgInviteSchema.safeParse(input);
}
