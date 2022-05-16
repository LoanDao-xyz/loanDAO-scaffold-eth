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

  describe("Lend", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { deployer, member1 } = await hre.ethers.getNamedSigners();
      const cbp = await hre.ethers.getContract("CommunityBankingPool");
      const dai = await hre.ethers.getContract("MockERC20");
      return { cbp, dai, deployer, member1 };
    });

    it("should allow accounts to deposit assets", async function() {
      const { cbp, dai, member1 } = await setup();
      // Step 1: Have some assets
      const amountToMint = hre.ethers.utils.parseEther("1000000.0");
      await dai.mint(member1.address, amountToMint);
      // Step 2: Approve the pool to transfer our assets
      await dai.connect(member1).approve(cbp.address, hre.ethers.constants.MaxUint256);
      // Step 3: Deposit assets into the pool and get shares
      const amountToDeposit = hre.ethers.utils.parseEther("1000.0");
      await expect(cbp.connect(member1).deposit(amountToDeposit, member1.address))
        .to.emit(cbp, "Deposit")
        .withArgs(member1.address, member1.address, amountToDeposit, amountToDeposit);
      expect(await dai.balanceOf(member1.address)).to.eq(amountToMint.sub(amountToDeposit));
      expect(await dai.balanceOf(cbp.address)).to.eq(amountToDeposit);
      expect(await cbp.balanceOf(member1.address)).to.eq(amountToDeposit);
    });

    it("should allow accounts to redeem shares", async function() {
      const { cbp, dai, member1 } = await setup();
      // Step 1: Have some shares
      // Have some assets
      const amountToMint = hre.ethers.utils.parseEther("1000000.0");
      await dai.mint(member1.address, amountToMint);
      // Approve the pool to transfer our assets
      await dai.connect(member1).approve(cbp.address, hre.ethers.constants.MaxUint256);
      // Deposit assets into the pool
      const amountToRedeem = hre.ethers.utils.parseEther("1000.0");
      await cbp.connect(member1).deposit(amountToRedeem, member1.address);
      // Step 2: Redeem assets from shares
      await expect(cbp.connect(member1).redeem(amountToRedeem, member1.address, member1.address))
        .to.emit(cbp, "Withdraw")
        .withArgs(member1.address, member1.address, member1.address, amountToRedeem, amountToRedeem);
      expect(await dai.balanceOf(member1.address)).to.eq(amountToMint);
      expect(await dai.balanceOf(cbp.address)).to.eq(0);
      expect(await cbp.balanceOf(member1.address)).to.eq(0);
    });
  });

  describe("Borrow", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { member1 } = await hre.ethers.getNamedSigners();
      const cbp = await hre.ethers.getContract("CommunityBankingPool");
      const dai = await hre.ethers.getContract("MockERC20");
      await dai.mint(cbp.address, hre.ethers.utils.parseEther("1000000.0"));
      return { cbp, dai, member1 };
    });

    it("should allow owner to create a loan", async function() {
      const { cbp, dai, member1 } = await setup();
      const amount = hre.ethers.utils.parseEther("1000.0");
      await expect(cbp.borrow(member1.address, amount)).to.not.be.reverted;
      expect(await cbp.totalBorrows()).to.eq(amount)
      expect(await cbp.borrowBalance(member1.address)).to.eq(amount);
      expect(await dai.balanceOf(member1.address)).to.eq(amount);
    });
  })
});
