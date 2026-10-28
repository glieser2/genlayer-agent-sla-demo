import './style.css';
import './action-feedback.css';
import {parseCase, parseResult, objectiveFindings, address, hash, receiptOutcome, parseJournal, type CaseInput, type Finding, type TxRecord} from './domain.ts';
import {CHAIN, NETWORK_NAME, readClient, makeWriter, checkNetwork, switchNetwork, contractUrl, transactionUrl, type Provider} from './network.ts';
import {studioRpc,normalizeStudioTransaction} from './studio.ts';
declare global { interface Window { ethereum?: Provider; } }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const json = (v: unknown) => JSON.stringify(v, (_,x) => typeof x === 'bigint' ? x.toString() : x, 2);
const short = (v: string) => v ? `${v.slice(0,8)}…${v.slice(-6)}` : '未连接';
const labels: Record<string,string> = {C1:'按时交付',C2:'测试与版本',C3:'响应式布局',C4:'交接文档',met:'满足',not_met:'未满足',insufficient_evidence:'证据不足'};
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/" aria-label="Agent SLA 首页"><span class="brandmark">↗</span><span>AGENT SLA<small>交付证据工作台</small></span></a><div class="header-right"><span class="network"><i></i>Studionet · 61999</span><button id="connect" class="dark">连接钱包</button></div></header>
<main><section class="intro"><div><p class="eyebrow">EVIDENCE BEFORE CONCLUSIONS</p><h1>交付是否达标，<br><em>让证据说话。</em></h1><p class="lede">按固定 SLA 标准检查交付记录，<br>通过 GenLayer 评估布局与文档证据，并保留判断依据。</p></div><aside class="intro-card"><span class="micro">工作流</span><ol><li><b>01</b>整理证据<span>时间 · 版本 · 报告 · 双方陈述</span></li><li><b>02</b>提交评估<span>冻结证据包，独立核对判断与引用</span></li><li><b>03</b>复核结果<span>逐项展示满足、未满足与证据不足</span></li></ol></aside></section>
<div class="notice"><strong>开发预览版</strong><span>合成示例与链上读取分别标记；评估仅针对提供的材料，不认证证据、不结算资金。Studionet 开发网可能重置。</span></div>
<nav class="steps" aria-label="工作区"><button class="tab active" data-panel="prepare">01　准备证据</button><button class="tab" data-panel="chain">02　链上评估</button><button class="tab" data-panel="history">03　交易记录</button></nav>
<section id="prepare" class="panel"><div class="workspace"><article class="card"><div class="card-title"><div><p class="eyebrow">CASE SNAPSHOT</p><h2>你的交付证据包</h2></div><span id="case-status" class="pill">待检查</span></div><p class="muted">上传或编辑 JSON。部署后该份证据包不可更改。不要上传密码、密钥或不宜公开的个人资料。</p><div class="toolbar"><button id="sample">加载合成案例</button><label class="file-button" for="import">导入 JSON<input type="file" id="import" accept=".json,application/json"></label><button id="save-input">下载证据包</button></div><label for="snapshot" class="sr-only">交付证据 JSON</label><textarea id="snapshot" spellcheck="false" placeholder="加载合成案例，或粘贴你的证据 JSON…"></textarea><div class="editor-footer"><span id="byte-count">0 / 16,000 字节</span><button id="validate" class="dark">检查证据 →</button></div></article><aside class="card criteria"><p class="eyebrow">SLA-DEMO-v1</p><h2>四项标准，同一份证据</h2><div class="criterion"><b>C1</b><div><h3>按时交付</h3><p>提交时间不晚于约定时间。</p><small>确定性检查</small></div></div><div class="criterion"><b>C2</b><div><h3>测试与版本</h3><p>报告对应交付版本，所有测试通过。</p><small>确定性检查</small></div></div><div class="criterion"><b>C3</b><div><h3>响应式布局</h3><p>360、768、1440px 下没有横向溢出。</p><small>GenLayer 语义评估</small></div></div><div class="criterion"><b>C4</b><div><h3>交接文档</h3><p>有与交付版本对应的安装、运行及测试说明。</p><small>GenLayer 语义评估</small></div></div><button id="show-example" class="full">查看合成示例结果 ↗</button><p class="footnote">证据不足是一种有效结果，不会自动当作交付失败。</p></aside></div></section>
<section id="chain" class="panel hidden"><div class="workspace"><article class="card"><p class="eyebrow">GENLAYER CONNECTION</p><h2>连接已有合约，或部署新证据包</h2><p class="muted">目标：${NETWORK_NAME}。此网络可重置，不代表 Bradbury 部署或 Portal 已认可该网络。</p><div class="toolbar"><button id="check-network">检查网络</button><a href="https://studio.genlayer.com" target="_blank" rel="noreferrer">打开官方 Studio ↗</a><a href="/contracts/agent_sla.py" download>下载合约源码 ↓</a></div><p id="network-state" class="footnote">尚未连接 RPC</p><label for="contract">合约地址</label><div class="input-row"><input id="contract" placeholder="0x…" autocomplete="off"><button id="read" class="dark">读取结果</button></div><p class="footnote">读取前会校验链上源码是否与本应用附带版本一致，不需要连接钱包。</p><hr><h3>准备本次交易</h3><p class="muted">当前使用稳定 Studionet（61999）和 SDK 1.1.8。Studio 的零地址派发与当前浏览器钱包不兼容，应用会在请求签名前停止；只读查询仍可使用。</p><div class="toolbar"><button id="quote-deploy">准备新部署</button><button id="quote-assess">准备 assess 评估</button></div><p class="footnote">新部署固定当前证据包；assess 仅允许原部署者调用一次。当前钱包兼容问题不能通过充值解决。</p></article><aside class="card"><p class="eyebrow">TRANSACTION REVIEW</p><h2>签名前复核</h2><p id="quote-empty" class="muted">先连接钱包并获取交易复核。任何链上操作都需要你在钱包中确认。</p><pre id="quote-summary" class="hidden"></pre><label class="check"><input id="consent" type="checkbox">我已复核网络和证据摘要，并会检查钱包展示的费用，愿意在钱包中确认本次操作。</label><button id="submit" class="dark full" disabled>等待准备</button><p class="footnote">应用不接收私钥或助记词。交易发出后，超时只会保留原 ID 继续查询，不会自动再次提交。</p></aside></div></section>
<section id="history" class="panel hidden"><article class="card"><div class="card-title"><div><p class="eyebrow">TRANSACTION JOURNAL</p><h2>继续查询，无需重复提交</h2></div><button id="export">导出工作记录 ↓</button></div><p class="muted">本机仅保存交易 ID、地址与状态，不保存你的证据包。记录内容来自 RPC，导出文件本身不是平台回执。</p><label for="txid">查询已有交易 ID</label><div class="input-row"><input id="txid" placeholder="0x…"><button id="track">查询交易</button></div><div id="journal"></div></article></section>
<section class="results card"><div class="card-title"><div><p class="eyebrow">ASSESSMENT</p><h2>逐项复核</h2></div><span id="result-source" class="pill">尚无结果</span></div><p id="result-context" class="muted">检查证据可预览 C1/C2；C3/C4 需要链上评估。也可以单独查看标明来源的合成示例。</p><div id="findings" class="findings"></div></section><p id="message" role="status" aria-live="polite">准备好后，从证据包开始。</p><footer><span>Agent SLA Workbench · v0.1.3</span><span>AI 辅助开发 · 无资金托管 · 无法律裁判效力</span></footer></main>`;

const feedback=document.createElement('p');feedback.id='chain-feedback';feedback.className='action-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.textContent='点击“准备新部署”后，这里会显示进度或需要处理的问题。';
$('quote-deploy').closest('.toolbar')!.before(feedback);
let account: `0x${string}` | undefined;
let busy = false;
let records: TxRecord[] = [];
try {records=parseJournal(localStorage.getItem('agent-sla:transactions:v1'));} catch { /* The app also works when browser persistence is disabled. */ }
let evidence: Record<string, unknown> | null = null;
type Quote = {kind:'deploy'|'assess'; account:`0x${string}`; contract:string; snapshot:string; code:string; balance:bigint; consensusTarget:string; at:number};
let quote: Quote | null = null;
const snapshot = () => $<HTMLTextAreaElement>('snapshot').value;
const source = async () => {const r = await fetch('/contracts/agent_sla.py'); if(!r.ok) throw new Error('无法加载合约源码。'); return r.text();};
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function message(value: string, error=false) { $('message').textContent=value; $('message').classList.toggle('error',error);feedback.textContent=value;feedback.classList.toggle('error',error); }
function invalidate() {quote=null; $<HTMLInputElement>('consent').checked=false; $('quote-summary').classList.add('hidden'); $('quote-empty').classList.remove('hidden'); $<HTMLButtonElement>('submit').disabled=true; $('submit').textContent='等待准备';}
function setInput(value: string) { $<HTMLTextAreaElement>('snapshot').value=value; invalidate(); $('case-status').textContent='待检查'; $('byte-count').textContent=`${new TextEncoder().encode(value).length.toLocaleString()} / 16,000 字节`; }
function show(panel: string) {document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('hidden',e.id!==panel));document.querySelectorAll<HTMLElement>('.tab').forEach(e=>e.classList.toggle('active',e.dataset.panel===panel));}
document.querySelectorAll<HTMLElement>('.tab').forEach(e=>e.addEventListener('click',()=>show(e.dataset.panel!)));
function render(findings: Finding[], provenance: string, context: string) {
  $('result-source').textContent=provenance; $('result-context').textContent=context; $('findings').replaceChildren();
  for(const f of findings) {
    const card=document.createElement('article'); card.className=`finding ${f.status}`;
    const caption=document.createElement('p'); caption.className='micro'; caption.textContent=`${f.criterion_id} · ${labels[f.criterion_id]}`;
    const title=document.createElement('h3'); title.textContent=labels[f.status];
    const reason=document.createElement('p'); reason.textContent=f.reason;
    const refs=document.createElement('small'); refs.textContent=f.evidence_ids.length?`依据：${f.evidence_ids.join(' · ')}`:'无足够的可引用证据';
    card.append(caption,title,reason,refs);$('findings').append(card);
  }
}
function saveRecords() {try{localStorage.setItem('agent-sla:transactions:v1',json(records.slice(-40)));}catch{message('浏览器无法持久保存交易记录，请立即复制当前交易 ID。',true);}renderRecords();}
function renderRecords() {
  $('journal').replaceChildren();
  if(!records.length){const p=document.createElement('p');p.className='empty';p.textContent='尚无本机交易记录。';$('journal').append(p);}
  for(const r of [...records].reverse()) {
    const row=document.createElement('div');row.className='journal-row';
    const left=document.createElement('div'); const link=document.createElement('a'); link.href=transactionUrl(r.hash);link.target='_blank';link.rel='noreferrer';link.textContent=`${r.kind==='deploy'?'部署':'评估'} · ${short(r.hash)} ↗`;
    const outcomes:Record<string,string>={pending:'待确认',unknown:'执行状态未知',success:'执行成功',failed:'执行失败',wrong_type:'非合约交易，未完成部署/评估'};
    const meta=document.createElement('small');meta.textContent=`${outcomes[r.outcome]??r.outcome} · chain ${r.chainId} · ${r.createdAt}`; left.append(link,meta);
    const resume=document.createElement('button');resume.textContent='继续查询';resume.addEventListener('click',()=>run(()=>track(r.hash)));row.append(left,resume);$('journal').append(row);
  }
}
async function run(fn:()=>Promise<void>|void,button?:HTMLButtonElement) {
  if(busy){message('上一项操作仍在处理中，请查看进度或钱包请求。');return;}
  busy=true;document.body.classList.add('working');
  const label=button?.textContent;if(button){button.disabled=true;button.textContent='处理中…';}
  try{await fn();}catch(e){message(e instanceof Error ? e.message : String(e),true);}finally{busy=false;document.body.classList.remove('working');if(button){if(button.textContent==='处理中…')button.textContent=label??'';if(button.id!=='submit')button.disabled=false;}}
}
async function walletCheck() {
  if(!window.ethereum || !account) throw new Error('请先连接浏览器钱包。');
  const chainId=Number(await window.ethereum.request({method:'eth_chainId'}));
  const accounts=await window.ethereum.request({method:'eth_accounts'}) as string[];
  if(chainId!==CHAIN.id || !accounts.some(a=>a.toLowerCase()===account!.toLowerCase())) {account=undefined;invalidate();$('connect').textContent='重新连接钱包';throw new Error('钱包账号或网络已变化，请重新连接并准备。');}
  await checkNetwork();
}
async function compatible(contract: `0x${string}`) {
  const local=await source(); const remote=await readClient.getContractCode(contract);
  if(await digest(local)!==await digest(remote)) throw new Error('合约源码与本工作台版本不一致，停止评估。请核对部署的原始合约。');
}
async function read(contract: `0x${string}`) {
  await checkNetwork();await compatible(contract);
  const rawSnapshot=await readClient.readContract({address:contract,functionName:'get_snapshot',args:[]});
  if(typeof rawSnapshot!=='string') throw new Error('未读取到有效证据包。');
  const c=parseCase(rawSnapshot);
  const result=await readClient.readContract({address:contract,functionName:'get_result',args:[]});
  setInput(rawSnapshot);$<HTMLInputElement>('contract').value=contract;
  if(result===''){evidence={chainId:CHAIN.id,contract,snapshotSha256:await digest(rawSnapshot),observedAt:new Date().toISOString(),assessment:null};render(objectiveFindings(c),'链上证据 · 尚未评估',`${c.case_id} · 合约已读取；C1/C2 为本地核对，不代表已运行 assess。`);}
  else{const parsed=parseResult(result,c);evidence={chainId:CHAIN.id,contract,explorer:contractUrl(contract),snapshotSha256:await digest(rawSnapshot),observedAt:new Date().toISOString(),assessment:parsed};render(parsed.findings,'链上读取',`${c.case_id} · ${short(contract)} · 仅评估提供的材料。`);}
  message('读取完成。可在交易记录中导出工作记录。');
}
async function prepareQuote(kind: 'deploy'|'assess') {
  invalidate();message('正在核对钱包、网络和 Studio 当前配置…');await walletCheck();const writer=await makeWriter(account!,window.ethereum!);
  const unresolved=records.filter(r=>r.account.toLowerCase()===account!.toLowerCase()&&['pending','unknown'].includes(r.outcome));
  for(const record of unresolved.slice(0,3)) {
    message(`正在只读核对既有交易 ${short(record.hash)}，不会重发…`);
    const tx=normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash',[hash(record.hash)]));
    if(!tx.sender||tx.sender.toLowerCase()!==record.account.toLowerCase())throw new Error('旧交易的发送账号无法核对，请到交易记录中检查原 ID。');
    record.outcome=!tx.isContractTransaction||tx.transactionType!==(record.kind==='deploy'?1:2)?'wrong_type':receiptOutcome(tx);
    if(record.outcome==='success'&&tx.contract)record.contract=tx.contract;
    saveRecords();
    if(kind==='deploy'&&record.kind==='deploy'&&record.outcome==='success'&&record.contract){$<HTMLInputElement>('contract').value=record.contract;throw new Error('已有一笔部署执行成功，请先读取该合约并继续评估，不要重复部署。');}
  }
  if(records.some(r=>r.account.toLowerCase()===account!.toLowerCase() && ['pending','unknown'].includes(r.outcome))) throw new Error('此账号仍有状态未确认的交易。请点击“03 交易记录”继续查询原 ID；尚未发送新交易。');
  const code=await source();let raw=snapshot();let contract='';
  if(kind==='deploy'){if(!raw.trim())throw new Error('证据包为空。请到“01 准备证据”加载合成案例并检查，再回来准备部署。');parseCase(raw);message('正在读取合约接口，尚未请求签名…');const schema=await readClient.getContractSchemaForCode(code);if(!schema.methods?.assess || !schema.methods?.get_result) throw new Error('网络未能识别合约接口；请检查 SDK 与 GenVM 兼容性。');}
  else {
    contract=address($<HTMLInputElement>('contract').value.trim());await compatible(address(contract));
    const stored=await readClient.readContract({address:address(contract),functionName:'get_snapshot',args:[]});
    const result=await readClient.readContract({address:address(contract),functionName:'get_result',args:[]});
    if(result!=='')throw new Error('该合约已有评估结果，不能再次调用 assess。');
    if(typeof stored!=='string')throw new Error('链上证据包无效。');parseCase(stored);raw=stored;setInput(raw);
  }
  message('正在读取测试网余额并生成签名前复核内容…');const balance=await readClient.getBalance({address:account!});
  const consensusTarget=writer.chain.consensusMainContract!.address;
  quote={kind,account:account!,contract,snapshot:raw,code,balance,consensusTarget,at:Date.now()};
  $('quote-summary').textContent=json({operation:kind,network:NETWORK_NAME,chainId:CHAIN.id,account,contract:contract||'新部署',consensusTarget,configurationSource:'官方 Studio sim_getConsensusContract；仅适用开发网61999',caseId:parseCase(raw).case_id,snapshotSha256:await digest(raw),sourceSha256:await digest(code),balanceWei:String(balance),fee:'具体费用由钱包在签名前展示；尚未测量实际费用',note:'仅使用开发网测试币，不自动领取或充值'});
  $('quote-summary').classList.remove('hidden');$('quote-empty').classList.add('hidden');$('submit').textContent=kind==='deploy'?'确认并请求部署签名':'确认并请求评估签名';message('交易内容已准备，5 分钟内有效。请在钱包确认界面检查费用。');
}
async function submit() {
  const q=quote;if(!q||!$<HTMLInputElement>('consent').checked)throw new Error('请先复核交易复核。');
  if(Date.now()-q.at>300000){invalidate();throw new Error('准备已过期，请重新准备。');}
  invalidate();await walletCheck();const writer=await makeWriter(account!,window.ethereum!);
  if(writer.chain.consensusMainContract?.address.toLowerCase()!==q.consensusTarget.toLowerCase()){invalidate();throw new Error('Studio 共识目标已变化，请重新准备交易。');}
  if(account!==q.account || snapshot()!==q.snapshot || (q.kind==='assess' && $<HTMLInputElement>('contract').value.trim()!==q.contract)) {invalidate();throw new Error('证据、钱包或合约已变化，请重新准备。');}
  const id=q.kind==='deploy'?await writer.deployContract({code:q.code,args:[q.snapshot]}):await writer.writeContract({address:address(q.contract),functionName:'assess',args:[],value:0n});
  hash(id);records.push({hash:id,kind:q.kind,chainId:CHAIN.id,account:q.account,contract:q.contract,createdAt:new Date().toISOString(),outcome:'pending'});saveRecords();show('history');message(`交易已发送：${id}。尚未确认执行成功。`);
  await track(id);
}
async function track(value: string) {
  const id=hash(value);await checkNetwork();message(`正在查询 ${short(id)}，不会重发交易…`);
  const tx=normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash',[id]));
  const record=records.find(r=>r.hash.toLowerCase()===id.toLowerCase());
  if(!tx.isContractTransaction || (record && tx.transactionType!==(record.kind==='deploy'?1:2))) {
    if(record){record.outcome='wrong_type';saveRecords();}
    message('此 ID 对应的不是预期合约操作；即使 FINALIZED 也不算部署/评估成功。不要对该记录调用 assess。',true);return;
  }
  const outcome=receiptOutcome(tx);
  if(record){record.outcome=outcome;saveRecords();}
  if(outcome!=='success'){message(`交易状态：${tx.statusName??'未知'} / ${tx.txExecutionResultName??'尚无执行结果'}。${outcome==='failed'?'执行未成功。':'稍后继续查询同一 ID。'}`,outcome==='failed');return;}
  const candidate=tx.contract;
  if(candidate){const target=address(candidate);if(record){record.contract=target;saveRecords();}await read(target);}
  else message('交易已终局且执行成功；未能从回执解析合约地址，请从浏览器取得后手动读取。');
}
function download(name:string,value:string){const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function bind(id:string,fn:()=>Promise<void>|void){$(id).addEventListener('click',()=>run(fn,$(id) instanceof HTMLButtonElement?$(id) as HTMLButtonElement:undefined));}
bind('sample',async()=>{const r=await fetch('/fixtures/case.json');if(!r.ok)throw new Error('无法加载案例。');setInput(json(await r.json()));message('已加载合成案例：内容不是实际网站测量。');});
bind('validate',()=>{const c=parseCase(snapshot());$('case-status').textContent='结构检查通过';render(objectiveFindings(c),'本地确定性预览',`${c.case_id} · C3/C4 尚未评估。结构有效不代表证据真实。`);message('证据包结构有效，已预览 C1/C2。');});
bind('show-example',async()=>{const [a,b]=await Promise.all([fetch('/fixtures/case.json'),fetch('/fixtures/demo-result.json')]);const c=parseCase(await a.text());const demo=await b.json();const result=parseResult(json(demo.assessment),c);render(result.findings,'合成示例 · 固定模拟响应','来自历史 SDK 本地测试，不是当前输入的判断，也不是链上结果。');message('正在展示合成示例。');});
bind('save-input',()=>{const c=parseCase(snapshot());download('sla-evidence.json',json(c));});
bind('connect',async()=>{invalidate();if(!window.ethereum)throw new Error('当前浏览器未检测到钱包扩展。请在安装钱包的 Chrome 中打开此应用。');const list=await window.ethereum.request({method:'eth_requestAccounts'}) as string[];if(!list.length)throw new Error('没有授权的钱包账号。');account=address(list[0]);await switchNetwork(window.ethereum);await walletCheck();$('connect').textContent=short(account);message('钱包已连接 Studionet 开发网；未发送任何交易。');});
bind('check-network',async()=>{const n=await checkNetwork();$('network-state').textContent=`已验证 chain ${n.chainId} · ${n.rpc}`;message('RPC 链 ID 检查通过，尚未验证合约部署兼容性。');});
bind('read',()=>read(address($<HTMLInputElement>('contract').value.trim())));
const readVerified=document.createElement('button');readVerified.id='read-verified';readVerified.textContent='读取链上合成案例 ↗';$('check-network').parentElement!.append(readVerified);
bind('read-verified',()=>{const contract=address('0x12de9d0F0CEFC3697e76656A3b520c302e17faE9');$<HTMLInputElement>('contract').value=contract;invalidate();return read(contract);});
bind('quote-deploy',()=>prepareQuote('deploy'));bind('quote-assess',()=>prepareQuote('assess'));bind('submit',submit);
bind('track',()=>track($<HTMLInputElement>('txid').value.trim()));
bind('export',()=>{download('agent-sla-work-record.json',json({app:'agent-sla-workbench',version:'0.1.3',generatedAt:new Date().toISOString(),transactions:records,chainRead:evidence,note:'RPC observations and local records; not a Portal acceptance or reward receipt. No input evidence text is included.'}));message('工作记录已导出。');});
$('snapshot').addEventListener('input',()=>{invalidate();$('case-status').textContent='待检查';$('byte-count').textContent=`${new TextEncoder().encode(snapshot()).length.toLocaleString()} / 16,000 字节`;});
for(const id of ['contract'])$(id).addEventListener('input',invalidate);
$('consent').addEventListener('change',()=>{$<HTMLButtonElement>('submit').disabled=!quote||!$<HTMLInputElement>('consent').checked;});
$('import').addEventListener('change',()=>run(async()=>{const f=$<HTMLInputElement>('import').files?.[0];if(!f)return;if(f.size>16000)throw new Error('文件超过 16,000 字节。');const raw=await f.text();parseCase(raw);setInput(raw);message('已导入证据包，仅保留在当前页面内存中。');}));
const provider=window.ethereum as Provider & {on?:(event:string,fn:()=>void)=>void};
for(const event of ['accountsChanged','chainChanged'])provider?.on?.(event,()=>{account=undefined;invalidate();$('connect').textContent='重新连接钱包';message('钱包网络或账号发生变化，请重新连接。');});
renderRecords();
