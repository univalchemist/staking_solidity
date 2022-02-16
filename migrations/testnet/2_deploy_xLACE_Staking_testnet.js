const LovelaceStaking = artifacts.require("LovelaceStaking");
const LovelaceMock = artifacts.require("LovelaceMock");
const xLovelaceTokenMock = artifacts.require("xLovelaceTokenMock");

const fromWei = web3.utils.fromWei;

const { ether } = require("@openzeppelin/test-helpers");

module.exports = async (deployer, network, accounts) => {
  const rewardPerBlock = await ether("10");
  console.log("Address owner: ", accounts[0]);
  // console.log('deployer', deployer.address);

  await deployer.deploy(LovelaceStaking);
  const staking = await LovelaceStaking.deployed();

  await deployer.deploy(LovelaceMock);
  const lovelaceToken = await LovelaceMock.deployed();

  await deployer.deploy(xLovelaceTokenMock, staking.address);
  const xLovelace = await xLovelaceTokenMock.deployed();

  await lovelaceToken.mintArbitrary(accounts[0], await ether("10000"));
  await lovelaceToken.mintArbitrary(staking.address, await ether("100000"));
  await staking.initialize(
    rewardPerBlock,
    lovelaceToken.address,
    xLovelace.address
  );

  await lovelaceToken.approve(staking.address, await ether("10000"));
  await staking.stake(await ether("100"));

  console.log("Address Lovelace Staking contract: ", staking.address);
  console.log("Address LACE Token: ", lovelaceToken.address);
  console.log("Address xLACE Token: ", xLovelace.address);
  console.log("Address owner: ", accounts[0]);
  console.log("LACE: ", fromWei(await lovelaceToken.balanceOf(accounts[0])));
  console.log("xLACE: ", fromWei(await xLovelace.balanceOf(accounts[0])));
};
