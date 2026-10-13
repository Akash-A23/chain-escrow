let currentUser = null;
let allJobsCache = [];

// ==========================================
// TOAST NOTIFICATION SYSTEM (BONUS UI)
// ==========================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 9999;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const bgColors = { pending: '#f59e0b', success: '#16a34a', error: '#dc2626', info: '#2563eb' };
    
    toast.style.cssText = `
        background: ${bgColors[type] || bgColors.info}; 
        color: white; 
        padding: 12px 20px; 
        border-radius: 6px; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
        font-size: 14px; 
        font-weight: 500;
        opacity: 0; 
        transform: translateY(10px); 
        transition: all 0.3s ease;
    `;
    toast.innerText = message;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, (type === 'error' ? 5000 : 4000));
}

// ==========================================
// WALLET & INITIALIZATION LOGIC
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length > 0) {
                currentUser = accounts[0].toLowerCase();
                document.getElementById('wallet-address').innerText = `${currentUser.substring(0,6)}...${currentUser.substring(38)}`;
                document.getElementById('connect-btn').innerText = "Connected";
                loadJobs();
            } else {
                currentUser = null;
                document.getElementById('wallet-address').innerText = "Not Connected";
                document.getElementById('connect-btn').innerText = "Connect MetaMask";
            }
        });
    }
});

async function connectWallet() {
    try {
        if (!window.ethereum) {
            showToast("Please install MetaMask to use ChainEscrow.", "error");
            return;
        }
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentUser = accounts[0].toLowerCase();
        document.getElementById('wallet-address').innerText = `${currentUser.substring(0,6)}...${currentUser.substring(38)}`;
        document.getElementById('connect-btn').innerText = "Connected";
        showToast("Wallet connected successfully!", "success");
        loadJobs();
    } catch (error) {
        console.error("Wallet connection failed:", error);
        showToast("Wallet connection rejected or failed.", "error");
    }
}

// ==========================================
// UI RENDERING & CHAIN DATA FETCHING
// ==========================================
function addMilestoneRow() {
    const list = document.getElementById('milestones-list');
    const row = document.createElement('div');
    row.className = 'milestone-row';
    row.innerHTML = `
        <input type="text" placeholder="Amount (e.g. 0.1)" class="m-amount">
        <input type="datetime-local" class="m-deadline" title="Deadline Date & Time">
    `;
    list.appendChild(row);
}

async function loadJobs() {
    try {
        const contract = await getContractReadOnly();
        const jobCount = await contract.jobCounter ? await contract.jobCounter() : await contract.jobCount();
        
        const container = document.getElementById('jobs-container');
        container.innerHTML = "";
        allJobsCache = [];

        if (Number(jobCount) === 0) {
            container.innerHTML = `<p style="color: #64748b; font-size: 14px;">No escrow jobs found on-chain.</p>`;
        } else {
            for (let i = 0; i < Number(jobCount); i++) {
                const job = await contract.jobs(i);
                
                // Fetch arbiters safely (handling both public array getters and helper functions)
                let arbiters = [];
                try {
                    arbiters = await contract.getJobArbiters(i);
                } catch {
                    try {
                        // Fallback if contract exposes an arbiter getter or array
                        let idx = 0;
                        while(true) {
                            const arb = await contract.jobArbiters(i, idx);
                            arbiters.push(arb);
                            idx++;
                        }
                    } catch {
                        if (job.arbiters) arbiters = job.arbiters;
                    }
                }

                let milestones = [];
                try {
                    milestones = await contract.getJobMilestones(i);
                } catch {
                    for(let mIdx = 0; mIdx < Number(job.milestoneCount); mIdx++) {
                        const m = await contract.jobMilestones(i, mIdx);
                        milestones.push(m);
                    }
                }

                allJobsCache.push({ id: i, client: job.client, freelancer: job.freelancer, token: job.token, arbiters: arbiters, milestones });
            }
        }

        updateRoleBannerAndRender();
        loadEventHistory();
    } catch (error) {
        console.error("Failed to load chain data:", error);
        document.getElementById('jobs-container').innerHTML = `<p style="color: #ef4444; font-size: 14px;">Error loading jobs from chain.</p>`;
    }
}

