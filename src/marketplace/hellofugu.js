import { subscriptionAbi, listingAbi, identityAbi } from '../chain/abi.js';
import { checkedBlock } from '../chain/venus.js';
export async function readIdentity(client, config) {
  if (config.agentId === null) return { registered: false, reason: 'Agent ID not configured' };
  const block = await checkedBlock(client, config);
  const call = (a, abi, name, args) => client.readContract({ address: a, abi, functionName: name, args, blockNumber: block.number });
  const [owner, uri] = await Promise.all([
    call(config.identityRegistry, identityAbi, 'ownerOf', [BigInt(config.agentId)]),
    call(config.identityRegistry, identityAbi, 'tokenURI', [BigInt(config.agentId)])
  ]);
  const id = await call(config.listingRegistry, listingAbi, 'listingByAgentId', [BigInt(config.agentId)]);
  const listing = id === 0n ? null : await call(config.listingRegistry, listingAbi, 'getListing', [id]);
  return { registered: owner.toLowerCase() === config.campaignOwner.toLowerCase(), owner, uri, listingId: id,
    listed: !!listing?.active && listing.owner.toLowerCase() === config.campaignOwner.toLowerCase() && listing.erc8004AgentId === BigInt(config.agentId), listing };
}
export async function verifySubscription(client, config, subId, subscriber, { requireActive = true } = {}) {
  if (!/^\d{1,30}$/.test(String(subId)) || !config.listingId || !config.agentId) throw new Error('A configured listing and valid subscription ID are required');
  const block = await checkedBlock(client, config);
  const [sub, listing] = await Promise.all([
    client.readContract({ address: config.subscription, abi: subscriptionAbi, functionName: 'getSub', args: [BigInt(subId)], blockNumber: block.number }),
    client.readContract({ address: config.listingRegistry, abi: listingAbi, functionName: 'getListing', args: [BigInt(config.listingId)], blockNumber: block.number })
  ]);
  if (sub.listingId !== BigInt(config.listingId) || sub.subscriber.toLowerCase() !== subscriber.toLowerCase() ||
      sub.deposited === 0n || listing.erc8004AgentId !== BigInt(config.agentId) || listing.owner.toLowerCase() !== config.campaignOwner.toLowerCase()) {
    throw new Error('Subscription does not belong to this user and ChainPilot listing');
  }
  if (requireActive && (sub.cancelled || !listing.active || sub.startedAt > block.timestamp || sub.endsAt <= block.timestamp)) throw new Error('Subscription is inactive');
  return { ...sub, id: String(subId), active: !sub.cancelled && sub.startedAt <= block.timestamp && sub.endsAt > block.timestamp, blockNumber: block.number };
}
