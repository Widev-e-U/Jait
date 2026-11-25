import { rankProjectContentMatches, rankProjectFilePaths } from '../../../packages/gateway/src/services/project-search.ts';

type RankRequest =
  | { op: 'nativeprojectsearch.files'; paths: string[]; query: string; limit: number; alreadyMatched?: boolean }
  | { op: 'nativeprojectsearch.content'; matches: Array<{ relativePath: string; line: number; content: string }>; query: string; limit: number };

export function dispatch(call: RankRequest) {
  switch (call.op) {
    case 'nativeprojectsearch.files':
      return rankProjectFilePaths(call.paths, call.query, call.limit, call.alreadyMatched);
    case 'nativeprojectsearch.content':
      return rankProjectContentMatches(call.matches, call.query, call.limit);
    default:
      throw new Error('unknown project-search operation');
  }
}
