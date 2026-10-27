import { isAddress, getAddress } from 'viem';
export const CAMPAIGN_OWNER = '0xf5506B65e71601991895cD40bD2E875F29cca0da';
export const SOURCES = {
  venus: 'https://github.com/VenusProtocol/isolated-pools/tree/943e7db1855c8ab4a09104f1d09e2b2db0506b95',
  marketplace: 'https://github.com/Lexirieru/fugugent/tree/52b3e89b94d18e4bf6a5ec84a9c925255294f478'
};
export function address(value, name = 'address') {
  if (typeof value !== 'string' || !isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) throw new Error(`Invalid ${name}`);
  return getAddress(value.toLowerCase());
}
export function configFromEnv(env = process.env) {
  const chainId = Number(env.CHAIN_ID || 97);
  // The shipped addresses are Venus isolated-pool Stablecoins on BSC testnet.
  // Mainnet is intentionally not enabled through an arbitrary RPC override.
  if (chainId !== 97) throw new Error('Only BSC testnet (97) is configured; mainnet needs a reviewed deployment profile');
  const base = env.PUBLIC_URL || 'http://localhost:3001';
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('PUBLIC_URL must use HTTPS');
  return {
    chainId, rpcUrl: env.BSC_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
    controller: '0x10b57706AD2345e590c2eA4DC02faef0d9f5b08B',
    market: '0x3338988d0beb4419Acb8fE624218754053362D06',
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    listingRegistry: '0xb2f36070E6eae3353E8e755172B477DF213ae248',
    subscription: '0xfdb083371f44Cf53181350389D3217e51B431776',
    campaignOwner: CAMPAIGN_OWNER,
    publicUrl: url.origin,
    factory: env.FACTORY_ADDRESS ? address(env.FACTORY_ADDRESS, 'factory') : null,
    keeper: env.KEEPER_ADDRESS ? address(env.KEEPER_ADDRESS, 'keeper') : null,
    agentId: env.AGENT_ID && /^\d+$/.test(env.AGENT_ID) ? env.AGENT_ID : null,
    listingId: env.LISTING_ID && /^\d+$/.test(env.LISTING_ID) ? env.LISTING_ID : null,
    dataDir: env.DATA_DIR || './data',
    executionEnabled: env.EXECUTION_ENABLED === 'true'
  };
}
