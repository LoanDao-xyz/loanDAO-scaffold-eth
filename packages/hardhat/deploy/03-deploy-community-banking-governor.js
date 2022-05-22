const helperNetwork = require("../helper.config");

// Step 3: We deploy the community banking governor
async function deployGovernor(hre, testArgs) {
  const { deployer, member1 } = await hre.getNamedAccounts();

  let genesisMembers;
  if (hre.network.name === "hardhat") {
    genesisMembers = testArgs.genesisMembers;
  } else {
    const c = helperNetwork[hre.network.name];
    if (!c) throw Error(`Unknown Network ${hre.network.name}`);
    genesisMembers = [deployer, member1, ...c.genesisMembers];
  }

  const cbt = await hre.ethers.getContract("CommunityBankingToken");
  const cbp = await hre.ethers.getContract("CommunityBankingPool");
  // We first need to know the governor contract address
  const deterministicCbg = await hre.deployments.deterministic("CommunityBankingGovernor", {
    from: deployer,
    args: [cbt.address, genesisMembers],
    log: true,
  });
  // We transfer the token contract ownership to the governor
  await cbt.transferOwnership(deterministicCbg.address);
  // We transfer the pool contract ownership to the governor
  await cbp.transferOwnership(deterministicCbg.address);
  // We deploy it
  const cbg = await deterministicCbg.deploy();
}

module.exports = deployGovernor;
deployGovernor.tags = ["CommunityBankingGovernor"];
deployGovernor.dependencies = ["CommunityBankingToken", "CommunityBankingPool"];
