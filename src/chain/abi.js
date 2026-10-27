import { parseAbi } from 'viem';
export const controllerAbi = parseAbi([
  'function getAssetsIn(address) view returns (address[])',
  'function markets(address) view returns (bool,uint256,uint256)',
  'function oracle() view returns (address)',
  'function getAccountLiquidity(address) view returns (uint256,uint256,uint256)'
]);
export const marketAbi = parseAbi([
  'function getAccountSnapshot(address) view returns (uint256,uint256,uint256,uint256)',
  'function underlying() view returns (address)',
  'function comptroller() view returns (address)',
  'function borrowBalanceStored(address) view returns (uint256)'
]);
export const oracleAbi = parseAbi(['function getUnderlyingPrice(address) view returns (uint256)']);
export const tokenAbi = parseAbi([
  'function decimals() view returns (uint8)', 'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'
]);
export const vaultAbi = parseAbi([
  'function owner() view returns (address)', 'function keeper() view returns (address)',
  'function controller() view returns (address)', 'function market() view returns (address)',
  'function token() view returns (address)', 'function triggerWad() view returns (uint256)',
  'function maxRepay() view returns (uint256)', 'function expiresAt() view returns (uint256)',
  'function cooldown() view returns (uint256)', 'function remainingBudget() view returns (uint256)',
  'function lastExecutedAt() view returns (uint256)', 'function paused() view returns (bool)',
  'function fund(uint256)', 'function withdraw(uint256)', 'function setPaused(bool)',
  'function execute(uint256) returns (uint256)',
  'event Repaid(address indexed borrower,address indexed market,uint256 amount,uint256 healthBefore,uint256 healthAfter)'
]);
export const factoryAbi = parseAbi([
  'function isVault(address) view returns (bool)', 'function controller() view returns (address)',
  'function market() view returns (address)',
  'function create(address,uint256,uint256,uint256,uint256) returns (address)',
  'event VaultCreated(address indexed owner,address indexed vault,address indexed keeper)'
]);
export const identityAbi = parseAbi([
  'function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)',
  'function register(string) returns (uint256)',
  'event Registered(uint256 indexed agentId,string agentURI,address indexed owner)'
]);
export const listingAbi = parseAbi([
  'function listingByAgentId(uint256) view returns (uint256)',
  'function list(uint256,address,uint8,uint128,uint32,string) returns (uint256)',
  'function getListing(uint256) view returns ((uint256 erc8004AgentId,address owner,address agentWallet,uint8 category,uint128 priceUsd8PerPeriod,uint32 periodSeconds,bool active,bool curated,string metadataURI))'
]);
export const subscriptionAbi = parseAbi([
  'function getSub(uint256) view returns ((uint256 listingId,address subscriber,address payToken,uint128 deposited,uint128 claimed,uint64 startedAt,uint64 endsAt,bool cancelled,uint16 feeBps))',
  'function claim(uint256)',
  'event Subscribed(uint256 indexed subId,uint256 indexed listingId,address indexed subscriber,address payToken,uint256 amount)'
]);