async function loadEventHistory() {
    try {
        const contract = await getContractReadOnly();
        const historyContainer = document.getElementById('activity-log-container');
        
        const events = await contract.queryFilter("*");
        historyContainer.innerHTML = "";

        if (events.length === 0) {
            historyContainer.innerHTML = `<p style="font-size: 13px; color: #94a3b8;">No contract events emitted yet.</p>`;
            return;
        }

        events.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 20).forEach(event => {
            const eventName = event.fragment ? event.fragment.name : "Chain Event";
            const txHash = event.transactionHash;
            
            let jobContext = "";
            if (event.args && event.args[0] !== undefined && !isNaN(Number(event.args[0]))) {
                jobContext = `(Job #${event.args[0].toString()})`;
            }

            const logEntry = document.createElement('div');
            logEntry.style.cssText = "padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff;";
            logEntry.innerHTML = `
                <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">
                    ${eventName} <span style="color: #64748b; font-weight: 400;">${jobContext}</span>
                </div>
                <div style="color: #64748b; font-size: 11px;">Block: ${event.blockNumber}</div>
                <div style="color: #94a3b8; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Tx: ${txHash}</div>
            `;
            historyContainer.appendChild(logEntry);
        });

    } catch (error) {
        console.error("Failed to fetch event logs:", error);
    }
}

function updateRoleBannerAndRender() {
    if (!currentUser) return;

    let clientCount = 0;
    let freelancerCount = 0;
    let arbiterCount = 0;
    let disputedMilestonesForArbiter = [];

    allJobsCache.forEach(job => {
        // Ensure lowercase comparison for exact address matching
        const isClient = currentUser === job.client.toLowerCase();
        const isFreelancer = currentUser === job.freelancer.toLowerCase();
        
        // Safely check if current user exists in the arbiters array
        const arbitersList = job.arbiters || [];
        const isArbiter = arbitersList.some(arb => arb && arb.toLowerCase() === currentUser);

        if (isClient) clientCount++;
        if (isFreelancer) freelancerCount++;
        if (isArbiter) {
            arbiterCount++;
            job.milestones.forEach((m, jIdx) => {
                if (Number(m.state) === 3) { // Disputed state
                    disputedMilestonesForArbiter.push({ job, milestoneIndex: jIdx, milestone: m });
                }
            });
        }
    });

    const banner = document.getElementById('role-banner');
    const summaryText = document.getElementById('role-summary-text');
    banner.style.display = "block";
    summaryText.innerHTML = `🏗️ <b>${clientCount}</b> as Client | 💻 <b>${freelancerCount}</b> as Freelancer | ⚖️ <b>${arbiterCount}</b> as Arbiter`;

    // Arbiter Panel: Shows ONLY if connected wallet is an arbiter
    const arbiterPanelCard = document.getElementById('arbiter-panel-card');
    const arbiterDisputesContainer = document.getElementById('arbiter-disputes-container');
    
    if (arbiterCount > 0) {
        arbiterPanelCard.style.display = "block";
        arbiterDisputesContainer.innerHTML = "";

        if (disputedMilestonesForArbiter.length === 0) {
            arbiterDisputesContainer.innerHTML = `<p style="font-size: 13px; color: #777; margin: 0;">No active disputes require your resolution right now.</p>`;
        } else {
            disputedMilestonesForArbiter.forEach(item => {
                const ethVal = ethers.formatEther(item.milestone.amount);
                const disputeBox = document.createElement('div');
                disputeBox.style.cssText = "background: white; border: 1px solid #fcd34d; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;";
                disputeBox.innerHTML = `
                    <div>
                        <strong>Job ID #${item.job.id.toString()}</strong> — Milestone #${item.milestoneIndex + 1}<br>
                        <small style="color: #666;">Amount in Dispute: <b>${ethVal} ETH</b></small><br>
                        <small style="color: #444;">Client: ${item.job.client.substring(0,6)}... | Freelancer: ${item.job.freelancer.substring(0,6)}...</small>
                    </div>
                    <div>
                        <button onclick="voteDispute(${item.job.id}, ${item.milestoneIndex}, true)" style="background: #16a34a; color: white; padding: 6px 10px; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; margin-right: 6px;">Resolve (Favor Freelancer)</button>
                        <button onclick="voteDispute(${item.job.id}, ${item.milestoneIndex}, false)" style="background: #dc2626; color: white; padding: 6px 10px; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">Resolve (Favor Client)</button>
                    </div>
                `;
                arbiterDisputesContainer.appendChild(disputeBox);
            });
        }
    } else {
        arbiterPanelCard.style.display = "none";
    }

    renderFilteredJobs();
}

