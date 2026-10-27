import { parseEventLogs } from 'viem';
import { vaultAbi } from './chain/abi.js';
import { readVault, checkedBlock } from './chain/venus.js';
import { readIdentity, verifySubscription } from './marketplace/hellofugu.js';

export async function recordRepayment(client,config,store,hash) {
  if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw new Error('Invalid transaction hash');
  const head = await checkedBlock(client,config);
  const [receipt,tx] = await Promise.all([client.getTransactionReceipt({hash}),client.getTransaction({hash})]);
  if (receipt.status !== 'success' || head.number < receipt.blockNumber+1n || !config.keeper || tx.from.toLowerCase() !== config.keeper.toLowerCase()) throw new Error('Not a confirmed keeper transaction');
  const events = parseEventLogs({ abi:vaultAbi,eventName:'Repaid',logs:receipt.logs });
  if (events.length !== 1) throw new Error('Expected one successful repayment event');
  const event = events[0];
  const vault = await readVault(client,config,event.address);
  if (event.args.amount === 0n || event.args.healthAfter <= event.args.healthBefore || vault.owner.toLowerCase() !== event.args.borrower.toLowerCase()) throw new Error('Invalid repayment evidence');
  const block = await client.getBlock({blockNumber:receipt.blockNumber});
  const at = Number(block.timestamp)*1000;
  if (at < Date.parse('2026-10-01T00:00:00Z') || at > Date.parse('2026-11-05T12:00:00Z')) throw new Error('Transaction outside campaign window');
  const evidence = { hash,chainId:config.chainId,vault:event.address,status:'verified-repayment',blockNumber:receipt.blockNumber,at,day:new Date(at).toISOString().slice(0,10),amount:event.args.amount };
  await store.update(state=>{if (!state.receipts.some(row=>row.hash===hash && row.status==='verified-repayment')) state.receipts.push(evidence);});
  return evidence;
}
export async function campaignStatus(client,config,store) {
  const state = await store.read();
  let identity = { registered:false,listed:false,reason:'Not configured' };
  try { identity = await readIdentity(client,config); } catch { identity.reason='Identity/listing could not be verified'; }
  const repayments = state.receipts.filter(row=>row.status==='verified-repayment');
  const txCount = new Set(repayments.map(row=>row.hash)).size;
  const days = new Set(repayments.map(row=>row.day)).size;
  const completed = new Set();
  for (const entry of Object.values(state.enrollments)) {
    try {
      const sub = await verifySubscription(client,config,entry.subscriptionId,entry.owner,{requireActive:false});
      const observed = state.observations.some(o=>o.subscriptionId===entry.subscriptionId);
      if (!sub.active && !sub.cancelled && sub.claimed > 0n && observed && entry.owner.toLowerCase() !== config.campaignOwner.toLowerCase()) completed.add(entry.owner.toLowerCase());
    } catch { /* Unknown, never count it as completed. */ }
  }
  return {
    complete:false, category:'health-factor', chainId:config.chainId, deadline:'2026-11-05T12:00:00Z',
    checks:{
      campaignRegistration:{status:'user-confirmed',note:'Google Form submitted; not verifiable by this service'},
      publicRepository:{status:'published',url:'https://github.com/mana-devs/chainpilot'},
      identity:{status:identity.registered?'verified':'pending',agentId:config.agentId,owner:identity.owner||null},
      marketplace:{status:identity.listed?'verified':'pending',listingId:identity.listingId||null},
      publicEndpoint:{status:config.publicUrl.startsWith('https:')?'configured-needs-external-probe':'local-only',url:config.publicUrl},
      agentActions:{status:txCount>=5&&days>=3?'evidence-collected':'pending',transactions:txCount,days,requiredTransactions:5,requiredDays:3},
      independentHires:{status:'requires-organizer-verification',completedServiceWallets:completed.size,required:3,note:'Wallet ownership and funding independence are not proven by distinct addresses'},
      participantHires:{status:'pending-evidence',requiredDifferentAgents:3,requiredMarketplaces:2},
      originalityAndEligibility:{status:'requires-organizer-review'}
    },
    note:'This checklist reports evidence, not prize eligibility. No hires, multi-day activity or independence are fabricated.'
  };
}
