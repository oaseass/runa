import { X509Certificate, createVerify } from "node:crypto";
import tls from "node:tls";
import type { SkuId } from "@/lib/products";

export const APPLE_TO_SKU: Record<string, SkuId> = {
  "com.luna.vip.monthly": "vip_monthly",
  "com.luna.vip.yearly": "vip_yearly",
  "com.luna.report.annual": "annual_report",
  "com.luna.report.area": "area_reading",
  "com.luna.void.single": "void_single",
  "com.luna.void.pack5": "void_pack_5",
  "com.luna.void.pack3": "void_pack_3",
  "com.luna.void.pack10": "void_pack_10",
};

type AppleJwsHeader = {
  alg?: string;
  x5c?: string[];
};

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function getTrustedAppleRoots(): X509Certificate[] {
  return tls.rootCertificates
    .map((pem) => {
      try {
        return new X509Certificate(pem);
      } catch {
        return null;
      }
    })
    .filter((certificate): certificate is X509Certificate => {
      return !!certificate && certificate.subject.includes("CN=Apple Root CA");
    });
}

function isTrustedAppleCertificateChain(chain: X509Certificate[]): boolean {
  if (chain.length === 0) {
    return false;
  }

  for (let index = 0; index < chain.length - 1; index += 1) {
    const certificate = chain[index];
    const issuer = chain[index + 1];

    if (certificate.issuer !== issuer.subject || !certificate.verify(issuer.publicKey)) {
      return false;
    }
  }

  const lastCertificate = chain[chain.length - 1];
  const trustedRoots = getTrustedAppleRoots();

  for (const root of trustedRoots) {
    const exactRoot = lastCertificate.fingerprint256 === root.fingerprint256;
    const issuedByRoot = lastCertificate.issuer === root.subject && lastCertificate.verify(root.publicKey);
    if (exactRoot || issuedByRoot) {
      return true;
    }
  }

  return false;
}

export function decodeJwsPayload<T = Record<string, unknown>>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return null;
  }

  return decodeBase64UrlJson<T>(parts[1]);
}

export function verifyAppleSignedPayload<T = Record<string, unknown>>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson<AppleJwsHeader>(encodedHeader);
  if (!header || header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length === 0) {
    return null;
  }

  let certificateChain: X509Certificate[];
  try {
    certificateChain = header.x5c.map((certificate) => new X509Certificate(Buffer.from(certificate, "base64")));
  } catch {
    return null;
  }

  if (!isTrustedAppleCertificateChain(certificateChain)) {
    return null;
  }

  const verifier = createVerify("SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const signature = Buffer.from(encodedSignature, "base64url");
  const validSignature = verifier.verify(
    { key: certificateChain[0].publicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );

  if (!validSignature) {
    return null;
  }

  return decodeBase64UrlJson<T>(encodedPayload);
}