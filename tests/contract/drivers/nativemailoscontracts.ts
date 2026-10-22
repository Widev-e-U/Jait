import type {EmailProvider,OAuthEmailProvider,EmailAccount,EmailTokens,EmailMessageSummary,EmailMessageFull,EmailFolder,ListMessagesOptions,SendMessageInput,MailServerConfig,ConnectMailboxInput,EmailAccountSettings,DiscoveredMailSettings,MailboxClient} from '../../../packages/gateway/src/services/email/types.ts';
import type {OsScreenshot,OsClickOptions,OsTypeOptions,OsKeyOptions,OsScrollOptions,OsExecOptions,OsDriverType,OsControlDriver,OsDriverBinding} from '../../../packages/gateway/src/os-control/types.ts';
import type {SandboxRunResult} from '../../../packages/gateway/src/security/sandbox-manager.ts';
const account={id:'a',userId:null,provider:'imap',email:'fixture@example.invalid',displayName:'Fixture 😀',status:'connected',createdAt:'created',updatedAt:'updated'} satisfies EmailAccount;
const summary={id:'m',from:'from@example.invalid',to:'to@example.invalid',subject:'Subject 😀',snippet:'',date:'date',unread:false,labels:[],hasAttachments:false} satisfies EmailMessageSummary;
const server={host:'mail.example.invalid',port:993,secure:true,user:'fixture',password:'test-only-fixture'} satisfies MailServerConfig;
const publicServer={host:'mail.example.invalid',port:587,secure:false,user:'fixture'};
export const fixtures={
 providers:['gmail','outlook','imap'] satisfies EmailProvider[],
 oauth:['gmail','outlook'] satisfies OAuthEmailProvider[],
 accounts:[account,{...account,userId:'owner',provider:'gmail',signature:'',signatureEnabled:false,error:null},{...account,provider:'outlook',status:'error',error:'failed'}] satisfies EmailAccount[],
 tokens:[{accessToken:'test-only',refreshToken:null,expiresAt:0},{accessToken:'test-only',refreshToken:'test-only',expiresAt:9007199254740991,scope:''},{accessToken:'test-only',refreshToken:null,expiresAt:NaN}] satisfies EmailTokens[],
 summaries:[summary,{...summary,threadId:'thread',unread:true,labels:['Inbox','😀'],hasAttachments:true}] satisfies EmailMessageSummary[],
 full:[{...summary,cc:'',bodyText:'text',bodyHtml:'<p>text</p>'}] satisfies EmailMessageFull[],
 folders:[{id:'inbox',name:'Inbox'},{id:'empty',name:'',unreadCount:-1.5},{id:'unknown',name:'Unknown',unreadCount:Infinity}] satisfies EmailFolder[],
 list:[{},{folder:'',query:'',limit:0},{limit:NaN},{limit:-Infinity}] satisfies ListMessagesOptions[],
 send:[{to:'recipient@example.invalid',subject:'',body:''},{to:'',subject:'',body:'<p>reply</p>',cc:'',bcc:'',replyToMessageId:'id',html:true,includeSignature:false}] satisfies SendMessageInput[],
 servers:[server,{...server,port:0},{...server,port:65536.5},{...server,port:NaN}] satisfies MailServerConfig[],
 connect:[{email:'fixture@example.invalid',imap:server,smtp:server},{email:'',displayName:'',imap:server,smtp:server}] satisfies ConnectMailboxInput[],
 settings:[{},{displayName:'',signature:'',signatureEnabled:false}] satisfies EmailAccountSettings[],
 discovered:[{name:'Fixture',imap:publicServer,smtp:publicServer}] satisfies DiscoveredMailSettings[],
 os:['linux-desktop','windows'] satisfies OsDriverType[],
 screenshots:[{png:Buffer.from([0,1,137,255]),width:1920,height:1080},{png:Buffer.alloc(0),width:NaN,height:-0}] satisfies OsScreenshot[],
 click:[{},{button:'left',clicks:0},{button:'middle',clicks:-1.5},{button:'right',clicks:NaN}] satisfies OsClickOptions[],
 type:[{},{delayMs:12},{delayMs:Infinity}] satisfies OsTypeOptions[],
 key:[{},{holdMs:-0.5},{holdMs:NaN}] satisfies OsKeyOptions[],
 scroll:[{},{x:0,y:-1,direction:'up',amount:1},{direction:'down'},{direction:'left'},{direction:'right',amount:NaN}] satisfies OsScrollOptions[],
 exec:[{},{cwd:'',env:{SAFE_MARK:'fixture',EMPTY:''},timeoutMs:30000},{timeoutMs:-Infinity}] satisfies OsExecOptions[],
 result:[{ok:true,output:'stdout',exitCode:0,timedOut:false,containerName:'owned'},{ok:false,output:'',exitCode:null,timedOut:true,containerName:'owned'}] satisfies SandboxRunResult[],
};
function signatures(mail:MailboxClient,driver:OsControlDriver,binding:OsDriverBinding){
 const a:Promise<EmailMessageSummary[]>=mail.listMessages('test-only',{limit:NaN});
 const b:Promise<EmailMessageFull>=mail.getMessage('test-only','id');
 const c:Promise<{id:string}>=mail.sendMessage('test-only',fixtures.send[0]);
 const d:Promise<void>=mail.tagMessage('test-only','id',['add'],['remove']),e:Promise<void>=mail.deleteMessage('test-only','id');
 const f:Promise<EmailFolder[]>=mail.listFolders('test-only'),g:Promise<string>=mail.getProfileEmail('test-only');
 const h:Promise<OsScreenshot>=driver.screenshot(),i:Promise<void>=driver.click(NaN,Infinity),j:Promise<void>=driver.mouseMove(1,2);
 const k:Promise<void>=driver.type('text'),l:Promise<void>=driver.key('ctrl+c'),m:Promise<void>=driver.scroll(),n:Promise<SandboxRunResult>=driver.exec('fixture');
 const os:OsDriverType=driver.osType;const parts:[OsControlDriver,string,OsDriverType]=[binding.driver,binding.containerName,binding.type];
 void[a,b,c,d,e,f,g,h,i,j,k,l,m,n,os,parts];
 // @ts-expect-error driver identity is readonly
 driver.osType='windows';
}
void signatures;
// @ts-expect-error OAuth excludes IMAP
const badOAuth:OAuthEmailProvider='imap';
// @ts-expect-error account refresh bundle requires nullable refreshToken
const missingRefresh:EmailTokens={accessToken:'test-only',expiresAt:0};
// @ts-expect-error screenshot must contain a Node Buffer
const badScreenshot:OsScreenshot={png:new Uint8Array(0),width:1,height:1};
// @ts-expect-error mouse buttons are closed
const badClick:OsClickOptions={button:'secondary'};
// @ts-expect-error driver types are closed
const badDriver:OsDriverType='macos';
void[badOAuth,missingRefresh,badScreenshot,badClick,badDriver];
export async function dispatch(call:{op:string}){
 if(call.op==='nativemailoscontracts.fixtures')return fixtures;
 if(call.op==='nativemailoscontracts.exports')return {
  email:Object.keys(await import('../../../packages/gateway/src/services/email/types.ts')),
  os:Object.keys(await import('../../../packages/gateway/src/os-control/types.ts')),
 };
 throw Error('unknown email/OS contract operation');
}
