/** Execute the actual tool factory; script only its service boundary. */
import { createTeamChatTool } from '../../../packages/gateway/src/tools/team-chat-tools.ts';
export async function dispatch(call: any) {
  if (call.op === 'nativeteamchat.metadata') {
    const { execute, ...metadata } = createTeamChatTool({} as any, {} as any);
    return metadata;
  }
  const results = [];
  for (const test of call.cases) {
    const events: any[] = [];
    const service = new Proxy({}, { get(_target, method: string) {
      return (...args: any[]) => {
        events.push({ method, args });
        const response = test.responses[method];
        if (!response) throw Error('Unscripted service method: ' + method);
        if ('error' in response) throw Error(response.error);
        if ('thrown' in response) throw response.thrown;
        return response.value;
      };
    }});
    const tool = createTeamChatTool(service as any, {} as any);
    const result = await tool.execute(test.input, test.context);
    // Keep random UUID generation observable without comparing its entropy.
    const post = events.find(e => e.method === 'postRouted');
    if (test.randomKey && post) {
      const key = post.args[2].clientKey;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) throw Error('Invalid UUIDv7 retry key');
      post.args[2].clientKey = '<uuidv7>';
    }
    results.push({ result, events });
  }
  return results;
}
