import { readFile } from 'node:fs/promises';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { configFromEnv } from '../src/config.js';
import { createClient } from '../src/chain/venus.js';
import { Store } from '../src/store.js';
import { tick } from '../src/agent.js';
import { recordRepayment } from '../src/campaign.js';
const config=configFromEnv(),client=createClient(config),store=new Store(config.dataDir);
let wallet;
if(config.executionEnabled) {
  if(!config.keeper||!config.factory||!config.agentId||!config.listingId) throw new Error('Configure factory, keeper, identity and listing before enabling execution');
  // Mount a secret file locally/in your host secret manager. Never put a key in Git or chat.
  if(!process.env.KEEPER_KEY_FILE) throw new Error('KEEPER_KEY_FILE is required for the worker; never use the campaign owner key');
  const key=(await readFile(process.env.KEEPER_KEY_FILE,'utf8')).trim();
  let account;
  try {account=privateKeyToAccount(key);} catch {throw new Error('Keeper secret file must contain a valid 32-byte hex private key');}
  if(account.address.toLowerCase()!==config.keeper.toLowerCase()) throw new Error('Keeper key/address mismatch');
  wallet=createWalletClient({account,chain:bscTestnet,transport:http(config.rpcUrl)});
}
if(!config.factory) throw new Error('Deploy/configure the factory before starting the worker');
console.log(`ChainPilot worker: ${config.executionEnabled?'execution enabled':'monitor only'}, chain ${config.chainId}`);
let stopping=false;
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopping=true;});
do {
  await store.update(state=>{state.worker={at:Date.now(),executionEnabled:config.executionEnabled};});
  const results=await tick({client,wallet,config,store});
  for(const row of results) {
    console.log(JSON.stringify(row));
    if(row.status==='confirmed') {
      try {await recordRepayment(client,config,store,row.hash);} catch {console.log('Receipt confirmed; campaign verification pending');}
    }
  }
  if(process.argv.includes('--once')||stopping) break;
  await new Promise(resolve=>setTimeout(resolve,30000));
} while(!stopping);
