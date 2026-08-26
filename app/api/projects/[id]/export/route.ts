import JSZip from "jszip";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { assets: true },
  });
  if (!project?.currentHtml || project.currentCss == null) {
    return NextResponse.json({ error: "Nothing to export" }, { status: 400 });
  }

  const zip = new JSZip();
  zip.file(
    "index.html",
    `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="stylesheet" href="style.css">\n<title>${project.name}</title>\n</head>\n<body>\n${project.currentHtml}\n</body>\n</html>`
  );
  zip.file("style.css", project.currentCss);
  zip.file(
    "README.txt",
    `Exported from LP Wireframe Studio\nProject: ${project.name}\n\nAsset URLs used by the wireframe are left as URLs. Download/replace them before final production if needed.`
  );
  const buffer = await zip.generateAsync({ type: "arraybuffer" })
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="lp-${id}.zip"`,
    },
  });
}
