const hre = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Framework } = require("@superfluid-finance/sdk-core");
const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

use(solidity);

function errorHandler(err) {
  if (err) throw err;
}

// FIXME: Superfluid deploy helpers should have an option to disable logs
async function muteLogs(fn) {
  const log = console.log;
  const debug = console.debug;
  console.log = () => { };
  console.debug = () => { };
  try {
    await fn();
  } finally {
    console.log = log;
    console.debug = debug;
  }
}

describe("CommunityBankingPool", function() {
  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  it("should deploy CommunityBankingPool", async function() {
    const { deployer } = await hre.getNamedAccounts();
    // We need to deploy the Superfluid framework locally
    let sf;
    let fDAIx;

    await muteLogs(async function() {
      // deploy the framework
      await deployFramework(errorHandler, {
        web3: hre.web3,
        from: deployer,
      });

      //deploy a fake erc20 token
      await deployTestToken(errorHandler, [":", "fDAI"], {
        web3: hre.web3,
        from: deployer,
      });

      //deploy a fake erc20 wrapper super token around the fDAI token
      await deploySuperToken(errorHandler, [":", "fDAI"], {
        web3: hre.web3,
        from: deployer,
      });

      //initialize the superfluid framework...put custom and web3: only bc we are using hardhat locally
      sf = await Framework.create({
        networkName: "custom",
        provider: hre.ethers.provider,
        dataMode: "WEB3_ONLY",
        resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
        protocolReleaseVersion: "test",
      });

      // use the framework to get the super token
      fDAIx = await sf.loadSuperToken('fDAIx');
    });

    const CommunityBankingPool = await hre.ethers.getContractFactory("CommunityBankingPool");
    const irm = {
      supplyRate: hre.ethers.utils.parseEther("0.03"),
      borrowRate: hre.ethers.utils.parseEther("0.04"),
      term: 60 * 60 * 24 * 365,
    };

    await expect(CommunityBankingPool.deploy(fDAIx.address, "vDAIx", "vDAIx", irm, sf.settings.config.hostAddress)).to.not.be.reverted;
  });

  describe("Rates", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { deployer, member1 } = await hre.ethers.getNamedSigners();
      const cbp = await hre.ethers.getContract("CommunityBankingPool");
      return { cbp, deployer, member1 };
    });

    it("should allow owner to change the borrow and supply rates", async function() {
      const { cbp, deployer, member1 } = await setup();
      const supplyRate = hre.ethers.utils.parseEther("0.05"); // i.e. 5% per year
      const irm = {
        supplyRate,
        borrowRate: hre.ethers.utils.parseEther("0.05"), // i.e. 5%
        term: 60 * 60 * 24 * 365,
      };
      await expect(cbp.connect(member1).setInterestRateModel(irm)).to.be.reverted;
      await expect(cbp.connect(deployer).setInterestRateModel(irm))
        .to.emit(cbp, "InterestRateModelUpdated")
        .withArgs(Object.values(irm));
    });
  });

  describe("Lend", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { deployer, member1 } = await hre.ethers.getNamedSigners();
      // initialize the superfluid framework...put custom and web3: only bc we are using hardhat locally
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

      const cbp = await hre.ethers.getContract("CommunityBankingPool");
      // Add some funds to the pool
      const baseAmount = hre.ethers.utils.parseEther("1000000.0");
      await fDAI.mint(deployer.address, baseAmount);
      await fDAI.approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: baseAmount.toHexString() }).exec(deployer);
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256.toHexString() }).exec(deployer);
      await fDAIx.transfer({ receiver: cbp.address, amount: baseAmount.toString() }).exec(deployer);

      return { cbp, sf, fDAI, fDAIx, deployer, member1, baseAmount };
    });

    it("should allow accounts to deposit assets, stream the interets then redeem them", async function() {
      const { cbp, sf, fDAI, fDAIx, member1, baseAmount } = await setup();
      // Step 1: Have some assets
      const amountToMint = hre.ethers.utils.parseEther("1000000.0");
      await fDAI.mint(member1.address, amountToMint);
      await fDAI.connect(member1).approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: amountToMint.toHexString() }).exec(member1);
      // Step 2: Approve the pool to transfer our assets
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256.toHexString() }).exec(member1);
      // Check the yield
      const supplyRate = hre.ethers.utils.parseEther("0.01");
      expect((await cbp.getInterestRateModel()).supplyRate).to.eq(supplyRate);

      // Step 3: Deposit assets into the pool and get some CF
      const amountToDeposit = hre.ethers.utils.parseEther("1000.0");
      const expectedId = hre.ethers.constants.One;
      const expectedParams = {
        cfType: 0,
        amount: amountToDeposit,
        rate: supplyRate,
        term: 0,
        target: member1.address,
      };
      await expect(cbp.connect(member1).deposit(amountToDeposit))
        .to.emit(cbp, "Deposit")
        .withArgs(expectedId, Object.values(expectedParams));

      const [cfIds, params] = await cbp.cashflows(member1.address);
      expect(cfIds.length).to.eq(1);
      expect(params.reduce((acc, cur) => acc + cur.amount, 0)).to.eq(amountToDeposit);
      // Superfluid takes a 1h deposit up front on escrow on testnets
      // https://docs.superfluid.finance/superfluid/protocol-developers/interactive-tutorials/money-streaming-1#money-streaming
      const flow = await sf.cfaV1.getFlow({
        superToken: fDAIx.address,
        sender: cbp.address,
        receiver: member1.address,
        providerOrSigner: hre.ethers.provider,
      });
      expect(await fDAIx.balanceOf({ account: cbp.address, providerOrSigner: member1 })).to.eq(
        baseAmount.add(amountToDeposit).sub(flow.deposit)
      );
      // Step 4: Wait one year
      await hre.timeAndMine.setTimeIncrease("1y");
      await hre.timeAndMine.mine();
      // Step 5: Withdraw assets from CF
      const tx = await cbp.connect(member1).withdraw(expectedId);
      const block = await hre.ethers.provider.getBlock(tx.blockNumber);
      const streamedInterests = hre.ethers.BigNumber.from(
        // 1 year in seconds
        (new Date(block.timestamp * 1000).getTime() - flow.timestamp.getTime()) / 1000)
        .mul(flow.flowRate);
      await expect(tx).to.emit(cbp, "Withdraw").withArgs(1);
      expect(await cbp.balanceOf(member1.address)).to.eq(0);
      expect(await fDAIx.balanceOf({ account: member1.address, providerOrSigner: member1 })).to.eq(amountToMint.add(streamedInterests));
      expect(await fDAIx.balanceOf({ account: cbp.address, providerOrSigner: member1 })).to.eq(baseAmount.sub(streamedInterests));

      // Check the Tradeable CashFlow
      const [member2] = await hre.ethers.getUnnamedSigners();
      await cbp.connect(member1).deposit(amountToDeposit);
      const tx2 = await cbp.connect(member1).transferFrom(member1.address, member2.address, 2);
      await expect(tx2).to.emit(cbp, "Transfer").withArgs(member1.address, member2.address, 2);
      expect(await cbp.balanceOf(member1.address)).to.eq(0);
      expect(await cbp.balanceOf(member2.address)).to.eq(1);
      const flow2 = await sf.cfaV1.getFlow({
        superToken: fDAIx.address,
        sender: cbp.address,
        receiver: member1.address,
        providerOrSigner: hre.ethers.provider,
      });
      expect(flow2.flowRate).to.eq("0");
      const flow3 = await sf.cfaV1.getFlow({
        superToken: fDAIx.address,
        sender: cbp.address,
        receiver: member2.address,
        providerOrSigner: hre.ethers.provider,
      });
      expect(flow3.flowRate).to.eq(flow.flowRate);
      await expect(cbp.connect(member2).withdraw(2)).to.emit(cbp, "Withdraw").withArgs(2);
      expect(await fDAIx.balanceOf({ account: member2.address, providerOrSigner: member2 })).to.be.gt(amountToDeposit);
    });
  });

  describe("Borrow", function() {
    const setup = hre.deployments.createFixture(async function() {
      await hre.deployments.fixture(["CommunityBankingPool"]);

      const { deployer, member1 } = await hre.ethers.getNamedSigners();
      // initialize the superfluid framework...put custom and web3: only bc we are using hardhat locally
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

      const cbp = await hre.ethers.getContract("CommunityBankingPool");
      // Add some funds to the pool
      const baseAmount = hre.ethers.utils.parseEther("1000000.0");
      await fDAI.mint(deployer.address, baseAmount);
      await fDAI.approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: baseAmount.toHexString() }).exec(deployer);
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256.toHexString() }).exec(deployer);
      await fDAIx.transfer({ receiver: cbp.address, amount: baseAmount.toString() }).exec(deployer);

      return { cbp, sf, fDAI, fDAIx, deployer, member1, baseAmount };
    });

    it("should allow owner to create a loan for borrower", async function() {
      const { cbp, sf, fDAIx, baseAmount, member1 } = await setup();

      const amountToBorrow = hre.ethers.utils.parseEther("1000.0");
      // Check the yield
      const borrowRate = hre.ethers.utils.parseEther("0.02");
      expect((await cbp.getInterestRateModel()).borrowRate).to.eq(borrowRate);
      // Step 1: Authorize the Pool as flow operator
      await sf.cfaV1.updateFlowOperatorPermissions({
        flowOperator: cbp.address,
        permissions: 5, // Create and Delete
        flowRateAllowance: amountToBorrow,
        superToken: fDAIx.address,
      }).exec(member1);
      // Step 2: Borrow (only owner)
      await expect(cbp.connect(member1).borrow(member1.address, amountToBorrow)).to.be.reverted;
      const expectedParams = {
        cfType: 1,
        amount: amountToBorrow,
        rate: borrowRate,
        term: 60 * 60 * 24 * 365,
        target: member1.address,
      };
      await expect(cbp.borrow(member1.address, amountToBorrow))
        .to.emit(cbp, "Borrow")
        .withArgs(1, Object.values(expectedParams));
      expect(await cbp.totalBorrows()).to.eq(amountToBorrow)
      expect(await fDAIx.balanceOf({ account: cbp.address, providerOrSigner: member1 })).to.eq(baseAmount.sub(amountToBorrow));
      // Check CF
      const [cfIds, params] = await cbp.cashflows(member1.address);
      expect(cfIds.length).to.eq(1);
      expect(params[0].cfType).to.eq(1);
      expect(params[0].amount).to.eq(amountToBorrow);
      // Check that a loan is not transferable
      await expect(cbp.connect(member1).transferFrom(member1.address, cbp.address, 1)).to.be.reverted;
      await expect(cbp.connect(member1)["safeTransferFrom(address,address,uint256)"](member1.address, cbp.address, 1)).to.be.reverted;

      // Superfluid takes a 1h deposit up front on escrow on testnets
      // https://docs.superfluid.finance/superfluid/protocol-developers/interactive-tutorials/money-streaming-1#money-streaming
      const flow = await sf.cfaV1.getFlow({
        superToken: fDAIx.address,
        sender: member1.address,
        receiver: cbp.address,
        providerOrSigner: hre.ethers.provider,
      });
      // Step 3: Wait one year
      await hre.timeAndMine.setTimeIncrease("1y");
      await hre.timeAndMine.mine();
      // Step 4: Repay loan
      const tx = await cbp.repay(1);
      const block = await hre.ethers.provider.getBlock(tx.blockNumber);
      const streamedRepayment = hre.ethers.BigNumber.from(
        // 1 year in seconds
        (new Date(block.timestamp * 1000).getTime() - flow.timestamp.getTime()) / 1000)
        .mul(flow.flowRate);
      await expect(tx).to.emit(cbp, "Repay").withArgs(1);
      expect(await cbp.balanceOf(member1.address)).to.eq(0);
      expect(await fDAIx.balanceOf({ account: member1.address, providerOrSigner: member1 })).to.eq("0");
      expect(await fDAIx.balanceOf({ account: cbp.address, providerOrSigner: member1 })).to.eq(
        baseAmount.sub(amountToBorrow).add(streamedRepayment).add(flow.deposit)
      );
    });
  });
});
