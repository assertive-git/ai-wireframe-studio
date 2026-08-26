import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fallbackPage } from "@/lib/default-page";
import { getOpenAI, openAIModel, parseJsonOutput } from "@/lib/openai";
import { projectTextContext } from "@/lib/project-context";
import { multimodalInput } from "@/lib/openai-input";
import type { GeneratedPage } from "@/lib/types";
import { sanitizeGeneratedHtml } from "@/lib/sanitize";

type Params = { params: Promise<{ id: string }> };

async function nextVersionNumber(projectId: string) {
	const last = await prisma.version.findFirst({
		where: { projectId },
		orderBy: { versionNumber: "desc" },
	});
	return (last?.versionNumber || 0) + 1;
}

export async function POST(_: Request, { params }: Params) {
	const { id } = await params;
	const project = await prisma.project.findUnique({
		where: { id },
		include: { assets: true, messages: { orderBy: { createdAt: "asc" } } },
	});
	if (!project)
		return NextResponse.json({ error: "Project not found" }, { status: 404 });

	let generated: GeneratedPage;
	if (!process.env.OPENAI_API_KEY) {
		generated = {
			...fallbackPage,
			html: fallbackPage.html
				.replace(
					"伝わるLPの<br>ファーストビュー",
					project.primaryAppeal || project.name
				)
				.replace(
					"ヒアリング内容をもとに、訴求とCTAを整理した初校を生成します。",
					project.concept || "案件内容をもとに初校を生成します。"
				),
		};
	} else {
		const openai = getOpenAI();
		const prompt = `You are a senior Japanese web designer and frontend developer. Generate the FIRST DRAFT of an editable LP wireframe based strictly on the project context.

${projectTextContext(project)}

HEARING SUMMARY
${JSON.stringify(project.hearingSummary, null, 2)}

Return ONLY valid JSON:
{
  "html":"BODY FRAGMENT ONLY",
  "css":"CSS ONLY",
  "sections":[{"id":"hero","title":"ファーストビュー","description":"..."}],
  "note":"short Japanese explanation"
}

Requirements:
- HTML must be a body fragment, no html/head/body/style/script tags.
- Every top-level editable section MUST have data-section-id="unique-id".
- Use semantic HTML and plain CSS. No JavaScript.
- Responsive mobile layout is required.
- Create a polished grayscale/low-color wireframe suitable for client review, not a finished brand design.
- Use actual copy derived from the supplied project information. Never invent factual claims, prices, dates, legal terms, awards, or campaign conditions. Mark unknown specifics as 「要確認」.
- Include all items in mustInclude.
- If an uploaded image URL is safe and marked usable, it may be used in an img tag. Reference-only material must not be copied verbatim.
- Strong CTA hierarchy and conversion-oriented structure.
- No external libraries or remote fonts.`;
		const response = await openai.responses.create({
			model: openAIModel,
			input: multimodalInput(prompt, project.assets) as never,
		});
		generated = parseJsonOutput<GeneratedPage>(response.output_text);
	}

	generated.html = sanitizeGeneratedHtml(generated.html);

	const versionNumber = await nextVersionNumber(id);
	await prisma.$transaction([
		prisma.project.update({
			where: { id },
			data: {
				currentHtml: generated.html,
				currentCss: generated.css,
				status: "workspace",
			},
		}),
		prisma.version.create({
			data: {
				projectId: id,
				versionNumber,
				html: generated.html,
				css: generated.css,
				note: generated.note || "初校生成",
			},
		}),
		prisma.message.create({
			data: {
				projectId: id,
				role: "assistant",
				kind: "generation",
				content: generated.note || "初校を生成しました。",
			},
		}),
	]);

	return NextResponse.json({ ...generated, versionNumber });
}
