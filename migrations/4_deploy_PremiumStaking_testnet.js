const PremiumStaking = artifacts.require("PremiumStaking");
const LovelaceMock = artifacts.require("LovelaceMock");

const fromWei = web3.utils.fromWei;
const block = web3.eth.getBlockNumber;

const { ether, time, BN } = require("@openzeppelin/test-helpers");

function toBN(number) {
  return new BN(number);
}

const LACE = "0xAaF760Fa545c98Af3ff4ED7cc9AB5675B74fb755";

module.exports = async (deployer, network, accounts) => {
  console.log("Address owner: ", accounts[0]);
  const lovelaceToken = await LovelaceMock.at(LACE);
  // -------------VIP------------------
  // await deployer.deploy(
  //   PremiumStaking, 
  //   "VIP pool", 
  //   lovelaceToken.address, 
  //   (await time.latest()).toString(), 
  //   (await time.latest()).add(toBN('5184000')).toString(),
  //   (await time.latest()).add(toBN('5184000')).toString(),
  //   (await time.latest()).add(toBN('5184001')).toString(),
  //   ether('2000000')
  // );

  // const staking = await PremiumStaking.deployed();  
  
  // await lovelaceToken.mintArbitrary(accounts[0], await ether("160000"));
  // await lovelaceToken.approve(staking.address, await ether("100000000000"));

  // await staking.addReward(
  //   ether('160000'),
  //   ether('160000')
  // );
  // ------------------------------------------------------------------------------------------------
  await deployer.deploy(
    PremiumStaking, 
    "Guaranteed APY Staking", 
    lovelaceToken.address, 
    '1639072853',
    (new BN('1639072853')).add(toBN('2592000')).toString(),
    (new BN('1639072853')).add(toBN('2592000')).toString(),
    (new BN('1639072853')).add(toBN('2592001')).toString(),
    ether('2000000')
  );

  const staking = await PremiumStaking.deployed();  
  
  await lovelaceToken.mintArbitrary(accounts[0], await ether("450000"));
  await lovelaceToken.approve(staking.address, await ether("100000000000"));

  await staking.addReward(
    ether('450000'),
    ether('0')
  );

  console.log("Address Premium Staking contract: ", staking.address);
  console.log("Address LACE Token: ", lovelaceToken.address);
  console.log("Address owner: ", accounts[0]);
};
