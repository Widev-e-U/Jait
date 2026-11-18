import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailClient } from "./gmail.js";

afterEach(() => vi.unstubAllGlobals());

describe("Gmail profile response", () => {
  it.each([{ emailAddress: "owner@example.com" }, {}])("reads the profile email with a missing-field fallback: %j", async (body) => {
    const fetchMock = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new GmailClient().getProfileEmail("test-token")).toBe("emailAddress" in body ? body.emailAddress : "");
    expect(fetchMock).toHaveBeenCalledWith("https://gmail.googleapis.com/gmail/v1/users/me/profile",
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }));
  });
});
