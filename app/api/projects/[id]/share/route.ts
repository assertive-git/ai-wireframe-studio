import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const token = body.enabled === false ? null : randomBytes(18).toString("base64url");
  const project = await prisma.project.update({ where: { id }, data: { shareToken: token } });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return NextResponse.json({ token: project.shareToken, url: token ? `${origin}/share/${token}` : null });
}
