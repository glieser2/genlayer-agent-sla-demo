// Own localhost UI + public read-only Studio RPC; no real wallet or signing.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}});const methods=[];const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
  const r=route.request();const url=new URL(r.url());if(url.hostname==='127.0.0.1')return route.continue();
  assert.equal(url.origin,'https://studio.genlayer.com');
  const requests=r.postDataJSON();for(const q of Array.isArray(requests)?requests:[requests]){methods.push(q.method);assert.ok(['eth_chainId','gen_getContractCode','gen_call'].includes(q.method),'Unexpected RPC: '+q.method);}
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:5173');
  assert.equal(await page.evaluate(()=>Boolean(window.ethereum)),false);
  await page.getByRole('button',{name:'02　链上评估',exact:true}).click();await page.locator('#read-verified').click();
  await page.waitForFunction(()=>document.getElementById('result-source').textContent==='链上读取'||document.getElementById('message').classList.contains('error'),{},{timeout:45000});
  assert.equal(await page.locator('#result-source').innerText(),'链上读取',await page.locator('#message').innerText());
  assert.equal(await page.locator('.finding.met').count(),1);assert.equal(await page.locator('.finding.not_met').count(),3);
  assert.match(await page.locator('#result-context').innerText(),/SYNTHETIC-WEBSITE-001/);
  assert.equal(await page.locator('#submit').isDisabled(),true);assert.deepEqual(errors,[]);
  await page.locator('.results').screenshot({path:'docs/preview-live-result.png'});
  console.log(JSON.stringify({ok:true,network:'Studionet 61999',contract:await page.locator('#contract').inputValue(),source:'actual RPC result after deployed source check',findings:['C1 met','C2 not_met','C3 not_met','C4 not_met'],walletConnected:false,transactionsSent:0,rpcMethods:methods,screenshot:'docs/preview-live-result.png'},null,2));
} finally {await browser.close();}
