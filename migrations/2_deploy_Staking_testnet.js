const Staking = artifacts.require("Staking");
const LovelaceMock = artifacts.require("LovelaceMock");

const fromWei = web3.utils.fromWei;

const { ether } = require("@openzeppelin/test-helpers");
const LACE = "0xAaF760Fa545c98Af3ff4ED7cc9AB5675B74fb755";

module.exports = async (deployer, network, accounts) => {
  const rewardPerBlock = await ether("0.5");

  console.log("Address owner: ", accounts[0]);
  // await deployer.deploy(LovelaceMock);
  // const lovelaceToken = await LovelaceMock.deployed();
  const lovelaceToken = await LovelaceMock.at(LACE);

  await deployer.deploy(Staking, lovelaceToken.address, lovelaceToken.address, accounts[0]);
  const staking = await Staking.deployed();

  await lovelaceToken.mintArbitrary(accounts[0], await ether("1000000"));
  await lovelaceToken.mintArbitrary(staking.address, await ether("1000000"));
  console.log('owner', await staking.owner());
  await staking.setRewards(
		rewardPerBlock,
		'14825520',
		'876000'
  );

  await lovelaceToken.approve(staking.address, await ether("125000000"));
  await staking.stake(await ether("125000"));

  console.log("Address Lovelace Staking contract: ", staking.address);
  console.log("Address LACE Token: ", lovelaceToken.address);
  console.log("Address owner: ", accounts[0]);
  console.log("LACE: ", fromWei(await lovelaceToken.balanceOf(accounts[0])));
};
