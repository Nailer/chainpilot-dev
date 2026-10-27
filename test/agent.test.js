import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv } from '../src/config.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';
import { decideProtection } from '../src/chain/venus.js';
import { prepareTransaction } from '../src/transactions.js';
import { enrollmentMessage } from '../src/agent.js';

const now=Date.now();
const position={observedAt:now,debtUsd18:100n*10n**18n,adjustedCollateralUsd18:114n*10n**18n,healthFactorWad:114n*10n**16n,repaymentAsset:{priceMantissa:10n**30n,debtTokenUnits:100000000n}};
const vault={paused:false,expiresAt:BigInt(Math.floor(now/1000)+3600),lastExecutedAt:0n,cooldown:300n,triggerWad:12n*10n**17n,remainingBudget:30000000n,maxRepay:25000000n,balance:30000000n};
test('live planner converts USD18 to six-decimal token units',()=>{
  const result=decideProtection(position,vault,{now});
  assert.equal(result.amount,24000000n);assert.equal(result.targetReachableEstimate,true);
});
test('live planner respects debt, budget, balance and policy state',()=>{
  assert.equal(decideProtection(position,{...vault,balance:500000n},{now}).amount,500000n);
  assert.equal(decideProtection({...position,repaymentAsset:{...position.repaymentAsset,debtTokenUnits:20n}},vault,{now}).amount,20n);
  assert.equal(decideProtection(position,{...vault,paused:true},{now}).reason,'paused');
  assert.equal(decideProtection(position,{...vault,expiresAt:1n},{now}).reason,'expired');
  assert.equal(decideProtection({...position,debtUsd18:0n},vault,{now}).reason,'no-debt');
  assert.throws(()=>decideProtection({...position,observedAt:now-91000},vault,{now}));
  assert.throws(()=>decideProtection(position,vault,{targetBps:11000,now}));
});
test('configuration refuses accidental mainnet and remote HTTP public URLs',()=>{
  assert.throws(()=>configFromEnv({CHAIN_ID:'56'}));
  assert.throws(()=>configFromEnv({PUBLIC_URL:'http://example.com'}));
});
test('transaction builder never accepts arbitrary operations or unsigned amounts',async()=>{
  const config=configFromEnv({});
  await assert.rejects(()=>prepareTransaction(config,{from:config.campaignOwner,action:'arbitrary-call'}));
  await assert.rejects(()=>prepareTransaction(config,{from:config.campaignOwner,action:'create-vault'}));
  await assert.rejects(()=>prepareTransaction(config,{from:config.campaignOwner,action:'register-agent'}));
});
test('enrollment message binds service, chain, vault and subscription',()=>{
  const c=configFromEnv({});
  const message=enrollmentMessage(c,{vault:c.campaignOwner,subscriptionId:'5',expiresAt:123});
  assert.match(message,/Chain: 97/);assert.match(message,/Subscription: 5/);assert.match(message,/http:\/\/localhost:3001/);
});
test('two Store instances preserve concurrent writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'chainpilot-store-'));
  try{
    const a=new Store(dir),b=new Store(dir);
    await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).record('observations',{i})));
    assert.equal((await a.read()).observations.length,20);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('metadata, MCP discovery, errors, origin checks and secret redaction',async()=>{
  const config=configFromEnv({BSC_RPC_URL:'https://example.com/private-key-in-url'});
  const server=createApp({config});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    const card=await (await fetch(base+'/.well-known/agent-card.json')).json();
    assert.equal(card.skills[0].id,'position-guard');
    const visible=await (await fetch(base+'/v1/config')).text();assert.ok(!visible.includes('private-key-in-url'));
    const discovery=await (await post('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.equal(discovery.result.tools.length,3);
    assert.equal((await post('/v1/position',{borrower:'bad'})).status,400);
    assert.equal((await post('/v1/enroll',{}, {origin:'https://evil.example'})).status,403);
    assert.equal((await post('/v1/position',null)).status,400);
    const campaign=await (await fetch(base+'/v1/campaign')).json();assert.equal(campaign.complete,false);assert.equal(campaign.checks.agentActions.transactions,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
