// Test the production bundle at the real repository subpath. No user browser or wallet.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=fileURLToPath(new URL('../dist/',import.meta.url));const base='/genlayer-agent-sla-demo/';
const localRequests=[];const methods=[];const errors=[];
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;localRequests.push(pathname);
  if(!pathname.startsWith(base)){res.writeHead(404);res.end();return;}
  const filename=path.resolve(root,decodeURIComponent(pathname.slice(base.length))||'index.html');
  if(!filename.startsWith(root)){res.writeHead(403);res.end();return;}
  try {const content=readFileSync(filename);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.py':'text/plain'}[path.extname(filename)]??'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(content);}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const request=route.request();const url=new URL(request.url());if(url.hostname==='127.0.0.1')return route.continue();assert.equal(url.origin,'https://studio.genlayer.com');const data=request.postDataJSON();for(const q of Array.isArray(data)?data:[data]){methods.push(q.method);assert.ok(['eth_chainId','gen_getContractCode','gen_call'].includes(q.method),'Unexpected RPC '+q.method);}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.address().port}${base}`);
  assert.equal(await page.evaluate(()=>Boolean(window.ethereum)),false);
  assert.equal(await page.locator('.brand').getAttribute('href'),base);
  await page.locator('#sample').click();await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC-WEBSITE-001'));
  await page.locator('#validate').click();await page.waitForFunction(()=>document.querySelectorAll('.finding').length===2);
  await page.locator('#show-example').click();await page.waitForFunction(()=>document.querySelectorAll('.finding').length===4);assert.match(await page.locator('#result-source').innerText(),/Fixed mock response/);
  await page.getByRole('button',{name:'02 On-chain Assessment',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'Download contract source ↓',exact:true}).getAttribute('href'),base+'contracts/agent_sla.py');
  await page.locator('#read-verified').click();await page.waitForFunction(()=>document.getElementById('result-source').textContent==='On-chain result'||document.getElementById('message').classList.contains('error'),{},{timeout:45000});
  assert.equal(await page.locator('#result-source').innerText(),'On-chain result',await page.locator('#message').innerText());assert.equal(await page.locator('.finding.met').count(),1);assert.equal(await page.locator('.finding.not_met').count(),3);assert.equal(await page.locator('#submit').isDisabled(),true);
  assert.ok(!localRequests.some(p=>p.startsWith('/fixtures/')||p.startsWith('/contracts/')));assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.viewport,JSON.stringify(size));
  const report={observedAt:new Date().toISOString(),version:'0.1.4',localProductionPreview:true,published:false,basePath:base,checks:['production assets load at repository subpath','brand and source link retain subpath','sample and fixed example fetch at subpath','actual contract source check and four findings render','mobile no horizontal overflow','no browser errors'],rpcMethods:methods,walletConnected:false,transactionsSent:0};
  if(process.argv.includes('--record'))writeFileSync(new URL('../docs/pages-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
