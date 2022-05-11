// Step 2: We deploy the community banking governor
async function deployGovernor(hre) {
    const { deployer, member1 } = await hre.getNamedAccounts();
    const genesisMembers = [member1];
  
    const cbt = await hre.ethers.getContract("CommunityBankingToken");
    // We first need to know the governor contract address
    const deterministicCbg = await hre.deployments.deterministic("CommunityBankingGovernor", {
      from: deployer,
      args: [cbt.address, genesisMembers],
      log: true,
    });
    // We transfer the token contract ownership to the governor
    await cbt.transferOwnership(deterministicCbg.address);
    // We deploy it
    const cbg = await deterministicCbg.deploy();
  }
  
  module.exports = deployGovernor;
  deployGovernor.tags = ["CommunityBankingGovernor"];