// Step 1: We deploy the community banking token
async function deployCommunityToken(hre) {
    const { deployer } = await hre.getNamedAccounts();
  
    const cbt = await hre.deployments.deploy("CommunityBankingToken", {
      from: deployer,
      args: [],
      log: true,
    });
  }
  
  module.exports = deployCommunityToken;
  deployCommunityToken.tags = ["CommunityBankingToken"];