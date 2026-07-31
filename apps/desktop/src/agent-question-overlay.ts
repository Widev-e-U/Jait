export interface AgentQuestionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface AgentQuestionItem {
  id: string;
  header: string;
  question: string;
  multiSelect?: boolean;
  options?: AgentQuestionOption[];
  allowFreeformInput?: boolean;
}

export interface AgentQuestionRequest {
  id: string;
  title: string;
  attention: "normal" | "urgent";
  questions: AgentQuestionItem[];
}

export interface AgentQuestionAnswer {
  selected: string[];
  freeText: string | null;
  skipped: boolean;
}

export interface AgentQuestionResult {
  answers: Record<string, AgentQuestionAnswer>;
}

export type AgentQuestionNavigation =
  | { action: "submit"; result: AgentQuestionResult }
  | { action: "cancel" };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderQuestion(requestId: string, question: AgentQuestionItem): string {
  const inputType = question.multiSelect ? "checkbox" : "radio";
  const options = (question.options ?? []).map((option) => `
    <label class="option">
      <input
        type="${inputType}"
        name="selected:${escapeHtml(question.id)}"
        value="${escapeHtml(option.label)}"
      />
      <span>
        <strong>${escapeHtml(option.label)}</strong>
        ${option.recommended ? '<em>Recommended</em>' : ""}
        ${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}
      </span>
    </label>
  `).join("");

  const freeform = question.allowFreeformInput === false ? "" : `
    <textarea
      name="freeText:${escapeHtml(question.id)}"
      placeholder="Type an answer..."
      rows="3"
    ></textarea>
  `;

  return `
    <section>
      <h2>${escapeHtml(question.header)}</h2>
      <p>${escapeHtml(question.question)}</p>
      <div class="options">${options}</div>
      ${freeform}
      <input type="hidden" name="question:${escapeHtml(requestId)}" value="${escapeHtml(question.id)}" />
    </section>
  `;
}

export function createAgentQuestionOverlayHtml(request: AgentQuestionRequest): string {
  const questionsJson = JSON.stringify(request.questions.map((question) => question.id))
    .replaceAll("<", "\\u003c");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(request.title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #f8fafc; background: #0b1220; }
    main { min-height: 100vh; padding: 24px; background: radial-gradient(circle at top right, #164e63 0, #0b1220 42%); }
    header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px; }
    .mark { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 13px; color: #082f49; background: #67e8f9; font-size: 20px; font-weight: 800; }
    h1 { margin: 0; font-size: 20px; line-height: 1.25; }
    .eyebrow { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
    section { margin-top: 12px; padding: 15px; border: 1px solid #334155; border-radius: 14px; background: rgb(15 23 42 / 88%); }
    h2 { margin: 0; font-size: 14px; }
    section > p { margin: 5px 0 12px; color: #cbd5e1; font-size: 13px; line-height: 1.45; }
    .options { display: grid; gap: 7px; }
    .option { display: flex; gap: 10px; padding: 10px; border: 1px solid #334155; border-radius: 10px; cursor: pointer; background: #111c30; }
    .option:hover { border-color: #22d3ee; }
    .option input { margin-top: 3px; accent-color: #22d3ee; }
    .option span { min-width: 0; }
    .option strong { display: inline; font-size: 13px; }
    .option em { margin-left: 7px; color: #67e8f9; font-size: 11px; font-style: normal; }
    .option small { display: block; margin-top: 2px; color: #94a3b8; line-height: 1.35; }
    textarea { width: 100%; margin-top: 9px; padding: 10px; resize: vertical; border: 1px solid #334155; border-radius: 10px; outline: none; color: #f8fafc; background: #08101d; font: inherit; font-size: 13px; }
    textarea:focus { border-color: #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
    footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    button { min-width: 90px; padding: 9px 14px; border: 0; border-radius: 10px; color: #e2e8f0; background: #334155; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
    button.primary { color: #083344; background: #67e8f9; }
    button:hover { filter: brightness(1.08); }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="mark">J</div>
      <div>
        <h1>${escapeHtml(request.title)}</h1>
        <p class="eyebrow">Jait needs your input</p>
      </div>
    </header>
    <form id="question-form">
      ${request.questions.map((question) => renderQuestion(request.id, question)).join("")}
      <footer>
        <button id="cancel" type="button">Dismiss</button>
        <button class="primary" type="submit">Send answer</button>
      </footer>
    </form>
  </main>
  <script>
    const requestId = ${JSON.stringify(request.id).replaceAll("<", "\\u003c")};
    const questionIds = ${questionsJson};
    const form = document.getElementById("question-form");
    document.getElementById("cancel").addEventListener("click", () => {
      location.href = "jait-question://cancel/" + encodeURIComponent(requestId);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const answers = {};
      for (const questionId of questionIds) {
        const selected = data.getAll("selected:" + questionId).map(String);
        const rawFreeText = String(data.get("freeText:" + questionId) || "").trim();
        answers[questionId] = {
          selected,
          freeText: rawFreeText || null,
          skipped: selected.length === 0 && !rawFreeText,
        };
      }
      const payload = encodeURIComponent(JSON.stringify({ answers }));
      location.href = "jait-question://submit/" + encodeURIComponent(requestId) + "?payload=" + payload;
    });
  </script>
</body>
</html>`;
}

export function parseAgentQuestionNavigation(
  navigationUrl: string,
  expectedRequestId: string,
): AgentQuestionNavigation | null {
  let parsed: URL;
  try {
    parsed = new URL(navigationUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "jait-question:") return null;

  const requestId = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (requestId !== expectedRequestId) return null;
  if (parsed.hostname === "cancel") return { action: "cancel" };
  if (parsed.hostname !== "submit") return null;

  const payload = parsed.searchParams.get("payload");
  if (!payload) return null;

  try {
    const raw = JSON.parse(payload) as { answers?: Record<string, unknown> };
    if (!raw.answers || typeof raw.answers !== "object") return null;
    const answers: Record<string, AgentQuestionAnswer> = {};
    for (const [questionId, value] of Object.entries(raw.answers)) {
      if (!value || typeof value !== "object") continue;
      const answer = value as Record<string, unknown>;
      answers[questionId] = {
        selected: Array.isArray(answer.selected)
          ? answer.selected.filter((item): item is string => typeof item === "string")
          : [],
        freeText: typeof answer.freeText === "string" && answer.freeText.trim()
          ? answer.freeText.trim()
          : null,
        skipped: answer.skipped === true,
      };
    }
    return { action: "submit", result: { answers } };
  } catch {
    return null;
  }
}
