import { afterEach, expect, it, vi } from "vitest";
import { fetchOllamaModels, resetModelFetcherCaches } from "./model-fetchers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetModelFetcherCaches();
});

it("refreshes past a pending catalogue read and ignores its late cache write", async () => {
  const response = (name: string) => Response.json({ models: [{ name }] });
  let completeOlderRead!: (result: Response) => void;
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(resolve => { completeOlderRead = resolve; }))
    .mockResolvedValueOnce(response("new:latest"));
  vi.stubGlobal("fetch", fetchMock);
  const url = "http://office.test:11434";

  const olderRead = fetchOllamaModels(url);
  const refreshed = await fetchOllamaModels(url, { force: true });
  expect(refreshed.map(model => model.id)).toEqual(["new:latest"]);
  completeOlderRead(response("old:latest"));
  await olderRead;
  expect(await fetchOllamaModels(url)).toEqual(refreshed);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
