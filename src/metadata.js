export function agentCard(config) {
  return {
    name: 'ChainPilot', description: 'A modular BNB Chain assistant. Position Guard reads Venus isolated-pool lending risk and prepares budget-limited debt repayments. Autonomous execution requires a funded vault and active subscription.',
    url: `${config.publicUrl}/a2a`, version: '0.2.0', protocolVersion: '0.3.0',
    preferredTransport: 'JSONRPC', capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain','application/json'], defaultOutputModes: ['application/json'],
    category: 'health-factor',
    skills: [{ id: 'position-guard', name: 'Position Guard', description: 'Read a Venus isolated-pool borrower on BSC testnet and explain health factor. Enrolled vaults can repay debt within contract-enforced limits.', tags: ['health-factor','venus','bnb-chain'], examples: ['Analyze 0xf5506B65e71601991895cD40bD2E875F29cca0da'] }],
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
