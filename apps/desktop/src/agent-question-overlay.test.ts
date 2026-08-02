import { describe, expect, it } from "vitest";
import {
  createAgentQuestionOverlayHtml,
  parseAgentQuestionNavigation,
  type AgentQuestionRequest,
} from "./agent-question-overlay.js";

const request: AgentQuestionRequest = {
  id: "wake-request-42",
  title: "Morning check-in",
  attention: "urgent",
  questions: [{
    id: "wake_style",
    header: "Wake-up style",
    question: "How should Jait wake you today?",
    options: [
      { label: "Soft music", description: "Increase volume gradually", recommended: true },
      { label: "Direct alarm" },
    ],
    allowFreeformInput: true,
  }],
};

describe("agent question overlay", () => {
  it("renders the structured question without allowing agent HTML injection", () => {
    const html = createAgentQuestionOverlayHtml({
      ...request,
      title: '<img src=x onerror="alert(1)">',
      questions: [{
        ...request.questions[0]!,
        question: "<script>window.pwned = true</script>",
        options: [{ label: "<b>Unsafe choice</b>" }],
      }],
    });

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;window.pwned = true&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Unsafe choice&lt;/b&gt;");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script>window.pwned = true</script>");
    expect(html).toContain('<p class="brand">Jait</p>');
    expect(html).toContain('viewBox="0 0 1024 1024"');
    expect(html).not.toContain('<div class="mark">J</div>');
  });

  it("parses submitted option and free-text answers", () => {
    const payload = encodeURIComponent(JSON.stringify({
      answers: {
        wake_style: {
          selected: ["Soft music"],
          freeText: "Start at 07:15",
          skipped: false,
        },
      },
    }));
    const navigation = parseAgentQuestionNavigation(
      `jait-question://submit/wake-request-42?payload=${payload}`,
      request.id,
    );

    expect(navigation).toEqual({
      action: "submit",
      result: {
        answers: {
          wake_style: {
            selected: ["Soft music"],
            freeText: "Start at 07:15",
            skipped: false,
          },
        },
      },
    });
  });

  it("accepts cancellation and rejects unrelated or malformed navigation", () => {
    expect(parseAgentQuestionNavigation(
      "jait-question://cancel/wake-request-42",
      request.id,
    )).toEqual({ action: "cancel" });
    expect(parseAgentQuestionNavigation(
      "jait-question://submit/different-request?payload=%7B%7D",
      request.id,
    )).toBeNull();
    expect(parseAgentQuestionNavigation(
      "https://example.com/submit",
      request.id,
    )).toBeNull();
    expect(parseAgentQuestionNavigation(
      "jait-question://submit/wake-request-42?payload=not-json",
      request.id,
    )).toBeNull();
  });
});
