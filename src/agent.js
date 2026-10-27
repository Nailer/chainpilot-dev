import { verifyMessage } from 'viem';
import { address } from './config.js';
import { readPosition, readVault, decideProtection, jsonSafe } from './chain/venus.js';
import { verifySubscription } from './marketplace/hellofugu.js';
import { vaultAbi } from './chain/abi.js';

export function enrollmentMessage(config, { vault, subscriptionId, expiresAt }) {
  return `ChainPilot enrollment\nChain: ${config.chainId}\nService: ${config.publicUrl}\nVault: ${address(vault).toLowerCase()}\nSubscription: ${subscriptionId}\nSignature expiry: ${expiresAt}\nI request monitoring and policy-bounded repayments while my subscription and vault authorization are active. Onchain repayment receipts are public. This signature does not transfer funds.`;
}
export async function enroll(client, config, store, input) {
  const vaultAddress = address(input.vault);
  const now = Math.floor(Date.now()/1000);
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt < now || input.expiresAt > now + 600 || !/^\d{1,30}$/.test(String(input.subscriptionId))) throw new Error('Invalid enrollment expiry or subscription');
  if (!Number.isSafeInteger(input.targetBps) || input.targetBps <= 10000 || input.targetBps > 50000) throw new Error('Invalid target');
  const vault = await readVault(client, config, vaultAddress);
  if (!config.keeper || vault.keeper.toLowerCase() !== config.keeper.toLowerCase()) throw new Error('Vault must authorize the configured keeper');
  // Target is part of the signed request, preventing a third party from changing it.
  const message = `${enrollmentMessage(config,input)}\nTarget health factor (bps): ${input.targetBps}`;
  if (!(await verifyMessage({ address: vault.owner, message, signature: input.signature }))) throw new Error('Enrollment signature does not match vault owner');
  if (BigInt(input.targetBps)*10n**14n <= vault.triggerWad) throw new Error('Target must exceed vault trigger');
  const subscription = await verifySubscription(client,config,input.subscriptionId,vault.owner);
  const entry = { vault: vaultAddress, owner: vault.owner, subscriptionId: String(input.subscriptionId), targetBps: input.targetBps, enrolledAt: Date.now(), subscriptionEndsAt: String(subscription.endsAt) };
  // A replay can only re-enroll the exact same signed policy, within ten minutes.
  await store.enroll(entry);
  return entry;
}

export async function inspectVault(client,config,vaultAddress,targetBps = 15000) {
  const vault = await readVault(client,config,vaultAddress);
  const position = await readPosition(client,config,vault.owner);
  if (vault.token.toLowerCase() !== position.repaymentAsset.token.toLowerCase()) throw new Error('Vault token mismatch');
  const decision = decideProtection(position,vault,{targetBps});
  return { vault,position,decision };
}

export async function tick({ client, wallet, config, store }) {
  const state = await store.read();
  const results = [];
  // Serial execution avoids nonce collisions. Use one worker per keeper/store.
  for (const entry of Object.values(state.enrollments)) {
    try {
      const unresolved=state.receipts.find(row=>row.vault?.toLowerCase()===entry.vault.toLowerCase()&&row.status==='pending'&&!state.receipts.some(other=>other.hash===row.hash&&['confirmed','reverted'].includes(other.status)));
      if(unresolved) {
        try {
          const receipt=await client.getTransactionReceipt({hash:unresolved.hash});
          const head=await client.getBlockNumber();
          if(head<receipt.blockNumber+1n) {results.push({vault:entry.vault,status:'awaiting-confirmations'});continue;}
          await store.record('receipts',{...unresolved,status:receipt.status==='success'?'confirmed':'reverted',blockNumber:receipt.blockNumber});
        } catch {results.push({vault:entry.vault,status:'pending-reconciliation',hash:unresolved.hash});continue;}
        // Refresh the position on a later tick, never send while reconciling.
        results.push({vault:entry.vault,status:'reconciled',hash:unresolved.hash});continue;
      }
      await verifySubscription(client,config,entry.subscriptionId,entry.owner);
      const { vault, position, decision } = await inspectVault(client,config,entry.vault,entry.targetBps);
      if (vault.owner.toLowerCase() !== entry.owner.toLowerCase()) throw new Error('Owner mismatch');
      const observation = { at: Date.now(), vault: entry.vault, subscriptionId: entry.subscriptionId, blockNumber: position.blockNumber, healthFactorWad: position.healthFactorWad, decision: decision.action, reason: decision.reason };
      await store.record('observations',observation);
      if (decision.action !== 'repay' || !config.executionEnabled) {
        results.push({ ...observation, execution: 'not-broadcast' }); continue;
      }
      if (!wallet?.account || wallet.account.address.toLowerCase() !== vault.keeper.toLowerCase() || wallet.account.address.toLowerCase() !== config.keeper?.toLowerCase()) throw new Error('Signer is not the authorized keeper');
      // The contract independently checks the current risk, budget, expiry and cooldown.
      const { request } = await client.simulateContract({ address: entry.vault, abi: vaultAbi, functionName: 'execute', args: [decision.amount], account: wallet.account });
      const gas = await client.estimateContractGas({ ...request });
      const gasPrice = await client.getGasPrice();
      if (gas * 120n / 100n * gasPrice > 2n*10n**15n) throw new Error('Estimated gas exceeds 0.002 BNB per-action ceiling');
      const hash = await wallet.writeContract({ ...request, gas: gas*120n/100n, gasPrice });
      await store.record('receipts',{ hash, vault: entry.vault, subscriptionId: entry.subscriptionId, status: 'pending', broadcastAt: Date.now() });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
      if (receipt.status !== 'success') {
        await store.record('receipts',{hash,vault:entry.vault,status:'reverted',blockNumber:receipt.blockNumber});
        throw new Error('Repayment reverted');
      }
      const after = await readPosition(client,config,entry.owner);
      await store.record('receipts',{ hash, vault: entry.vault, subscriptionId: entry.subscriptionId, status: 'confirmed', blockNumber: receipt.blockNumber, confirmedAt: Date.now(), afterHealthFactorWad: after.healthFactorWad });
      results.push({ hash, status: 'confirmed' });
    } catch {
      // Do not persist RPC URLs, signatures or secret-bearing provider errors.
      results.push({ vault: entry.vault, status: 'failed', reason: 'Verification or execution failed; inspect the position and subscription before retrying' });
    }
  }
  return jsonSafe(results);
}
