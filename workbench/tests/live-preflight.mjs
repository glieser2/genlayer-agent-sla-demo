// Read-only browser check against the public Studio RPC, using a fake account provider.
// No submit click is made, and every signing request is forbidden.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const failures=[];const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(()=>{window.__signRequests=0;window.ethereum={on(){},async request({method}){
  if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x'+'1'.repeat(40)];
  if(method==='eth_chainId')return '0xf22f';
  if(/send|sign/i.test(method)){window.__signRequests++;throw new Error('Signing forbidden in read-only browser check');}
  throw new Error('Unexpected fake provider method '+method);
}};});
try{
  await page.goto('http://127.0.0.1:5173');await page.locator('#sample').click();await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC'));
  await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('connected to Studionet')||document.getElementById('message').classList.contains('error'));
  assert.match(await page.locator('#message').innerText(),/connected to Studionet/);
  await page.getByRole('button',{name:'02 On-chain Assessment',exact:true}).click();await page.locator('#quote-deploy').click();
  await page.waitForFunction(()=>!document.getElementById('quote-summary').classList.contains('hidden')||document.getElementById('chain-feedback').classList.contains('error'),{},{timeout:45000});
  const feedback=await page.locator('#chain-feedback').innerText();assert.match(feedback,/External-wallet signing is blocked/);
  assert.equal(await page.locator('#quote-summary').evaluate(e=>e.classList.contains('hidden')),true);
  assert.equal(await page.locator('#submit').isDisabled(),true);assert.equal(await page.evaluate(()=>window.__signRequests),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,readOnly:true,realWalletConnected:false,signingRequests:0,liveBrowserRpcCheck:'zero dispatcher correctly blocked before wallet signing',chainId:61999,feedback,requestFailures:failures},null,2));
}catch(e){console.log(JSON.stringify({ok:false,message:await page.locator('#message').textContent({timeout:3000}).catch(()=>null),failures,errors},null,2));throw e;}finally{await browser.close();}
