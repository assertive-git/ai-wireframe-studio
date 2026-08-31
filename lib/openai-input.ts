import type { Asset } from "@prisma/client";

type MultimodalInputOptions = {
  imageDetail?: "low" | "high";
  maxImages?: number;
  maxPdfs?: number;
};

export function multimodalInput(
  prompt: string,
  assets: Asset[],
  options: MultimodalInputOptions = {},
) {
  const imageDetail = options.imageDetail ?? "low";
  const maxImages = options.maxImages ?? 2;
  const maxPdfs = options.maxPdfs ?? 0;
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  let imageCount = 0;
  let pdfCount = 0;

  for (const asset of assets) {
    if (!/^https?:\/\//i.test(asset.url)) continue;

    if (asset.mimeType.startsWith("image/") && imageCount < maxImages) {
      content.push({ type: "input_image", image_url: asset.url, detail: imageDetail });
      imageCount += 1;
    } else if (asset.mimeType === "application/pdf" && pdfCount < maxPdfs) {
      content.push({ type: "input_file", file_url: asset.url });
      pdfCount += 1;
    }

    if (imageCount >= maxImages && pdfCount >= maxPdfs) break;
  }
  return [{ role: "user", content }];
}
