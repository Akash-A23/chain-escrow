const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainEscrow Security & Workflow Tests", function () {
    let ChainEscrow, escrow, owner, client, freelancer, arbiter, attacker;
    const futureDeadline = Math.floor(Date.now() / 1000) + 86400; // 1 day in future

    beforeEach(async function () {
        [owner, client, freelancer, arbiter, attacker] = await ethers.getSigners();
        ChainEscrow = await ethers.getContractFactory("ChainEscrow");
        escrow = await ChainEscrow.deploy();
        await escrow.waitForDeployment();
    });

    it("Should successfully create a job and lock funds", async function () {
        const amounts = [ethers.parseEther("1.0"), ethers.parseEther("2.0")];
        const deadlines = [futureDeadline, futureDeadline];
        const total = ethers.parseEther("3.0");

        await expect(
            escrow.connect(client).createJob(
                freelancer.address,
                arbiter.address,
                ethers.ZeroAddress,
                amounts,
                deadlines,
                { value: total }
            )
        ).to.emit(escrow, "JobCreated");

        const job = await escrow.jobs(0);
        expect(job.client).to.equal(client.address);
        expect(job.freelancer).to.equal(freelancer.address);
        expect(job.totalAmount).to.equal(total);
    });

    it("Should prevent job creation if the deposit doesn't match the milestone sum", async function () {
        const amounts = [ethers.parseEther("1.0"), ethers.parseEther("2.0")];
        const deadlines = [futureDeadline, futureDeadline];
        const incorrectTotal = ethers.parseEther("2.5"); // Mismatch

        await expect(
            escrow.connect(client).createJob(
                freelancer.address,
                arbiter.address,
                ethers.ZeroAddress,
                amounts,
                deadlines,
                { value: incorrectTotal }
            )
        ).to.be.revertedWith("ETH deposit must match milestone sum");
    });

    it("SECURITY: Should prevent approving a milestone before it is submitted", async function () {
        const amounts = [ethers.parseEther("1.0")];
        const deadlines = [futureDeadline];
        
        await escrow.connect(client).createJob(
            freelancer.address, arbiter.address, ethers.ZeroAddress, amounts, deadlines,
            { value: amounts[0] }
        );

        await expect(
            escrow.connect(client).approveMilestone(0, 0)
        ).to.be.revertedWith("Milestone must be submitted first");
    });

    it("SECURITY: Should prevent non-freelancers from submitting work", async function () {
        const amounts = [ethers.parseEther("1.0")];
        const deadlines = [futureDeadline];
        
        await escrow.connect(client).createJob(
            freelancer.address, arbiter.address, ethers.ZeroAddress, amounts, deadlines,
            { value: amounts[0] }
        );

        await expect(
            escrow.connect(attacker).submitMilestone(0, 0)
        ).to.be.revertedWith("Only freelancer can submit");
    });

    it("SECURITY: Should prevent double-approval or approving completed jobs", async function () {
        const amounts = [ethers.parseEther("1.0")];
        const deadlines = [futureDeadline];
        
        await escrow.connect(client).createJob(
            freelancer.address, arbiter.address, ethers.ZeroAddress, amounts, deadlines,
            { value: amounts[0] }
        );

        await escrow.connect(freelancer).submitMilestone(0, 0);
        await escrow.connect(client).approveMilestone(0, 0);

        // Trying to approve again fails because job is now completed/inactive
        await expect(
            escrow.connect(client).approveMilestone(0, 0)
        ).to.be.revertedWith("Job is not active");
    });

    it("SECURITY: Should prevent unauthorized addresses from resolving disputes", async function () {
        const amounts = [ethers.parseEther("1.0")];
        const deadlines = [futureDeadline];
        
        await escrow.connect(client).createJob(
            freelancer.address, arbiter.address, ethers.ZeroAddress, amounts, deadlines,
            { value: amounts[0] }
        );

        await escrow.connect(freelancer).submitMilestone(0, 0);
        await escrow.connect(client).raiseDispute(0, 0);

        await expect(
            escrow.connect(attacker).resolveDispute(0, 0, ethers.parseEther("0.5"))
        ).to.be.revertedWith("Only arbiter can resolve dispute");
    });

    it("SECURITY: Should allow client to reclaim funds after deadline passes", async function () {
        const nearDeadline = Math.floor(Date.now() / 1000) + 100;
        const amounts = [ethers.parseEther("1.0")];
        
        await escrow.connect(client).createJob(
            freelancer.address, arbiter.address, ethers.ZeroAddress, amounts, [nearDeadline],
            { value: amounts[0] }
        );

        // Fast-forward time past deadline using Hardhat network provider
        await ethers.provider.send("evm_increaseTime", [200]);
        await ethers.provider.send("evm_mine", []);

        await expect(
            escrow.connect(client).reclaimFunds(0, 0)
        ).to.emit(escrow, "RefundClaimed");
    });
});