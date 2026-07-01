import { getLogger } from "../logger";
import { sendEmailOTP } from "./channels/email";

const logger = getLogger("mfa");

export async function sendOTP(
  channel: "email",
  target: string,
  code: string
) {
  if (channel === "email") {
    return sendEmailOTP(target, "Your zerotrust OTP", `Your verification code is: ${code}`);
  }
  logger.warn("Requested unsupported MFA channel", { channel });
  return false;
}
