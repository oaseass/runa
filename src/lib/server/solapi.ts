import crypto from "node:crypto";

export class SolapiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SolapiError";
    this.status = status;
  }
}

type SolapiMessageResult = {
  statusCode?: string;
  statusMessage?: string;
  to?: string;
};

type SolapiSendResponse = {
  to?: string;
  from?: string;
  type?: string;
  statusCode?: string;
  statusMessage?: string;
  accountId?: string;
  messageId?: string;
  groupId?: string;
  status?: string;
  successCount?: number;
  errorCount?: number;
  messages?: SolapiMessageResult[];
};

function getConfig() {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !sender) {
    throw new SolapiError("SOLAPI credentials are not configured", 500);
  }

  return { apiKey, apiSecret, sender };
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeKrNumber(value: string) {
  const digits = digitsOnly(value);

  if (digits.startsWith("82")) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

function createAuthorization(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${date}${salt}`)
    .digest("hex");

  return {
    date,
    salt,
    signature,
    header: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
  };
}

export async function sendOtpMessage(payload: { to: string; otpCode: string }) {
  const { apiKey, apiSecret, sender } = getConfig();
  const auth = createAuthorization(apiKey, apiSecret);
  const normalizedTo = normalizeKrNumber(payload.to);
  const normalizedFrom = digitsOnly(sender);

  if (!normalizedTo || !normalizedFrom) {
    throw new SolapiError("SOLAPI sender/recipient format is invalid", 400);
  }

  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      Authorization: auth.header,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        to: normalizedTo,
        from: normalizedFrom,
        text: `[LUNA] Verification code: ${payload.otpCode}`,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SolapiError(`SOLAPI send failed (${response.status}): ${text}`, response.status);
  }

  const data = (await response.json()) as SolapiSendResponse;
  const successCount = data.successCount ?? 0;
  const errorCount = data.errorCount ?? 0;
  const acceptedStatusCode = data.statusCode === "2000";
  const acceptedSingleMessage = Boolean(data.messageId) && errorCount === 0;

  if ((!acceptedStatusCode && successCount < 1 && !acceptedSingleMessage) || errorCount > 0) {
    const firstError = data.messages?.find((item) => item.statusCode && item.statusCode !== "2000");
    const reason = firstError?.statusMessage || data.statusMessage || "Provider accepted request but message was not queued";
    throw new SolapiError(`SOLAPI delivery rejected: ${reason}`, 400);
  }

  return {
    messageId: data.messageId ?? null,
    groupId: data.groupId ?? null,
    status: data.status ?? null,
  };
}
