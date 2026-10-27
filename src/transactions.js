import { encodeFunctionData, encodeDeployData } from 'viem';
import { address } from './config.js';
import { identityAbi, listingAbi, factoryAbi, vaultAbi, tokenAbi } from './chain/abi.js';
import { readVault, createClient } from './chain/venus.js';

const positive = (value,name) => {
  if (!/^[1-9]\d{0,59}$/.test(String(value))) throw new Error(`Invalid ${name}`);
  return BigInt(value);
};
export async function prepareTransaction(config,input,client = createClient(config), contracts = null) {
  const from = address(input.from,'sender');
  const tx = { from, chainId: '0x61', value: '0x0' };
  const contractCall = (to,abi,functionName,args=[]) => ({ ...tx,to,data: encodeFunctionData({abi,functionName,args}) });
  switch (input.action) {
    case 'deploy-factory': {
      if (from.toLowerCase() !== config.campaignOwner.toLowerCase()) throw new Error('Deploy from the registered campaign wallet');
      const bundle = contracts || JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../public/contracts.json',import.meta.url),'utf8'));
      return { ...tx, data: encodeDeployData({ abi: bundle.factory.abi, bytecode: bundle.factory.bytecode, args: [config.controller,config.market] }) };
    }
    case 'create-vault': {
      if (!config.factory || !config.keeper) throw new Error('Factory and keeper must be configured first');
      const expiry = positive(input.expiresAt,'expiry');
      const now = BigInt(Math.floor(Date.now()/1000));
      if (expiry <= now || expiry > now+30n*86400n) throw new Error('Expiry must be within 30 days');
      const trigger = positive(input.triggerBps,'trigger');
      if (trigger <= 10000n || trigger > 30000n) throw new Error('Trigger must be above 1.0 and at most 3.0');
      return contractCall(config.factory,factoryAbi,'create',[config.keeper,trigger*10n**14n,positive(input.maxRepay,'per-action limit'),expiry,300n]);
    }
    case 'approve-reserve': case 'fund-reserve': case 'pause': case 'withdraw': {
      const vault = await readVault(client,config,input.vault);
      if (vault.owner.toLowerCase() !== from.toLowerCase()) throw new Error('Only the vault owner can prepare this operation');
      if (input.action === 'pause') return contractCall(vault.address,vaultAbi,'setPaused',[true]);
      const amount = positive(input.amount,'token amount');
      if (input.action === 'approve-reserve') return contractCall(vault.token,tokenAbi,'approve',[vault.address,amount]);
      return contractCall(vault.address,vaultAbi,input.action === 'fund-reserve' ? 'fund' : 'withdraw',[amount]);
    }
    case 'register-agent': {
      if (from.toLowerCase() !== config.campaignOwner.toLowerCase() || !config.publicUrl.startsWith('https://')) throw new Error('A public HTTPS service and the campaign owner are required');
      if (config.agentId !== null) throw new Error('Agent already configured; do not register duplicate IDs');
      return contractCall(config.identityRegistry,identityAbi,'register',[`${config.publicUrl}/registration.json`]);
    }
    case 'list-agent': {
      if (!config.agentId || from.toLowerCase() !== config.campaignOwner.toLowerCase()) throw new Error('Configured agent ID and campaign owner required');
      const price = positive(input.priceUsd8,'price');
      const period = positive(input.periodSeconds,'period');
      if (period < 120n || period > 604800n || price > (1n<<128n)-1n) throw new Error('Invalid listing price or duration');
      const metadata = 'data:application/json;base64,'+Buffer.from(JSON.stringify({ name:'ChainPilot',category:'HEALTH_FACTOR',summary:'Venus isolated-pool monitoring and bounded repayment',endpoint:config.publicUrl,repo:'https://github.com/mana-devs/chainpilot' })).toString('base64');
      return contractCall(config.listingRegistry,listingAbi,'list',[BigInt(config.agentId),config.keeper || from,3,price,Number(period),metadata]);
    }
    default: throw new Error('Unsupported transaction operation');
  }
}
