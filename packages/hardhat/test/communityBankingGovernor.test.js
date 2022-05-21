const hre = require("hardhat");
const { use, expect, config } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Framework } = require("@superfluid-finance/sdk-core");

const deployGovernor = require("../deploy/03-deploy-community-banking-governor");

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
      await hre.deployments.fixture(["CommunityBankingToken", "CommunityBankingPool"]);
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
      await hre.deployments.fixture(["CommunityBankingToken", "CommunityBankingPool"]);

      const { deployer, member1 } = await hre.ethers.getNamedSigners();
      const [member2, member3, member4, ...nonMembers] = await hre.ethers.getUnnamedSigners();
      const genesisMembers = [member1, member2, member3, member4];
      // Deploy the governor and mint the membership tokens to the genesis members
      await deployGovernor(hre, { genesisMembers: genesisMembers.map(s => s.address) });
      // Delegate their voting power to themselves
      const cbt = await hre.ethers.getContract("CommunityBankingToken", member1);
      await Promise.all(genesisMembers.map(async m => cbt.connect(m).delegate(m.address)));

      const cbp = await hre.ethers.getContract("CommunityBankingPool", member1);
      //initialize the superfluid framework...put custom and web3: only bc we are using hardhat locally
      const sf = await Framework.create({
        networkName: "custom",
        provider: hre.ethers.provider,
        dataMode: "WEB3_ONLY",
        resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
        protocolReleaseVersion: "test",
      });
      // use the framework to get the super token
      const fDAIx = await sf.loadSuperToken("fDAIx");
      const fDAIAddress = fDAIx.underlyingToken.address;
      const fDAI = await hre.ethers.getContractAt("MockERC20", fDAIAddress, deployer.address);
      const amountToMint = hre.ethers.utils.parseEther("1000.0");
      await fDAI.mint(cbp.address, amountToMint);
      await fDAI.connect(member1).approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: amountToMint.toHexString() }).exec(member1);
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256.toHexString() }).exec(member1);

      const cbg = await hre.ethers.getContract("CommunityBankingGovernor", member1);
      return { cbt, cbg, cbp, fDAIx, genesisMembers, nonMembers };
    });

    it("should correctly follow the governance process to add a new member", async function() {
      const { cbt, cbg, genesisMembers, nonMembers } = await setup();
      const [candidate] = nonMembers;

      // Step 1: The candidate must create a proposal to add themselves
      const safeMintCalldata = cbt.interface.encodeFunctionData("safeMint", [candidate.address]);
      const tx = await cbg.connect(candidate).propose(
        [cbt.address],
        [0],
        [safeMintCalldata],
        "Add me plzz :D",
      );
      const receipt = await tx.wait();
      const { proposalId, targets, calldatas, startBlock, endBlock, description } = receipt.events[0].args;

      // Step 2: Other members vote to add them
      // Wait for the vote to be active
      const currentBlockNumber = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(startBlock - currentBlockNumber);
      // To avoid going over the voting deadline if too many people are voting
      await hre.network.provider.send("evm_setAutomine", [false]);
      await cbg.connect(genesisMembers[0]).castVote(proposalId, 1); // 0 = Against, 1 = For, 2 = Abstain
      await cbg.connect(genesisMembers[1]).castVote(proposalId, 1);
      await hre.network.provider.send("evm_setAutomine", [true]);

      // Step 3: Execute the safeMint to add them
      const currentBlockNumber2 = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(endBlock - currentBlockNumber2 + 1);
      await cbg.execute(targets, [0], calldatas, hre.ethers.utils.id(description));

      expect(await cbt.balanceOf(candidate.address)).to.eq(1);
    });

    it("should correctly follow the governance process to create a loan", async function() {
      const { cbg, cbp, fDAIx, genesisMembers } = await setup();
      const [member1] = genesisMembers;

      // Step 1: Ask the DAO for a loan
      // Create the proposal
      const amount = hre.ethers.utils.parseEther("1.0");
      const borrowCalldata = cbp.interface.encodeFunctionData("borrow", [member1.address, amount]);
      const tx = await cbg.connect(member1).propose(
        [cbp.address],
        [0],
        [borrowCalldata],
        "Give me moneyyyyy",
      );
      const receipt = await tx.wait();
      const { proposalId, targets, calldatas, startBlock, endBlock, description } = receipt.events[0].args;

      // Step 2: Other members vote to accept it
      const currentBlockNumber = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(startBlock - currentBlockNumber);
      await hre.network.provider.send("evm_setAutomine", [false]);
      await cbg.connect(genesisMembers[0]).castVote(proposalId, 1);
      await cbg.connect(genesisMembers[1]).castVote(proposalId, 1);
      await hre.network.provider.send("evm_setAutomine", [true]);

      // Step 3: Execute the borrow proposal
      const currentBlockNumber2 = await hre.ethers.provider.getBlockNumber();
      await hre.timeAndMine.mine(endBlock - currentBlockNumber2 + 1);
      await expect(cbg.execute(targets, [0], calldatas, hre.ethers.utils.id(description))).to.emit(cbp, "Borrow").withArgs(member1.address, amount);
      expect(await fDAIx.balanceOf({ account: member1.address })).to.eq(amount)
    });
  });
});
