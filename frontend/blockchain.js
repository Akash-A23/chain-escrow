const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const CONTRACT_ABI = [
    {
      "inputs": [],
      "name": "ReentrancyGuardReentrantCall",
      "type": "error"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_jobId", "type": "uint256" },
        { "internalType": "uint256", "name": "_milestoneId", "type": "uint256" }
      ],
      "name": "approveMilestone",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "_freelancer", "type": "address" },
        { "internalType": "address[]", "name": "_arbiters", "type": "address[]" },
        { "internalType": "address", "name": "_token", "type": "address" },
        { "internalType": "uint256[]", "name": "_milestoneAmounts", "type": "uint256[]" },
        { "internalType": "uint256[]", "name": "_deadlines", "type": "uint256[]" }
      ],
      "name": "createJob",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "jobCount",
      "outputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" },
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "name": "jobMilestones",
      "outputs": [
        { "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "internalType": "enum ChainEscrow.MilestoneState", "name": "state", "type": "uint8" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "name": "jobs",
      "outputs": [
        { "internalType": "address", "name": "client", "type": "address" },
        { "internalType": "address", "name": "freelancer", "type": "address" },
        { "internalType": "address", "name": "arbiter", "type": "address" },
        { "internalType": "uint256", "name": "totalAmount", "type": "uint256" },
        { "internalType": "uint256", "name": "milestoneCount", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_jobId", "type": "uint256" },
        { "internalType": "uint256", "name": "_milestoneId", "type": "uint256" }
      ],
      "name": "raiseDispute",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_jobId", "type": "uint256" },
        { "internalType": "uint256", "name": "_milestoneId", "type": "uint256" },
        { "internalType": "uint256", "name": "_clientShare", "type": "uint256" }
      ],
      "name": "resolveDispute",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_jobId", "type": "uint256" },
        { "internalType": "uint256", "name": "_milestoneId", "type": "uint256" }
      ],
      "name": "submitMilestone",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
];

async function getContractReadOnly() {
    if (!window.ethereum) throw new Error("MetaMask is not installed!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

async function getContractWithSigner() {
    if (!window.ethereum) throw new Error("MetaMask is not installed!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}