import { afterEach, describe, expect, it } from "vitest";
import { clearSessionTodos, createTodoTool, getSessionTodos } from "./todo.js";
const context = { sessionId: "todo-tests", actionId: "todo-action", projectRoot: "/project", requestedBy: "test" };
afterEach(() => { clearSessionTodos(context.sessionId); clearSessionTodos("other-session"); });
describe("todo", () => {
  it("replaces the complete plan and keeps sessions independent", async () => {
    const tool = createTodoTool();
    const item = { id: 1, title: "Verify browser actions", status: "in-progress" as const };
    await tool.execute({ todoList: [item] }, context);
    expect(getSessionTodos(context.sessionId)).toEqual([item]);
    expect(getSessionTodos("other-session")).toEqual([]);
    const completed = { ...item, status: "completed" as const };
    expect(await tool.execute({ todoList: [completed] }, context)).toMatchObject({ ok: true, message: "Todo list updated (1/1 done).", data: { items: [completed] } });
    await tool.execute({ todoList: [] }, context);
    expect(getSessionTodos(context.sessionId)).toEqual([]);
  });
  it("copies inputs so later caller changes do not silently mutate the plan", async () => {
    const item = { id: 1, title: "Verify browser actions", status: "in-progress" as const };
    await createTodoTool().execute({ todoList: [item] }, context);
    item.title = "Caller changed this";
    expect(getSessionTodos(context.sessionId)[0]!.title).toBe("Verify browser actions");
  });
});
