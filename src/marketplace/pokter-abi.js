// Interfaces from bnb-chain/bnbagent-sdk, commit 245fcf18c178c678a34870d8cc8b5a841e45ea30.
export const pokterAbi = {
  "AgenticCommerce": [
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "jobId",
          "type": "uint256"
        }
      ],
      "name": "getJob",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "address",
              "name": "client",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "provider",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "evaluator",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "description",
              "type": "string"
            },
            {
              "internalType": "uint256",
              "name": "budget",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "expiredAt",
              "type": "uint256"
            },
            {
              "internalType": "enum IACP.JobStatus",
              "name": "status",
              "type": "uint8"
            },
            {
              "internalType": "address",
              "name": "hook",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "submittedAt",
              "type": "uint256"
            },
            {
              "internalType": "bytes32",
              "name": "deliverable",
              "type": "bytes32"
            }
          ],
          "internalType": "struct IACP.Job",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "jobId",
          "type": "uint256"
        }
      ],
      "name": "jobPaymentToken",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "jobId",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "deliverable",
          "type": "bytes32"
        },
        {
          "internalType": "bytes",
          "name": "optParams",
          "type": "bytes"
        }
      ],
      "name": "submit",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "EvaluatorRouter": [
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "jobId",
          "type": "uint256"
        }
      ],
      "name": "jobPolicy",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "jobId",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "evidence",
          "type": "bytes"
        }
      ],
      "name": "settle",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "OptimisticPolicy": [
    {
      "inputs": [],
      "name": "disputeWindow",
      "outputs": [
        {
          "internalType": "uint64",
          "name": "",
          "type": "uint64"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ],
  "IdentityRegistry": [
    {
      "inputs": [],
      "name": "eip712Domain",
      "outputs": [
        {
          "internalType": "bytes1",
          "name": "fields",
          "type": "bytes1"
        },
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "version",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "chainId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "verifyingContract",
          "type": "address"
        },
        {
          "internalType": "bytes32",
          "name": "salt",
          "type": "bytes32"
        },
        {
          "internalType": "uint256[]",
          "name": "extensions",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agentId",
          "type": "uint256"
        }
      ],
      "name": "getAgentWallet",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        }
      ],
      "name": "ownerOf",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agentId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "newWallet",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "deadline",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "signature",
          "type": "bytes"
        }
      ],
      "name": "setAgentWallet",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "tokenId",
          "type": "uint256"
        }
      ],
      "name": "tokenURI",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
};
