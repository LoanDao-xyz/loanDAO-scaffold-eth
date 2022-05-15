// Step 2: We deploy the community banking pool
async function deployCommunityPool(hre) {
  const { deployer } = await hre.getNamedAccounts();
  let underlying;
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    const dai = await hre.deployments.deploy("MockERC20", {
      from: deployer,
      args: ["DAI", "DAI", 18],
      log: true,
    });
    underlying = {
      address: dai.address,
      name: "vDAI",
      symbol: "vDAI",
    };
  } else {
    // FIXME: get underlying token from process.env instead ?
    underlying = {
      address: hre.ethers.constants.AddressZero,
      name: "",
      symbol: "",
    };
  }

  const cbp = await hre.deployments.deploy("CommunityBankingPool", {
    from: deployer,
    args: [underlying.address, underlying.name, underlying.symbol],
    log: true,
  });
}

module.exports = deployCommunityPool;
deployCommunityPool.tags = ["CommunityBankingPool"];
