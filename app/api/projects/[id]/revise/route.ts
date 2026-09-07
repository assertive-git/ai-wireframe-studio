import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOpenAI, openAIModel } from "@/lib/openai";
import { projectTextContext } from "@/lib/project-context";
import { multimodalInput } from "@/lib/openai-input";
import { generatedPageFormat, parseGeneratedPage, GeneratedPageError } from "@/lib/generated-page";
import type { GeneratedPage } from "@/lib/types";
import { sanitizeGeneratedHtml } from "@/lib/sanitize";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const instruction = String(body.instruction || "").trim();
  const sectionId = body.sectionId ? String(body.sectionId) : "";
  if (!instruction) return NextResponse.json({ error: "Instruction is required" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id },
    include: { assets: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!project?.currentHtml || project.currentCss == null) {
    return NextResponse.json({ error: "Generate the first draft first" }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required for AI revisions." }, { status: 503 });
  }

  await prisma.message.create({ data: { projectId: id, role: "user", kind: "revision", content: instruction } });

  const openai = getOpenAI();
  const usableAssets = project.assets.filter((asset) => asset.rights === "usable");
  const usableMaterialNotes = (project.usableMaterials || "").slice(0, 2_000);
  const prioritizedAssets = [
    ...usableAssets,
    ...project.assets.filter((asset) => asset.rights !== "usable"),
  ];
  const usableAssetUrls = usableAssets
    .filter((asset) => asset.mimeType.startsWith("image/"))
    .slice(0, 12)
    .map((asset) => `- ${asset.name}: ${asset.url}`)
    .join("\n");
  const prompt = `You are editing an existing Japanese LP wireframe. Make the smallest targeted change that satisfies the instruction.

${projectTextContext(project)}

TARGET SECTION: ${sectionId || "not specified / infer from instruction"}
USER INSTRUCTION: ${instruction}

CURRENT HTML:
${project.currentHtml}

CURRENT CSS:
${project.currentCss}

OUTPUT-USABLE MATERIAL NOTES / URLS:
${usableMaterialNotes || "No additional usable-material notes or URLs were supplied."}

OUTPUT-USABLE UPLOADED IMAGE URLS:
${usableAssetUrls || "No output-usable image files were uploaded."}

Return ONLY valid JSON:
{"html":"full updated body fragment","css":"full updated CSS","sections":[{"id":"...","title":"...","description":"..."}],"note":"short Japanese summary of changes"}

Rules:
- Preserve unrelated sections and copy.
- Keep data-section-id attributes stable whenever possible.
- Reference-only assets are visual guidance only and MUST NOT appear in img src attributes.
- New img src values may only use URLs explicitly listed in the two OUTPUT-USABLE sections above.
- Do not invent factual claims; unknown factual details must be 「要確認」.
- No script tags or external JS.
- Keep the result responsive.`;

  let revised: GeneratedPage;
  try {
    const response = await openai.responses.create({
      model: openAIModel,
      reasoning: { effort: "high" },
      input: multimodalInput(prompt, prioritizedAssets, {
        imageDetail: "low",
        maxImages: 1,
        maxPdfs: 0,
      }) as never,
      text: { format: generatedPageFormat },
      max_output_tokens: 24_000,
    });
    revised = parseGeneratedPage(response);
  } catch (error) {
    if (error instanceof GeneratedPageError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    // Do not expose upstream response bodies or credentials to the client.
    return NextResponse.json({ error: "AIサービスへのリクエストに失敗しました。しばらくしてからお試しください。" }, { status: 502 });
  }
  revised.html = sanitizeGeneratedHtml(revised.html);
  const last = await prisma.version.findFirst({ where: { projectId: id }, orderBy: { versionNumber: "desc" } });
  const versionNumber = (last?.versionNumber || 0) + 1;

  await prisma.$transaction([
    prisma.project.update({ where: { id }, data: { currentHtml: revised.html, currentCss: revised.css } }),
    prisma.version.create({
      data: { projectId: id, versionNumber, html: revised.html, css: revised.css, note: revised.note || instruction },
    }),
    prisma.message.create({
      data: { projectId: id, role: "assistant", kind: "revision", content: revised.note || "修正を反映しました。" },
    }),
  ]);

  return NextResponse.json({ ...revised, versionNumber });
}
