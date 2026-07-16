import { NextResponse } from "next/server";
import { requireEntitledSession } from "@/lib/session";
import { nextManagementNo } from "@/lib/db";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { companyId } = await requireEntitledSession();
    // preview=true の場合は採番せず現在値を返す
    const body = await req.json().catch(() => ({}));
    if (body?.preview) {
      const { getManagementNoSettings } = await import("@/lib/db");
      const s = await getManagementNoSettings(companyId);
      const no = `${s.prefix}-${String(s.seq).padStart(s.digits, "0")}`;
      return NextResponse.json({ no });
    }
    const no = await nextManagementNo(companyId);
    return NextResponse.json({ no });
  } catch (e) {
    console.error("[next-no]", e);
    return NextResponse.json({ error: "採番に失敗しました" }, { status: 500 });
  }
}
