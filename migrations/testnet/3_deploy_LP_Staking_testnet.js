const PartnersStaking = artifacts.require("PartnersStaking");
const StakingRegistry = artifacts.require("StakingRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const LovelaceMock = artifacts.require("LovelaceMock");

const { ether } = require("@openzeppelin/test-helpers");

module.exports = async (deployer, network, accounts) => {
  const rewardPerBlock = await ether("1");
  console.log("Address owner: ", accounts[0]);
  // console.log('deployer', deployer.address);

  await deployer.deploy(PartnersStaking);
  const stakingImpl = await PartnersStaking.deployed();

  await deployer.deploy(StakingRegistry, stakingImpl.address);
  const registry = await StakingRegistry.deployed();

  await deployer.deploy(LovelaceMock);
  const lovelaceToken = await LovelaceMock.deployed();

  await deployer.deploy(ERC20Mock, "Reward", "RWD");
  const rewardToken = await ERC20Mock.deployed();

  const receipt = await registry.createStaking(
    lovelaceToken.address,
    rewardToken.address,
    accounts[1]
  );
  const event = receipt.logs.filter((x) => {
    return x.event == "StakingCreated";
  })[0];
  const createdStaking = await event.args["stakingAddress"];
  const stakingCotract = await PartnersStaking.at(createdStaking);

  await rewardToken.mintArbitrary(
    stakingCotract.address,
    web3.utils.toWei("1000000")
  );
  const fromBlock = receipt.receipt.blockNumber + 50;

  await stakingCotract.setRewards(web3.utils.toWei("10"), fromBlock, "50000", {
    from: accounts[1],
  });

  await lovelaceToken.mintArbitrary(accounts[1], await ether("100000"), {
    from: accounts[1],
  });
  await lovelaceToken.approve(stakingCotract.address, await ether("100000"), {
    from: accounts[1],
  });
  await stakingCotract.stake(await ether("100"), { from: accounts[1] });

  console.log("Address Registry Staking contract: ", registry.address);
  console.log("Address Staking contract: ", stakingCotract.address);
  console.log("Address LACE Token: ", lovelaceToken.address);
  console.log("Address Reward Token: ", rewardToken.address);

  console.log("Address owner: ", accounts[0]);
};
