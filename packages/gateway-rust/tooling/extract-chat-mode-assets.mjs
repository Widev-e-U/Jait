// Migration-time data extraction; Rust owns selection, policy lookup and formatting.
import * as source from '../../gateway/src/tools/chat-modes.ts';
import {writeFileSync} from 'node:fs';
const assets = {
  modes: source.CHAT_MODES,
  askTools: [...source.ASK_MODE_TOOLS],
  mutatingTools: [...source.MUTATING_TOOLS],
  swarmTools: [...source.SWARM_ORCHESTRATION_TOOLS],
  teams: source.SWARM_TEAMS,
  prompts: Object.fromEntries(source.CHAT_MODES.map(mode => [mode, source.getSystemPromptForMode(mode)])),
};
writeFileSync(new URL('../src/tools/chat-modes-assets.json',import.meta.url),JSON.stringify(assets,null,2)+'\n');
console.log(JSON.stringify({modes:assets.modes,teams:assets.teams.length,toolSets:[assets.askTools.length,assets.mutatingTools.length,assets.swarmTools.length]}));
