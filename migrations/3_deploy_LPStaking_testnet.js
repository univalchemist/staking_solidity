const LPStaking = artifacts.require("LPStaking");
const LovelaceMock = artifacts.require("LovelaceMock");
const BigNumber = require('bignumber.js');

const fromWei = web3.utils.fromWei;

const { ether } = require("@openzeppelin/test-helpers");

// const LPToken = "0x8dAa6389c3B32cCd8320C5d6eAaaF2e7B1e4C90f"; // uniswap V2, mLACE/ETH
// const LPToken = "0x4935F6d200F5339F22c24397A88453535B50193E"; // uniswap V2, mLACE/USDT
const LPToken = "0x3DB62180ACEdFcd3B130b558A9be1aA5C00F2C43"; // pancakeswap V2, mLACE/TBNB
const LACE = "0xAaF760Fa545c98Af3ff4ED7cc9AB5675B74fb755";

module.exports = async (deployer, network, accounts) => {
  const rewardPerBlock = await ether("0.2");

  console.log("Address owner: ", accounts[0]);
  // const lovelaceToken = await LovelaceMock.deployed();
  const lovelaceToken = await LovelaceMock.at(LACE);


  await deployer.deploy(LPStaking, LPToken, lovelaceToken.address, accounts[0]);
  const staking = await LPStaking.deployed();

  await lovelaceToken.mintArbitrary(accounts[0], await ether("1000000"));
  await lovelaceToken.mintArbitrary(staking.address, await ether("2000000"));
  console.log('owner', await staking.owner());
  await staking.setRewards(
		rewardPerBlock,
		'14825520',
		'876000'
  );

  console.log("Address LP Staking contract: ", staking.address);
  console.log("Address LP Token: ", LPToken);
  console.log("Address LACE Token: ", lovelaceToken.address);
  console.log("Address owner: ", accounts[0]);
  console.log("LACE: ", fromWei(await lovelaceToken.balanceOf(accounts[0])));
};
