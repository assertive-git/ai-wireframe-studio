import type { Asset, Message, Project } from "@prisma/client";

type ProjectTextContextOptions = {
  maxAssets?: number;
  maxAssetTextChars?: number;
  maxFieldChars?: number;
  maxMessageChars?: number;
};

function clip(value: unknown, maxChars: number) {
  const text = String(value ?? "");
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const suffix = "\n[truncated]";
  if (maxChars <= suffix.length) return text.slice(0, maxChars);
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

export function projectTextContext(
  project: Project & { assets?: Asset[]; messages?: Message[] },
  options: ProjectTextContextOptions = {},
) {
  const maxAssets = options.maxAssets ?? 8;
  const maxAssetTextChars = options.maxAssetTextChars ?? 2_000;
  const maxFieldChars = options.maxFieldChars ?? 600;
  const maxMessageChars = options.maxMessageChars ?? 2_000;
  const allAssets = project.assets || [];
  let remainingAssetText = maxAssetTextChars;

  const assets = allAssets
    .slice(0, maxAssets)
    .map((asset) => {
      const extractedText = asset.extractedText
        ? clip(asset.extractedText, remainingAssetText)
        : "";
      remainingAssetText = Math.max(0, remainingAssetText - extractedText.length);

      return [
        `Asset: ${clip(asset.name, 300)} (${clip(asset.mimeType, 100)})`,
        `Rights: ${clip(asset.rights, 100)}`,
        `Asset URL: ${clip(asset.url, 1_000)}`,
        asset.sourceUrl ? `Source URL: ${clip(asset.sourceUrl, 1_000)}` : "",
        extractedText ? `Extracted text:\n${extractedText}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const omittedAssets = Math.max(0, allAssets.length - maxAssets);

  const selectedMessages: string[] = [];
  let remainingMessageChars = maxMessageChars;
  const allMessages = project.messages || [];
  for (let index = allMessages.length - 1; index >= 0 && remainingMessageChars > 0; index -= 1) {
    const message = allMessages[index];
    const formatted = `${message.role.toUpperCase()}: ${message.content}`;
    const clipped = clip(formatted, remainingMessageChars);
    selectedMessages.push(clipped);
    remainingMessageChars -= clipped.length;
  }

  const messages = selectedMessages.reverse().join("\n");

  return `
PROJECT
Name: ${clip(project.name, maxFieldChars)}
Page type: ${clip(project.pageType, maxFieldChars)}
Concept: ${clip(project.concept, maxFieldChars)}
Target: ${clip(project.target, maxFieldChars)}
Primary appeal: ${clip(project.primaryAppeal, maxFieldChars)}
Must include: ${clip(project.mustInclude, maxFieldChars)}
Design directions: ${clip(JSON.stringify(project.designDirections), maxFieldChars)}
Reference URLs: ${clip(JSON.stringify(project.referenceUrls), maxFieldChars)}
Reference mode: ${clip(project.referenceMode, maxFieldChars)}

ASSETS
${assets || "No uploaded assets yet."}${omittedAssets ? `\n${omittedAssets} additional asset(s) omitted from this request.` : ""}

RECENT HEARING / CHAT
${messages || "No messages yet."}
`.trim();
}
