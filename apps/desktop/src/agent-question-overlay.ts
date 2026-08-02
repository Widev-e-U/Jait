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
  const attentionLabel = request.attention === "urgent" ? "Urgent input" : "Input requested";

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
    body { margin: 0; color: #f2f4f7; background: #0d0f12; }
    main { min-height: 100vh; padding: 22px; background: #0d0f12; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid #343942; }
    .mark { display: grid; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; border: 1px solid rgb(59 130 246 / 55%); border-radius: 10px; color: #fff; background: rgb(59 130 246 / 18%); }
    .mark svg { width: 27px; height: 27px; }
    .brand { margin: 0 0 3px; color: #60a5fa; font-size: 10px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 19px; font-weight: 650; line-height: 1.28; letter-spacing: -.015em; }
    .eyebrow { margin: 4px 0 0; color: #858b95; font-size: 12px; }
    section { margin-top: 12px; padding: 15px; border: 1px solid #343942; border-radius: 10px; background: #181a1f; }
    h2 { margin: 0; color: #aeb4bd; font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
    section > p { margin: 6px 0 12px; color: #f2f4f7; font-size: 14px; line-height: 1.48; }
    .options { display: grid; gap: 7px; }
    .option { display: flex; gap: 10px; padding: 10px; border: 1px solid #343942; border-radius: 8px; cursor: pointer; background: #131519; transition: border-color 120ms ease, background 120ms ease; }
    .option:hover { border-color: #4b5563; background: #171a1f; }
    .option:has(input:checked) { border-color: #3b82f6; background: rgb(59 130 246 / 10%); }
    .option input { margin-top: 3px; accent-color: #3b82f6; }
    .option span { min-width: 0; }
    .option strong { display: inline; font-size: 13px; }
    .option em { margin-left: 7px; color: #60a5fa; font-size: 11px; font-style: normal; }
    .option small { display: block; margin-top: 3px; color: #858b95; line-height: 1.4; }
    textarea { width: 100%; margin-top: 9px; padding: 10px; resize: vertical; border: 1px solid #343942; border-radius: 8px; outline: none; color: #f2f4f7; background: #101216; font: inherit; font-size: 13px; }
    textarea::placeholder { color: #686f79; }
    textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
    footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    button { min-width: 96px; padding: 9px 14px; border: 1px solid #343942; border-radius: 8px; color: #e4e7eb; background: #22262c; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
    button.primary { border-color: #3b82f6; color: #fff; background: #3b82f6; }
    button:hover { filter: brightness(1.08); }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 1024 1024" fill="none">
          <path d="M318 372 L430 486 L318 600" stroke="currentColor" stroke-width="88" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715" stroke="currentColor" stroke-width="88" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div>
        <p class="brand">Jait</p>
        <h1>${escapeHtml(request.title)}</h1>
        <p class="eyebrow">${attentionLabel}</p>
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
