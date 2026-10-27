export function agentCard(config) {
  return {
    name: 'ChainPilot', description: config.marketplace === 'pokter' ? 'ChainPilot assesses Venus DeFi isolated-pool lending risk on BNB testnet. Hire it for a read-only health-factor report with block references and limitations. Position Guard offers separate opt-in vault protection.' : 'A modular BNB Chain assistant. Position Guard reads Venus isolated-pool lending risk and prepares budget-limited debt repayments. Autonomous execution requires a funded vault and active subscription.',
    url: `${config.publicUrl}/a2a`, version: '0.3.0', protocolVersion: '0.3.0',
    preferredTransport: 'JSONRPC', capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain','application/json'], defaultOutputModes: ['application/json'],
    category: 'health-factor',
    skills: [{ id: 'position-guard', name: 'Position Guard', description: 'Read a Venus isolated-pool borrower on BSC testnet and explain health factor. Enrolled vaults can repay debt within contract-enforced limits.', tags: ['health-factor','venus','bnb-chain'], examples: ['Analyze 0xf5506B65e71601991895cD40bD2E875F29cca0da'] }],
    ...(config.marketplace === 'pokter' ? {skills:[
      {id:'negotiate',name:'Quote a Venus lending-risk assessment',description:'A read-only health-factor report for exactly one borrower in the Venus DeFi isolated pool on BNB testnet (97). No swaps or transactions for the buyer. Paid in 0.01 test U.',tags:['health-factor','erc8183','negotiation'],examples:['Assess liquidation risk for borrower 0xf5506B65e71601991895cD40bD2E875F29cca0da in the Venus DeFi isolated pool on BNB testnet (97). Return health factor, collateral, debt, block reference and limitations.']},
      {id:'notify_funded',name:'Accept a funded risk-assessment job',description:'Verify the onchain escrow and signed terms, then deliver the report in the background.',tags:['erc8183']},
      {id:'preview',name:'Preview a Venus health-factor report',description:'Free read-only assessment using the same scope as a paid report.',tags:['preview','health-factor'],examples:['Assess 0xf5506B65e71601991895cD40bD2E875F29cca0da on Venus BNB testnet.']}
    ]} : {}),
    documentationUrl: 'https://github.com/mana-devs/chainpilot', supportsAuthenticatedExtendedCard: false
  };
}
export function registrationFile(config) {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'ChainPilot', description: agentCard(config).description,
    image: `${config.publicUrl}/logo.svg`, category: 'health-factor', active: true, x402Support: false,
    services: [
      { name: 'A2A', endpoint: `${config.publicUrl}/.well-known/agent-card.json`, version: '0.3.0' },
      { name: 'MCP', endpoint: `${config.publicUrl}/mcp`, version: '2025-03-26' },
      { name: 'repo', endpoint: 'https://github.com/mana-devs/chainpilot' }
    ],
    registrations: config.agentId ? [{ agentId: config.agentId, agentRegistry: `eip155:${config.chainId}:${config.identityRegistry}` }] : []
  };
}
