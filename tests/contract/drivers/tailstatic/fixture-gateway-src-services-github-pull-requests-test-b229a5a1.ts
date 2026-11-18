// Translated fixture from packages/gateway/src/services/github-pull-requests.test.ts; expected literals are in tail_static.rs.
import {
  GitHubPullRequestService,
  type PullRequestConflictGitOperations,
} from "../../../../packages/gateway/src/services/github-pull-requests.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/github-pull-requests.test.ts",import.meta.url).href;
const __jait_require=__jait_createRequire(__jait_original_url);
const __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));
const __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));
const __jait_symbols=new Map<symbol,number>();
const __jait_nestedRefs=new WeakMap<object,number>();let __jait_nextNestedRef=1;
function __jait_nestedRef(value:object):number{let id=__jait_nestedRefs.get(value);if(!id){id=__jait_nextNestedRef++;__jait_nestedRefs.set(value,id)}return id;}
// Fixture transport only. Rust owns all comparison semantics.
function __jait_boxed(value: any): any {
 const type=typeof value;
 if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}
 if(type==='function')return {type,name:value.name};
 if(type==='undefined')return {type};
 if(type==='bigint')return {type,value:String(value)};
 if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};
 const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;
 if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};
 return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted,ref:__jait_nestedRef(child)};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function',ref:__jait_nestedRef(child)}:child;}));
}

export async function run(name: string): Promise<unknown> {
 await __jait_mkdir(__jait_fixture_dir,{recursive:true});
 const __jait_observations: any[]=[];
 const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};
 const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;
 const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};
 const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};
 const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});
 const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);
 const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};
 const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};
 const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};
 switch(name){
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_60_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const runner = vi.fn(async () => ({
      stdout: JSON.stringify([{
        number: 42,
        title: "feat: in-app pull requests",
        state: "OPEN",
        url: "https://github.com/acme/jait/pull/42",
        author: { login: "octocat", name: "Octo Cat" },
        baseRefName: "main",
        headRefName: "feature/pulls",
        isDraft: false,
        reviewDecision: "APPROVED",
        mergeStateStatus: "CLEAN",
        additions: 120,
        deletions: 15,
        changedFiles: 4,
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
        labels: [{ name: "feature", color: "00ff00" }],
        statusCheckRollup: [{
          name: "test",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: "https://github.com/acme/jait/actions/1",
        }],
      }]),
      stderr: "",
    }));
    const service = new GitHubPullRequestService(runner);

    const result = await service.list("git@github.com:acme/jait.git", "open", 50);

    __jait_capture(0, (runner.mock.calls));
    __jait_capture(1, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_109_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const runner = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const service = new GitHubPullRequestService(runner);
    const body = "Looks good with `code` and $(untrusted input).";

    await service.review("https://github.com/acme/jait", 42, "approve", body);

    __jait_capture(0, (runner.mock.calls), ([["pr", "review", "42", "--repo", "acme/jait", "--approve", "--body-file", "-"],{ input: body }]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_122_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = new GitHubPullRequestService();

    __jait_thrown(0, () => service.repositoryTarget("https://gitlab.com/acme/jait"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_129_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "gateway-owner-token";
    try {
      const service = new GitHubPullRequestService();
      await __jait_rejected(0, service.list("https://github.com/acme/jait", "open", 1));
    } finally {
      if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previousToken;
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_142_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const path = "src/link;$(touch-owned)";
    const baseBranch = "main;$(touch-base)";
    const headBranch = "feature;$(touch-head)";
    const operations = conflictOperations({ paths: [{ path, mode: "120000" }] });
    const service = new GitHubPullRequestService(
      conflictRunner({ baseBranch, headBranch }),
      operations,
    );

    await service.resolveConflicts(
      "https://github.com/acme/jait",
      42,
      { [path]: "ours" },
    );

    __jait_capture(0, (operations.cloneOrFetch.mock.calls), (["https://github.com/acme/jait","github.com--acme--jait--conflicts",baseBranch]));
    __jait_capture(1, (operations.git.mock.calls), (["/tmp/jait-conflict-clone",["merge", "--no-edit", `refs/remotes/origin/${baseBranch}`],60_000]));
    __jait_capture(2, (operations.git.mock.calls), (["/tmp/jait-conflict-clone",["checkout", "--ours", "--", path],30_000]));
    __jait_capture(3, (operations.git.mock.calls), (["/tmp/jait-conflict-clone",["add", "--", path],30_000]));
    __jait_capture(4, (operations.git.mock.calls), (["/tmp/jait-conflict-clone",["branch", "-D", "--", headBranch],30_000]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_185_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const operations = conflictOperations({ paths: [{ path: "../outside" }] });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    await __jait_rejected(0, service.resolveConflicts("https://github.com/acme/jait", 42));
    __jait_capture(1, (operations.git.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_198_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const path = "assets/logo.bin";
    const operations = conflictOperations({
      paths: [{ path }],
      stages: {
        [`:2:${path}`]: Buffer.from([0, 255, 1, 2]),
        [`:3:${path}`]: Buffer.from([0, 254, 3, 4]),
      },
    });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    const preview = await service.resolveConflicts("https://github.com/acme/jait", 42);
    __jait_capture(0, (preview), ({
      status: "conflicts",
      files: [{ path, binary: true, ours: "", theirs: "" }],
    }));

    await service.resolveConflicts(
      "https://github.com/acme/jait",
      42,
      { [path]: "theirs" },
    );
    __jait_capture(1, (operations.git.mock.calls), (["/tmp/jait-conflict-clone",["checkout", "--theirs", "--", path],30_000]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_227_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const token = "ghp_super_secret";
    const git: PullRequestConflictGitOperations["git"] = vi.fn(async (_cwd, args) => {
      if (args[0] === "ls-files") return "";
      if (args[0] === "push" && args.length === 1) throw new Error("no credential helper");
      if (args[0] === "push") throw new Error(`remote echoed ${token}`);
      return "";
    });
    const operations = conflictOperations({ git });
    const service = new GitHubPullRequestService(
      conflictRunner({
        token,
        headUrl: "https://embedded:credential@github.com/fork/jait",
      }),
      operations,
    );

    let surfaced = "";
    try {
      await service.resolveConflicts("https://github.com/acme/jait", 42);
    } catch (error) {
      surfaced = error instanceof Error ? error.message : String(error);
    }
    __jait_capture(0, (surfaced));
    __jait_capture(1, (surfaced), (token));

    const fallbackPush = vi.mocked(git).mock.calls.find(([, args]) => args[0] === "push" && args.length > 1);
    __jait_capture(2, (fallbackPush?.[1]));
    __jait_capture(3, (JSON.stringify(fallbackPush?.[1])), (token));
    __jait_capture(4, (fallbackPush?.[3]?.redactions), (token));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_github_pull_requests_test_ts_263_3": {


function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}
function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let activeClones = 0;
    let maxActiveClones = 0;
    const operations = conflictOperations({
      cloneOrFetch: vi.fn(async () => {
        activeClones += 1;
        maxActiveClones = Math.max(maxActiveClones, activeClones);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeClones -= 1;
        return "/tmp/jait-conflict-clone";
      }),
    });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    await Promise.all([
      service.resolveConflicts("https://github.com/acme/jait", 41),
      service.resolveConflicts("https://github.com/acme/jait", 42),
    ]);

    __jait_capture(0, (maxActiveClones));
  
})();

} finally {

}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
