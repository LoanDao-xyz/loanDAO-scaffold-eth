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
      borrowRate: hre.ethers.utils.parseEther("0.04"), // i.e. 5%
      supplyRate: hre.ethers.utils.parseEther("0.03"),
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
        borrowRate: hre.ethers.utils.parseEther("0.05"), // i.e. 5%
        supplyRate,
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
      const baseAmount = hre.ethers.utils.parseEther("2000000.0");
      await fDAI.mint(deployer.address, baseAmount);
      await fDAI.approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: baseAmount.toHexString() }).exec(deployer);
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256 }).exec(deployer);
      return { cbp, sf, fDAI, fDAIx, deployer, member1, baseAmount };
    });

    it.only("should allow accounts to deposit assets, stream the interets then redeem them", async function() {
      const { cbp, sf, fDAI, fDAIx, member1, baseAmount } = await setup();
      // Deposit some funds
      await cbp.deposit(baseAmount, cbp.address);
      // Step 1: Have some assets
      const amountToMint = hre.ethers.utils.parseEther("1000000.0");
      await fDAI.mint(member1.address, amountToMint);
      await fDAI.connect(member1).approve(fDAIx.address, hre.ethers.constants.MaxUint256);
      await fDAIx.upgrade({ amount: amountToMint.toHexString() }).exec(member1);
      // Step 2: Approve the pool to transfer our assets
      await fDAIx.approve({ receiver: cbp.address, amount: hre.ethers.constants.MaxUint256.toHexString() }).exec(member1);
      // Step 3: Deposit assets into the pool and get shares
      // Check the yield
      const supplyRate = hre.ethers.utils.parseEther("0.01");
      expect(await cbp.getSupplyRate()).to.eq(supplyRate);
      const amountToDeposit = hre.ethers.utils.parseEther("1000.0");
      await expect(cbp.connect(member1).deposit(amountToDeposit, member1.address))
        .to.emit(cbp, "Deposit")
        .withArgs(member1.address, member1.address, amountToDeposit, amountToDeposit);
      const previousBalance = await fDAIx.balanceOf({ account: member1.address, providerOrSigner: member1 }).then(hre.ethers.BigNumber.from);
      expect(previousBalance).to.eq(amountToMint.sub(amountToDeposit));
      expect(await cbp.balanceOf(member1.address)).to.eq(amountToDeposit);
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
      // Step 5: Redeem assets from shares
      const amountToRedeem = await cbp.maxRedeem(member1.address);
      const tx = await cbp.connect(member1).redeem(amountToRedeem, member1.address, member1.address);
      const block = await hre.ethers.provider.getBlock(tx.blockNumber);
      const streamedInterests = hre.ethers.BigNumber.from(
        // 1 year in seconds
        (new Date(block.timestamp * 1000).getTime() - flow.timestamp.getTime()) / 1000)
        .mul(flow.flowRate);
      console.log((await tx.wait()).events.filter(e => e.event === "Withdraw")[0].args.map(a => a.toString()))
      console.log(previousBalance.toString())
      await expect(tx)
        .to.emit(cbp, "Withdraw")
        .withArgs(member1.address, member1.address, member1.address, amountToRedeem.sub(streamedInterests).sub(flow.deposit), amountToRedeem);
      expect(await fDAIx.balanceOf({ account: member1.address, providerOrSigner: member1 })).to.eq(amountToMint.sub(flow.deposit));
      expect(await fDAIx.balanceOf({ account: cbp.address, providerOrSigner: member1 })).to.eq(flow.deposit);
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
  });
});
