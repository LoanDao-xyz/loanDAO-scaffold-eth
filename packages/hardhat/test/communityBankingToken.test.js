const hre = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("CommunityBankingToken", function() {
  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  it("should deploy CommunityBankingToken", async function() {
    const CommunityBankingToken = await hre.ethers.getContractFactory("CommunityBankingToken");
    await expect(CommunityBankingToken.deploy()).to.not.be.reverted;
  });

  describe("Mint", function() {
    beforeEach(async function() {
      // Documentation: https://github.com/wighawag/hardhat-deploy#testing-deployed-contracts
      await hre.deployments.fixture(["CommunityBankingToken"]);
    });

    it("should not allow sender to mint", async function() {
      const { member1 } = await hre.getNamedAccounts();
      const cbt = await hre.ethers.getContract("CommunityBankingToken", member1);
      await expect(cbt.safeMint(member1.address)).to.be.reverted;
    });

    it("should allow owner to mint", async function() {
      const { deployer, member1 } = await hre.getNamedAccounts();
      const cbt = await hre.ethers.getContract("CommunityBankingToken", deployer);
      await expect(cbt.safeMint(member1)).to.not.be.reverted;
      expect(await cbt.balanceOf(member1)).to.eq(1);
    });

    it("should only mint 1 token per address", async function() {
      const { deployer, member1 } = await hre.getNamedAccounts();
      const cbt = await hre.ethers.getContract("CommunityBankingToken", deployer);
      await expect(cbt.safeMint(member1)).to.not.be.reverted;
      await expect(cbt.safeMint(member1)).to.be.reverted;
    });
  });

  describe("Transfer", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingToken"]);

      const { deployer, member1 } = await hre.getNamedAccounts();
      const cbt = await hre.ethers.getContract("CommunityBankingToken", deployer);
      await cbt.safeMint(member1);
      return { cbt, deployer, member1 };
    });

    it("should not allow sender to transfer their token", async function() {
      const { cbt, deployer, member1 } = await setup();
      await expect(cbt.transferFrom(member1, deployer, 0)).to.be.reverted;
      await expect(cbt["safeTransferFrom(address,address,uint256)"](member1, deployer, 0)).to.be.reverted;
      await expect(cbt["safeTransferFrom(address,address,uint256,bytes)"](member1, deployer, 0, "")).to.be.reverted;
    });
  })
});
