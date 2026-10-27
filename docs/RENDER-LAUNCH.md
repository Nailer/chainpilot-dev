# ChainPilot launch on Render

Create one always-on **Node web service** from `https://github.com/mana-devs/chainpilot`, branch `main`.

- Build command: `npm ci`
- Start command: `node scripts/start-service.js`
- Node: 22 (the repository contains `.nvmrc`)
- Health check: `/health`
- Persistent disk: mount at `/var/data`; 1 GB is sufficient initially.
- Choose the smallest always-on instance that supports a disk. Confirm its displayed price with the owner before creating paid resources. Do not use a sleeping free instance for campaign availability.

Initial environment (no secret values):

```dotenv
HOST=0.0.0.0
CHAIN_ID=97
BSC_RPC_URL=https://bsc-testnet-rpc.publicnode.com
DATA_DIR=/var/data
INIT_KEEPER_ON_START=true
KEEPER_KEY_FILE=/var/data/keeper.key
RUN_WORKER=false
EXECUTION_ENABLED=false
```

Leave `PUBLIC_URL` unset on Render: the application uses Render's documented `RENDER_EXTERNAL_URL`. Do not set it to localhost. Leave factory, agent ID and listing ID unset until those transactions are confirmed.

The supervisor creates a new keeper key on the private persistent disk only if no key already exists. It passes the derived **public address** to child processes, and never returns the private key. This does not fund the keeper or send any transaction. The key survives restarts; don't replace the disk after vaults authorize it. The campaign owner remains the user's registered wallet.

After the HTTP deployment is live:

1. Verify the service and metadata externally. Record the public URL and the public keeper address from `/v1/config`.
2. Review and sign the factory deployment from the campaign owner wallet. Configure its confirmed `FACTORY_ADDRESS` in Render, redeploy, and verify controller and market addresses.
3. Register the ERC-8004 identity using `/registration.json` from the campaign owner. Configure the resulting `AGENT_ID`, publish it in README, and redeploy.
4. Set a service price explicitly and list on HelloFugu. Configure its actual `LISTING_ID`, publish the listing link and redeploy.
5. Fund the keeper with a small **testnet** gas allowance approved by the owner. This is a service operational key, not an additional campaign participant.
6. Set `RUN_WORKER=true`, keeping `EXECUTION_ENABLED=false`. Verify `/health` reports a recent worker heartbeat.
7. Enroll real users with valid subscriptions and real Venus DeFi-pool borrowing positions. The borrower chooses reserve amount, per-action cap, target and expiry and signs the setup steps themselves.
8. After inspecting monitor-only decisions, explicitly approve enabling `EXECUTION_ENABLED=true`. Confirm real onchain repayments and category-consistent receipts. Record evidence; do not generate transactions merely to meet a count.

The selected DeFi USDT market was chosen after a real Venus local-fork acceptance test found new supplies paused in the earlier Stablecoins market. Protocol pause flags are read on every live analysis; future pause changes can still prevent actions. No third-party pause state is modified by ChainPilot.

Three completed hires from independently funded users and activity across three days cannot be manufactured by deployment. Keep those requirements pending until genuine evidence exists.
