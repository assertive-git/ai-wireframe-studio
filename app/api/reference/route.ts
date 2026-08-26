import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

function assertSafePublicUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are supported.");
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" || h === "::1" || h.startsWith("127.") || h.startsWith("10.") ||
    h.startsWith("192.168.") || h.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) throw new Error("Private/local URLs are not allowed.");
  return url;
}

export async function POST(request: Request) {
  const body = await request.json();
  const projectId = String(body.projectId || "");
  const url = assertSafePublicUrl(String(body.url || ""));
  const rights = String(body.rights || "reference");

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1440, height: 1000 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout: 40000 });
    const title = await page.title();
    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 40000));
    const screenshot = Buffer.from(await page.screenshot({ fullPage: true, type: "png" }));

    let screenshotUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`projects/${projectId}/references/${Date.now()}.png`, screenshot, { access: "public" });
      screenshotUrl = blob.url;
    } else {
      const dir = path.join(process.cwd(), "public", "uploads", projectId);
      await mkdir(dir, { recursive: true });
      const filename = `${Date.now()}-reference.png`;
      await writeFile(path.join(dir, filename), screenshot);
      screenshotUrl = `/uploads/${projectId}/${filename}`;
    }

    const asset = await prisma.asset.create({
      data: {
        projectId,
        name: title || url.hostname,
        mimeType: "image/png",
        url: screenshotUrl,
        rights,
        sourceUrl: url.toString(),
        extractedText: pageText,
      },
    });
    return NextResponse.json(asset, { status: 201 });
  } finally {
    await browser.close();
  }
}
