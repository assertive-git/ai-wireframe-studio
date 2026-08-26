import type { Asset, Message, Project } from "@prisma/client";

export function projectTextContext(
  project: Project & { assets?: Asset[]; messages?: Message[] },
) {
  const assets = (project.assets || []).
    map((asset) =>
      [
        `Asset: ${asset.name} (${asset.mimeType})`,
        `Rights: ${asset.rights}`,
        `Asset URL: ${asset.url}`,
        asset.sourceUrl ? `Source URL: ${asset.sourceUrl}` : "",
        asset.extractedText ? `Extracted text:\n${asset.extractedText.slice(0, 12000)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const messages = (project.messages || [])
    .slice(-20)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return `
PROJECT
Name: ${project.name}
Page type: ${project.pageType}
Concept: ${project.concept}
Target: ${project.target}
Primary appeal: ${project.primaryAppeal}
Must include: ${project.mustInclude}
Design directions: ${JSON.stringify(project.designDirections)}
Reference URLs: ${JSON.stringify(project.referenceUrls)}
Reference mode: ${project.referenceMode}

ASSETS
${assets || "No uploaded assets yet."}

RECENT HEARING / CHAT
${messages || "No messages yet."}
`.trim();
}
