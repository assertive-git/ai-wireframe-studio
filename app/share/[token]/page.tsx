import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { previewDocument } from "@/lib/preview";

type Props = { params: Promise<{ token: string }> };

export default async function SharedPreview({ params }: Props) {
  const { token } = await params;
  const project = await prisma.project.findUnique({ where: { shareToken: token } });
  if (!project?.currentHtml || project.currentCss == null) notFound();
  const srcDoc = previewDocument(project.currentHtml, project.currentCss, false);

  return (
    <main style={{ minHeight: "100vh", background: "#e9edf3", padding: 24 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <strong>{project.name}</strong>
            <div style={{ fontSize: 12, color: "#6d7b90", marginTop: 3 }}>共有プレビュー・閲覧専用</div>
          </div>
        </div>
        <iframe
          title={project.name}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          style={{ width: "100%", minHeight: "calc(100vh - 100px)", border: "1px solid #ccd4df", background: "white", borderRadius: 10 }}
        />
      </div>
    </main>
  );
}
