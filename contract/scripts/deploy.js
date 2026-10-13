const hre = require("hardhat");

async function main() {
    console.log("Deploying ChainEscrow contract...");

    const ChainEscrow = await hre.ethers.getContractFactory("ChainEscrow");
    const escrow = await ChainEscrow.deploy();

    await escrow.waitForDeployment();
    const address = await escrow.getAddress();

    console.log(`ChainEscrow successfully deployed to: ${address}`);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
});