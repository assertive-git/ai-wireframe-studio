import type { Asset } from "@prisma/client";

export function multimodalInput(prompt: string, assets: Asset[]) {
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  for (const asset of assets.slice(0, 12)) {
    if (!/^https?:\/\//i.test(asset.url)) continue;
    if (asset.mimeType.startsWith("image/")) {
      content.push({ type: "input_image", image_url: asset.url, detail: "auto" });
    } else if (asset.mimeType === "application/pdf") {
      content.push({ type: "input_file", file_url: asset.url });
    }
  }
  return [{ role: "user", content }];
}
