// Step 3: We deploy the community banking governor
async function deployGovernor(hre, testArgs) {
  const { deployer, member1 } = await hre.getNamedAccounts();
  const genesisMembers = hre.network.name === "hardhat"
    ? testArgs.genesisMembers
    // FIXME: get genesis membres from process.env instead ?
    : [member1];

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
