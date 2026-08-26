import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assets: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" } },
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.pageType !== undefined ? { pageType: body.pageType } : {}),
    ...(body.concept !== undefined ? { concept: body.concept } : {}),
    ...(body.target !== undefined ? { target: body.target } : {}),
    ...(body.primaryAppeal !== undefined ? { primaryAppeal: body.primaryAppeal } : {}),
    ...(body.mustInclude !== undefined ? { mustInclude: body.mustInclude } : {}),
    ...(body.designDirections !== undefined ? { designDirections: body.designDirections } : {}),
    ...(body.referenceUrls !== undefined ? { referenceUrls: body.referenceUrls } : {}),
    ...(body.referenceMode !== undefined ? { referenceMode: body.referenceMode } : {}),
    ...(body.hearingSummary !== undefined ? { hearingSummary: body.hearingSummary } : {}),
    ...(body.currentHtml !== undefined ? { currentHtml: body.currentHtml } : {}),
    ...(body.currentCss !== undefined ? { currentCss: body.currentCss } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  };

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
