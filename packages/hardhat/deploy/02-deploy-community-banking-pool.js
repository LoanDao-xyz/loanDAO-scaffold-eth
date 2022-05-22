const fs = require("fs/promises");
const path = require("path");

const helperConfig = require("../helper.config");

// Step 2: We deploy the community banking pool
async function deployCommunityPool(hre) {
  const { deployer } = await hre.getNamedAccounts();
  let config;

  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    // We need to deploy the Superfluid framework locally
    const { Framework } = require("@superfluid-finance/sdk-core");
    const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
    const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
    const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

    function errorHandler(err) {
      if (err) throw err;
    }
    //deploy the framework
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
    const sf = await Framework.create({
      networkName: "custom",
      provider: hre.ethers.provider,
      dataMode: "WEB3_ONLY",
      resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
      protocolReleaseVersion: "test",
    });

    // use the framework to get the super token
    fDAIx = await sf.loadSuperToken('fDAIx');

    config = {
      asset: fDAIx.address,
      name: "DAI Pool",
      symbol: "pDAI",
      sfHost: sf.settings.config.hostAddress,
    };

    // Save the Superfluid config to .env
    const dotenvPath = path.join(__dirname, "../.env");
    await fs.writeFile(dotenvPath, `SF_RESOLVER_ADDRESS=${process.env.RESOLVER_ADDRESS}`, { encoding: "utf8" });
  } else {
    const c = helperConfig[hre.network.name];

    if (!c) throw Error(`Unknown Network ${hre.network.name}`);

    config = {
      asset: c.superfluid.fDAIx,
      name: "DAI Pool",
      symbol: "pDAI",
      sfHost: c.superfluid.host,
    };
  }

  // FIXME: get rates from process.env instead ?
  const interestRateModel = {
    supplyRate: hre.ethers.utils.parseEther("0.01"),
    borrowRate: hre.ethers.utils.parseEther("0.02"),
    term: 60 * 60 * 24 * 365, // 1y in seconds
  };

  const cbp = await hre.deployments.deploy("CommunityBankingPool", {
    from: deployer,
    args: [config.asset, config.name, config.symbol, interestRateModel, config.sfHost],
    log: true,
  });
}

module.exports = deployCommunityPool;
deployCommunityPool.tags = ["CommunityBankingPool"];
