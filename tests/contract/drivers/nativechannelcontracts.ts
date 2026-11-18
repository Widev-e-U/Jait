/** Compile fixtures against actual declarations, then serialize those typed fixtures. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export async function dispatch(_call:unknown){
 const dir=join(root,'.jait/artifacts/gateway-rust/channel-contracts',randomUUID());mkdirSync(dir,{recursive:true});
 const source=join(root,'packages/gateway/src/channels/types.ts');
 const imports='import type {ChannelStatus,ChannelStatusDetail,ChannelPairing,InboundMessage,ChannelChoice,OutboundMessage,ChannelCommandDescriptor,ChannelPairOptions,ChannelSetupGuide,ChannelConfig,ChannelConnector,ChannelConnectorEvents} from '+JSON.stringify(source)+';\n';
 const fixture=String.raw`
const status:ChannelStatus[]=['stopped','connecting','qr','connected','error'];
const detail:ChannelStatusDetail[]=[{},{qr:'',link:'',expiresAt:'',error:''},{qr:'data:fixture',link:'fixture://link',expiresAt:'2026-10-21T00:00:00Z',error:'fixture 🦀'}];
const pairing:ChannelPairing[]=[{senderId:'sender',conversationId:'room'},{senderId:'',conversationId:'',senderName:''},{senderId:'sender',conversationId:'room',senderName:'🦀'}];
const inbound:InboundMessage[]=[0,-0,1.25,1e21,NaN,Infinity,-Infinity].map((timestamp,index)=>({channelId:'fixture',conversationId:'room',senderId:'sender',...(index%2?{senderName:''}:{}),text:'line1\nline2 🦀',timestamp,fromMe:index%2===0,isSelfChat:index%3===0}));
const choice:ChannelChoice[]=[{label:'',value:''},{label:'Choose 🦀',value:'/fixture'}];
const outbound:OutboundMessage[]=[{conversationId:'room',text:'plain'},{conversationId:'room',text:'empty choices',choices:[]},{conversationId:'room',text:'choose',choices:choice}];
const command:ChannelCommandDescriptor[]=[{name:'model',description:'Select a model'},{name:'',description:''}];
const options:ChannelPairOptions[]=[{},{returnUrl:''},{returnUrl:'https://fixture.invalid/return'}];
const guide:ChannelSetupGuide[]=[{link:'fixture://link',qr:null,suggestedName:'Fixture',suggestedUsername:'fixture_bot'},{link:'',qr:'data:image/png;base64,fixture',suggestedName:'',suggestedUsername:''}];
const config:ChannelConfig[]=[{},{enabled:false,allowedSenders:[],respondToAll:false,tools:[],autoApprove:false,progress:false,notifications:false,model:'',modelProvider:'',fallbackModel:'',fallbackModelProvider:'',timeZone:'',token:''},{enabled:true,allowedSenders:['a','b'],respondToAll:true,tools:['read','write'],autoApprove:true,progress:true,notifications:true,model:'fixture/model',modelProvider:'provider-account',fallbackModel:'fallback',fallbackModelProvider:'jait',timeZone:'Europe/Vienna',token:'fictional-not-a-secret'}];
export const corpus={status,detail,pairing,inbound,choice,outbound,command,options,guide,config};
`;
 const negative=String.raw`
type Equal<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;
type Assert<T extends true>=T;
type A=[
 Assert<Equal<keyof ChannelConfig,'enabled'|'allowedSenders'|'respondToAll'|'tools'|'autoApprove'|'progress'|'notifications'|'model'|'modelProvider'|'fallbackModel'|'fallbackModelProvider'|'timeZone'|'token'>>,
 Assert<Equal<Parameters<ChannelConnector['start']>,[ChannelConnectorEvents,ChannelConfig?,ChannelPairOptions?]>>,
 Assert<Equal<ReturnType<ChannelConnector['start']>,Promise<void>>>,
 Assert<Equal<ReturnType<ChannelConnector['stop']>,Promise<void>>>,
 Assert<Equal<Parameters<ChannelConnector['send']>,[OutboundMessage]>>,
 Assert<Equal<ReturnType<ChannelConnector['send']>,Promise<void>>>,
 Assert<Equal<ReturnType<ChannelConnector['status']>,ChannelStatus>>,
 Assert<Equal<ReturnType<ChannelConnector['currentQr']>,string|null>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnector['pair']>>,[ChannelPairOptions?]>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['pair']>>,Promise<void>>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['setupGuide']>>,Promise<ChannelSetupGuide>>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnector['startTyping']>>,[string]>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['startTyping']>>,()=>void>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnector['sendLive']>>,[string,string]>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['sendLive']>>,Promise<string|null>>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnector['editLive']>>,[string,string,string]>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['editLive']>>,Promise<void>>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnector['setCommandMenu']>>,[ChannelCommandDescriptor[]]>>,
 Assert<Equal<ReturnType<NonNullable<ChannelConnector['setCommandMenu']>>,Promise<void>>>,
 Assert<Equal<Parameters<ChannelConnectorEvents['onInbound']>,[InboundMessage]>>,
 Assert<Equal<Parameters<ChannelConnectorEvents['onStatus']>,[ChannelStatus,ChannelStatusDetail?]>>,
 Assert<Equal<Parameters<NonNullable<ChannelConnectorEvents['onPaired']>>,[ChannelPairing]>>
];
declare let connector:ChannelConnector;
// @ts-expect-error connector identity is readonly
connector.id='other';
// @ts-expect-error connector label is readonly
connector.label='other';
// @ts-expect-error connector feature flag is readonly
connector.supportsChoices=true;
// @ts-expect-error closed status union
const badStatus:ChannelStatus='stopping';
// @ts-expect-error inbound message requires source flags
const badInbound:InboundMessage={channelId:'x',conversationId:'r',senderId:'s',text:'t',timestamp:1};
// @ts-expect-error config enabled is boolean
const badConfig:ChannelConfig={enabled:'true'};
// @ts-expect-error guide QR is required even when null
const badGuide:ChannelSetupGuide={link:'',suggestedName:'',suggestedUsername:''};
// @ts-expect-error a live message id may be null but cannot be numeric
const badLive:NonNullable<ChannelConnector['sendLive']>=async()=>42;
`;
 writeFileSync(join(dir,'fixtures.ts'),imports+fixture);writeFileSync(join(dir,'negative.ts'),imports+negative);
 writeFileSync(join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,skipLibCheck:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',allowImportingTsExtensions:true,types:[],lib:['ES2022']},files:['fixtures.ts','negative.ts']}));
 const checked=Bun.spawnSync(['node',join(root,'node_modules/typescript/bin/tsc'),'-p',join(dir,'tsconfig.json')],{cwd:root,stdout:'pipe',stderr:'pipe',timeout:8000});
 if(checked.exitCode!==0)throw Error('channel declaration compile failed: '+new TextDecoder().decode(checked.stdout)+new TextDecoder().decode(checked.stderr));
 const {corpus}=await import(pathToFileURL(join(dir,'fixtures.ts')).href);
 const module=await import(pathToFileURL(source).href);
 return {corpus,exports:Object.keys(module),strictTypes:true};
}
