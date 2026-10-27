import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createPublicClient,createWalletClient,http,parseEventLogs,encodeFunctionData } from 'viem';
import { defineChain } from 'viem';
import { configFromEnv } from '../src/config.js';
import { readPosition,readVault,decideProtection,jsonSafe } from '../src/chain/venus.js';
import { factoryAbi,vaultAbi } from '../src/chain/abi.js';
import { Store } from '../src/store.js';
import { enroll,enrollmentMessage,tick } from '../src/agent.js';

// LOCAL ONLY. No user keys and no public chain transactions.
const port=18545;
const anvil=spawn('anvil',['--port',String(port),'--chain-id','97','--block-time','1','--silent'],{stdio:['ignore','ignore','pipe']});
const chain=defineChain({id:97,name:'Local BSC simulation',nativeCurrency:{name:'Test BNB',symbol:'tBNB',decimals:18},rpcUrls:{default:{http:[`http://127.0.0.1:${port}`]}}});
const client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0])});
const artifacts=async(file,name)=>JSON.parse(await readFile(`contracts/out/${file}/${name}.json`,'utf8'));
try{
  let ready=false;
  for(let i=0;i<80;i++){try{await client.getBlockNumber();ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  if(!ready)throw new Error('Local Anvil node did not start');
  const accounts=await client.request({method:'eth_accounts'});
  const owner=createWalletClient({account:accounts[0],chain,transport:http(chain.rpcUrls.default.http[0])});
  const keeper=createWalletClient({account:accounts[1],chain,transport:http(chain.rpcUrls.default.http[0])});
  async function deploy(file,name,args=[]){const a=await artifacts(file,name);const hash=await owner.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});return (await client.waitForTransactionReceipt({hash})).contractAddress;}
  async function write(wallet,address,abi,functionName,args=[]){const {request}=await client.simulateContract({address,abi,functionName,args,account:wallet.account});const hash=await wallet.writeContract(request);const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;}
  const mock=await artifacts('PositionGuardVault.t.sol','MockMarket');
  const ctrl=await artifacts('PositionGuardVault.t.sol','MockController');
  const erc=await artifacts('PositionGuardVault.t.sol','MockToken');
  const token=await deploy('PositionGuardVault.t.sol','MockToken');
  const controller=await deploy('PositionGuardVault.t.sol','MockController');
  const market=await deploy('PositionGuardVault.t.sol','MockMarket',[token,controller]);
  await write(owner,controller,ctrl.abi,'setAsset',[market]);
  const factory=await deploy('PositionGuardFactory.sol','PositionGuardFactory',[controller,market]);
  const expiry=BigInt(Math.floor(Date.now()/1000)+86400);
  const creation=await write(owner,factory,factoryAbi,'create',[accounts[1],1200000000000000000n,25n*10n**18n,expiry,60n]);
  const vault=parseEventLogs({abi:factoryAbi,eventName:'VaultCreated',logs:creation.logs})[0].args.vault;
  await write(owner,token,erc.abi,'mint',[accounts[0],50n*10n**18n]);
  await write(owner,token,erc.abi,'approve',[vault,50n*10n**18n]);
  await write(owner,vault,vaultAbi,'fund',[50n*10n**18n]);
  const marketplace=await deploy('PositionGuardVault.t.sol','MockMarketplace',[accounts[0]]);
  const config={...configFromEnv({}),rpcUrl:chain.rpcUrls.default.http[0],controller,market,factory,keeper:accounts[1],subscription:marketplace,listingRegistry:marketplace,listingId:'1',agentId:'1',campaignOwner:accounts[0],executionEnabled:true};
  // Controller mock also exposes the actual interface used by the real reader.
  const before=await readPosition(client,config,accounts[0]);
  const state=await readVault(client,config,vault);
  const decision=decideProtection(before,state);
  assert.equal(decision.amount,24n*10n**18n);
  const dir=await mkdtemp(join(tmpdir(),'chainpilot-e2e-'));
  let repayment;
  try {
    const store=new Store(dir);
    const enrollment={vault,subscriptionId:'1',expiresAt:Math.floor(Date.now()/1000)+300,targetBps:15000};
    const message=`${enrollmentMessage(config,enrollment)}\nTarget health factor (bps): 15000`;
    const signature=await owner.signMessage({message});
    await enroll(client,config,store,{...enrollment,signature});
    const results=await tick({client,wallet:keeper,config,store});
    assert.equal(results[0].status,'confirmed',JSON.stringify(results));
    repayment={transactionHash:results[0].hash};
    const state=await store.read();assert.equal(state.observations.length,1);
    const fixture=await artifacts('PositionGuardVault.t.sol','MockMarketplace');
    await write(owner,marketplace,fixture.abi,'cancel');
    const cancelled=await tick({client,wallet:keeper,config,store});
    assert.equal(cancelled[0].status,'failed');
    console.log('Signed enrollment verified; worker repaid; cancelled subscription refused.');
  }finally{await rm(dir,{recursive:true,force:true});}
  const after=await readPosition(client,config,accounts[0]);
  assert.equal(before.healthFactorWad,1140000000000000000n);
  assert.equal(after.healthFactorWad,1500000000000000000n);
  assert.equal(await client.readContract({address:vault,abi:vaultAbi,functionName:'remainingBudget'}),26n*10n**18n);
  await assert.rejects(()=>client.simulateContract({address:vault,abi:vaultAbi,functionName:'withdraw',args:[1n],account:keeper.account}));
  console.log(JSON.stringify(jsonSafe({network:'LOCAL SIMULATION ONLY',factory,vault,beforeHealthFactor:before.healthFactorWad,afterHealthFactor:after.healthFactorWad,repayment:repayment.transactionHash,unauthorizedWithdrawal:'rejected',campaignEvidence:false}),null,2));
}finally{anvil.kill('SIGTERM');}
