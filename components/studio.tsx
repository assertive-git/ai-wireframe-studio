"use client";

import {
	ChangeEvent,
	Dispatch,
	FormEvent,
	SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { previewDocument } from "@/lib/preview";
import type { HearingQuestion, HearingResult } from "@/lib/types";

type Asset = {
	id: string;
	name: string;
	mimeType: string;
	url: string;
	rights: string;
	sourceUrl?: string | null;
	createdAt: string;
};

type Message = {
	id: string;
	role: string;
	content: string;
	kind: string;
	createdAt: string;
};

type Version = {
	id: string;
	versionNumber: number;
	html: string;
	css: string;
	note?: string | null;
	createdAt: string;
};

type Project = {
	id: string;
	name: string;
	pageType: string;
	concept: string;
	target: string;
	primaryAppeal: string;
	mustInclude: string;
	designDirections: string[];
	referenceUrls: string[];
	referenceMode: string;
	hearingSummary?: HearingResult["summary"] | null;
	currentHtml?: string | null;
	currentCss?: string | null;
	status: string;
	shareToken?: string | null;
	updatedAt: string;
	assets: Asset[];
	messages: Message[];
	versions: Version[];
};

type ProjectListItem = Pick<
	Project,
	"id" | "name" | "pageType" | "status" | "updatedAt"
> & {
	currentHtml?: string | null;
	_count: { versions: number; assets: number };
};

type View =
	| "dashboard"
	| "intake"
	| "hearing"
	| "generating"
	| "workspace"
	| "settings";

type Intake = {
	name: string;
	pageType: string;
	concept: string;
	target: string;
	primaryAppeal: string;
	mustInclude: string;
	designDirections: string[];
	referenceText: string;
	referenceMode: string;
};

const initialIntake: Intake = {
	name: "",
	pageType: "キャンペーンLP",
	concept: "",
	target: "",
	primaryAppeal: "",
	mustInclude: "",
	designDirections: ["明るい", "シンプル"],
	referenceText: "",
	referenceMode: "参考にしながらオリジナルをつくる",
};

const directionOptions = [
	"明るい",
	"スポーティ",
	"高級感",
	"親しみやすい",
	"シンプル",
	"写真中心",
];

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const data = await response.json().catch(() => ({}));
	if (!response.ok)
		throw new Error(data.error || `Request failed: ${response.status}`);
	return data as T;
}

