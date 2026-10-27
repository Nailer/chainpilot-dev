import { createPublicClient, http, formatUnits } from 'viem';
import { bscTestnet } from 'viem/chains';
import { controllerAbi, marketAbi, oracleAbi, tokenAbi, vaultAbi, factoryAbi } from './abi.js';
import { address } from '../config.js';

const WAD = 10n ** 18n;
export const jsonSafe = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
export function createClient(config) {
  return createPublicClient({ chain: bscTestnet, transport: http(config.rpcUrl, { timeout: 12000, retryCount: 1 }) });
}
export async function checkedBlock(client, config) {
  if (await client.getChainId() !== config.chainId) throw new Error('RPC chain mismatch');
  const block = await client.getBlock();
  const age = Date.now() / 1000 - Number(block.timestamp);
  if (age > 90 || age < -15) throw new Error('RPC block is stale or has a future timestamp');
  return block;
}
export async function readPosition(client, config, borrower) {
  borrower = address(borrower, 'borrower');
  const block = await checkedBlock(client, config);
  const call = (contract, abi, functionName, args = []) => client.readContract({ address: contract, abi, functionName, args, blockNumber: block.number });
  const [assets, oracle, selectedController, underlying] = await Promise.all([
    call(config.controller, controllerAbi, 'getAssetsIn', [borrower]),
    call(config.controller, controllerAbi, 'oracle'),
    call(config.market, marketAbi, 'comptroller'),
    call(config.market, marketAbi, 'underlying')
  ]);
  if (selectedController.toLowerCase() !== config.controller.toLowerCase()) throw new Error('Market controller mismatch');
  if (assets.length > 32) throw new Error('More than 32 markets are unsupported');
  const [decimals, symbol, selectedPrice, selectedSnapshot] = await Promise.all([
    call(underlying, tokenAbi, 'decimals'), call(underlying, tokenAbi, 'symbol'),
    call(oracle, oracleAbi, 'getUnderlyingPrice', [config.market]),
    call(config.market, marketAbi, 'getAccountSnapshot', [borrower])
  ]);
  if (selectedPrice <= 0n || selectedSnapshot[0] !== 0n) throw new Error('Invalid repayment market snapshot or price');
  let adjustedCollateralUsd18 = 0n, debtUsd18 = 0n;
  const markets = await Promise.all(assets.map(async market => {
    const [[listed,, threshold], [error, balance, debt, exchangeRate], price] = await Promise.all([
      call(config.controller, controllerAbi, 'markets', [market]),
      call(market, marketAbi, 'getAccountSnapshot', [borrower]),
      call(oracle, oracleAbi, 'getUnderlyingPrice', [market])
    ]);
    if (!listed || error !== 0n || price === 0n || threshold > WAD) throw new Error('Invalid market accounting or oracle');
    const vPrice = exchangeRate * price / WAD;
    const weightedPrice = threshold * vPrice / WAD;
    return { market, adjustedCollateralUsd18: weightedPrice * balance / WAD, debtUsd18: price * debt / WAD };
  }));
  for (const m of markets) { adjustedCollateralUsd18 += m.adjustedCollateralUsd18; debtUsd18 += m.debtUsd18; }
  const [error, liquidity, shortfall] = await call(config.controller, controllerAbi, 'getAccountLiquidity', [borrower]);
  const delta = adjustedCollateralUsd18 - debtUsd18;
  if (error !== 0n || liquidity !== (delta > 0n ? delta : 0n) || shortfall !== (delta < 0n ? -delta : 0n)) throw new Error('Local accounting does not match Venus liquidation liquidity');
  return {
    protocol: 'venus-isolated', chainId: config.chainId, borrower, blockNumber: block.number,
    blockHash: block.hash, observedAt: Number(block.timestamp) * 1000,
    adjustedCollateralUsd18, debtUsd18,
    healthFactorWad: debtUsd18 === 0n ? null : adjustedCollateralUsd18 * WAD / debtUsd18,
    markets, repaymentAsset: { market: config.market, token: underlying, decimals, symbol, priceMantissa: selectedPrice, debtTokenUnits: selectedSnapshot[2] },
    accounting: 'stored-interest; execution accrues interest again before checking risk',
    display: { collateralUsd: formatUnits(adjustedCollateralUsd18,18), debtUsd: formatUnits(debtUsd18,18) }
  };
}

export async function readVault(client, config, vault) {
  vault = address(vault, 'vault');
  if (!config.factory) throw new Error('Factory is not deployed/configured');
  const block = await checkedBlock(client, config);
  const call = (a, abi, functionName, args = []) => client.readContract({ address: a, abi, functionName, args, blockNumber: block.number });
  const [factoryController, factoryMarket, registered] = await Promise.all([
    call(config.factory, factoryAbi, 'controller'), call(config.factory, factoryAbi, 'market'), call(config.factory, factoryAbi, 'isVault', [vault])
  ]);
  if (!registered || factoryController.toLowerCase() !== config.controller.toLowerCase() || factoryMarket.toLowerCase() !== config.market.toLowerCase()) throw new Error('Untrusted vault/factory');
  const names = ['owner','keeper','controller','market','token','triggerWad','maxRepay','expiresAt','cooldown','remainingBudget','lastExecutedAt','paused'];
  const values = await Promise.all(names.map(name => call(vault, vaultAbi, name)));
  const state = Object.fromEntries(names.map((name,i) => [name,values[i]]));
  if (state.controller.toLowerCase() !== config.controller.toLowerCase() || state.market.toLowerCase() !== config.market.toLowerCase()) throw new Error('Vault protocol mismatch');
  state.balance = await call(state.token, tokenAbi, 'balanceOf', [vault]);
  return { address: vault, ...state };
}

export function decideProtection(position, vault, { targetBps = 15000, now = Date.now() } = {}) {
  if (!Number.isSafeInteger(targetBps) || targetBps < 10001 || targetBps > 50000 || BigInt(targetBps) * 10n ** 14n <= vault.triggerWad) throw new Error('Target must exceed trigger and be at most 5.0');
  const hold = reason => ({ action: 'hold', reason, amount: 0n, targetBps });
  if (now - position.observedAt > 90000 || position.observedAt > now + 15000) throw new Error('Stale position');
  if (vault.paused) return hold('paused');
  if (BigInt(Math.floor(now/1000)) >= vault.expiresAt) return hold('expired');
  if (vault.lastExecutedAt !== 0n && BigInt(Math.floor(now/1000)) < vault.lastExecutedAt + vault.cooldown) return hold('cooldown');
  if (position.debtUsd18 === 0n) return hold('no-debt');
  if (position.healthFactorWad >= vault.triggerWad) return hold('above-trigger');
  const requiredUsd18 = position.debtUsd18 - position.adjustedCollateralUsd18 * 10000n / BigInt(targetBps);
  const price = position.repaymentAsset.priceMantissa;
  if (price <= 0n) throw new Error('Invalid token price');
  const requiredTokenUnits = (requiredUsd18 * WAD + price - 1n) / price;
  const amount = [requiredTokenUnits,vault.remainingBudget,vault.maxRepay,vault.balance,position.repaymentAsset.debtTokenUnits].reduce((a,b)=>a<b?a:b);
  if (amount <= 0n) return hold('no-funded-debt-in-selected-market');
  return { action: 'repay', reason: 'below-trigger', amount, targetBps, requiredTokenUnits, targetReachableEstimate: amount >= requiredTokenUnits };
}
