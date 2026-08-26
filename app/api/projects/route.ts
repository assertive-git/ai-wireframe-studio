import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      pageType: true,
      status: true,
      currentHtml: true,
      updatedAt: true,
      _count: { select: { versions: true, assets: true } },
    },
  });
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const project = await prisma.project.create({
    data: {
      name: body.name?.trim() || "無題のLP",
      pageType: body.pageType || "キャンペーンLP",
      concept: body.concept || "",
      target: body.target || "",
      primaryAppeal: body.primaryAppeal || "",
      mustInclude: body.mustInclude || "",
      designDirections: Array.isArray(body.designDirections) ? body.designDirections : [],
      referenceUrls: Array.isArray(body.referenceUrls) ? body.referenceUrls : [],
      referenceMode: body.referenceMode || "参考にしながらオリジナルをつくる",
      status: "hearing",
    },
  });
  return NextResponse.json(project, { status: 201 });
}
