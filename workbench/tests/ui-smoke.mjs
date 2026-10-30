// Isolated browser profile and localhost only. This never opens Portal or a user's wallet.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[];const external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();external.push(url.origin);return route.abort();});
try {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#validate').click();await page.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
  await page.locator('#sample').click();await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC'));
  await page.locator('#validate').click();await page.waitForFunction(()=>document.querySelectorAll('.finding').length===2);
  assert.match(await page.locator('#result-source').innerText(),/Local/);
  await page.locator('#show-example').click();await page.waitForFunction(()=>document.querySelectorAll('.finding').length===4);
  assert.match(await page.locator('#result-source').innerText(),/Fixed mock response/);
  await page.screenshot({path:'docs/preview-desktop.png',fullPage:true});
  await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('No wallet extension detected'));
  assert.equal(await page.locator('#submit').isDisabled(),true);
  await page.getByRole('button',{name:'02 On-chain Assessment',exact:true}).click();
  await page.locator('#quote-deploy').click();await page.waitForFunction(()=>document.getElementById('chain-feedback').classList.contains('error'));
  assert.match(await page.locator('#chain-feedback').innerText(),/Connect an external wallet first/);assert.equal(await page.locator('#quote-deploy').isDisabled(),false);
  await page.locator('#read').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('valid, nonzero contract address'));
  await page.evaluate(()=>localStorage.setItem('agent-sla:transactions:v1','corrupt'));
  await page.reload();assert.equal(await page.locator('.journal-row').count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#sample').click();await page.waitForFunction(()=>document.getElementById('snapshot').value.includes('SYNTHETIC'));
  await page.locator('#validate').click();await page.waitForFunction(()=>document.querySelectorAll('.finding').length===2);
  const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.viewport,JSON.stringify(size));
  await page.screenshot({path:'docs/preview-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({ok:true,checks:['empty input error','synthetic case validation','C1/C2 preview','four canned findings clearly labeled','wallet absent handled','prepare error shown beside action button, button recovers','invalid address blocked','corrupt journal handled','mobile no horizontal overflow','no uncaught errors','no external requests'],screenshots:['docs/preview-desktop.png','docs/preview-mobile.png'],walletTransactions:0,liveRpcCalls:0},null,2));
} finally {await browser.close();}
