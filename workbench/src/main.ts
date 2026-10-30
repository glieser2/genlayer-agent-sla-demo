import './style.css';
import './action-feedback.css';
import {parseCase, parseResult, objectiveFindings, address, hash, receiptOutcome, parseJournal, type CaseInput, type Finding, type TxRecord} from './domain.ts';
import {CHAIN, NETWORK_NAME, readClient, makeWriter, checkNetwork, switchNetwork, contractUrl, transactionUrl, type Provider} from './network.ts';
import {studioRpc,normalizeStudioTransaction} from './studio.ts';
import {createStudioSession,type SessionReview} from './studio-session.ts';
import {createEvidenceReview} from './evidence-review.ts';
declare global { interface Window { ethereum?: Provider; } }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const appBase=import.meta.env.BASE_URL;
const asset=(path:string)=>`${appBase}${path}`;
const json = (v: unknown) => JSON.stringify(v, (_,x) => typeof x === 'bigint' ? x.toString() : x, 2);
const short = (v: string) => v ? `${v.slice(0,8)}…${v.slice(-6)}` : 'Not connected';
const labels: Record<string,string> = {C1:'On-time delivery',C2:'Tests and revision',C3:'Responsive layout',C4:'Handover documentation',met:'Met',not_met:'Not met',insufficient_evidence:'Insufficient evidence'};
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="${appBase}" aria-label="Agent SLA home"><span class="brandmark">↗</span><span>AGENT SLA<small>Delivery Evidence Workbench</small></span></a><div class="header-right"><span class="network"><i></i>Studionet · 61999</span><button id="connect" class="dark">Connect wallet</button></div></header>
<main><section class="intro"><div><p class="eyebrow">EVIDENCE BEFORE CONCLUSIONS</p><h1>Does the delivery meet the brief?<br><em>Let the evidence speak.</em></h1><p class="lede">Review delivery records against a fixed SLA rubric.<br>Use GenLayer to assess layout and documentation evidence, with reasons you can review.</p></div><aside class="intro-card"><span class="micro">Workflow</span><ol><li><b>01</b>Prepare evidence<span>Time · Revision · Report · Statements</span></li><li><b>02</b>Run assessment<span>Freeze the evidence; verify findings and references</span></li><li><b>03</b>Review findings<span>See what is met, not met, or needs more evidence</span></li></ol></aside></section>
<div class="notice"><strong>Development preview</strong><span>Synthetic examples and on-chain results are labelled separately. Assessments cover supplied evidence only, without authentication or payment settlement. Studionet may reset.</span></div>
<nav class="steps" aria-label="Workspace"><button class="tab active" data-panel="prepare">01　Prepare Evidence</button><button class="tab" data-panel="chain">02　On-chain Assessment</button><button class="tab" data-panel="history">03　Transaction History</button></nav>
<section id="prepare" class="panel"><div class="workspace"><article class="card"><div class="card-title"><div><p class="eyebrow">CASE SNAPSHOT</p><h2>Your delivery evidence</h2></div><span id="case-status" class="pill">Not validated</span></div><p class="muted">Import or edit JSON. Deployment freezes this evidence snapshot. Use public material only; never include passwords, private keys, or private personal data.</p><div class="toolbar"><button id="sample">Load synthetic case</button><label class="file-button" for="import">Import JSON<input type="file" id="import" accept=".json,application/json"></label><button id="save-input">Download evidence</button></div><label for="snapshot" class="sr-only">Delivery evidence JSON</label><textarea id="snapshot" spellcheck="false" placeholder="Load the synthetic case or paste your evidence JSON…"></textarea><div class="editor-footer"><span id="byte-count">0 / 16,000 bytes</span><button id="validate" class="dark">Validate evidence →</button></div></article><aside class="card criteria"><p class="eyebrow">SLA-DEMO-v1</p><h2>Four criteria. One evidence snapshot.</h2><div class="criterion"><b>C1</b><div><h3>On-time delivery</h3><p>Submitted on or before the agreed deadline.</p><small>Deterministic check</small></div></div><div class="criterion"><b>C2</b><div><h3>Tests and revision</h3><p>The report matches the delivered revision and all tests pass.</p><small>Deterministic check</small></div></div><div class="criterion"><b>C3</b><div><h3>Responsive layout</h3><p>No horizontal overflow at 360, 768, and 1440px.</p><small>GenLayer semantic assessment</small></div></div><div class="criterion"><b>C4</b><div><h3>Handover documentation</h3><p>Install, run, and test instructions match the delivered revision.</p><small>GenLayer semantic assessment</small></div></div><button id="show-example" class="full">View synthetic example ↗</button><p class="footnote">Insufficient evidence is a valid outcome, not an automatic delivery failure.</p></aside></div></section>
<section id="chain" class="panel hidden"><div class="workspace"><article class="card"><p class="eyebrow">GENLAYER CONNECTION</p><h2>Read a contract or deploy evidence</h2><p class="muted">Network: ${NETWORK_NAME}. This development network may reset. A Studionet deployment does not establish Bradbury deployment or Portal network eligibility.</p><div class="toolbar"><button id="check-network">Check network</button><a href="https://studio.genlayer.com" target="_blank" rel="noreferrer">Open official Studio ↗</a><a href="${asset('contracts/agent_sla.py')}" download>Download contract source ↓</a></div><p id="network-state" class="footnote">RPC not checked</p><label for="contract">Contract address</label><div class="input-row"><input id="contract" placeholder="0x…" autocomplete="off"><button id="read" class="dark">Read results</button></div><p class="footnote">The deployed source must match the version bundled with this app. No wallet connection is needed to read results.</p><hr><h3>Prepare a transaction</h3><p class="muted">This app uses stable Studionet (61999) and SDK 1.1.8. The external-wallet route blocks the zero dispatcher. To test in-app writes, explicitly choose a temporary test account below. Accounts never switch automatically.</p><div class="toolbar"><button id="quote-deploy">Prepare deployment</button><button id="quote-assess">Prepare assessment</button></div><p class="footnote">Deployment freezes the current evidence. Only the deployer may call assess, once. Adding funds will not resolve the current wallet compatibility issue.</p></article><aside class="card"><p class="eyebrow">TRANSACTION REVIEW</p><h2>Review before signing</h2><p id="quote-empty" class="muted">Choose an account and prepare a transaction. Confirm temporary-account operations here; confirm external-wallet operations in your wallet.</p><pre id="quote-summary" class="hidden"></pre><label class="check"><input id="consent" type="checkbox">I have reviewed the network, account, evidence, and fees and approve this operation. Confirming a temporary-account operation signs and sends it from this page. An external wallet requires its own confirmation.</label><button id="submit" class="dark full" disabled>Prepare a transaction first</button><p class="footnote">Never enter a private key or recovery phrase. After submission, keep querying the original transaction ID; a timeout does not trigger resubmission.</p></aside></div></section>
<section id="history" class="panel hidden"><article class="card"><div class="card-title"><div><p class="eyebrow">TRANSACTION JOURNAL</p><h2>Track progress without resubmitting</h2></div><button id="export">Export work record ↓</button></div><p class="muted">Only transaction IDs, addresses, and statuses are saved locally, not the evidence body. Exported RPC observations are not Portal receipts.</p><label for="txid">Existing transaction ID</label><div class="input-row"><input id="txid" placeholder="0x…"><button id="track">Check transaction</button></div><div id="journal"></div></article></section>
<section class="results card"><div class="card-title"><div><p class="eyebrow">ASSESSMENT</p><h2>Findings by criterion</h2></div><span id="result-source" class="pill">No results yet</span></div><p id="result-context" class="muted">Validate evidence to preview C1/C2. C3/C4 require an on-chain assessment. A separately labelled synthetic example is also available.</p><div id="findings" class="findings"></div></section><p id="message" role="status" aria-live="polite">Start by loading or importing an evidence snapshot.</p><footer><span>Agent SLA Workbench · v0.1.7</span><span>AI-assisted development · No escrow · No legal authority</span></footer></main>`;

const feedback=document.createElement('p');feedback.id='chain-feedback';feedback.className='action-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.textContent='Prepare a deployment to see progress or any issues here.';
$('quote-deploy').closest('.toolbar')!.before(feedback);
let account: `0x${string}` | undefined;
const studioSession=createStudioSession(); // Does not generate a key until start(true).
let writeRoute:'wallet'|'session'='wallet';
const sessionControls=document.createElement('div');
sessionControls.innerHTML=`<h3>Temporary Studionet Account</h3><p class="muted">Deploy and assess in this page. This disposable account is separate from your Portal wallet and any existing Studio account. Its key stays only in page memory. Reloading, closing, or ending the account permanently removes signing access; deployed contracts remain readable. Complete both steps in the same session. Do not send assets to this account.</p><label class="check"><input id="session-consent" type="checkbox">I agree to create an independent account in this page, restricted to zero-value, zero-gasPrice operations on Studionet.</label><div class="toolbar"><button id="start-session">Create test account</button><button id="end-session" disabled>End test account</button></div><p id="session-status" class="footnote">External-wallet mode is selected. The app will not switch to a test account automatically.</p>`;
$('quote-deploy').closest('.toolbar')!.before(sessionControls);
let busy = false;
let records: TxRecord[] = [];
try {records=parseJournal(localStorage.getItem('agent-sla:transactions:v1'));} catch { /* The app also works when browser persistence is disabled. */ }
let evidence: Record<string, unknown> | null = null;
const evidenceReview=createEvidenceReview();
const binding=document.createElement('div');binding.id='review-binding';binding.className='review-binding';binding.hidden=true;$('findings').before(binding);
type Quote = {kind:'deploy'|'assess'; account:`0x${string}`; contract:string; snapshot:string; code:string; balance:bigint; consensusTarget:string; at:number;route:'wallet'|'session';sessionReview?:SessionReview};
let quote: Quote | null = null;
const snapshot = () => $<HTMLTextAreaElement>('snapshot').value;
const source = async () => {const r = await fetch(asset('contracts/agent_sla.py')); if(!r.ok) throw new Error('Could not load the contract source.'); return r.text();};
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function message(value: string, error=false) { $('message').textContent=value; $('message').classList.toggle('error',error);feedback.textContent=value;feedback.classList.toggle('error',error); }
function invalidate() {quote=null; $<HTMLInputElement>('consent').checked=false; $('quote-summary').classList.add('hidden'); $('quote-empty').classList.remove('hidden'); $<HTMLButtonElement>('submit').disabled=true; $('submit').textContent='Prepare a transaction first';}
function expireResults(reason: string) {
  const hadResult=!!evidenceReview.current || $('findings').childElementCount>0;
  evidenceReview.changed();evidence=null;binding.hidden=true;binding.replaceChildren();
  if(hadResult){$('findings').replaceChildren();$('result-source').textContent='Outdated · Review again';$('result-context').textContent=reason;}
}
function setInput(value: string, preserveReview=false) {
  if(!preserveReview)expireResults('The evidence was replaced. Validate the new draft or read a contract again.');
  $<HTMLTextAreaElement>('snapshot').value=value;invalidate();$('case-status').textContent='Not validated';$('byte-count').textContent=`${new TextEncoder().encode(value).length.toLocaleString()} / 16,000 bytes`;
}
function renderBinding() {
  const proof=evidenceReview.current;binding.replaceChildren();binding.hidden=!proof;if(!proof)return;
  const title=document.createElement('strong');title.textContent=proof.origin==='synthetic_example'?'Example fingerprint · Not the current draft':`Evidence binding · Revision ${proof.revision}`;
  const origins={local_preview:'Local preview',chain_snapshot:'On-chain snapshot',chain_result:'On-chain result',synthetic_example:'Fixed synthetic example'};
  const detail=document.createElement('p');detail.textContent=`${proof.caseId} · ${origins[proof.origin]} · ${proof.observedAt}`;
  const snapshotHash=document.createElement('code');snapshotHash.textContent=`Snapshot SHA-256: ${proof.snapshotSha256}`;
  const note=document.createElement('p');note.textContent='Fingerprint of the exact reviewed snapshot text. It binds these findings to that snapshot; it does not authenticate the evidence.';
  binding.append(title,detail,snapshotHash);
  if(proof.contract){const contract=document.createElement('p');contract.textContent=`Verified source · chain ${proof.chainId} · ${proof.contract}`;const sourceHash=document.createElement('code');sourceHash.textContent=`Source SHA-256: ${proof.sourceSha256}`;binding.append(contract,sourceHash);}
  binding.append(note);
}
function show(panel: string) {document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('hidden',e.id!==panel));document.querySelectorAll<HTMLElement>('.tab').forEach(e=>e.classList.toggle('active',e.dataset.panel===panel));}
document.querySelectorAll<HTMLElement>('.tab').forEach(e=>e.addEventListener('click',()=>show(e.dataset.panel!)));
function render(findings: Finding[], provenance: string, context: string) {
  $('result-source').textContent=provenance; $('result-context').textContent=context; $('findings').replaceChildren();
  renderBinding();
  for(const f of findings) {
    const card=document.createElement('article'); card.className=`finding ${f.status}`;
    const caption=document.createElement('p'); caption.className='micro'; caption.textContent=`${f.criterion_id} · ${labels[f.criterion_id]}`;
    const title=document.createElement('h3'); title.textContent=labels[f.status];
    const reason=document.createElement('p'); reason.textContent=f.reason;
    const refs=document.createElement('small'); refs.textContent=f.evidence_ids.length?`Evidence: ${f.evidence_ids.join(' · ')}`:'Not enough evidence to cite';
    card.append(caption,title,reason,refs);$('findings').append(card);
  }
}
function saveRecords() {try{localStorage.setItem('agent-sla:transactions:v1',json(records.slice(-40)));}catch{message('Browser storage is unavailable. Copy the transaction ID now.',true);}renderRecords();}
function renderRecords() {
  $('journal').replaceChildren();
  if(!records.length){const p=document.createElement('p');p.className='empty';p.textContent='No local transaction records yet.';$('journal').append(p);}
  for(const r of [...records].reverse()) {
    const row=document.createElement('div');row.className='journal-row';
    const left=document.createElement('div'); const link=document.createElement('a'); link.href=transactionUrl(r.hash);link.target='_blank';link.rel='noreferrer';link.textContent=`${r.kind==='deploy'?'deployment':'assessment'} · ${short(r.hash)} ↗`;
    const outcomes:Record<string,string>={pending:'Pending',unknown:'Execution unknown',success:'Succeeded',failed:'Failed',wrong_type:'Wrong transaction type; no deployment or assessment'};
    const meta=document.createElement('small');meta.textContent=`${outcomes[r.outcome]??r.outcome} · chain ${r.chainId} · ${r.createdAt}`; left.append(link,meta);
    const resume=document.createElement('button');resume.textContent='Check status';resume.addEventListener('click',()=>run(()=>track(r.hash)));row.append(left,resume);$('journal').append(row);
  }
}
async function run(fn:()=>Promise<void>|void,button?:HTMLButtonElement) {
  if(busy){message('An operation is still running. Check its progress or your wallet request.');return;}
  busy=true;document.body.classList.add('working');
  const label=button?.textContent;if(button){button.disabled=true;button.textContent='Working…';}
  try{await fn();}catch(e){message(e instanceof Error ? e.message : String(e),true);}finally{busy=false;document.body.classList.remove('working');if(button){if(button.textContent==='Working…')button.textContent=label??'';if(button.id!=='submit')button.disabled=button.id==='end-session'&&writeRoute!=='session';}}
}
async function walletCheck() {
  if(writeRoute==='session') {
    if(!account||studioSession.address!==account)throw new Error('The temporary test account is no longer available.');
    await checkNetwork();return;
  }
  if(!window.ethereum || !account) throw new Error('Connect an external wallet first.');
  const chainId=Number(await window.ethereum.request({method:'eth_chainId'}));
  const accounts=await window.ethereum.request({method:'eth_accounts'}) as string[];
  if(chainId!==CHAIN.id || !accounts.some(a=>a.toLowerCase()===account!.toLowerCase())) {account=undefined;invalidate();$('connect').textContent='Reconnect wallet';throw new Error('The wallet account or network changed. Reconnect and prepare again.');}
  await checkNetwork();
}
async function compatible(contract: `0x${string}`) {
  const local=await source(); const remote=await readClient.getContractCode(contract);
  const sourceHash=await digest(local);
  if(sourceHash!==await digest(remote)) throw new Error('The deployed source does not match this workbench. Assessment stopped; check the original deployed contract.');
  return sourceHash;
}
async function read(contract: `0x${string}`) {
  const request=evidenceReview.begin();
  await checkNetwork();const sourceSha256=await compatible(contract);
  const rawSnapshot=await readClient.readContract({address:contract,functionName:'get_snapshot',args:[]});
  if(typeof rawSnapshot!=='string') throw new Error('No valid evidence snapshot was returned.');
  const c=parseCase(rawSnapshot);
  const result=await readClient.readContract({address:contract,functionName:'get_result',args:[]});
  const parsed=result===''?null:parseResult(result,c);
  const proof={origin:parsed?'chain_result' as const:'chain_snapshot' as const,caseId:c.case_id,snapshotSha256:await digest(rawSnapshot),sourceSha256,observedAt:new Date().toISOString(),chainId:CHAIN.id,contract};
  if(!evidenceReview.accept(request,proof))throw new Error('Read discarded because the evidence or contract changed while it was loading. Your current draft was kept. Read again when ready.');
  setInput(rawSnapshot,true);$('case-status').textContent='Schema valid';$<HTMLInputElement>('contract').value=contract;
  evidence={chainId:CHAIN.id,contract,explorer:contractUrl(contract),snapshotSha256:proof.snapshotSha256,sourceSha256,observedAt:proof.observedAt,assessment:parsed};
  if(!parsed)render(objectiveFindings(c),'On-chain evidence · Not assessed',`${c.case_id} · Contract loaded. C1/C2 are local checks; assess has not run.`);
  else render(parsed.findings,'On-chain result',`${c.case_id} · ${short(contract)} · Assessment covers supplied evidence only.`);
  message('Results loaded. Export the work record from Transaction History.');
}
async function prepareQuote(kind: 'deploy'|'assess') {
  invalidate();message('Checking the account, network, and current Studio configuration…');await walletCheck();const route=writeRoute;
  const writer=route==='wallet'?await makeWriter(account!,window.ethereum!):null;
  const unresolved=records.filter(r=>r.account.toLowerCase()===account!.toLowerCase()&&['pending','unknown'].includes(r.outcome));
  for(const record of unresolved.slice(0,3)) {
    message(`Checking an existing transaction (read-only): ${short(record.hash)} — no resubmission…`);
    const tx=normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash',[hash(record.hash)]));
    if(!tx.sender||tx.sender.toLowerCase()!==record.account.toLowerCase())throw new Error('The previous transaction sender could not be verified. Check its original ID in Transaction History.');
    record.outcome=!tx.isContractTransaction||tx.transactionType!==(record.kind==='deploy'?1:2)?'wrong_type':receiptOutcome(tx);
    if(record.outcome==='success'&&tx.contract)record.contract=tx.contract;
    saveRecords();
    if(kind==='deploy'&&record.kind==='deploy'&&record.outcome==='success'&&record.contract){$<HTMLInputElement>('contract').value=record.contract;throw new Error('An existing deployment succeeded. Read that contract and continue its assessment instead of deploying again.');}
  }
  if(records.some(r=>r.account.toLowerCase()===account!.toLowerCase() && ['pending','unknown'].includes(r.outcome))) throw new Error('This account has an unresolved transaction. Open Transaction History and query its original ID. No new transaction was sent.');
  const code=await source();let raw=snapshot();let contract='';
  if(kind==='deploy'){if(!raw.trim())throw new Error('The evidence snapshot is empty. Open Prepare Evidence, load the synthetic case, and validate it before preparing a deployment.');parseCase(raw);message('Checking the contract interface; no signature requested…');const schema=await readClient.getContractSchemaForCode(code);if(!schema.methods?.assess || !schema.methods?.get_result) throw new Error('The network could not recognize the contract interface. Check SDK and GenVM compatibility.');}
  else {
    contract=address($<HTMLInputElement>('contract').value.trim());await compatible(address(contract));
    const stored=await readClient.readContract({address:address(contract),functionName:'get_snapshot',args:[]});
    const result=await readClient.readContract({address:address(contract),functionName:'get_result',args:[]});
    if(result!=='')throw new Error('This contract already has an assessment. assess cannot run again.');
    if(typeof stored!=='string')throw new Error('The on-chain evidence snapshot is invalid.');parseCase(stored);raw=stored;setInput(raw);
  }
  message('Reading the test balance and preparing a transaction review…');const balance=await readClient.getBalance({address:account!});
  const sessionReview=route==='session'?await studioSession.prepare({kind,code,snapshot:raw,contract}):undefined;
  const consensusTarget=sessionReview?.target??writer!.chain.consensusMainContract!.address;
  quote={kind,account:account!,contract,snapshot:raw,code,balance,consensusTarget,at:Date.now(),route,sessionReview};
  $('quote-summary').textContent=json({operation:kind,route:route==='session'?'Temporary page account; the official SDK signs after confirmation':'External-wallet confirmation',network:NETWORK_NAME,chainId:CHAIN.id,account,contract:contract||'New deployment',consensusTarget,configurationSource:'Official Studio sim_getConsensusContract; development chain 61999 only',caseId:parseCase(raw).case_id,snapshotSha256:await digest(raw),sourceSha256:await digest(code),balanceWei:String(balance),fee:route==='session'?'Requires value=0 and gasPrice=0; checked again before signing':'Review the actual fees in your wallet before signing',note:'No automatic claims or funding. Temporary-account signing does not open MetaMask.'});
  $('quote-summary').classList.remove('hidden');$('quote-empty').classList.add('hidden');$('submit').textContent=route==='session'?`Confirm and send test ${kind==='deploy'?'deployment':'assessment'}`:kind==='deploy'?'Confirm deployment in wallet':'Confirm assessment in wallet';message('Transaction review ready; valid for 5 minutes. Review and confirm each operation separately.');
}
async function submit() {
  const q=quote;if(!q||!$<HTMLInputElement>('consent').checked)throw new Error('Review the transaction and check the confirmation box first.');
  if(Date.now()-q.at>300000){invalidate();throw new Error('This review expired. Prepare the transaction again.');}
  invalidate();await walletCheck();
  if(writeRoute!==q.route||account!==q.account || snapshot()!==q.snapshot || (q.kind==='assess' && $<HTMLInputElement>('contract').value.trim()!==q.contract)) {invalidate();throw new Error('The evidence, account, or contract changed. Prepare again.');}
  let id:`0x${string}`;
  if(q.route==='session') {
    if(!q.sessionReview)throw new Error('The temporary-account review is missing.');
    id=await studioSession.submit(q.sessionReview,true);
  } else {
    const writer=await makeWriter(account!,window.ethereum!);
    if(writer.chain.consensusMainContract?.address.toLowerCase()!==q.consensusTarget.toLowerCase())throw new Error('The Studio consensus target changed. Prepare the transaction again.');
    id=q.kind==='deploy'?await writer.deployContract({code:q.code,args:[q.snapshot]}):await writer.writeContract({address:address(q.contract),functionName:'assess',args:[],value:0n});
  }
  hash(id);records.push({hash:id,kind:q.kind,chainId:CHAIN.id,account:q.account,contract:q.contract,createdAt:new Date().toISOString(),outcome:'pending'});saveRecords();show('history');message(`Transaction sent: ${id}. Execution success is not yet confirmed.`);
  await track(id);
}
async function track(value: string) {
  const id=hash(value);await checkNetwork();message(`Querying ${short(id)} — no resubmission…`);
  const tx=normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash',[id]));
  const record=records.find(r=>r.hash.toLowerCase()===id.toLowerCase());
  if(!tx.isContractTransaction || (record && tx.transactionType!==(record.kind==='deploy'?1:2))) {
    if(record){record.outcome='wrong_type';saveRecords();}
    message('This ID is not the expected contract operation. FINALIZED does not make it a successful deploy or assessment. Do not use this record to call assess.',true);return;
  }
  const outcome=receiptOutcome(tx);
  if(record){record.outcome=outcome;saveRecords();}
  if(outcome!=='success'){message(`Transaction status: ${tx.statusName??'Unknown'} / ${tx.txExecutionResultName??'No execution result yet'}. ${outcome==='failed'?'Execution did not succeed.':'Query this same ID again later.'}`,outcome==='failed');return;}
  const candidate=tx.contract;
  if(candidate){const target=address(candidate);if(record){record.contract=target;saveRecords();}await read(target);}
  else message('The transaction finalized successfully, but its contract address could not be parsed. Find it in Explorer and read it manually.');
}
function download(name:string,value:string){const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function bind(id:string,fn:()=>Promise<void>|void){$(id).addEventListener('click',()=>run(fn,$(id) instanceof HTMLButtonElement?$(id) as HTMLButtonElement:undefined));}
bind('sample',async()=>{const request=evidenceReview.begin();const r=await fetch(asset('fixtures/case.json'));if(!r.ok)throw new Error('Could not load the case.');const raw=json(await r.json());parseCase(raw);if(!evidenceReview.isCurrent(request))throw new Error('Example loading was discarded because the draft changed. Your draft was kept.');setInput(raw);message('Synthetic case loaded. Its measurements are invented examples, not real website tests.');});
bind('validate',async()=>{const request=evidenceReview.begin(),raw=snapshot(),c=parseCase(raw);if(!evidenceReview.accept(request,{origin:'local_preview',caseId:c.case_id,snapshotSha256:await digest(raw),observedAt:new Date().toISOString()}))throw new Error('The draft changed during validation. Validate it again.');evidence=null;$('case-status').textContent='Schema valid';render(objectiveFindings(c),'Local deterministic preview',`${c.case_id} · C3/C4 have not been assessed. A valid schema does not authenticate evidence.`);message('Evidence schema valid. C1/C2 preview ready.');});
bind('show-example',async()=>{const request=evidenceReview.begin();const [a,b]=await Promise.all([fetch(asset('fixtures/case.json')),fetch(asset('fixtures/demo-result.json'))]);if(!a.ok||!b.ok)throw new Error('Could not load the synthetic example.');const raw=await a.text(),c=parseCase(raw),demo=await b.json(),result=parseResult(json(demo.assessment),c);if(!evidenceReview.accept(request,{origin:'synthetic_example',caseId:c.case_id,snapshotSha256:await digest(raw),observedAt:new Date().toISOString()}))throw new Error('Example loading was discarded because the draft changed.');evidence=null;render(result.findings,'Synthetic example · Fixed mock response','Historical local SDK test output; not an assessment of the current input or an on-chain result.');message('Showing the synthetic example.');});
bind('save-input',()=>{const c=parseCase(snapshot());download('sla-evidence.json',json(c));});
bind('connect',async()=>{invalidate();if(writeRoute==='session')throw new Error('A temporary test account is active. End it before connecting an external wallet.');if(!window.ethereum)throw new Error('No wallet extension detected. Open this app in Chrome with your wallet installed.');const list=await window.ethereum.request({method:'eth_requestAccounts'}) as string[];if(!list.length)throw new Error('No wallet account was authorized.');account=address(list[0]);await switchNetwork(window.ethereum);await walletCheck();$('connect').textContent=short(account);message('Wallet connected to Studionet. No transaction was sent.');});
bind('start-session',async()=>{invalidate();const a=await studioSession.start($<HTMLInputElement>('session-consent').checked);account=a;writeRoute='session';$('connect').textContent=`Test ${short(a)}`;$('session-status').textContent=`Temporary test account ${a}. Use this account for both deploy and assess. Signing access is lost on reload.`;$<HTMLButtonElement>('end-session').disabled=false;message('Temporary account created. No transaction has been signed or sent.');});
bind('end-session',()=>{invalidate();studioSession.end();writeRoute='wallet';account=undefined;$('connect').textContent='Connect wallet';$('session-status').textContent='Test account ended. Deployed contracts remain readable; the temporary key cannot be recovered.';$<HTMLInputElement>('session-consent').checked=false;$<HTMLButtonElement>('end-session').disabled=true;message('Test account ended. Transaction records remain; no key was saved.');});
bind('check-network',async()=>{const n=await checkNetwork();$('network-state').textContent=`Verified chain ${n.chainId} · ${n.rpc}`;message('RPC chain ID verified. Contract deployment compatibility has not been verified.');});
bind('read',()=>read(address($<HTMLInputElement>('contract').value.trim())));
const readVerified=document.createElement('button');readVerified.id='read-verified';readVerified.textContent='Read on-chain example ↗';$('check-network').parentElement!.append(readVerified);
bind('read-verified',()=>{const contract=address('0x12de9d0F0CEFC3697e76656A3b520c302e17faE9');$<HTMLInputElement>('contract').value=contract;invalidate();expireResults('The read target changed. Read this contract to bind a new result.');return read(contract);});
bind('quote-deploy',()=>prepareQuote('deploy'));bind('quote-assess',()=>prepareQuote('assess'));bind('submit',submit);
bind('track',()=>track($<HTMLInputElement>('txid').value.trim()));
bind('export',()=>{download('agent-sla-work-record.json',json({app:'agent-sla-workbench',version:'0.1.7',generatedAt:new Date().toISOString(),transactions:records,chainRead:evidence,reviewProvenance:evidenceReview.exportMetadata(),note:'RPC observations and local records; not a Portal acceptance or reward receipt. Current is null after an edit; history contains fingerprints only. No input evidence text is included.'}));message('Work record exported.');});
$('snapshot').addEventListener('input',()=>{invalidate();expireResults('Evidence changed. Previous findings were cleared; validate this draft or read a contract again.');$('case-status').textContent='Not validated';$('byte-count').textContent=`${new TextEncoder().encode(snapshot()).length.toLocaleString()} / 16,000 bytes`;});
for(const id of ['contract'])$(id).addEventListener('input',()=>{invalidate();expireResults('The contract target changed. Read the selected contract to bind new findings.');});
$('consent').addEventListener('change',()=>{$<HTMLButtonElement>('submit').disabled=!quote||!$<HTMLInputElement>('consent').checked;});
$('import').addEventListener('change',()=>run(async()=>{const request=evidenceReview.begin();const f=$<HTMLInputElement>('import').files?.[0];if(!f)return;if(f.size>16000)throw new Error('The file exceeds 16,000 bytes.');const raw=await f.text();parseCase(raw);if(!evidenceReview.isCurrent(request))throw new Error('Import discarded because the draft changed while the file was loading.');setInput(raw);message('Evidence imported and kept only in this page memory.');}));
const provider=window.ethereum as Provider & {on?:(event:string,fn:()=>void)=>void};
for(const event of ['accountsChanged','chainChanged'])provider?.on?.(event,()=>{if(writeRoute==='session')return;account=undefined;invalidate();$('connect').textContent='Reconnect wallet';message('The wallet network or account changed. Reconnect to continue.');});
renderRecords();
