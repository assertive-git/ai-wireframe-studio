import type { GeneratedPage } from "./types";

// Use the same response format for generation and revision.
export const generatedPageFormat = {
  type: "json_schema" as const,
  name: "generated_page",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      html: { type: "string" },
      css: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["id", "title", "description"],
        },
      },
      note: { type: "string" },
    },
    required: ["html", "css", "sections", "note"],
  },
};

export class GeneratedPageError extends Error {}

type PageResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text: string;
  output: Array<{ type: string; content?: Array<{ type: string }> }>;
};

export function parseGeneratedPage(response: PageResponse): GeneratedPage {
  if (response.status === "incomplete") {
    throw new GeneratedPageError(
      response.incomplete_details?.reason === "max_output_tokens"
        ? "生成結果が出力上限に達しました。ページの構成を短くして、もう一度お試しください。"
        : "生成結果が途中で終了しました。内容を確認して、もう一度お試しください。"
    );
  }
  if (response.status !== "completed") {
    throw new GeneratedPageError("ページの生成が完了しませんでした。もう一度お試しください。");
  }
  if (response.output.some((item) =>
    item.type === "message" && item.content?.some((part) => part.type === "refusal")
  )) {
    throw new GeneratedPageError("この内容ではページを生成できませんでした。入力内容を変更してお試しください。");
  }

  let page: unknown;
  try {
    page = JSON.parse(response.output_text);
  } catch {
    throw new GeneratedPageError("生成結果の形式が不正です。もう一度お試しください。");
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isRecord(page) || typeof page.html !== "string" || !page.html.trim() ||
    typeof page.css !== "string" || typeof page.note !== "string" ||
    !Array.isArray(page.sections) || !page.sections.every((section: unknown) =>
      isRecord(section) && typeof section.id === "string" &&
      typeof section.title === "string" && typeof section.description === "string"
    )) {
    throw new GeneratedPageError("生成結果に必要なページ情報がありません。もう一度お試しください。");
  }
  return page as GeneratedPage;
}
