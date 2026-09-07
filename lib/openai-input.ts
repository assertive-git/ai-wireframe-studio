import type { Asset } from "@prisma/client";
import type { ResponseInput, ResponseInputContent } from "openai/resources/responses/responses";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

type MultimodalInputOptions = {
  imageDetail?: "low" | "high";
  maxImages?: number;
  maxPdfs?: number;
};

function assetLabel(asset: Asset) {
  return JSON.stringify({
    assetId: asset.id,
    name: asset.name,
    rights: asset.rights,
    originalUrl: asset.url,
    sourceUrl: asset.sourceUrl,
    usage: asset.rights === "usable"
      ? "Approved material. Use originalUrl in HTML when appropriate, never the transport data URL."
      : "Reference only. Study layout/style; never embed this image or copy its factual claims.",
  });
}

// Existing hearing/revision callers retain their synchronous interface and budgets.
export function multimodalInput(
  prompt: string,
  assets: Asset[],
  options: MultimodalInputOptions = {},
): ResponseInput {
  const imageDetail = options.imageDetail ?? "low";
  const maxImages = options.maxImages ?? 2;
  const maxPdfs = options.maxPdfs ?? 0;
  const content: ResponseInputContent[] = [{ type: "input_text", text: prompt }];
  let imageCount = 0;
  let pdfCount = 0;

  for (const asset of assets) {
    if (!/^https?:\/\//i.test(asset.url)) continue;
    if (asset.mimeType.startsWith("image/") && imageCount < maxImages) {
      content.push({ type: "input_text", text: assetLabel(asset) });
      content.push({ type: "input_image", image_url: asset.url, detail: imageDetail });
      imageCount += 1;
    } else if (asset.mimeType === "application/pdf" && pdfCount < maxPdfs) {
      content.push({ type: "input_text", text: assetLabel(asset) });
      content.push({ type: "input_file", file_url: asset.url });
      pdfCount += 1;
    }
    if (imageCount >= maxImages && pdfCount >= maxPdfs) break;
  }
  return [{ role: "user", content }];
}

// Alternate references and usable assets so neither group crowds the other out.
export function selectGenerationAssets(assets: Asset[], maxImages = 8, maxPdfs = 3) {
  const balanced = (items: Asset[], limit: number) => {
    const references = items.filter((asset) => asset.rights !== "usable");
    const usable = items.filter((asset) => asset.rights === "usable");
    const selected: Asset[] = [];
    for (let i = 0; i < Math.max(references.length, usable.length) && selected.length < limit; i++) {
      if (references[i] && selected.length < limit) selected.push(references[i]);
      if (usable[i] && selected.length < limit) selected.push(usable[i]);
    }
    return selected;
  };
  return [
    ...balanced(assets.filter((asset) => asset.mimeType.startsWith("image/")), maxImages),
    ...balanced(assets.filter((asset) => asset.mimeType === "application/pdf"), maxPdfs),
  ];
}

async function localAssetData(asset: Asset): Promise<string> {
  // Only resolve files inside this project's upload directory, including symlink checks.
  const projectRoot = path.resolve(process.cwd(), "public", "uploads", asset.projectId);
  const filename = path.resolve(process.cwd(), "public", `.${decodeURIComponent(asset.url)}`);
  if (!filename.startsWith(projectRoot + path.sep)) throw new Error("Invalid local asset path");
  const [resolvedRoot, resolvedFile] = await Promise.all([realpath(projectRoot), realpath(filename)]);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) throw new Error("Invalid local asset path");
  const bytes = await readFile(resolvedFile);
  return `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
}

export async function generationInput(prompt: string, assets: Asset[]): Promise<{
  input: ResponseInput;
  warnings: string[];
}> {
  const selected = selectGenerationAssets(assets);
  const selectedIds = new Set(selected.map((asset) => asset.id));
  const omitted = assets.filter((asset) =>
    (asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf") &&
    !selectedIds.has(asset.id)
  );
  const warnings: string[] = omitted.length
    ? [`画像は最大8件、PDFは最大3件を参照しました。未添付: ${omitted.map((asset) => asset.name).join("、")}（保存済みの抽出テキストは送信済み）。`]
    : [];
  const content: ResponseInputContent[] = [{ type: "input_text", text: prompt }];
  for (const asset of selected) {
    let url = asset.url;
    if (url.startsWith("/uploads/")) {
      try {
        url = await localAssetData(asset);
      } catch {
        // Do not silently generate a page without the selected reference.
        throw new Error(`資料「${asset.name}」を読み込めませんでした。ファイルを再アップロードしてください。`);
      }
    } else if (!/^https?:\/\//i.test(url)) {
      throw new Error(`資料「${asset.name}」のURL形式に対応していません。ファイルを再アップロードしてください。`);
    }
    content.push({ type: "input_text", text: assetLabel(asset) });
    if (asset.mimeType.startsWith("image/")) {
      content.push({ type: "input_image", image_url: url, detail: "high" });
    } else {
      content.push(url.startsWith("data:")
        ? { type: "input_file", filename: asset.name, file_data: url }
        : { type: "input_file", file_url: url });
    }
  }
  if (omitted.length) {
    content.push({ type: "input_text", text: `ATTACHMENT COVERAGE: These files were NOT attached visually: ${JSON.stringify(omitted.map((asset) => ({ id: asset.id, name: asset.name })))}. Only their saved extracted text, if supplied in the context, is available. Do not claim to have visually inspected them.` });
  }
  return { input: [{ role: "user", content }], warnings };
}