function renderFilteredJobs() {
    const container = document.getElementById('jobs-container');
    container.innerHTML = "";

    // If user is an arbiter, filter to show ONLY jobs containing milestones in dispute
    let jobsToDisplay = allJobsCache;
    const isConnectedArbiter = allJobsCache.some(job => 
        (job.arbiters || []).some(arb => arb.toLowerCase() === currentUser)
    );

    if (isConnectedArbiter && currentUser) {
        jobsToDisplay = allJobsCache.filter(job => {
            const isAssignedArbiter = job.arbiters.some(arb => arb.toLowerCase() === currentUser);
            const hasDisputedMilestone = job.milestones.some(m => Number(m.state) === 3);
            return isAssignedArbiter && hasDisputedMilestone;
        });

        if (jobsToDisplay.length === 0) {
            container.innerHTML = `<p style="color: #64748b; font-size: 14px;">As an arbiter, you only see jobs with active disputes requiring your resolution. No active disputes found.</p>`;
            return;
        }
    }

    jobsToDisplay.forEach(job => {
        const isClient = currentUser && currentUser === job.client.toLowerCase();
        const isFreelancer = currentUser && currentUser === job.freelancer.toLowerCase();

        const card = document.createElement('div');
        card.className = 'job-card';

        let milestonesHtml = '';
        job.milestones.forEach((m, mIdx) => {
            const stateNames = ['Pending', 'Submitted', 'Approved', 'Disputed', 'Resolved', 'Refunded'];
            const badgeClasses = ['badge-pending', 'badge-submitted', 'badge-approved', 'badge-disputed', 'badge-resolved', 'badge-refunded'];
            const stateNum = Number(m.state);
            const ethAmount = ethers.formatEther(m.amount);
            const deadlineDate = new Date(Number(m.deadline) * 1000).toLocaleString();

            let actionButtons = '';
            if (currentUser) {
                // Freelancer Role: Can submit when Pending, can dispute when Submitted
                if (isFreelancer) {
                    if (stateNum === 0) {
                        actionButtons += `<button onclick="submitMilestone(${job.id}, ${mIdx})" style="background: #0284c7; padding: 4px 10px; font-size: 12px;">Submit Work</button>`;
                    } else if (stateNum === 1) {
                        actionButtons += `<button onclick="raiseDispute(${job.id}, ${mIdx})" style="background: #dc2626; padding: 4px 10px; font-size: 12px;">Dispute</button>`;
                    }
                }

                // Client Role: Can approve or dispute when Submitted
                if (isClient && stateNum === 1) {
                    actionButtons += `<button onclick="approveMilestone(${job.id}, ${mIdx})" style="background: #16a34a; padding: 4px 10px; font-size: 12px; margin-right: 6px;">Approve</button>`;
                    actionButtons += `<button onclick="raiseDispute(${job.id}, ${mIdx})" style="background: #dc2626; padding: 4px 10px; font-size: 12px;">Dispute</button>`;
                }
            }

            milestonesHtml += `
                <div style="border-top: 1px solid #f1f5f9; padding-top: 8px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <b>Milestone #${mIdx + 1}</b> (${ethAmount} ETH)<br>
                        <span style="font-size: 11px; color: #64748b;">Due: ${deadlineDate}</span><br>
                        <span class="badge ${badgeClasses[stateNum]}" style="margin-top: 4px;">${stateNames[stateNum]}</span>
                    </div>
                    <div>${actionButtons}</div>
                </div>
            `;
        });

        const arbiterDisplay = job.arbiters && job.arbiters.length > 0 
            ? job.arbiters.map(a => a.substring(0,6)+'...').join(', ') 
            : 'None';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>Job ID #${job.id}</strong>
                <span style="font-size: 12px; color: #64748b;">Client: ${job.client.substring(0,6)}... | Freelancer: ${job.freelancer.substring(0,6)}...</span>
            </div>
            <div style="font-size: 13px; color: #475569; margin-bottom: 8px;">Arbiters: ${arbiterDisplay}</div>
            ${milestonesHtml}
        `;
        container.appendChild(card);
    });
}

// ==========================================
// CONTRACT TRANSACTION WRAPPERS
// ==========================================
async function createJob() {
    try {
        const freelancer = document.getElementById('freelancer-address').value.trim();
        const arbitersInput = document.getElementById('arbiters-addresses').value.trim();
        const token = document.getElementById('token-address').value.trim() || "0x0000000000000000000000000000000000000000";
        
        const amountInputs = document.querySelectorAll('.m-amount');
        const deadlineInputs = document.querySelectorAll('.m-deadline');
        
        let amounts = [];
        let deadlines = []; // Changed to track UNIX deadlines
        let totalValue = 0n;

        for (let i = 0; i < amountInputs.length; i++) {
            const amtStr = amountInputs[i].value.trim();
            const dateVal = deadlineInputs[i].value;
            if (!amtStr || !dateVal) continue;
            
            const weiAmt = ethers.parseEther(amtStr);
            const unixDeadline = Math.floor(new Date(dateVal).getTime() / 1000);
            
            // Validation: Ensure deadline is strictly in the future (prevents contract revert)
            if (unixDeadline <= Math.floor(Date.now() / 1000)) {
                showToast(`Milestone ${i+1} deadline must be in the future.`, "error");
                return;
            }

            amounts.push(weiAmt);
            deadlines.push(unixDeadline);
            totalValue += weiAmt;
        }

        if (amounts.length === 0) {
            showToast("Please add at least one valid milestone.", "error");
            return;
        }

        const arbiters = arbitersInput ? arbitersInput.split(',').map(addr => addr.trim()).filter(Boolean) : [];

        const contract = await getContractWithSigner();
        let tx;
        
        showToast("Approve the transaction in MetaMask...", "info");
        
        // Exact matching for: _freelancer, _arbiters[], _token, _milestoneAmounts[], _deadlines[]
        if (token === "0x0000000000000000000000000000000000000000") {
            tx = await contract.createJob(freelancer, arbiters, token, amounts, deadlines, { value: totalValue });
        } else {
            tx = await contract.createJob(freelancer, arbiters, token, amounts, deadlines);
        }

        showToast("Transaction submitted! Waiting for block confirmation...", "pending");
        await tx.wait();
        
        showToast("Job successfully created and funded!", "success");
        loadJobs();
        
        // Reset fields
        document.getElementById('freelancer-address').value = "";
        document.getElementById('arbiters-addresses').value = "";
        
    } catch (error) {
        console.error(error);
        showToast("Failed to create job: " + (error.reason || error.message), "error");
    }
}

async function submitMilestone(jobId, milestoneIndex) {
    try {
        const contract = await getContractWithSigner();
        showToast("Approve the transaction in MetaMask...", "info");
        const tx = await contract.submitMilestone(jobId, milestoneIndex);
        
        showToast("Transaction submitted! Waiting for confirmation...", "pending");
        await tx.wait();
        
        showToast("Milestone submitted successfully!", "success");
        loadJobs();
    } catch (error) {
        showToast("Action failed: " + (error.reason || error.message), "error");
    }
}

async function approveMilestone(jobId, milestoneIndex) {
    try {
        const contract = await getContractWithSigner();
        showToast("Approve the transaction in MetaMask...", "info");
        const tx = await contract.approveMilestone(jobId, milestoneIndex);
        
        showToast("Transaction submitted! Waiting for confirmation...", "pending");
        await tx.wait();
        
        showToast("Milestone approved and funds released!", "success");
        loadJobs();
    } catch (error) {
        showToast("Action failed: " + (error.reason || error.message), "error");
    }
}

async function raiseDispute(jobId, milestoneIndex) {
    try {
        const contract = await getContractWithSigner();
        showToast("Approve the transaction in MetaMask...", "info");
        const tx = await contract.raiseDispute(jobId, milestoneIndex);
        
        showToast("Transaction submitted! Waiting for confirmation...", "pending");
        await tx.wait();
        
        showToast("Dispute raised successfully.", "success");
        loadJobs();
    } catch (error) {
        showToast("Action failed: " + (error.reason || error.message), "error");
    }
}

async function voteDispute(jobId, milestoneIndex, favorFreelancer) {
    try {
        const contract = await getContractWithSigner();
        showToast("Approve the transaction in MetaMask...", "info");
        const tx = await contract.voteOnDispute(jobId, milestoneIndex, favorFreelancer);
        
        showToast("Vote submitted! Waiting for confirmation...", "pending");
        await tx.wait();
        
        showToast("Dispute vote recorded successfully!", "success");
        loadJobs();
    } catch (error) {
        showToast("Voting failed: " + (error.reason || error.message), "error");
    }
}