import type { Asset, Message, Project } from "@prisma/client";

type ProjectTextContextOptions = {
  complete?: boolean;
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
  const maxAssets = options.complete ? Infinity : (options.maxAssets ?? 8);
  const maxAssetTextChars = options.complete ? Infinity : (options.maxAssetTextChars ?? 2_000);
  const maxFieldChars = options.complete ? Infinity : (options.maxFieldChars ?? 600);
  const maxMessageChars = options.complete ? Infinity : (options.maxMessageChars ?? 2_000);
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
        `Asset: ${clip(asset.name, options.complete ? Infinity : 300)} (${clip(asset.mimeType, options.complete ? Infinity : 100)})`,
        `Rights: ${clip(asset.rights, options.complete ? Infinity : 100)}`,
        `Asset URL: ${clip(asset.url, options.complete ? Infinity : 1_000)}`,
        asset.sourceUrl ? `Source URL: ${clip(asset.sourceUrl, options.complete ? Infinity : 1_000)}` : "",
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
Usable materials: ${clip(project.usableMaterials, maxFieldChars)}

ASSETS
${assets || "No uploaded assets yet."}${omittedAssets ? `\n${omittedAssets} additional asset(s) omitted from this request.` : ""}

RECENT HEARING / CHAT
${messages || "No messages yet."}
`.trim();
}
