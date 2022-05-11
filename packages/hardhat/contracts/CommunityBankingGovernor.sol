// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import { CommunityBankingToken } from "./CommunityBankingToken.sol";

contract CommunityBankingGovernor is Governor, GovernorSettings, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction {

    constructor(CommunityBankingToken _token, address[] memory genesisMembers)
        Governor("CommunityBankingGovernor")
        GovernorSettings(1 /* 1 block */, 2 /* 2 block */, 1)
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)
    {
        // To bootstrap the DAO 😀
        uint256 nbMembers = genesisMembers.length;
        for (uint256 i; i < nbMembers; ++i) {
            _token.safeMint(genesisMembers[i]);
        }
    }

    // The following functions are overrides required by Solidity.

    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }
}