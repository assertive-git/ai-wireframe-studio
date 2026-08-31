import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOpenAI, openAIModel, parseJsonOutput } from "@/lib/openai";
import { projectTextContext } from "@/lib/project-context";
import { multimodalInput } from "@/lib/openai-input";
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
  const prompt = `You are editing an existing Japanese LP wireframe. Make the smallest targeted change that satisfies the instruction.

${projectTextContext(project)}

TARGET SECTION: ${sectionId || "not specified / infer from instruction"}
USER INSTRUCTION: ${instruction}

CURRENT HTML:
${project.currentHtml}

CURRENT CSS:
${project.currentCss}

Return ONLY valid JSON:
{"html":"full updated body fragment","css":"full updated CSS","sections":[{"id":"...","title":"...","description":"..."}],"note":"short Japanese summary of changes"}

Rules:
- Preserve unrelated sections and copy.
- Keep data-section-id attributes stable whenever possible.
- Do not invent factual claims; unknown factual details must be 「要確認」.
- No script tags or external JS.
- Keep the result responsive.`;

  const response = await openai.responses.create({
    model: openAIModel,
    input: multimodalInput(prompt, project.assets, {
      imageDetail: "low",
      maxImages: 1,
      maxPdfs: 0,
    }) as never,
    max_output_tokens: 6_000,
  });
  const revised = parseJsonOutput<GeneratedPage>(response.output_text);
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
