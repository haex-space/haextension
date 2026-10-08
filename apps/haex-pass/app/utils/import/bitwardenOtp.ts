// Parse OTP data from Bitwarden TOTP field
interface ParsedOtp {
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

export function parseOtpData(totp: string | null | undefined): ParsedOtp | null {
  if (!totp) return null;

  // Check if it's an otpauth:// URI
  if (totp.startsWith("otpauth://")) {
    try {
      const url = new URL(totp);
      const secret = url.searchParams.get("secret");
      if (!secret) return null;

      return {
        secret: secret.toUpperCase(),
        digits: parseInt(url.searchParams.get("digits") || "6", 10),
        period: parseInt(url.searchParams.get("period") || "30", 10),
        algorithm: (url.searchParams.get("algorithm") || "SHA1").toUpperCase(),
      };
    } catch {
      return null;
    }
  }

  // Plain secret
  return {
    secret: totp.toUpperCase(),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  };
}
