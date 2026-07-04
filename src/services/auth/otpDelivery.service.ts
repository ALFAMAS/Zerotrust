import { getLogger } from "../../logger";
import { sendEmailOTP } from "../../mfa/channels/email";

const logger = getLogger("otp-delivery");

export async function sendOTP(channel: "email", target: string, code: string) {
  if (channel === "email") {
    return sendEmailOTP(target, "Your zerotrust OTP", `Your verification code is: ${code}`);
  }
  logger.warn("Requested unsupported MFA channel", { channel });
  return false;
}
