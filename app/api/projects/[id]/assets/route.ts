import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import * as XLSX from "xlsx";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

function extractText(buffer: Buffer, mimeType: string, filename: string) {
  if (mimeType.includes("spreadsheet") || /\.xlsx?$/i.test(filename)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      return `# ${name}\n${csv}`;
    }).join("\n\n").slice(0, 50000);
  }
  if (mimeType.startsWith("text/") || /\.(html?|css|js|json|md|txt)$/i.test(filename)) {
    return buffer.toString("utf8").slice(0, 50000);
  }
  return null;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  const rights = String(form.get("rights") || "usable");
  if (!files.length) return NextResponse.json({ error: "No files supplied" }, { status: 400 });

  const created = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`projects/${id}/${Date.now()}-${file.name}`, bytes, { access: "public" });
      url = blob.url;
    } else {
      const dir = path.join(process.cwd(), "public", "uploads", id);
      await mkdir(dir, { recursive: true });
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${Date.now()}-${safe}`;
      await writeFile(path.join(dir, filename), bytes);
      url = `/uploads/${id}/${filename}`;
    }

    const asset = await prisma.asset.create({
      data: {
        projectId: id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        url,
        rights,
        extractedText: extractText(bytes, file.type, file.name),
      },
    });
    created.push(asset);
  }
  return NextResponse.json(created, { status: 201 });
}
