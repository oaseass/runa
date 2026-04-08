import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/server/admin-session";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";
import { getAuthStorageSyncStatus } from "@/lib/server/auth-storage-sync";

export async function GET() {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;

  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getAuthStorageSyncStatus();
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("[admin/auth-storage/status]", error);
    return NextResponse.json({ error: "인증 저장소 상태를 읽지 못했어요." }, { status: 500 });
  }
}