import json
from pathlib import Path
root=Path(__file__).resolve().parents[3]
vectors=[]; mappings=[]
inv=json.loads((root/'tests/contract/coverage.json').read_text())
files={f['path']:f for f in inv['test_files']}
def assertion(path,value,kind='eq',**extra):return dict(path=path,kind=kind,value=value,**extra)
def case(file,index,name,calls,assertions,covered):
 id='internal.tailhelpers.'+name
 vectors.append(dict(id=id,calls=[dict(op='tailhelpers.'+op,**args) for op,args in calls],assertions=assertions))
 original=files['packages/gateway/src/tools/'+file+'.test.ts']['cases'][index]
 mappings.append(dict(original=original['id'],name=original['name'],vectors=[id],assertionsCovered=covered,gaps='',status='authored-unrun'))
a=assertion
case('token-estimator',0,'plain-and-json-rounding',[('text',dict(value='')),('text',dict(value='abcd')),('json',dict(value='abcd')),('json',dict(value={'a':'abcd'}))],[a('/0',0),a('/1',2),a('/2',1),a('/3',3)],'All four exact rounded estimates.')
case('token-estimator',1,'unsupported-json',[('json',dict(value={'$fixture':kind})) for kind in ['undefined','function','circular']],[a('/'+str(i),0) for i in range(3)],'Undefined, function, circular values all return zero without throwing.')
case('token-estimator',2,'message-tool-calls',[('message',dict(message=dict(role='user',content='abcd'))),('message',dict(message=dict(role='assistant',content='abcd',tool_calls=[dict(name='read_file',args=dict(path='README.md'))]))),('message',dict(message=dict(role='assistant',content='abcd')))],[a('/0',6),dict(path='/1',kind='gt-path',other='/2',factor=1)],'Exact overhead and structured call increase compared to baseline.')
case('token-estimator',3,'hidden-thinking',[('message',dict(message=dict(role='assistant',content='abcd'))),('message',dict(message=dict(role='assistant',content='abcd',thinking='Let me analyze this step by step. The user wants me to read the file.')))],[dict(path='/1',kind='gt-path',other='/0',factor=1),a('/1',15,'difference-ge',other='/0')],'With-thinking exceeds baseline and the difference is at least 15; no fixed baseline.')
case('token-estimator',4,'large-thinking-usage',[('usage',dict(messages=[dict(role='system',content='system prompt'),dict(role='user',content='do the task'),dict(role='assistant',content='working on it',thinking={'$fixture':'repeat','text':'x','count':100000})],schemas=[],limit=200000))],[a('/0/history',27000,'gt'),a('/0/ratio',0.13,'gt')],'Original history and ratio lower bounds with full 100000-character reasoning fixture.')
case('token-estimator',5,'history-priming',[('history',dict(messages=[dict(role='system',content='abcd'),dict(role='user',content='abcd')]))],[a('/0',15)],'Exact primed token total.')
case('token-estimator',6,'usage-categories',[('usage',dict(messages=[dict(role='system',content='abcd'),dict(role='user',content='abcd'),dict(role='tool',content='')],schemas=[dict(name='read')],limit=16))],[a('/0/'+k,v) for k,v in dict(system=6,history=6,toolResults=4,tools=31,total=47,limit=16,ratio=1).items()],'All seven exact category, total, limit, capped ratio assertions.')
case('token-estimator',7,'empty-schemas',[('schemas',dict(schemas=[]))],[a('/0',0)],'Empty schema list zero.')
messages=[dict(role='system',content='Follow the project rules.'),dict(role='user',content='Inspect the code.'),dict(role='assistant',content='I will read the relevant files.'),dict(role='tool',content='packages/gateway/src/tools/token-estimator.ts')]
schemas=[dict(type='function',function=dict(name='read_file',description='Read a file',parameters=dict(type='object',properties=dict(path=dict(type='string')))))]
case('token-estimator',8,'usage-summed-categories',[('usage',dict(messages=messages,schemas=schemas,limit=10))],[a('/0/system',0,'gt'),dict(path='/0/history',kind='gt-path',other='/0/system',factor=1),a('/0/toolResults',0,'gt'),a('/0/tools',0,'gt')]+[dict(path='/0/total',kind='sum-paths-eq',paths=['/0/system','/0/history','/0/toolResults','/0/tools']),a('/0/limit',10),a('/0/ratio',1)],'Original positive categories, history > system, total = sum(categories), limit and cap.')
todo_schema=dict(type='object',properties=dict(todoList=dict(type='array',items=dict(type='object',properties=dict(id=dict(type='integer'),title=dict(type='string'),status=dict(type='string',enum=['not-started','in-progress','completed'])),required=['id','title','status']))),required=['todoList'])
case('validate',0,'coerce-nested-array',[('validate',dict(schema=todo_schema,input=dict(todoList=[dict(id='1',title='Ship tests',status='in-progress')])) )],[a('/0/result',dict(valid=True,errors=[])),a('/0/input',dict(todoList=[dict(id=1,title='Ship tests',status='in-progress')]))],'Exact success and nested mutation.')
schema=dict(type='object',properties=dict(threads=dict(type='array',items=dict(type='object',properties=dict(title=dict(type='string'),runtimeMode=dict(type='string',enum=['full-access','supervised'])),required=['title']))))
case('validate',1,'nested-required-path',[('validate',dict(schema=schema,input=dict(threads=[dict(runtimeMode='full-access')])))],[a('/0/result/valid',False),a('/0/result/errors','Missing required property: threads[0].title','array-contains')],'Invalid plus original full-path error; array containment permits additional errors.')
case('validate',2,'invalid-array-item',[('validate',dict(schema=dict(type='object',properties=dict(urls=dict(type='array',items=dict(type='string')))),input=dict(urls=['https://example.com',42])))],[a('/0/result/valid',False),a('/0/result/errors',"Property 'urls[1]' expected type 'string', got 'number'",'array-contains')],'Invalid plus original indexed type error.')
case('validate',3,'parse-object-then-coerce',[('validate',dict(schema=dict(type='object',properties=dict(payload=dict(type='object',properties=dict(enabled=dict(type='boolean')),required=['enabled']))),input=dict(payload='{"enabled":"true"}')))],[a('/0/result',dict(valid=True,errors=[])),a('/0/input',dict(payload=dict(enabled=True)))],'Exact success and parsed nested boolean mutation.')
schema=dict(type='object',properties=dict(timeoutMs=dict(type='number'),retryCount=dict(type='integer')),required=['timeoutMs','retryCount'])
case('validate',4,'reject-nonfinite',[('validate',dict(schema=schema,input=dict(timeoutMs={'$fixture':'nan'},retryCount=1))),('validate',dict(schema=schema,input=dict(timeoutMs=1000,retryCount={'$fixture':'infinity'})))],[a('/0/result',dict(valid=False,errors=["Property 'timeoutMs' expected type 'number', got 'number'"])),a('/1/result',dict(valid=False,errors=["Property 'retryCount' expected type 'integer', got 'number'"]))],'Both NaN and positive infinity exact validation results.')
(root/'tests/contract/vectors/tailhelpers.json').write_text(json.dumps(vectors,indent=2)+'\n')
artifact_dir=root/'.jait/artifacts/rust-continuation/helper-equivalence'
artifact_dir.mkdir(parents=True,exist_ok=True)
(artifact_dir/'mapping-proposal.json').write_text(json.dumps(dict(lane='tailhelpers',vectors=len(vectors),verified=False,execution='Authored only; see adjacent validation logs for execution evidence',declarations=mappings),indent=2)+'\n')
print('Authored',len(vectors),'Rust-owned vectors for',len(mappings),'declarations; no test execution.')
