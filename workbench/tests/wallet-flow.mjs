// Browser integration with a deliberately fake provider. Every remote RPC is intercepted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {decodeInputData} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
const sdkRequire=createRequire(import.meta.resolve('genlayer-js'));
const {decodeFunctionData}=sdkRequire('viem');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const methods=[];const errors=[];let genuinePending=false;let zeroTarget=true;
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  if(!localStorage.getItem('agent-sla:transactions:v1'))localStorage.setItem('agent-sla:transactions:v1',JSON.stringify([{hash:'0x'+'a'.repeat(64),kind:'deploy',chainId:61999,account:'0x'+'1'.repeat(40),contract:'',createdAt:'2026-10-28',outcome:'pending'}]));
  window.__walletCalls=[];
  window.ethereum={on(){},async request({method,params}){
    window.__walletCalls.push(method);
    if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x'+'1'.repeat(40)];
    if(method==='eth_chainId')return '0xf22f';
    if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain')return null;
    if(method==='eth_sendTransaction'){window.__lastTx=params[0];throw Object.assign(new Error('TEST: user rejected transaction'),{code:4001});}
    throw new Error('Unexpected fake wallet method: '+method);
  }};
});
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname!=='studio.genlayer.com')throw new Error('Unexpected remote origin '+url.origin);
  const requests=route.request().postDataJSON();
  if(genuinePending&&!Array.isArray(requests)&&requests.method==='gen_getStudioTransactionByHash'){
    await route.fulfill({json:{jsonrpc:'2.0',id:requests.id,result:{status:'PENDING',type:1,sender:'0x'+'1'.repeat(40),data:{},consensus_data:null}}});return;
  }
  function result(r){methods.push(r.method);const values={eth_chainId:'0xf22f',eth_getBalance:'0xde0b6b3a7640000',gen_getContractSchemaForCode:{ctor:{params:[]},methods:{assess:{},get_snapshot:{},get_result:{}}},eth_getTransactionCount:'0x0',eth_blockNumber:'0x1',eth_estimateGas:'0x30d40',eth_gasPrice:'0x0',sim_getConsensusContract:{address:'0x'+(zeroTarget?'0':'2').repeat(40),abi:[{type:'function',name:'addTransaction',inputs:['address','address','uint256','uint256','bytes'].map(type=>({type}))}]},gen_getStudioTransactionByHash:{status:'FINALIZED',type:0,data:{},consensus_data:null,sender:'0x'+'1'.repeat(40)}};return {jsonrpc:'2.0',id:r.id,...(r.method in values ? {result:values[r.method]}:{error:{code:-32000,message:'Blocked by isolated test: '+r.method}})};}
  await route.fulfill({json:Array.isArray(requests)?requests.map(result):result(requests)});
});
try {
  await page.goto('http://127.0.0.1:5173');await page.locator('#sample').click();
  await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC'));
  await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已连接 Studionet')||document.getElementById('message').classList.contains('error'));
  assert.match(await page.locator('#message').innerText(),/已连接 Studionet/);
  await page.getByRole('button',{name:'02　链上评估',exact:true}).click();
  await page.locator('#quote-deploy').click();await page.waitForFunction(()=>document.getElementById('chain-feedback').textContent.includes('停止向浏览器钱包请求签名'));
  assert.equal(await page.locator('#submit').isDisabled(),true);assert.equal((await page.evaluate(()=>window.__walletCalls)).filter(x=>x==='eth_sendTransaction').length,0);
  // Only this isolated fixture returns a nonzero dispatcher; it is not live network evidence.
  zeroTarget=false;
  await page.locator('#quote-deploy').click();await page.waitForFunction(()=>!document.getElementById('quote-summary').classList.contains('hidden'));
  assert.equal(await page.locator('#submit').isDisabled(),true);
  assert.match(await page.locator('#quote-summary').innerText(),/61999/);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('agent-sla:transactions:v1'))))[0].outcome,'wrong_type');
  await page.locator('#consent').check();assert.equal(await page.locator('#submit').isDisabled(),false);
  await page.locator('#contract').fill('0x'+'2'.repeat(40));assert.equal(await page.locator('#submit').isDisabled(),true);
  await page.locator('#quote-deploy').click();await page.waitForFunction(()=>!document.getElementById('quote-summary').classList.contains('hidden'));
  await page.locator('#consent').check();await page.locator('#submit').click();
  await page.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
  assert.equal(await page.locator('#submit').isDisabled(),true);
  assert.equal(await page.locator('.journal-row').count(),1);
  const calls=await page.evaluate(()=>window.__walletCalls);
  assert.equal(calls.filter(x=>x==='eth_sendTransaction').length,1);
  const sent=await page.evaluate(()=>window.__lastTx);assert.equal(sent.to,'0x'+'2'.repeat(40));assert.equal(sent.value,'0x0');assert.equal(sent.chainId,'0xf22f');
  const decoded=decodeFunctionData({abi:studionet.consensusMainContract.abi,data:sent.data});
  assert.equal(decoded.functionName,'addTransaction');
  const deploy=decodeInputData(decoded.args[4],'0x'+'0'.repeat(40));assert.equal(deploy.type,'deploy');
  assert.equal(deploy.code,readFileSync(new URL('../public/contracts/agent_sla.py',import.meta.url),'utf8'));
  assert.ok(!methods.some(x=>/sendTransaction|sendRawTransaction/.test(x)));
  assert.deepEqual(errors,[]);
  await page.locator('#quote-deploy').click();await page.waitForFunction(()=>!document.getElementById('quote-summary').classList.contains('hidden'));
  await page.locator('#consent').check();zeroTarget=true;await page.locator('#submit').click();
  await page.waitForFunction(()=>document.getElementById('chain-feedback').textContent.includes('停止向浏览器钱包请求签名'));
  assert.equal(await page.locator('#submit').isDisabled(),true);assert.equal((await page.evaluate(()=>window.__walletCalls)).filter(x=>x==='eth_sendTransaction').length,1);zeroTarget=false;
  await page.evaluate(()=>localStorage.setItem('agent-sla:transactions:v1',JSON.stringify([{hash:'0x'+'a'.repeat(64),kind:'deploy',chainId:61999,account:'0x'+'1'.repeat(40),contract:'',createdAt:'2026-10-28',outcome:'pending'}])));
  await page.reload();await page.getByRole('button',{name:'03　交易记录',exact:true}).click();await page.getByRole('button',{name:'继续查询',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('不是预期合约操作'));
  assert.match(await page.locator('.journal-row').innerText(),/非合约交易/);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('agent-sla:transactions:v1'))))[0].contract,'');
  genuinePending=true;
  await page.evaluate(()=>localStorage.setItem('agent-sla:transactions:v1',JSON.stringify([{hash:'0x'+'a'.repeat(64),kind:'deploy',chainId:61999,account:'0x'+'1'.repeat(40),contract:'',createdAt:'2026-10-28',outcome:'pending'}])));
  await page.reload();await page.locator('#sample').click();await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC'));
  await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已连接 Studionet'));
  await page.getByRole('button',{name:'02　链上评估',exact:true}).click();await page.locator('#quote-deploy').click();
  await page.waitForFunction(()=>document.getElementById('chain-feedback').textContent.includes('仍有状态未确认'));
  assert.equal(await page.locator('#submit').isDisabled(),true);assert.equal((await page.evaluate(()=>window.__walletCalls)).filter(x=>x==='eth_sendTransaction').length,0);
  console.log(JSON.stringify({ok:true,checks:['fake provider connection remains available for read-only work','zero dispatcher blocked before review with no signing request','review bound to chain 61999','stale pending transfer refreshed read-only before preparing deployment','explicit consent required','input edits invalidate review','wallet rejection prevents repeat and creates no success record','unsigned request targets mocked nonzero dispatcher with zero value','ABI/RLP payload decodes to reviewed contract source','dispatcher changing to zero after review invalidates review without another signing request','finalized transfer recorded as wrong_type, never as deployed','genuine pending contract still blocks new deployment without a signing request'],fakeWalletSigningRequests:1,realWalletRequests:0,liveRpcCalls:0,rpcMethodsIntercepted:methods},null,2));
} catch(e) {console.log(JSON.stringify({message:await page.locator('#message').innerText(),walletCalls:await page.evaluate(()=>window.__walletCalls),methods,errors},null,2));throw e;} finally {await browser.close();}
