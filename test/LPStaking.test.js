const LPStaking = artifacts.require('LPStaking'); // LPStaking
const LovelaceMock = artifacts.require('LovelaceMock');
const LPTokenMock = artifacts.require('LPTokenMock');

const Reverter = require('./helpers/reverter');
const BigNumber = require('bignumber.js');

const setCurrentTime = require('./helpers/ganacheTimeTraveler');

function toBN(number) {
  return new BigNumber(number);
}

contract('LPStaking', async (accounts) => {
  const reverter = new Reverter(web3);

  const OWNER = accounts[0];
  const FIRST_ADDRESS = accounts[1];

  const APY_PRECISION = toBN(10 ** 5);

  let staking;
  let stakingToken;
  let rewardToken;

  const wei = web3.utils.toWei;

  const mintAndApproveStaked = async (address, amount) => {
    await stakingToken.mintArbitrary(address, amount);
    await stakingToken.approve(staking.address, amount, { from: address });
  };

  beforeEach('setup', async () => {
    rewardToken = await LovelaceMock.new();
    stakingToken = await LPTokenMock.new('', '', wei('1000000'), rewardToken.address);

    staking = await LPStaking.new(stakingToken.address, rewardToken.address, OWNER);

    const stakingTokensAmount = wei('300');
    await setCurrentTime(200 * 24 * 60 * 60);
    await rewardToken.mintArbitrary(staking.address, wei('1000000'));
    await mintAndApproveStaked(FIRST_ADDRESS, stakingTokensAmount);

    await reverter.snapshot();
  });

  afterEach('revert', reverter.revert);

  const getCurrentBlock = async () => (await web3.eth.getBlock('latest')).number;

  describe('Check ownership', () => {
    it('should transfer ownership', async () => {
      expect(await staking.owner()).to.be.eq(OWNER);
    });
  });

  describe('APY', async () => {
    it('should return 0 if totalSupply == 0', async () => {
      stakingToken = await LPTokenMock.new('', '', '0', rewardToken.address);      
      staking = await LPStaking.new(stakingToken.address, rewardToken.address, OWNER);
      await rewardToken.mintArbitrary(staking.address, wei('10000'));

      await staking.setRewards(wei('10'), await getCurrentBlock(), 100);
      await stakingToken.setReserves(wei('500000'), wei('250000'));

      assert.equal(
        toBN(await staking.getAPY()).toString(),
        '0'
      );
    });

    it('should return 0 if block.timestamp > lastBlockWithReward', async () => {     
      await staking.setRewards(wei('100'), await getCurrentBlock(), 1);

      assert.equal(
        toBN(await staking.getAPY()).toString(),
        '0'
      );
    });

    it('should calculate correct APY', async () => {
      await staking.setRewards(wei('100'), await getCurrentBlock(), 10000);

      await stakingToken.setReserves(wei('500000'), wei('250000'));

      assert.equal(
        toBN(await staking.getAPY()).idiv(APY_PRECISION).toString(),
        '23660325969'
      );
    });

    it('should calculate correct APY without reserve', async () => {
      await staking.setRewards(wei('100'), await getCurrentBlock(), 1000);

      assert.equal(toBN(await staking.getAPY()).toString(), '0');
    });

    it('should calculate correct APY without rewards', async () => {
      assert.equal(toBN(await staking.getAPY()).toString(), '0');
    });
  });
});