function dateLabel(raw: string) {
	const date = new Date(raw);
	return date.toLocaleString("ja-JP", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function projectStatus(status: string) {
	if (status === "workspace") return "修正中";
	if (status === "ready") return "初校生成待ち";
	if (status === "hearing") return "ヒアリング中";
	return "作成中";
}

function extractSections(html: string) {
	if (typeof window === "undefined" || !html)
		return [] as Array<{ id: string; title: string; description: string }>;
	const documentNode = new DOMParser().parseFromString(
		`<div id="root">${html}</div>`,
		"text/html"
	);
	return [...documentNode.querySelectorAll("[data-section-id]")].map(
		(element, index) => {
			const heading = element.querySelector("h1,h2,h3,h4");
			return {
				id: element.getAttribute("data-section-id") || `section-${index + 1}`,
				title:
					heading?.textContent?.trim().slice(0, 30) ||
					`セクション ${index + 1}`,
				description: element.tagName.toLowerCase(),
			};
		}
	);
}

export default function Studio() {
	const [view, setView] = useState<View>("dashboard");
	const [projects, setProjects] = useState<ProjectListItem[]>([]);
	const [project, setProject] = useState<Project | null>(null);
	const [intake, setIntake] = useState<Intake>(initialIntake);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [hearing, setHearing] = useState<HearingResult | null>(null);
	const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
	const [statusText, setStatusText] = useState("● 待機中");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [codeOpen, setCodeOpen] = useState(false);
	const [inlineEditing, setInlineEditing] = useState(false);
	const [html, setHtml] = useState("");
	const [css, setCss] = useState("");
	const [selectedSection, setSelectedSection] = useState<string>("");
	const [leftTab, setLeftTab] = useState<"outline" | "assets" | "refs">(
		"outline"
	);
	const [rightTab, setRightTab] = useState<"chat" | "versions">("chat");
	const [revision, setRevision] = useState("");
	const [freeText, setFreeText] = useState("");
	const [referenceUrl, setReferenceUrl] = useState("");
	const [specOpen, setSpecOpen] = useState(false);
	const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const sections = useMemo(() => extractSections(html), [html]);
	const preview = useMemo(
		() => previewDocument(html, css, inlineEditing),
		[html, css, inlineEditing]
	);

	async function loadProjects() {
		const list = await jsonFetch<ProjectListItem[]>("/api/projects");
		setProjects(list);
	}

	async function loadProject(id: string) {
		const data = await jsonFetch<Project>(`/api/projects/${id}`);
		setProject(data);
		setHtml(data.currentHtml || "");
		setCss(data.currentCss || "");
		return data;
	}

	useEffect(() => {
		loadProjects().catch((e) => setError(e.message));
	}, []);

	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === "lp-section-selected")
				setSelectedSection(String(event.data.id || ""));
			if (
				event.data?.type === "lp-inline-update" &&
				typeof event.data.html === "string"
			)
				setHtml(event.data.html);
		};
		window.addEventListener("message", listener);
		return () => window.removeEventListener("message", listener);
	}, []);

	useEffect(() => {
		if (!project || view !== "workspace" || !html) return;
		if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		setStatusText("● 保存中...");
		autosaveTimer.current = setTimeout(async () => {
			try {
				await jsonFetch(`/api/projects/${project.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ currentHtml: html, currentCss: css }),
				});
				setStatusText("● 保存済み");
			} catch {
				setStatusText("● 保存エラー");
			}
		}, 900);
		return () => {
			if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		};
	}, [html, css, project?.id, view]);

	function flash(text: string) {
		setStatusText(`● ${text}`);
		setTimeout(() => setStatusText("● 保存済み"), 1800);
	}

	function resetNewProject() {
		setIntake(initialIntake);
		setPendingFiles([]);
		setProject(null);
		setHearing(null);
		setAnswers({});
		setHtml("");
		setCss("");
		setError("");
		setView("intake");
	}

	async function openExisting(id: string) {
		try {
			setBusy(true);
			setError("");
			const data = await loadProject(id);
			if (data.currentHtml) {
				setView("workspace");
			} else {
				setView("hearing");
				await startHearing(data.id);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
		} finally {
			setBusy(false);
		}
	}

	function toggleDirection(value: string) {
		setIntake((current) => ({
			...current,
			designDirections: current.designDirections.includes(value)
				? current.designDirections.filter((item) => item !== value)
				: [...current.designDirections, value],
		}));
	}

	function onFiles(event: ChangeEvent<HTMLInputElement>) {
		setPendingFiles([...pendingFiles, ...Array.from(event.target.files || [])]);
		event.target.value = "";
	}

	async function uploadFiles(
		projectId: string,
		files: File[],
		rights = "usable"
	) {
		if (!files.length) return;
		const form = new FormData();
		files.forEach((file) => form.append("files", file));
		form.append("rights", rights);
		const response = await fetch(`/api/projects/${projectId}/assets`, {
			method: "POST",
			body: form,
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok)
			throw new Error(data.error || "ファイルのアップロードに失敗しました。");
	}

	function parseReferenceUrls(text: string) {
		return text
			.split(/\s+/)
			.map((item) => item.trim().replace(/[、,]$/, ""))
			.filter((item) => /^https?:\/\//i.test(item));
	}

	async function captureReference(projectId: string, url: string) {
		return jsonFetch<Asset>("/api/reference", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ projectId, url, rights: "reference" }),
		});
	}

	async function createProject(event: FormEvent) {
		event.preventDefault();
		if (!intake.name.trim() || !intake.concept.trim()) {
			setError("案件名と「今回つくりたいもの・構想」は入力してください。");
			return;
		}
		setBusy(true);
		setError("");
		try {
			const referenceUrls = parseReferenceUrls(intake.referenceText);
			const created = await jsonFetch<Project>("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...intake, referenceUrls }),
			});
			setProject({ ...created, assets: [], messages: [], versions: [] });
			flash("案件を作成しました");

			if (pendingFiles.length) await uploadFiles(created.id, pendingFiles);
			for (const url of referenceUrls.slice(0, 3)) {
				try {
					await captureReference(created.id, url);
				} catch (e) {
					console.warn("Reference capture failed", e);
				}
			}
			await loadProject(created.id);
			setView("hearing");
			await startHearing(created.id);
			await loadProjects();
		} catch (e) {
			setError(e instanceof Error ? e.message : "案件作成に失敗しました。");
		} finally {
			setBusy(false);
		}
	}

	async function startHearing(projectId = project?.id) {
		if (!projectId) return;
		setBusy(true);
		try {
			const result = await jsonFetch<HearingResult>(
				`/api/projects/${projectId}/hearing`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "start" }),
				}
			);
			setHearing(result);
			setAnswers({});
			await loadProject(projectId);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "AIヒアリングを開始できませんでした。"
			);
		} finally {
			setBusy(false);
		}
	}

	function answerQuestion(question: HearingQuestion, value: string) {
		setAnswers((current) => {
			if (question.type === "multi") {
				const selected = Array.isArray(current[question.id])
					? (current[question.id] as string[])
					: [];
				return {
					...current,
					[question.id]: selected.includes(value)
						? selected.filter((item) => item !== value)
						: [...selected, value],
				};
			}
			return { ...current, [question.id]: value };
		});
	}

	function hearingCompleteEnough() {
		if (!hearing) return false;
		return hearing.questions.every((question) => {
			if (!question.required) return true;
			const value = answers[question.id];
			return Array.isArray(value)
				? value.length > 0
				: Boolean(String(value || "").trim());
		});
	}

	async function continueHearing(
		extraAnswers?: Record<string, string | string[]>
	) {
		if (!project) return;
		const payload = { ...answers, ...(extraAnswers || {}) };
		if (!extraAnswers && !hearingCompleteEnough()) {
			setError("必須の質問に回答してください。");
			return;
		}
		setBusy(true);
		setError("");
		try {
			const result = await jsonFetch<HearingResult>(
				`/api/projects/${project.id}/hearing`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "continue", answers: payload }),
				}
			);
			setHearing(result);
			setAnswers({});
			setFreeText("");
			await loadProject(project.id);
			flash("ヒアリングを保存しました");
		} catch (e) {
			setError(e instanceof Error ? e.message : "回答を送信できませんでした。");
		} finally {
			setBusy(false);
		}
	}

	async function generateDraft() {
		if (!project) return;
		setView("generating");
		setBusy(true);
		setError("");
		try {
			const result = await jsonFetch<{
				html: string;
				css: string;
				note: string;
				versionNumber: number;
			}>(`/api/projects/${project.id}/generate`, { method: "POST" });
			setHtml(result.html);
			setCss(result.css);
			await loadProject(project.id);
			await loadProjects();
			setView("workspace");
			flash(`初校 Ver.${result.versionNumber} を生成しました`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "初校生成に失敗しました。");
			setView("hearing");
		} finally {
			setBusy(false);
		}
	}

	async function revise() {
		if (!project || !revision.trim()) return;
		setBusy(true);
		setError("");
		try {
			const result = await jsonFetch<{
				html: string;
				css: string;
				note: string;
				versionNumber: number;
			}>(`/api/projects/${project.id}/revise`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					instruction: revision,
					sectionId: selectedSection || undefined,
				}),
			});
			setHtml(result.html);
			setCss(result.css);
			setRevision("");
			await loadProject(project.id);
			flash(`AI修正 Ver.${result.versionNumber} を反映しました`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "AI修正に失敗しました。");
		} finally {
			setBusy(false);
		}
	}

	async function saveManualVersion() {
		if (!project) return;
		try {
			await jsonFetch(`/api/projects/${project.id}/versions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ note: "手動保存" }),
			});
			await loadProject(project.id);
			flash("新しいバージョンとして保存しました");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "バージョン保存に失敗しました。"
			);
		}
	}

	async function restoreVersion(versionId: string) {
		if (!project) return;
		setBusy(true);
		try {
			const result = await jsonFetch<{
				html: string;
				css: string;
				versionNumber: number;
			}>(`/api/projects/${project.id}/versions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "restore", versionId }),
			});
			setHtml(result.html);
			setCss(result.css);
			await loadProject(project.id);
			flash(`Ver.${result.versionNumber} として復元しました`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "復元に失敗しました。");
		} finally {
			setBusy(false);
		}
	}

	async function sharePreview() {
		if (!project?.currentHtml) return;
		try {
			const result = await jsonFetch<{ url: string | null }>(
				`/api/projects/${project.id}/share`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ enabled: true }),
				}
			);
			if (result.url) {
				await navigator.clipboard.writeText(result.url).catch(() => undefined);
				flash("共有URLをコピーしました");
			}
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "共有URLを作成できませんでした。"
			);
		}
	}

	async function uploadWorkspaceAssets(event: ChangeEvent<HTMLInputElement>) {
		if (!project) return;
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		setBusy(true);
		try {
			await uploadFiles(project.id, files);
			await loadProject(project.id);
			flash("素材を追加しました");
		} catch (e) {
			setError(e instanceof Error ? e.message : "素材追加に失敗しました。");
		} finally {
			setBusy(false);
		}
	}

	async function addReference() {
		if (!project || !referenceUrl.trim()) return;
		setBusy(true);
		setError("");
		try {
			await captureReference(project.id, referenceUrl.trim());
			setReferenceUrl("");
			await loadProject(project.id);
			flash("参考LPを追加しました");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "参考LPを取得できませんでした。"
			);
		} finally {
			setBusy(false);
		}
	}

	const progress = hearing?.ready
		? 100
		: hearing
		? Math.max(42, 78 - hearing.summary.unresolved.length * 8)
		: 24;

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<span className="brandmark">AI</span> LP Wireframe Studio
					{project && <span className="project-title">{project.name}</span>}
				</div>
				<div className="top-actions">
					<span className="saved">{statusText}</span>
					<button
						className="btn ghost"
						onClick={() => setSpecOpen((open) => !open)}
					>
						仕様メモ
					</button>
					<button
						className="btn"
						disabled={!project?.currentHtml}
						onClick={sharePreview}
					>
						プレビュー共有
					</button>
					<button
						className="btn primary"
						disabled={!project?.currentHtml}
						onClick={() =>
							project &&
							(window.location.href = `/api/projects/${project.id}/export`)
						}
					>
						HTML/CSSを書き出す
					</button>
				</div>
			</header>

			<div className="layout">
				<nav className="navrail">
					<button
						className={`navitem ${view === "dashboard" ? "active" : ""}`}
						onClick={() => {
							setView("dashboard");
							loadProjects();
						}}
					>
						<span className="ico">▦</span>
						<span>案件</span>
					</button>
					<button
						className={`navitem ${view === "intake" ? "active" : ""}`}
						onClick={resetNewProject}
					>
						<span className="ico">＋</span>
						<span>新規</span>
					</button>
					<button
						className={`navitem ${view === "workspace" ? "active" : ""}`}
						disabled={!project?.currentHtml}
						onClick={() => setView("workspace")}
					>
						<span className="ico">◫</span>
						<span>制作</span>
					</button>
					<div className="nav-spacer" />
					{/* <button
						className={`navitem ${view === "settings" ? "active" : ""}`}
						onClick={() => setView("settings")}
					>
						<span className="ico">⚙</span>
						<span>設定</span>
					</button> */}
				</nav>

				<main className="content">
					{error && (
						<div
							className="notice error"
							style={{
								position: "fixed",
								zIndex: 80,
								top: 68,
								right: 16,
								width: 380,
							}}
						>
							{error}
							<button
								onClick={() => setError("")}
								style={{ float: "right", border: 0, background: "transparent" }}
							>
								×
							</button>
						</div>
					)}
					{view === "dashboard" && (
						<Dashboard
							projects={projects}
							busy={busy}
							onNew={resetNewProject}
							onOpen={openExisting}
						/>
					)}
					{view === "intake" && (
						<IntakeView
							intake={intake}
							setIntake={setIntake}
							pendingFiles={pendingFiles}
							onFiles={onFiles}
							toggleDirection={toggleDirection}
							onSubmit={createProject}
							busy={busy}
						/>
					)}
					{view === "hearing" && (
						<HearingView
							project={project}
							hearing={hearing}
							answers={answers}
							answerQuestion={answerQuestion}
							progress={progress}
							onContinue={() => continueHearing()}
							onGenerate={generateDraft}
							busy={busy}
							freeText={freeText}
							setFreeText={setFreeText}
							onFreeText={() =>
								freeText.trim() && continueHearing({ freeText })
							}
						/>
					)}
					{view === "generating" && <GeneratingView />}
					{view === "workspace" && project && (
						<Workspace
							project={project}
							html={html}
							css={css}
							setHtml={setHtml}
							setCss={setCss}
							preview={preview}
							sections={sections}
							selectedSection={selectedSection}
							setSelectedSection={setSelectedSection}
							leftTab={leftTab}
							setLeftTab={setLeftTab}
							rightTab={rightTab}
							setRightTab={setRightTab}
							codeOpen={codeOpen}
							setCodeOpen={setCodeOpen}
							inlineEditing={inlineEditing}
							setInlineEditing={setInlineEditing}
							revision={revision}
							setRevision={setRevision}
							revise={revise}
							busy={busy}
							saveManualVersion={saveManualVersion}
							restoreVersion={restoreVersion}
							uploadAssets={uploadWorkspaceAssets}
							referenceUrl={referenceUrl}
							setReferenceUrl={setReferenceUrl}
							addReference={addReference}
						/>
					)}
					{view === "settings" && <SettingsView />}
				</main>
			</div>

			{specOpen && (
				<div className="spec-drawer open">
					<div className="spec-head">
						<span>実装仕様</span>
						<button className="btn small" onClick={() => setSpecOpen(false)}>
							閉じる
						</button>
					</div>
					<div className="spec-body">
						<ol>
							<li>
								<b>案件単位の永続化</b>
								<br />
								構想、素材、参考URL、チャット、HTML/CSS、バージョンを保存。
							</li>
							<li>
								<b>差分修正</b>
								<br />
								AI修正は選択セクションを優先し、関係ない部分は維持。
							</li>
							<li>
								<b>プレビュー＋チャット</b>
								<br />
								見ながら修正指示を送信。
							</li>
							<li>
								<b>直接編集</b>
								<br />
								プレビュー内テキスト編集とHTML/CSS編集。
							</li>
							<li>
								<b>素材区分</b>
								<br />
								使用可・参考のみを保存。
							</li>
							<li>
								<b>バージョン管理</b>
								<br />
								AI生成・AI修正・手動保存・復元。
							</li>
						</ol>
					</div>
				</div>
			)}
		</div>
	);
}

function Dashboard({
	projects,
	busy,
	onNew,
	onOpen,
}: {
	projects: ProjectListItem[];
	busy: boolean;
	onNew: () => void;
	onOpen: (id: string) => void;
}) {
	const workspaceCount = projects.filter(
		(item) => item.status === "workspace"
	).length;
	const generatedCount = projects.filter(
		(item) => item._count.versions > 0
	).length;
	const month = new Date().getMonth();
	const completedThisMonth = projects.filter(
		(item) =>
			new Date(item.updatedAt).getMonth() === month &&
			item.status === "workspace"
	).length;

	return (
		<section className="view active">
			<div className="dashboard">
				<div className="pagehead">
					<div>
						<h1>ワイヤーフレーム案件</h1>
						<p>構想、参考資料、AIとの会話、HTML/CSSを案件単位で管理します。</p>
					</div>
					<button className="btn primary" onClick={onNew}>
						＋ 新しい案件を作成
					</button>
				</div>
				<div className="metrics">
					<div className="metric">
						<span>制作中</span>
						<strong>{workspaceCount}</strong>
					</div>
					<div className="metric">
						<span>初校生成済み</span>
						<strong>{generatedCount}</strong>
					</div>
					<div className="metric">
						<span>今月更新</span>
						<strong>{completedThisMonth}</strong>
					</div>
				</div>
				{busy && !projects.length ? (
					<div className="hearing-empty">読み込み中...</div>
				) : (
					<div className="projects">
						{projects.map((item) => (
							<article
								className="project"
								key={item.id}
								onClick={() => onOpen(item.id)}
							>
								<div
									className={`project-preview ${
										item.currentHtml ? "has-page" : ""
									}`}
								>
									{item.currentHtml ? (
										<div className="fake-browser">
											<div />
											<div />
											<div />
											<div />
										</div>
									) : (
										<>
											<div className="mini-page">
												<div className="mini-line short" />
												<div className="mini-block" />
												<div className="mini-line" />
											</div>
											<div className="mini-page">
												<div className="mini-block" />
												<div className="mini-line short" />
											</div>
										</>
									)}
								</div>
								<div className="project-info">
									<h3>{item.name}</h3>
									<p>
										最終更新：{dateLabel(item.updatedAt)} ・ Ver.{" "}
										{item._count.versions}
									</p>
									<span className="tag">{projectStatus(item.status)}</span>
								</div>
							</article>
						))}
						{!projects.length && (
							<div
								className="form-card"
								style={{
									gridColumn: "1/-1",
									textAlign: "center",
									color: "var(--muted)",
								}}
							>
								まだ案件がありません。最初のLPを作成してください。
							</div>
						)}
					</div>
				)}
			</div>
		</section>
	);
}

function Steps({ active }: { active: 1 | 2 | 3 | 4 }) {
	const labels = ["案件概要", "素材・参考", "AIヒアリング", "初校生成"];
	return (
		<div className="steps">
			{labels.map((label, index) => {
				const number = index + 1;
				const className =
					number < active
						? "step done"
						: number === active
						? "step active"
						: "step";
				return (
					<div key={label} style={{ display: "contents" }}>
						<div className={className}>
							<i>{number < active ? "✓" : number}</i>
							{label}
						</div>
						{number < 4 && <div className="step-line" />}
					</div>
				);
			})}
		</div>
	);
}

function IntakeView({
	intake,
	setIntake,
	pendingFiles,
	onFiles,
	toggleDirection,
	onSubmit,
	busy,
}: {
	intake: Intake;
	setIntake: Dispatch<SetStateAction<Intake>>;
	pendingFiles: File[];
	onFiles: (event: ChangeEvent<HTMLInputElement>) => void;
	toggleDirection: (value: string) => void;
	onSubmit: (event: FormEvent) => void;
	busy: boolean;
}) {
	return (
		<section className="view active">
			<div className="flow-head">
				<div className="flow-title">
					<h1>新規案件の構想を入力</h1>
					<p>ラフな構想と資料を先に登録します。</p>
				</div>
				<Steps active={1} />
			</div>
			<form className="intake" onSubmit={onSubmit}>
				<div className="card form-card">
					<div className="form-grid">
						<div className="field">
							<label>案件名</label>
							<input
								value={intake.name}
								onChange={(e) =>
									setIntake((v) => ({ ...v, name: e.target.value }))
								}
								placeholder="例：新サービス紹介LP"
							/>
						</div>
						<div className="field">
							<label>ページ種別</label>
							<select
								value={intake.pageType}
								onChange={(e) =>
									setIntake((v) => ({ ...v, pageType: e.target.value }))
								}
							>
								<option>キャンペーンLP</option>
								<option>サービスLP</option>
								<option>採用LP</option>
								<option>コーポレートサイト</option>
							</select>
						</div>
						<div className="field full">
							<label>今回つくりたいもの・構想</label>
							<textarea
								value={intake.concept}
								onChange={(e) =>
									setIntake((v) => ({ ...v, concept: e.target.value }))
								}
								placeholder="目的、サービス内容、LPで伝えたいことをラフに入力"
							/>
						</div>
						<div className="field">
							<label>主なターゲット</label>
							<input
								value={intake.target}
								onChange={(e) =>
									setIntake((v) => ({ ...v, target: e.target.value }))
								}
							/>
						</div>
						<div className="field">
							<label>最重要の訴求</label>
							<input
								value={intake.primaryAppeal}
								onChange={(e) =>
									setIntake((v) => ({ ...v, primaryAppeal: e.target.value }))
								}
							/>
						</div>
						<div className="field full">
							<label>必ず入れたい内容</label>
							<textarea
								style={{ minHeight: 70 }}
								value={intake.mustInclude}
								onChange={(e) =>
									setIntake((v) => ({ ...v, mustInclude: e.target.value }))
								}
							/>
						</div>
						<div className="field full">
							<label>デザインの方向性</label>
							<div className="chips">
								{directionOptions.map((option) => (
									<button
										type="button"
										key={option}
										className={`chip ${
											intake.designDirections.includes(option) ? "active" : ""
										}`}
										onClick={() => toggleDirection(option)}
									>
										{option}
									</button>
								))}
							</div>
						</div>
						<div className="field full">
							<label>参考URL・過去LP</label>
							<textarea
								style={{ minHeight: 72 }}
								value={intake.referenceText}
								onChange={(e) =>
									setIntake((v) => ({ ...v, referenceText: e.target.value }))
								}
								placeholder="https://example.com/lp など。URLは自動でスクリーンショット取得を試みます。"
							/>
						</div>
						<div className="field full">
							<label>画像・資料を追加</label>
							<label className="dropzone real">
								スクリーンショット、Excel、PDF、画像、HTMLを選択
								<input type="file" multiple onChange={onFiles} />
								<small>OpenAIと初校生成の参考にします。</small>
								{pendingFiles.length > 0 && (
									<div className="upload-list">
										{pendingFiles.map((file, index) => (
											<div
												className="upload-pill"
												key={`${file.name}-${index}`}
											>
												<span>{file.name}</span>
												<span>{Math.ceil(file.size / 1024)} KB</span>
											</div>
										))}
									</div>
								)}
							</label>
						</div>
						<div className="field full">
							<label>参考資料の使い方</label>
							<ul className="radio-list">
								{[
									"参考にしながら似たものを作る",
									"これと同じものをワイヤーにする",
									"参考にしながらオリジナルをつくる",
								].map((option) => (
									<li key={option}>
										<label>
											<input
												type="radio"
												name="referenceMode"
												checked={intake.referenceMode === option}
												onChange={() =>
													setIntake((v) => ({ ...v, referenceMode: option }))
												}
											/>
											{option}
										</label>
									</li>
								))}
							</ul>
						</div>
					</div>
					<div className="form-footer">
						<span style={{ fontSize: 12, color: "var(--muted)" }}>
							入力内容は案件の前提条件として保持されます。
						</span>
						<button className="btn primary" disabled={busy}>
							{busy ? "登録・解析中..." : "AIヒアリングを開始 →"}
						</button>
					</div>
				</div>
			</form>
		</section>
	);
}

function HearingView({
	project,
	hearing,
	answers,
	answerQuestion,
	progress,
	onContinue,
	onGenerate,
	busy,
	freeText,
	setFreeText,
	onFreeText,
}: {
	project: Project | null;
	hearing: HearingResult | null;
	answers: Record<string, string | string[]>;
	answerQuestion: (question: HearingQuestion, value: string) => void;
	progress: number;
	onContinue: () => void;
	onGenerate: () => void;
	busy: boolean;
	freeText: string;
	setFreeText: (value: string) => void;
	onFreeText: () => void;
}) {
	const summary = hearing?.summary || project?.hearingSummary;
	return (
		<section className="view active">
			<div className="flow-head">
				<div className="flow-title">
					<h1>AIヒアリング</h1>
					<p>入力済み情報を前提に、初校作成に必要な判断だけを整理します。</p>
				</div>
				<Steps active={3} />
			</div>
			<div className="hearing-layout">
				<aside className="side left">
					<div className="side-head">
						<h3>AIが参照している情報</h3>
						<span className="side-count">
							素材 {project?.assets.length || 0}件
						</span>
					</div>
					<div className="side-body">
						<div className="summary-block">
							<h4>構想</h4>
							<p>{project?.concept || "-"}</p>
						</div>
						<div className="summary-block">
							<h4>ターゲット</h4>
							<p>{project?.target || "未指定"}</p>
						</div>
						<div className="summary-block">
							<h4>必須掲載</h4>
							<p>{project?.mustInclude || "未指定"}</p>
						</div>
						<div
							style={{ fontSize: 10, fontWeight: 800, margin: "14px 0 8px" }}
						>
							アップロード資料
						</div>
						{project?.assets.map((asset) => (
							<div className="file-row" key={asset.id}>
								<div className="file-thumb">
									{asset.mimeType.split("/")[1]?.slice(0, 5).toUpperCase() ||
										"FILE"}
								</div>
								<div>
									<strong>{asset.name}</strong>
									<span>{asset.sourceUrl || asset.mimeType}</span>
									<div className="file-tags">
										<span className="file-tag">
											{asset.rights === "reference" ? "参考のみ" : "使用可"}
										</span>
									</div>
								</div>
							</div>
						))}
						{!project?.assets.length && (
							<div className="info-note">
								資料なしでもヒアリングと初校生成は可能です。
							</div>
						)}
					</div>
				</aside>

				<section className="chat-area">
					<div className="chat-top">
						<div className="ai-status">
							<span className="ai-dot" />
							ChatGPTがヒアリング中
						</div>
						<small>不足情報に応じて質問内容が変わります</small>
					</div>
					<div className="chat-scroll">
						{hearing ? (
							<>
								<div className="msg-wrap">
									<div className="avatar">AI</div>
									<div className="msg">
										<p>{hearing.assistantMessage}</p>
									</div>
								</div>
								{hearing.questions.length > 0 && (
									<div className="question-card dynamic">
										<div className="question-head">
											<strong>初校に必要な確認</strong>
											<span>{hearing.questions.length}問</span>
										</div>
										<div className="question-body">
											{hearing.questions.map((question, index) => (
												<div className="hearing-question" key={question.id}>
													<div className="q-title">
														{index + 1}. {question.prompt}
													</div>
													{question.help && (
														<div className="q-help">{question.help}</div>
													)}
													{question.type === "text" ? (
														<textarea
															className="mini-text"
															value={String(answers[question.id] || "")}
															onChange={(e) =>
																answerQuestion(question, e.target.value)
															}
														/>
													) : (
														<div className="option-grid">
															{(question.options || []).map((option) => {
																const value = answers[question.id];
																const selected = Array.isArray(value)
																	? value.includes(option)
																	: value === option;
																return (
																	<button
																		type="button"
																		className={`option ${
																			selected ? "selected" : ""
																		}`}
																		key={option}
																		onClick={() =>
																			answerQuestion(question, option)
																		}
																	>
																		{option}
																	</button>
																);
															})}
														</div>
													)}
												</div>
											))}
											<div className="question-foot">
												<span className="form-note">
													不明な部分は「要確認」として生成できます。
												</span>
												<button
													className="btn primary small"
													disabled={busy}
													onClick={onContinue}
												>
													この回答を送る
												</button>
											</div>
										</div>
									</div>
								)}
							</>
						) : (
							<div className="hearing-empty">
								{busy
									? "AIが入力内容を整理しています..."
									: "ヒアリングを準備しています。"}
							</div>
						)}
					</div>
					<div className="chat-composer">
						<div className="composer-box">
							<textarea
								value={freeText}
								onChange={(e) => setFreeText(e.target.value)}
								placeholder="補足や、先に伝えておきたい内容を入力"
							/>
							<div className="composer-actions">
								<span className="attach">補足メッセージ</span>
								<button
									className="btn small"
									disabled={busy || !freeText.trim()}
									onClick={onFreeText}
								>
									送る
								</button>
							</div>
						</div>
					</div>
				</section>

				<aside className="side right">
					<div className="side-head">
						<h3>ヒアリング整理</h3>
						<span className="side-count">自動更新</span>
					</div>
					<div className="side-body">
						<div className="progress-card">
							<div className="progress-top">
								<strong>初校準備</strong>
								<b>{progress}%</b>
							</div>
							<div className="progress-track">
								<div
									className="progress-bar"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
						<div className="understanding">
							<h4>現時点のAI理解</h4>
							<dl>
								<dt>ページ目的</dt>
								<dd>{summary?.purpose || "整理中"}</dd>
								<dt>メイン訴求</dt>
								<dd>
									{summary?.mainAppeal || project?.primaryAppeal || "整理中"}
								</dd>
								<dt>構成の仮説</dt>
								<dd>{summary?.structureHypothesis || "整理中"}</dd>
								<dt>デザイン方向</dt>
								<dd>
									{summary?.designDirection ||
										project?.designDirections.join("・") ||
										"整理中"}
								</dd>
							</dl>
						</div>
						<div className="unresolved">
							<strong>
								{hearing?.ready ? "初校生成可能" : "まだ判断が必要なこと"}
							</strong>
							<p>
								{hearing?.ready
									? "不足する固有情報は「要確認」として生成します。"
									: summary?.unresolved?.join("、") || "AIが整理中です。"}
							</p>
						</div>
					</div>
					<div className="right-foot stack">
						<button
							className="btn primary"
							disabled={!hearing?.ready || busy}
							onClick={onGenerate}
						>
							ヒアリングを確定して初校生成
						</button>
					</div>
				</aside>
			</div>
		</section>
	);
}

function GeneratingView() {
	return (
		<section className="view active">
			<div className="flow-head">
				<div className="flow-title">
					<h1>初校を生成しています</h1>
					<p>ヒアリング内容・資料・参考LPをまとめてHTML/CSSへ反映します。</p>
				</div>
				<Steps active={4} />
			</div>
			<div className="generating">
				<div className="card generate-card">
					<div className="generate-icon">◇</div>
					<h2>ワイヤーフレーム初校を作成中</h2>
					<p>セクション構成、コピー、CTA、レスポンシブCSSを生成しています。</p>
					<div className="generate-list">
						<div className="gen-row">
							<i>✓</i>目的・ターゲット・訴求を整理
						</div>
						<div className="gen-row">
							<i>✓</i>資料・参考URLを統合
						</div>
						<div className="gen-row running">
							<i>●</i>HTML/CSSを生成
						</div>
						<div className="gen-row">
							<i>−</i>初回バージョンとして保存
						</div>
					</div>
					<div className="loader">
						<div />
					</div>
				</div>
			</div>
		</section>
	);
}

function Workspace({
	project,
	html,
	css,
	setHtml,
	setCss,
	preview,
	sections,
	selectedSection,
	setSelectedSection,
	leftTab,
	setLeftTab,
	rightTab,
	setRightTab,
	codeOpen,
	setCodeOpen,
	inlineEditing,
	setInlineEditing,
	revision,
	setRevision,
	revise,
	busy,
	saveManualVersion,
	restoreVersion,
	uploadAssets,
	referenceUrl,
	setReferenceUrl,
	addReference,
}: {
	project: Project;
	html: string;
	css: string;
	setHtml: (value: string) => void;
	setCss: (value: string) => void;
	preview: string;
	sections: Array<{ id: string; title: string; description: string }>;
	selectedSection: string;
	setSelectedSection: (value: string) => void;
	leftTab: "outline" | "assets" | "refs";
	setLeftTab: (value: "outline" | "assets" | "refs") => void;
	rightTab: "chat" | "versions";
	setRightTab: (value: "chat" | "versions") => void;
	codeOpen: boolean;
	setCodeOpen: (value: boolean) => void;
	inlineEditing: boolean;
	setInlineEditing: (value: boolean) => void;
	revision: string;
	setRevision: (value: string) => void;
	revise: () => void;
	busy: boolean;
	saveManualVersion: () => void;
	restoreVersion: (id: string) => void;
	uploadAssets: (event: ChangeEvent<HTMLInputElement>) => void;
	referenceUrl: string;
	setReferenceUrl: (value: string) => void;
	addReference: () => void;
}) {
	const chatMessages = project.messages
		.filter(
			(message) => message.kind === "revision" || message.kind === "generation"
		)
		.slice(-14);
	const referenceAssets = project.assets.filter(
		(asset) => asset.sourceUrl || asset.rights === "reference"
	);

	return (
		<section className="view active" style={{ overflow: "hidden" }}>
			<div className={`workspace-main ${codeOpen ? "code-open" : ""}`}>
				<aside className="leftpanel">
					<div className="panelhead">
						<h3>構成・素材</h3>
						<div className="tabs">
							<button
								className={`tab ${leftTab === "outline" ? "active" : ""}`}
								onClick={() => setLeftTab("outline")}
							>
								構成
							</button>
							<button
								className={`tab ${leftTab === "assets" ? "active" : ""}`}
								onClick={() => setLeftTab("assets")}
							>
								素材
							</button>
							<button
								className={`tab ${leftTab === "refs" ? "active" : ""}`}
								onClick={() => setLeftTab("refs")}
							>
								参考
							</button>
						</div>
					</div>
					<div className="leftbody">
						{leftTab === "outline" && (
							<>
								{sections.map((section) => (
									<button
										key={section.id}
										className={`section ${
											selectedSection === section.id ? "selected" : ""
										}`}
										style={{ width: "100%", textAlign: "left" }}
										onClick={() => setSelectedSection(section.id)}
									>
										<strong>{section.title}</strong>
										<span>{section.id}</span>
									</button>
								))}
								{!sections.length && (
									<div className="info-note">
										data-section-id を持つセクションがありません。
									</div>
								)}
							</>
						)}
						{leftTab === "assets" && (
							<>
								{project.assets
									.filter((asset) => asset.rights !== "reference")
									.map((asset) => (
										<div className="asset-row" key={asset.id}>
											{asset.mimeType.startsWith("image/") && (
												<img src={asset.url} alt="" />
											)}
											<strong>{asset.name}</strong>
											<span>
												{asset.mimeType} ・ {asset.rights}
											</span>
										</div>
									))}
								{!project.assets.filter((asset) => asset.rights !== "reference")
									.length && (
									<div className="info-note">素材はまだありません。</div>
								)}
							</>
						)}
						{leftTab === "refs" && (
							<>
								<div className="ref-input-row">
									<input
										value={referenceUrl}
										onChange={(e) => setReferenceUrl(e.target.value)}
										placeholder="https://..."
									/>
									<button
										className="btn small"
										disabled={busy}
										onClick={addReference}
									>
										取得
									</button>
								</div>
								{referenceAssets.map((asset) => (
									<div className="ref-card" key={asset.id}>
										{asset.mimeType.startsWith("image/") && (
											<div className="ref-thumb">
												<img src={asset.url} alt="" />
											</div>
										)}
										<div className="ref-info">
											<div className="ref-title">{asset.name}</div>
											<div className="ref-url">{asset.sourceUrl}</div>
											<div className="ref-tags">
												<span className="ref-tag">参考のみ</span>
											</div>
										</div>
									</div>
								))}
								{!referenceAssets.length && (
									<div className="info-note">
										参考URLを追加するとスクリーンショットと本文を保存します。
									</div>
								)}
							</>
						)}
					</div>
					<div className="left-upload">
						<label>
							＋ 素材を追加
							<input type="file" multiple onChange={uploadAssets} />
						</label>
					</div>
				</aside>

				<section className="canvasarea">
					<div className="canvasbar">
						<div className="canvas-controls">
							<button
								className="btn small"
								onClick={() => setInlineEditing(!inlineEditing)}
							>
								{inlineEditing ? "テキスト編集を終了" : "テキストを直接編集"}
							</button>
							<button
								className="btn small"
								onClick={() => setCodeOpen(!codeOpen)}
							>
								{codeOpen ? "コードを閉じる" : "HTML/CSS"}
							</button>
							<button className="btn small" onClick={saveManualVersion}>
								バージョン保存
							</button>
							<span className="divider" />
							{selectedSection && (
								<span className="inline-badge">選択: {selectedSection}</span>
							)}
						</div>
						<span className="status-pill">自動保存</span>
					</div>
					<div className="canvas-scroll">
						<div className="canvas-shell">
							<iframe
								className="canvas-preview"
								title="LP preview"
								sandbox="allow-scripts"
								srcDoc={preview}
							/>
						</div>
					</div>
				</section>

				<aside className="right">
					<div className="righthead">
						<h3>AIと構成を調整</h3>
						<span className="ver">
							Ver.{project.versions[0]?.versionNumber || 1}
						</span>
					</div>
					<div className="paneltabs">
						<button
							className={`ptab ${rightTab === "chat" ? "active" : ""}`}
							onClick={() => setRightTab("chat")}
						>
							AI修正
						</button>
						<button
							className={`ptab ${rightTab === "versions" ? "active" : ""}`}
							onClick={() => setRightTab("versions")}
						>
							履歴
						</button>
					</div>
					{rightTab === "chat" ? (
						<>
							<div className="workspace-chat-list">
								{chatMessages.map((message) => (
									<div
										key={message.id}
										className={`msg ${message.role === "user" ? "user" : "ai"}`}
									>
										<div className="who">
											{message.role === "user" ? "あなた" : "AI"}
										</div>
										{message.content}
									</div>
								))}
								{!chatMessages.length && (
									<div className="workspace-chat-empty">
										生成後の修正指示がここに残ります。
									</div>
								)}
							</div>
							<div className="quick-actions">
								<button
									className="quick"
									onClick={() =>
										setRevision(
											"このセクションの情報量を減らして、要点がすぐ分かるようにして"
										)
									}
								>
									情報量を整理
								</button>
								<button
									className="quick"
									onClick={() => setRevision("CTAをもっと目立たせて")}
								>
									CTA強化
								</button>
								<button
									className="quick"
									onClick={() =>
										setRevision("スマホ表示をさらに読みやすくして")
									}
								>
									スマホ改善
								</button>
							</div>
							<div className="workspace-composer">
								<textarea
									value={revision}
									onChange={(e) => setRevision(e.target.value)}
									placeholder={
										selectedSection
											? `「${selectedSection}」への修正指示`
											: "修正したい内容を入力。プレビューでセクションをクリックすると対象を指定できます。"
									}
								/>
								<div className="composer-foot">
									<span className="version">AI修正は新しいVer.として保存</span>
									<button
										className="btn primary small"
										disabled={busy || !revision.trim()}
										onClick={revise}
									>
										{busy ? "反映中..." : "AIで修正"}
									</button>
								</div>
							</div>
						</>
					) : (
						<div className="version-list">
							{project.versions.map((version) => (
								<div className="version-row" key={version.id}>
									<div className="version-row-top">
										<strong>Ver.{version.versionNumber}</strong>
										<span style={{ fontSize: 9, color: "var(--muted)" }}>
											{dateLabel(version.createdAt)}
										</span>
									</div>
									<p>{version.note || "保存バージョン"}</p>
									<button
										disabled={
											busy ||
											version.versionNumber ===
												project.versions[0]?.versionNumber
										}
										onClick={() => restoreVersion(version.id)}
									>
										この版を復元
									</button>
								</div>
							))}
						</div>
					)}
				</aside>

				<div className="codepanel">
					<div className="codebox">
						<div className="codehead">
							<span>index.html（body）</span>
							<span>直接編集</span>
						</div>
						<textarea
							className="code-editor"
							value={html}
							onChange={(e) => setHtml(e.target.value)}
							spellCheck={false}
						/>
					</div>
					<div className="codebox">
						<div className="codehead">
							<span>style.css</span>
							<span>直接編集</span>
						</div>
						<textarea
							className="code-editor"
							value={css}
							onChange={(e) => setCss(e.target.value)}
							spellCheck={false}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}

function SettingsView() {
	return (
		<section className="view active">
			<div className="settings-page">
				<div className="pagehead">
					<div>
						<h1>設定</h1>
						<p>単一ユーザー向けMVPの接続設定です。</p>
					</div>
				</div>
				<div className="settings-grid">
					<div className="settings-card">
						<h3>OpenAI</h3>
						<p>
							<code>OPENAI_API_KEY</code> と <code>OPENAI_MODEL</code>{" "}
							をVercelまたは <code>.env.local</code>{" "}
							に設定します。キー未設定でも初校のUI確認はできますが、AI修正は実行しません。
						</p>
					</div>
					<div className="settings-card">
						<h3>Database</h3>
						<p>
							<code>DATABASE_URL</code> はSQLiteファイル（例:{" "}
							<code>file:./dev.db</code>）を指定し、初回は{" "}
							<code>npm run db:push</code> を実行します。
						</p>
					</div>
					<div className="settings-card">
						<h3>Uploads / screenshots</h3>
						<p>
							Vercelでは <code>BLOB_READ_WRITE_TOKEN</code>{" "}
							を設定してください。ローカルでは <code>public/uploads</code>{" "}
							に保存します。
						</p>
					</div>
					<div className="settings-card">
						<h3>Login</h3>
						<p>
							今回はあなた専用なので認証は入れていません。インターネット公開する場合はVercel
							Deployment Protectionなどでアクセス制限するのがおすすめです。
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
