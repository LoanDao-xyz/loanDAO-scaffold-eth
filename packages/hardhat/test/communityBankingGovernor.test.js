const hre = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

const deployGovernor = require("../deploy/02-deploy-community-banking-governor");

use(solidity);

describe("CommunityBankingGovernor", function() {
  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  it("should deploy CommunityBankingGovernor", async function() {
    const CommunityBankingGovernor = await hre.ethers.getContractFactory("CommunityBankingGovernor");
    await expect(CommunityBankingGovernor.deploy("0x0Ac1dF02185025F65202660F8167210A80dD5086", [])).to.not.be.reverted;
  });

  describe("Deployment", async function() {
    beforeEach(async function() {
      await hre.deployments.fixture(["CommunityBankingToken"]);
    });

    it("should be the token contract's owner", async function() {
      await deployGovernor(hre, { genesisMembers: [] });
      const cbt = await hre.ethers.getContract("CommunityBankingToken");
      const cbg = await hre.deployments.get("CommunityBankingGovernor");
      expect(await cbt.owner()).to.eq(cbg.address);
    });

    it("should bootstrap the dao by minting tokens for the genesis members", async function() {
      const genesisMembers = await hre.ethers.provider.listAccounts();
      await deployGovernor(hre, { genesisMembers });
      const cbt = await hre.ethers.getContract("CommunityBankingToken");
      const balances = await Promise.all(genesisMembers.map(async member => {
        const balance = await cbt.balanceOf(member);
        return balance.toNumber();
      }));
      expect(balances.every(b => b === 1)).to.be.true;
    });
  })

  describe("Governance", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingToken"]);

      const { member1 } = await hre.ethers.getNamedSigners();
      const [member2, member3, member4, ...nonMembers] = await hre.ethers.getUnnamedSigners();
      const genesisMembers = [member1, member2, member3, member4];
      // Deploy the governor and mint the membership tokens to the genesis members
      await deployGovernor(hre, { genesisMembers: genesisMembers.map(s => s.address) });
      // Delegate their voting power to themselves
      const cbt = await hre.ethers.getContract("CommunityBankingToken");
      await Promise.all(genesisMembers.map(async m => cbt.connect(m).delegate(m.address)));

      const cbg = await hre.ethers.getContract("CommunityBankingGovernor");
      return { cbt, cbg, genesisMembers, nonMembers };
    });

    it("should correctly follow the governance process to add a new member", async function() {
      const { cbt, cbg, genesisMembers, nonMembers } = await setup();
      // Step 1: The candidate must create a proposal
      const [candidate] = nonMembers;
      const safeMintCalldata = cbt.interface.encodeFunctionData("safeMint", [candidate.address]);
      const tx = await cbg.connect(candidate).propose(
        [cbt.address],
        [0],
        [safeMintCalldata],
        "Add me plzz :D",
      );
      const receipt = await tx.wait();
      const { proposalId, targets, calldatas, startBlock, endBlock, description } = receipt.events[0].args;
      // Step 2: Vote
      // Wait for the vote to be active
      let currentBlockNumber = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(startBlock - currentBlockNumber);
      // To avoid going over the voting deadline if too many people are voting
      await hre.network.provider.send("evm_setAutomine", [false]);
      await cbg.connect(genesisMembers[0]).castVote(proposalId, 1); // 0 = Against, 1 = For, 2 = Abstain await cbg.connect(genesisMembers[1]).castVote(proposalId, 1);});
      await cbg.connect(genesisMembers[1]).castVote(proposalId, 1);
      await hre.network.provider.send("evm_setAutomine", [true]);
      // Step 3: Execute
      currentBlockNumber = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(endBlock - currentBlockNumber + 1);
      await cbg.connect(candidate).execute(targets, [0], calldatas, hre.ethers.utils.id(description));

      expect(await cbt.balanceOf(candidate.address)).to.eq(1);
    });
  });
});
