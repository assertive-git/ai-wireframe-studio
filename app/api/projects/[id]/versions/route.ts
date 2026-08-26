import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  if (body.action === "restore") {
    const version = await prisma.version.findFirst({ where: { id: body.versionId, projectId: id } });
    if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const last = await prisma.version.findFirst({ where: { projectId: id }, orderBy: { versionNumber: "desc" } });
    const restoredNumber = (last?.versionNumber || 0) + 1;
    await prisma.$transaction([
      prisma.project.update({ where: { id }, data: { currentHtml: version.html, currentCss: version.css } }),
      prisma.version.create({
        data: {
          projectId: id,
          versionNumber: restoredNumber,
          html: version.html,
          css: version.css,
          note: `Ver.${version.versionNumber} を復元`,
        },
      }),
    ]);
    return NextResponse.json({ html: version.html, css: version.css, versionNumber: restoredNumber });
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project?.currentHtml || project.currentCss == null) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }
  const last = await prisma.version.findFirst({ where: { projectId: id }, orderBy: { versionNumber: "desc" } });
  const version = await prisma.version.create({
    data: {
      projectId: id,
      versionNumber: (last?.versionNumber || 0) + 1,
      html: project.currentHtml,
      css: project.currentCss,
      note: body.note || "手動保存",
    },
  });
  return NextResponse.json(version, { status: 201 });
}
