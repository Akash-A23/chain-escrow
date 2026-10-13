// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ChainEscrow is ReentrancyGuard {
    enum MilestoneState { Pending, Submitted, Approved, Disputed, Resolved, Refunded }
    enum JobStatus { Active, Completed, Cancelled }

    struct Milestone {
        uint256 amount;
        MilestoneState state;
        uint256 deadline;
        uint256 totalVotes;
        uint256 cumulativeClientShare; // Sum of proposed client shares for weighted/majority average
        mapping(address => bool) hasVoted;
    }

    struct Job {
        address client;
        address freelancer;
        address[] arbiters;
        address token;
        uint256 totalAmount;
        uint256 milestoneCount;
        JobStatus status;
    }

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => mapping(uint256 => Milestone)) public jobMilestones;
    uint256 public jobCount;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed freelancer, address token, uint256 totalAmount);
    event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed milestoneId);
    event MilestoneApproved(uint256 indexed jobId, uint256 indexed milestoneId, uint256 amount);
    event DisputeRaised(uint256 indexed jobId, uint256 indexed milestoneId);
    event ArbiterVoted(uint256 indexed jobId, uint256 indexed milestoneId, address indexed arbiter, uint256 clientShare);
    event DisputeResolved(uint256 indexed jobId, uint256 indexed milestoneId, uint256 clientRefund, uint256 freelancerPayout);
    event RefundClaimed(uint256 indexed jobId, uint256 indexed milestoneId, uint256 amount);
    event JobStatusUpdated(uint256 indexed jobId, JobStatus status);

    function createJob(
        address _freelancer, 
        address[] calldata _arbiters, 
        address _token, 
        uint256[] calldata _milestoneAmounts,
        uint256[] calldata _deadlines
    ) external payable nonReentrant {
        require(_milestoneAmounts.length > 0, "Job must have at least 1 milestone");
        require(_milestoneAmounts.length == _deadlines.length, "Deadlines length mismatch");
        require(_freelancer != address(0), "Invalid freelancer");
        require(_arbiters.length > 0, "Must specify at least one arbiter");

        uint256 calculatedTotal = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            require(_milestoneAmounts[i] > 0, "Milestone amount must be > 0");
            require(_deadlines[i] > block.timestamp, "Deadline must be in the future");
            calculatedTotal += _milestoneAmounts[i];
        }

        if (_token == address(0)) {
            require(msg.value == calculatedTotal, "ETH deposit must match milestone sum");
        } else {
            require(msg.value == 0, "Do not send ETH for ERC-20 jobs");
            bool success = IERC20(_token).transferFrom(msg.sender, address(this), calculatedTotal);
            require(success, "ERC-20 transferFrom failed");
        }

        uint256 currentJobId = jobCount++;

        Job storage newJob = jobs[currentJobId];
        newJob.client = msg.sender;
        newJob.freelancer = _freelancer;
        newJob.token = _token;
        newJob.totalAmount = calculatedTotal;
        newJob.milestoneCount = _milestoneAmounts.length;
        newJob.status = JobStatus.Active;

        for (uint256 a = 0; a < _arbiters.length; a++) {
            require(_arbiters[a] != address(0), "Invalid arbiter address");
            newJob.arbiters.push(_arbiters[a]);
        }

        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            Milestone storage m = jobMilestones[currentJobId][i];
            m.amount = _milestoneAmounts[i];
            m.state = MilestoneState.Pending;
            m.deadline = _deadlines[i];
        }

        emit JobCreated(currentJobId, msg.sender, _freelancer, _token, calculatedTotal);
    }

    function isArbiter(uint256 _jobId, address _user) public view returns (bool) {
        Job memory job = jobs[_jobId];
        for (uint256 i = 0; i < job.arbiters.length; i++) {
            if (job.arbiters[i] == _user) return true;
        }
        return false;
    }

    function submitMilestone(uint256 _jobId, uint256 _milestoneId) external {
        Job memory job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job is not active");
        require(msg.sender == job.freelancer, "Only freelancer can submit");
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];
        require(milestone.state == MilestoneState.Pending, "Milestone not pending");
        require(block.timestamp <= milestone.deadline, "Milestone deadline has passed");

        milestone.state = MilestoneState.Submitted;
        emit MilestoneSubmitted(_jobId, _milestoneId);
    }

    function approveMilestone(uint256 _jobId, uint256 _milestoneId) external nonReentrant {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job is not active");
        require(msg.sender == job.client, "Only client can approve");
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];
        require(milestone.state == MilestoneState.Submitted, "Milestone must be submitted first");

        milestone.state = MilestoneState.Approved;

        if (job.token == address(0)) {
            (bool success, ) = job.freelancer.call{value: milestone.amount}("");
            require(success, "ETH transfer failed");
        } else {
            bool success = IERC20(job.token).transfer(job.freelancer, milestone.amount);
            require(success, "ERC-20 transfer failed");
        }

        emit MilestoneApproved(_jobId, _milestoneId, milestone.amount);
        _checkJobCompletion(_jobId);
    }

    function raiseDispute(uint256 _jobId, uint256 _milestoneId) external {
        Job memory job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job is not active");
        require(msg.sender == job.client || msg.sender == job.freelancer, "Not authorized");
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];
        require(milestone.state == MilestoneState.Submitted, "Can only dispute submitted milestones");

        milestone.state = MilestoneState.Disputed;
        emit DisputeRaised(_jobId, _milestoneId);
    }

    function voteDispute(uint256 _jobId, uint256 _milestoneId, uint256 _clientShare) external nonReentrant {
        Job memory job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job is not active");
        require(isArbiter(_jobId, msg.sender), "Only designated arbiters can vote");
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];
        require(milestone.state == MilestoneState.Disputed, "Milestone not disputed");
        require(!milestone.hasVoted[msg.sender], "Arbiter has already voted");
        require(_clientShare <= milestone.amount, "Client share exceeds milestone amount");

        milestone.hasVoted[msg.sender] = true;
        milestone.totalVotes++;
        milestone.cumulativeClientShare += _clientShare;

        emit ArbiterVoted(_jobId, _milestoneId, msg.sender, _clientShare);

        // Check if majority of arbiters have voted (e.g., > 50%)
        uint256 majorityThreshold = (job.arbiters.length / 2) + 1;
        if (milestone.totalVotes >= majorityThreshold) {
            uint256 avgClientShare = milestone.cumulativeClientShare / milestone.totalVotes;
            _resolveMilestone(_jobId, _milestoneId, avgClientShare);
        }
    }

    function _resolveMilestone(uint256 _jobId, uint256 _milestoneId, uint256 _clientShare) internal {
        Job memory job = jobs[_jobId];
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];

        uint256 freelancerShare = milestone.amount - _clientShare;
        milestone.state = MilestoneState.Resolved;

        if (job.token == address(0)) {
            if (_clientShare > 0) {
                (bool s1, ) = job.client.call{value: _clientShare}("");
                require(s1, "Client refund failed");
            }
            if (freelancerShare > 0) {
                (bool s2, ) = job.freelancer.call{value: freelancerShare}("");
                require(s2, "Freelancer payout failed");
            }
        } else {
            if (_clientShare > 0) {
                bool s1 = IERC20(job.token).transfer(job.client, _clientShare);
                require(s1, "ERC-20 client refund failed");
            }
            if (freelancerShare > 0) {
                bool s2 = IERC20(job.token).transfer(job.freelancer, freelancerShare);
                require(s2, "ERC-20 freelancer payout failed");
            }
        }

        emit DisputeResolved(_jobId, _milestoneId, _clientShare, freelancerShare);
        _checkJobCompletion(_jobId);
    }

    function reclaimFunds(uint256 _jobId, uint256 _milestoneId) external nonReentrant {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job is not active");
        require(msg.sender == job.client, "Only client can reclaim funds");
        Milestone storage milestone = jobMilestones[_jobId][_milestoneId];
        require(milestone.state == MilestoneState.Pending, "Milestone not pending");
        require(block.timestamp > milestone.deadline, "Deadline has not passed yet");

        milestone.state = MilestoneState.Refunded;

        if (job.token == address(0)) {
            (bool success, ) = job.client.call{value: milestone.amount}("");
            require(success, "ETH refund transfer failed");
        } else {
            bool success = IERC20(job.token).transfer(job.client, milestone.amount);
            require(success, "ERC-20 refund transfer failed");
        }

        emit RefundClaimed(_jobId, _milestoneId, milestone.amount);
        _checkJobCompletion(_jobId);
    }

    function _checkJobCompletion(uint256 _jobId) internal {
        Job storage job = jobs[_jobId];
        bool allDone = true;
        for (uint256 i = 0; i < job.milestoneCount; i++) {
            MilestoneState state = jobMilestones[_jobId][i].state;
            if (state != MilestoneState.Approved && state != MilestoneState.Resolved && state != MilestoneState.Refunded) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            job.status = JobStatus.Completed;
            emit JobStatusUpdated(_jobId, JobStatus.Completed);
        }
    }
}