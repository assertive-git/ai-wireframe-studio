import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOpenAI, openAIModel, parseJsonOutput } from "@/lib/openai";
import { projectTextContext } from "@/lib/project-context";
import { multimodalInput } from "@/lib/openai-input";
import type { HearingResult } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function fallbackHearing(finalRound: boolean): HearingResult {
  if (finalRound) {
    return {
      ready: true,
      assistantMessage: "初校生成に必要な情報がそろいました。未確定部分は要確認として生成できます。",
      questions: [],
      summary: {
        purpose: "LPからの問い合わせ・応募獲得",
        target: "案件概要に登録したターゲット",
        mainAppeal: "登録済みの最重要訴求",
        structureHypothesis: "FV → メリット → 詳細 → 信頼 → CTA",
        designDirection: "登録済みのデザイン方向を優先",
        unresolved: [],
      },
    };
  }
  return {
    ready: false,
    assistantMessage: "入力内容を確認しました。初校の方向性を決めるため、次の点だけ確認します。",
    summary: {
      purpose: "LPからの問い合わせ・応募獲得",
      target: "登録済みターゲット",
      mainAppeal: "登録済み訴求",
      structureHypothesis: "FV → 主なメリット → 詳細 → CTA",
      designDirection: "登録済みの方向性",
      unresolved: ["FVの優先訴求", "ユーザーの不安", "CTA直前に必要な情報"],
    },
    questions: [
      {
        id: "fv-priority",
        prompt: "ファーストビューで最優先する訴求は何ですか？",
        help: "最初に目へ入る情報の優先順位を決めます。",
        type: "text",
        required: true,
      },
      {
        id: "barriers",
        prompt: "申し込み・問い合わせを迷う最大の理由は何だと思いますか？",
        type: "multi",
        required: true,
        options: ["価格が不安", "条件が分かりにくい", "信頼できるか不安", "手続きが面倒そう"],
      },
      {
        id: "tone",
        prompt: "デザインの強さはどの程度にしますか？",
        type: "single",
        required: true,
        options: ["控えめ", "バランス重視", "インパクト重視"],
      },
    ],
  };
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const action = body.action === "continue" ? "continue" : "start";
  const answers = body.answers || {};

  const project = await prisma.project.findUnique({
    where: { id },
    include: { assets: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (action === "continue") {
    await prisma.message.create({
      data: { projectId: id, role: "user", kind: "hearing", content: JSON.stringify(answers, null, 2) },
    });
  }

  let result: HearingResult;
  if (!process.env.OPENAI_API_KEY) {
    result = fallbackHearing(action === "continue");
  } else {
    const openai = getOpenAI();
    const hearingAssets = [
      ...project.assets.filter((asset) => asset.rights === "reference"),
      ...project.assets.filter((asset) => asset.rights !== "reference"),
    ];
    const serializedAnswers = JSON.stringify(answers, null, 2).slice(0, 2_000);
    const prompt = `You are an expert Japanese LP director. Conduct a concise adaptive hearing before generating a landing-page wireframe.

${projectTextContext(project, {
  maxAssets: 6,
  maxAssetTextChars: 1_500,
  maxFieldChars: 400,
  maxMessageChars: 1_500,
})}

NEW ANSWERS
${serializedAnswers}

Return ONLY valid JSON in this exact shape:
{
  "summary": {
    "purpose": "string",
    "target": "string",
    "mainAppeal": "string",
    "structureHypothesis": "string",
    "designDirection": "string",
    "unresolved": ["string"]
  },
  "questions": [
    {"id":"kebab-case","prompt":"Japanese question","help":"optional Japanese help","type":"single|multi|text","options":["option"],"required":true}
  ],
  "ready": false,
  "assistantMessage": "short Japanese message"
}

Rules:
- Ask only questions that materially change the first draft.
- Maximum 4 questions per round.
- Do not re-ask facts already provided.
- If enough information is available, set ready=true and questions=[].
- Keep all user-facing text natural Japanese.`;

    const response = await openai.responses.create({
      model: openAIModel,
      input: multimodalInput(prompt, hearingAssets, {
        imageDetail: "low",
        maxImages: 2,
        maxPdfs: 0,
      }) as never,
      max_output_tokens: 1_500,
    });
    result = parseJsonOutput<HearingResult>(response.output_text);
  }

  await prisma.$transaction([
    prisma.message.create({
      data: { projectId: id, role: "assistant", kind: "hearing", content: result.assistantMessage },
    }),
    prisma.project.update({
      where: { id },
      data: { hearingSummary: result.summary as never, status: result.ready ? "ready" : "hearing" },
    }),
  ]);

  return NextResponse.json(result);
}
