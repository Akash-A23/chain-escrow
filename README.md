#Taskid- ChainEscrow
# 🔒 ChainEscrow

A decentralized, trustless milestone-based escrow application built on Ethereum, featuring strict role-based access control, multi-milestone tracking, and a dedicated arbiter dispute-resolution panel.

---

## 🌟 Key Features

* **Multi-Milestone Escrow:** Divide complex projects into sequential milestones with custom funding amounts and Unix timestamp deadlines.
* **Role-Adaptive UI:** Automatically detects whether the connected MetaMask wallet is acting as a **Client**, **Freelancer**, or **Arbiter**, rendering only authorized interface views and actions.
* **Strict Role-Based Permissions:**
  * **Client:** Creates and funds escrow jobs, monitors progress, approves completed milestones, or raises a dispute if necessary.
  * **Freelancer:** Submits completed milestone work and can trigger a dispute if deliverables are contested.
  * **Arbiter:** Dynamically views only disputed milestones requiring their attention, with authority to vote and distribute escrowed funds accordingly.
* **Flexible Asset Support:** Supports both native ETH and ERC-20 token escrows.
* **Real-Time Event Tracking:** Live activity logging and state updates pulled directly from contract events via Ethers.js `queryFilter`.

---

## 🛠️ Tech Stack

* **Smart Contracts:** Solidity, OpenZeppelin (`ReentrancyGuard`), Hardhat
* **Blockchain Interaction:** Ethers.js (v6)
* **Frontend:** Vanilla JavaScript, HTML5, CSS3, MetaMask
* **Local Development:** Hardhat Local Testnet Node

---

## 🚀 Getting Started & Local Setup

### Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* [MetaMask](https://metamask.io/) browser extension installed.
