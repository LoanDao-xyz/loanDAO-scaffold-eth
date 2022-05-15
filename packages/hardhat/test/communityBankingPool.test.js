const hre = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("CommunityBankingPool", function() {
  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  it("should deploy CommunityBankingPool", async function() {
    const DAI = await hre.ethers.getContractFactory("MockERC20");
    const dai = await DAI.deploy("DAI", "DAI", 18);
    const CommunityBankingPool = await hre.ethers.getContractFactory("CommunityBankingPool");
    await expect(CommunityBankingPool.deploy(dai.address, "vDAI", "vDAI")).to.not.be.reverted;
  });

  describe("Borrow", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { deployer, member1 } = await hre.getNamedAccounts();
      const cbp = await hre.ethers.getContract("CommunityBankingPool", deployer);
      const dai = await hre.ethers.getContract("MockERC20", deployer);
      await dai.mint(cbp.address, hre.ethers.utils.parseEther("1000000.0"));
      return { cbp, dai, deployer, member1 };
    });

    it("should allow owner to create a loan", async function() {
      const { cbp, dai, member1 } = await setup();
      const amount = hre.ethers.utils.parseEther("1000.0");
      await expect(cbp.borrow(member1, amount)).to.not.be.reverted;
      expect(await cbp.totalBorrows()).to.eq(amount)
      expect(await dai.balanceOf(member1)).to.eq(amount);
    });
  })
});
