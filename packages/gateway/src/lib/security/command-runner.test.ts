import { expect,it } from "vitest";
import { runCommand,EngineUnavailable } from "./engines.js";
it("bounds real subprocess output and cancels a real child without shell expansion",async()=>{
 const argumentsResult=await runCommand(process.execPath,["-e","process.stdout.write(process.argv[1])","$(touch SHOULD_NOT_EXIST)"],new AbortController().signal);
 expect(argumentsResult.stdout).toBe("$(touch SHOULD_NOT_EXIST)");
 const capped=await runCommand(process.execPath,["-e","process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"],new AbortController().signal,100);
 expect(capped.limited).toBe(true);expect(capped.stdout.length).toBeLessThanOrEqual(100);
 const controller=new AbortController();
 const running=runCommand(process.execPath,["-e","setInterval(()=>{},1000)"],controller.signal);
 setTimeout(()=>controller.abort(),30);
 expect((await running).limited).toBe(true);
 await expect(runCommand("jait-test-engine-that-does-not-exist",[],new AbortController().signal)).rejects.toBeInstanceOf(EngineUnavailable);
});
