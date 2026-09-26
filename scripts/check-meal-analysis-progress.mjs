import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { launchBrowser } = require(process.env.SOMA_BROWSER_RUNTIME ?? '/home/codex/.local/share/codex-browser/browser.cjs');
const baseUrl = process.env.SOMA_QA_URL ?? 'http://127.0.0.1:3107';
assert.equal(new URL(baseUrl).hostname, '127.0.0.1', 'Run only against a local demo server.');
const screenshots = process.env.SOMA_QA_SCREENSHOTS !== 'false';
const outputDir = await mkdtemp(join(tmpdir(), 'soma-meal-progress-'));
console.log(`Screenshots: ${outputDir}`);
(async () => {
 const browser = await launchBrowser();
 try {
 for (const width of [1440,390,768]) {
  const page = await browser.newPage({viewport:{width,height:width===1440?900:844},reducedMotion:width===768?'reduce':'no-preference'});
  let stage='queued', gets=0, releaseCreate, releaseSave;
  const createGate = new Promise(r=>releaseCreate=r), saveGate = new Promise(r=>releaseSave=r);
  const meal={id:'qa-snack',mealDate:'2026-09-26',mealType:'snack',note:'Repas de démonstration',status:'draft',photos:[],analysis:null};
  const completeMeal={...meal,analysis:{status:'completed',result:{dishType:'Repas de démonstration',summary:'Exemple de résultat',foods:[],totals:{calories:{low:200,likely:250,high:300},proteinGrams:{low:5,likely:8,high:10}}}}};
  await page.route('**/api/meals', async route=>{
   if(route.request().method()==='POST') {await createGate;await route.fulfill({json:{meal}});}else await route.continue();
  });
  await page.route('**/api/meals/qa-snack/analyze', async route=>{
   if(route.request().method()==='POST') await route.fulfill({status:202,json:{queued:true,analysis:{status:'queued'},meal}});
   else { gets++; await route.fulfill({json:{analysis:{status:stage},meal:stage==='completed'?completeMeal:meal}}); }
  });
  await page.route('**/api/meals/qa-snack',async route=>{
   if(route.request().method()==='PATCH'){await saveGate;await route.fulfill({json:{meal:{...completeMeal,status:'confirmed'}}});}else await route.continue();
  });
  await page.goto(baseUrl);
  await page.getByText('LOCAL PREVIEW', { exact: true }).waitFor();
  const card=page.locator('#meal-snack');
  await card.locator('textarea').fill('Repas de démonstration');
  await card.getByRole('button',{name:'Analyze Snack',exact:true}).click();
  const screen=card.locator('[data-purpose="meal-snack-analyzing"]');
  await screen.waitFor();await page.waitForTimeout(500);assert.equal(gets,0);
  assert.match(await screen.innerText(),/Connexion/);
  await page.keyboard.press('Tab');
  assert.equal(await card.getByRole('button', { name: 'Annuler l’analyse' }).evaluate(el => document.activeElement === el), true);
  assert.equal(await card.getByRole('button', { name: 'Annuler l’analyse' }).evaluate(el => getComputedStyle(el).outlineWidth), '2px');
  if (width === 768) assert.equal(await screen.locator('li[data-state="active"] > span').evaluate(el => getComputedStyle(el).animationName), 'none');
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -64));
  if (screenshots) await page.screenshot({path:`${outputDir}/soma-meal-${width}-connecting.png`});
  releaseCreate();
  await card.getByText('En attente de l’analyse…',{exact:true}).waitFor();
  await page.waitForTimeout(300);assert.equal(await card.locator('textarea').count(),0);
  stage='running';
  await card.getByText('Analyse du repas en cours…',{exact:true}).waitFor();
  if (screenshots) await page.screenshot({path:`${outputDir}/soma-meal-${width}-analyzing.png`});
  stage='completed';
  await card.getByText('Enregistrement des résultats…',{exact:true}).waitFor();
  assert.equal(await card.getByRole('button',{name:'Annuler l’analyse'}).isDisabled(),true);
  assert.equal(await card.locator('li[data-state="complete"]').count(),2);
  if (screenshots) await page.screenshot({path:`${outputDir}/soma-meal-${width}-finalizing.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  if(width===390){await card.getByRole('button',{name:'Annuler l’analyse'}).evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await screen.count(),1);}
  releaseSave();await screen.waitFor({state:'detached'});
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  if (screenshots) await page.screenshot({path:`${outputDir}/soma-meal-${width}-result.png`});
  console.log(JSON.stringify({width,states:['connecting','queued','analyzing','finalizing','result'],prematureStatusReads:0,horizontalOverflow:false,reducedMotion:width===768}));
  await page.close();
 }
 for (const scenario of ['cancel', 'change-date', 'analysis-error', 'save-error']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let releaseCreate;
  const createGate = new Promise(resolve => { releaseCreate = resolve; });
  const meal = { id: 'qa-edge', mealDate: '2026-09-26', mealType: 'snack', note: 'Repas de démonstration', status: 'draft', photos: [], analysis: null };
  const completeMeal = { ...meal, analysis: { status: 'completed', result: { dishType: 'Exemple', summary: 'Exemple', foods: [], totals: { calories: { low: 200, likely: 250, high: 300 } } } } };
  await page.route('**/api/meals', async route => {
   if (route.request().method() !== 'POST') return route.continue();
   await createGate;
   await route.fulfill({ json: { meal } });
  });
  await page.route('**/api/meals/qa-edge/analyze', route => scenario === 'analysis-error'
   ? route.fulfill({ status: 503, json: { error: 'Analyse indisponible', code: 'PROVIDER_UNAVAILABLE' } })
   : route.fulfill({ json: { meal: completeMeal } }));
  await page.route('**/api/meals/qa-edge', route => route.fulfill({ status: 503, json: { error: 'Enregistrement indisponible' } }));
  await page.goto(baseUrl);
  await page.getByText('LOCAL PREVIEW', { exact: true }).waitFor();
  const card = page.locator('#meal-snack');
  await card.locator('textarea').fill('Repas de démonstration');
  await card.getByRole('button', { name: 'Analyze Snack', exact: true }).click();
  await card.locator('[data-purpose="meal-snack-analyzing"]').waitFor();
  if (scenario === 'change-date') {
   await page.locator('.personal-lab-day-strip__mobile-days button:not([aria-current])').first().click();
   await page.waitForTimeout(500);
   releaseCreate();
   await page.waitForTimeout(1000);
   assert.equal(await page.locator('[data-purpose="meal-snack-analyzing"]').count(), 0);
   assert.doesNotMatch(await page.locator('#meal-snack').innerText(), /Repas de démonstration/);
  } else if (scenario === 'cancel') {
   await card.getByRole('button', { name: 'Annuler l’analyse' }).click();
   await card.locator('textarea').waitFor();
   releaseCreate();
   await page.waitForTimeout(700);
   assert.equal(await card.locator('textarea').inputValue(), 'Repas de démonstration');
   assert.equal(await card.locator('[data-purpose="meal-snack-analyzing"]').count(), 0);
  } else {
   releaseCreate();
   await card.locator('[data-purpose="meal-snack-analyzing"]').waitFor({ state: 'detached' });
   assert.match(await card.innerText(), scenario === 'save-error' ? /Enregistrement indisponible/ : /Analyse indisponible/);
   if (scenario === 'save-error') assert.match(await card.innerText(), /250 kcal/);
  }
  console.log(JSON.stringify({ scenario, passed: true }));
  await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
