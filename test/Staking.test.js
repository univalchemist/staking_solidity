const Reverter = require("./helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { time, BN } = require('@openzeppelin/test-helpers');
const { expect, assert } = require("chai");

const advanceBlockAtTime = require("./helpers/ganacheTimeTraveler");

const Staking = artifacts.require("Staking");
const ERC20Mock = artifacts.require("ERC20Mock");
const LovelaceMock = artifacts.require("LovelaceMock");

const wei = web3.utils.toWei;

contract("Staking", async (accounts) => {
  const reverter = new Reverter(web3);

  const OWNER = accounts[0];
  const FIRST_ADDRESS = accounts[1];
  const SECOND_ADDRESS = accounts[2];
  const THIRD_ADDRESS = accounts[3];

  const stakingTokensAmount = await wei("100");

  let staking;
  let stakingToken;
  let rewardToken;

  const mintAndApproveStaked = async (address, amount) => {
    await stakingToken.mintArbitrary(address, amount);
    await stakingToken.approve(staking.address, amount, { from: address });
  };

  describe("Staking", () => {
    before("setup", async () => {
      stakingToken = await LovelaceMock.new();
      rewardToken = await ERC20Mock.new("Reward", "RWD");

      staking = await Staking.new(
        stakingToken.address,
        rewardToken.address,
        OWNER
      );

      await rewardToken.mintArbitrary(
        staking.address,
        wei("10000")
      );
      await mintAndApproveStaked(FIRST_ADDRESS, stakingTokensAmount);
      await mintAndApproveStaked(SECOND_ADDRESS, stakingTokensAmount);
      await mintAndApproveStaked(THIRD_ADDRESS, stakingTokensAmount);

      await reverter.snapshot();
    });

    afterEach("revert", reverter.revert);

    const getTransactionBlock = (tx) => tx.receipt.blockNumber;
    const getCurrentBlock = async () =>
      (await web3.eth.getBlock("latest")).number;
    const advanceBlocks = async (amount) => {
      for (let i = 0; i < amount; i++) {
        await advanceBlockAtTime(1);
      }
    };

    describe("constructor", () => {
      it("should set correct parameters", async () => {
        expect(await staking.stakingToken()).to.be.equal(stakingToken.address);
        expect(await staking.rewardsToken()).to.be.equal(rewardToken.address);
        expect(await staking.owner()).to.be.eq(OWNER);
      });
    });

    describe("setRewards", async () => {
      it("should revert if not owner", async () => {
        await truffleAssert.reverts(
          staking.setRewards(
            wei("100"),
            await getCurrentBlock(),
            100,
            { from: FIRST_ADDRESS }
          ),
          "Ownable: caller is not the owner."
        );
      });

      it("should not allow to set more tokens than contract have", async () => {
        const fromBlock = (await getCurrentBlock()) + 2;
        await truffleAssert.reverts(
          staking.setRewards(wei("101"), fromBlock, 100),
          "Not enough tokens for the rewards"
        );
      });

      it("should update reward per token before", async () => {
        await staking.setRewards(
          wei("10"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(wei("100"), { from: FIRST_ADDRESS });
        const tx = await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );

        assert.equal(
          (await staking.rewardPerTokenStored()).toString(),
          wei("0.1")
        );
        assert.equal(await staking.lastUpdateBlock(), getTransactionBlock(tx));
      });

      it("should validly calculate tokens locked in a case of a change in the middle", async () => {
        const fromBlock = await getCurrentBlock();
        await staking.setRewards(wei("100"), fromBlock, 100);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("9800")
        );

        await advanceBlocks(5);
        await staking.setRewards(wei("50"), fromBlock, 100);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("5200")
        );
      });

      it("should validly calculate tokens locked with change from before to after", async () => {
        const fromBlock = (await getCurrentBlock()) + 2;
        await staking.setRewards(wei("100"), fromBlock + 20, 100);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("10000")
        );

        await advanceBlocks(5);
        await staking.setRewards(wei("50"), fromBlock - 5, 3);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("0")
        );
      });

      it("should validly calculate tokens locked with change from after to before", async () => {
        await advanceBlocks(5);
        const fromBlock = (await getCurrentBlock()) + 2;
        await staking.setRewards(wei("100"), fromBlock - 5, 3);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("0")
        );

        await advanceBlocks(5);
        await staking.setRewards(wei("50"), fromBlock + 20, 100);
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("5000")
        );
      });

      it("should change the underlying fields as expected", async () => {
        const fromBlock = await getCurrentBlock();
        await staking.setRewards(wei("100"), fromBlock, 100);

        assert.equal(
          (await staking.rewardPerBlock()).toString(),
          wei("100").toString()
        );
        assert.equal(
          (await staking.firstBlockWithReward()).toString(),
          fromBlock
        );
        assert.equal(
          (await staking.lastBlockWithReward()).toString(),
          fromBlock + 99
        );
      });

      it("should emit expected event", async () => {
        const fromBlock = await getCurrentBlock();
        const tx = await staking.setRewards(
          wei("100"),
          fromBlock,
          100
        );

        const event = tx.logs.find((x) => x.event == "RewardsSet").args;
        assert.equal(
          event.rewardPerBlock.toString(),
          wei("100").toString()
        );
        assert.equal(event.firstBlockWithReward.toString(), fromBlock);
        assert.equal(event.lastBlockWithReward.toString(), fromBlock + 99);
      });
    });

    describe('setCooldownPeriod', () => {
      it("should revert if not owner", async () => {
        await truffleAssert.reverts(
          staking.setCooldownPeriod(
            '600',
            { from: FIRST_ADDRESS }
          ),
          "Ownable: caller is not the owner."
        );
      });

      it("should not allow to set more period than month", async () => {
        await truffleAssert.reverts(
          staking.setCooldownPeriod('3000000'),
          "Cooldown period too high"
        );
      });

      it('should update cooldown period', async () => {
        expect(await staking.cooldownPeriod()).to.be.a.bignumber.equal("0");
        await staking.setCooldownPeriod('6000');
        expect(await staking.cooldownPeriod()).to.be.a.bignumber.equal("6000");
      });
    });

    describe("stake", async () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
      });

      it("should revert if stake on pause", async () => {
        expect(await staking.paused()).to.be.equal(false);
        await staking.pause();
        expect(await staking.paused()).to.be.equal(true);

        await truffleAssert.reverts(
          staking.stake(wei("50"), { from: FIRST_ADDRESS }),
          "Pausable: paused"
        );
      });

      // it("should revert if staking period over", async () => {
      //   await advanceBlocks(101);

      //   await truffleAssert.reverts(
      //     staking.stake(wei("50"), { from: FIRST_ADDRESS }),
      //     "Stake: staking  period is over"
      //   );
      // });

      it("should update user rewards before", async () => {
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
        const tx = await staking.stake(wei("50"), {
          from: FIRST_ADDRESS,
        });

        const currentBlock = getTransactionBlock(tx);
        assert.equal(
          (await staking.usersInfo(FIRST_ADDRESS)).rewards.toString(),
          wei("100")
        );
        assert.equal(
          (await staking.usersInfo(FIRST_ADDRESS)).rewardPerTokenPaid.toString(),
          wei("2")
        );
        assert.equal(
          (await staking.rewardPerTokenStored()).toString(),
          wei("2")
        );
        assert.equal(await staking.lastUpdateBlock(), currentBlock);
      });

      it("should not be able to stake zero", async () => {
        await truffleAssert.reverts(
          staking.stake(0, { from: FIRST_ADDRESS }),
          "Stake: can't stake 0"
        );
      });

      it("should not be able stake more than have", async () => {
        await truffleAssert.reverts(
          staking.stake(wei("101"), { from: FIRST_ADDRESS }),
          "ERC20: transfer amount exceeds balance"
        );
      });

      it("should accurately change contract state", async () => {
        await staking.stake(wei("70"), { from: FIRST_ADDRESS });
        await staking.stake(wei("30"), { from: SECOND_ADDRESS });

        assert.equal(
          (await staking.totalStaked()).toString(),
          wei("100")
        );
        assert.equal(
          (await staking.usersInfo(FIRST_ADDRESS)).staked.toString(),
          wei("70")
        );
        assert.equal(
          (await staking.usersInfo(SECOND_ADDRESS)).staked.toString(),
          wei("30")
        );
      });

      it("should transfer staked tokens", async () => {
        await staking.stake(wei("70"), { from: FIRST_ADDRESS });

        assert.equal(
          (await stakingToken.balanceOf(FIRST_ADDRESS)).toString(),
          wei("30")
        );
        assert.equal(
          (await stakingToken.balanceOf(staking.address)).toString(),
          wei("70")
        );
      });

      it("should emit valid event", async () => {
        const tx = await staking.stake(wei("70"), {
          from: FIRST_ADDRESS,
        });

        const event = tx.logs.find((x) => x.event == "Staked").args;
        assert.equal(event.user, FIRST_ADDRESS);
        assert.equal(event.amount.toString(), wei("70"));
      });
    });

    describe("withdraw", async () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
        await staking.setCooldownPeriod('1728000');

        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
        await staking.stake(wei("50"), { from: SECOND_ADDRESS });
      });

      it("should update rewards before", async () => {
        await time.increase(await time.duration.days(21));
        const tx = await staking.withdraw(wei("50"), {
          from: SECOND_ADDRESS,
        });

        const currentBlock = getTransactionBlock(tx);
        assert.equal(
          (await staking.usersInfo(SECOND_ADDRESS)).rewards.toString(),
          wei("100")
        );
        assert.equal(
          (await staking.usersInfo(SECOND_ADDRESS)).rewardPerTokenPaid.toString(),
          wei("4")
        );
        assert.equal(
          (await staking.rewardPerTokenStored()).toString(),
          wei("4")
        );
        assert.equal(await staking.lastUpdateBlock(), currentBlock);
      });

      it("should update locked before", async () => {
        await time.increase(await time.duration.days(10));
        let prevInfo = await staking.usersInfo(SECOND_ADDRESS);

        await staking.withdraw(wei("10"), { from: SECOND_ADDRESS });

        let info = await staking.usersInfo(SECOND_ADDRESS);
        expect(info.staked).to.be.a.bignumber.equal(wei('40'));
        expect(info.locked).to.be.a.bignumber.closeTo(wei('25'), wei('0.1'));
        expect(info.lastUpdate).to.be.a.bignumber
          .closeTo(prevInfo.lastUpdate.add(new BN('864000')), '10');
      });

      it("should not be able to withdraw zero", async () => {
        await truffleAssert.reverts(
          staking.withdraw(0, { from: FIRST_ADDRESS }),
          "Withdraw: amount should be greater then 0"
        );
      });

      it("should not be able to withdraw more than have", async () => {
        await truffleAssert.reverts(
          staking.withdraw(wei("51"), { from: FIRST_ADDRESS }),
          "Withdraw: insufficient staked amount"
        );
      });

      it("should not be able to withdraw in cooldown period", async () => {
        await time.increase(await time.duration.seconds(1));

        await truffleAssert.reverts(
          staking.withdraw(wei("20"), { from: FIRST_ADDRESS }),
          "Withdraw: cooldown not reached"
        );
      });

      it('should unlock correctly', async () => {
        await time.increase(await time.duration.days(5));
        await staking.withdraw('1', { from: FIRST_ADDRESS });
        let info = await staking.usersInfo(FIRST_ADDRESS);
        expect(info.locked).to.be.a.bignumber.closeTo(wei('37.5'), wei('0.1'));

        await time.increase(await time.duration.days(5));
        await staking.withdraw('1', { from: SECOND_ADDRESS });
        info = await staking.usersInfo(SECOND_ADDRESS);
        expect(info.locked).to.be.a.bignumber.closeTo(wei('25'), wei('0.1'));

        await time.increase(await time.duration.days(16));
        await staking.withdraw('1', { from: FIRST_ADDRESS });
        info = await staking.usersInfo(FIRST_ADDRESS);
        expect(info.locked.toString()).to.be.equal('0');
      });

      it("should accurately change contract state", async () => {
        await time.increase(await time.duration.days(21));
        await staking.withdraw(wei("20"), { from: FIRST_ADDRESS });

        assert.equal(
          (await staking.totalStaked()).toString(),
          wei("80")
        );
        assert.equal(
          (await staking.usersInfo(FIRST_ADDRESS)).staked.toString(),
          wei("30")
        );
      });

      it("should transfer staked tokens", async () => {
        await time.increase(await time.duration.days(21));
        await staking.withdraw(wei("20"), { from: FIRST_ADDRESS });

        assert.equal(
          (await stakingToken.balanceOf(FIRST_ADDRESS)).toString(),
          wei("70")
        );
        assert.equal(
          (await stakingToken.balanceOf(staking.address)).toString(),
          wei("80")
        );
      });

      it("should emit valid event", async () => {
        await time.increase(await time.duration.days(21));
        const tx = await staking.withdraw(wei("20"), {
          from: FIRST_ADDRESS,
        });

        const event = tx.logs.find((x) => x.event == "Withdrawn").args;
        assert.equal(event.user, FIRST_ADDRESS);
        assert.equal(event.amount.toString(), wei("20"));
      });
    });

    describe("getReward", async () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          (await getCurrentBlock()) + 2,
          100
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
      });

      it("should update rewards before", async () => {
        const tx = await staking.getReward({ from: FIRST_ADDRESS });

        const currentBlock = getTransactionBlock(tx);
        assert.equal(
          (await staking.usersInfo(FIRST_ADDRESS)).rewardPerTokenPaid.toString(),
          wei("2")
        );
        assert.equal(
          (await staking.rewardPerTokenStored()).toString(),
          wei("2")
        );
        assert.equal(await staking.lastUpdateBlock(), currentBlock);
      });

      it("should clear saved reward", async () => {
        await staking.getReward({ from: FIRST_ADDRESS });

        assert.equal((await staking.usersInfo(FIRST_ADDRESS)).rewards.toString(), 0);
      });

      it("should transfer tokens and lower tokens locked", async () => {
        await staking.getReward({ from: FIRST_ADDRESS });

        assert.equal(
          (await rewardToken.balanceOf(FIRST_ADDRESS)).toString(),
          wei("100")
        );
        assert.equal(
          (await rewardToken.balanceOf(staking.address)).toString(),
          wei("9900")
        );
        assert.equal(
          (await staking.rewardTokensLocked()).toString(),
          wei("9900")
        );
      });

      it("should emit event", async () => {
        const tx = await staking.getReward({ from: FIRST_ADDRESS });

        const event = tx.logs.find((x) => x.event == "RewardPaid").args;
        assert.equal(event.user, FIRST_ADDRESS);
        assert.equal(event.reward.toString(), wei("100"));
      });
    });

    describe("exit", async () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
      });

      it("should withdraw staking tokens", async () => {
        await staking.exit({ from: FIRST_ADDRESS });

        assert.equal(
          (await stakingToken.balanceOf(FIRST_ADDRESS)).toString(),
          wei("100")
        );
      });

      it("should withdraw reward tokens", async () => {
        await staking.exit({ from: FIRST_ADDRESS });

        assert.equal(
          (await rewardToken.balanceOf(FIRST_ADDRESS)).toString(),
          wei("100")
        );
      });
    });

    describe("recoverNonLockedRewardTokens", async () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("50"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
      });

      it("should recover reward tokens", async () => {
        const lockedAmount = await staking.rewardTokensLocked();
        const expectedRecover = (
          await rewardToken.balanceOf(staking.address)
        ).sub(lockedAmount);
        const balanceBefore = await rewardToken.balanceOf(OWNER);
        await staking.recoverNonLockedRewardTokens();

        assert.equal(
          (await rewardToken.balanceOf(OWNER)).toString(),
          balanceBefore.add(expectedRecover)
        );
        assert.equal(
          (await rewardToken.balanceOf(staking.address)).toString(),
          lockedAmount
        );
      });

      it("should emit valid event", async () => {
        const lockedAmount = await staking.rewardTokensLocked();
        const expectedRecover = (
          await rewardToken.balanceOf(staking.address)
        ).sub(lockedAmount);
        const tx = await staking.recoverNonLockedRewardTokens();

        const event = tx.logs.find(
          (x) => x.event == "RewardTokensRecovered"
        ).args;
        assert.equal(event.amount.toString(), expectedRecover);
      });
    });

    describe("earned calculation", async () => {
      it("before start block is zero", async () => {
        await staking.setRewards(
          wei("100"),
          (await getCurrentBlock()) + 50,
          100
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
        await advanceBlocks(5);

        assert.equal((await staking.earned(FIRST_ADDRESS)).toString(), 0);
      });

      it("start in the middle of calculation", async () => {
        await staking.setRewards(
          wei("100"),
          (await getCurrentBlock()) + 5,
          100
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
        await advanceBlocks(5);

        assert.equal(
          (await staking.earned(FIRST_ADDRESS)).toString(),
          wei("200")
        );
      });

      it("end in the middle of calculation", async () => {
        await advanceBlocks(5);
        await staking.setRewards(
          wei("100"),
          (await getCurrentBlock()) - 5,
          10
        );
        await staking.stake(wei("50"), { from: FIRST_ADDRESS });
        await advanceBlocks(5);

        assert.equal(
          (await staking.earned(FIRST_ADDRESS)).toString(),
          wei("200")
        );
      });

      // it("after end block is zero", async () => {
      //   await advanceBlocks(11);
      //   await staking.setRewards(wei("100"), (await getCurrentBlock()) - 11, 10);
      //   await staking.stake(wei("50"), {from: FIRST_ADDRESS});
      //   await advanceBlocks(5);

      //   assert.equal((await staking.earned(FIRST_ADDRESS)).toString(), 0);
      // });

      it("with small stakes", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(1, { from: FIRST_ADDRESS });
        await staking.stake(2, { from: SECOND_ADDRESS });
        await staking.stake(7, { from: THIRD_ADDRESS });
        await advanceBlocks(5);

        assert.equal(
          (await staking.earned(THIRD_ADDRESS)).toString(),
          wei("350")
        );
      });

      it("with large stakes", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );

        await mintAndApproveStaked(
          FIRST_ADDRESS,
          wei("1000000000000")
        );
        await mintAndApproveStaked(
          SECOND_ADDRESS,
          wei("2000000000000")
        );
        await mintAndApproveStaked(
          THIRD_ADDRESS,
          wei("7000000000000")
        );

        await staking.stake(wei("1000000000000"), {
          from: FIRST_ADDRESS,
        });
        await staking.stake(wei("2000000000000"), {
          from: SECOND_ADDRESS,
        });
        await staking.stake(wei("7000000000000"), {
          from: THIRD_ADDRESS,
        });
        await advanceBlocks(5);

        assert.equal(
          (await staking.earned(THIRD_ADDRESS)).toString(),
          wei("350")
        );
      });
    });

    describe("pause", () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
      });

      it("only owner can pause staking", async () => {
        await truffleAssert.reverts(
          staking.pause({ from: FIRST_ADDRESS }),
          "Ownable: caller is not the owner"
        );
        await staking.pause();
      });

      it("should revert if stake on pause", async () => {
        expect(await staking.paused()).to.be.equal(false);
        await staking.pause();
        expect(await staking.paused()).to.be.equal(true);

        await truffleAssert.reverts(
          staking.stake(wei("10"), { from: FIRST_ADDRESS }),
          "Pausable: paused"
        );
      });

      it("should revert if paused", async () => {
        expect(await staking.paused()).to.be.equal(false);
        await staking.pause();
        expect(await staking.paused()).to.be.equal(true);

        await truffleAssert.reverts(staking.pause(), "Pausable: paused");
      });

      it("should pause staking", async () => {
        expect(await staking.paused()).to.be.equal(false);
        await staking.stake(wei("10"), { from: FIRST_ADDRESS });

        await staking.pause();
        expect(await staking.paused()).to.be.equal(true);

        await truffleAssert.reverts(
          staking.stake(wei("10"), { from: FIRST_ADDRESS }),
          "Pausable: paused"
        );
      });

      it("should cath event Paused", async () => {
        const tx = await staking.pause();

        const event = tx.logs.find((x) => x.event == "Paused").args;
        assert.equal(event.account, OWNER);
      });
    });

    describe("unpause", () => {
      beforeEach("setup", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
      });

      it("only owner can unpause staking", async () => {
        await staking.pause();

        await truffleAssert.reverts(
          staking.unpause({ from: FIRST_ADDRESS }),
          "Ownable: caller is not the owner"
        );
        await staking.unpause();
      });

      it("should revert if unpaused", async () => {
        expect(await staking.paused()).to.be.equal(false);

        await truffleAssert.reverts(staking.unpause(), "Pausable: not paused");
      });

      it("should unpause staking", async () => {
        expect(await staking.paused()).to.be.equal(false);

        await staking.pause();
        expect(await staking.paused()).to.be.equal(true);

        await truffleAssert.reverts(
          staking.stake(wei("10"), { from: FIRST_ADDRESS }),
          "Pausable: paused"
        );

        await staking.unpause();
        await staking.stake(wei("10"), { from: FIRST_ADDRESS });
      });

      it("should cath event Unpaused", async () => {
        await staking.pause();
        const tx = await staking.unpause();

        const event = tx.logs.find((x) => x.event == "Unpaused").args;
        assert.equal(event.account, OWNER);
      });
    });

    describe("reward complex calculation cases", async () => {
      const assertEarnedRoundedDownEqual = async (address, expected) => {
        const earnedTokens = web3.utils.fromWei(await staking.earned(address));
        assert.equal(Math.floor(earnedTokens.toString()), expected);
      };

      // Case taken from a document
      it("should accurately accrue rewards in a long run", async () => {
        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(wei("10"), { from: FIRST_ADDRESS });
        await advanceBlocks(1);
        await staking.stake(wei("20"), { from: SECOND_ADDRESS });
        await advanceBlocks(4);
        await staking.stake(wei("10"), { from: THIRD_ADDRESS });
        await advanceBlocks(3);
        await staking.stake(wei("10"), { from: FIRST_ADDRESS });
        await staking.stake(wei("30"), { from: SECOND_ADDRESS });
        await advanceBlocks(3);
        await staking.withdraw(wei("10"), { from: FIRST_ADDRESS });
        await advanceBlocks(2);
        await staking.withdraw(wei("50"), {
          from: SECOND_ADDRESS,
        });
        await advanceBlocks(2);
        await staking.withdraw(wei("10"), { from: FIRST_ADDRESS });
        await advanceBlocks(2);

        await assertEarnedRoundedDownEqual(FIRST_ADDRESS, "799");
        await assertEarnedRoundedDownEqual(SECOND_ADDRESS, "1037");
        await assertEarnedRoundedDownEqual(THIRD_ADDRESS, "562");
      });

      it("should accurately accrue rewards in a case of rewards reset", async () => {
        await rewardToken.mintArbitrary(
          staking.address,
          wei("20000")
        );

        await staking.setRewards(
          wei("100"),
          await getCurrentBlock(),
          100
        );
        await staking.stake(wei("10"), { from: FIRST_ADDRESS });
        await advanceBlocks(1);
        await staking.stake(wei("20"), { from: SECOND_ADDRESS });
        await advanceBlocks(4);
        await staking.stake(wei("10"), { from: THIRD_ADDRESS });
        await advanceBlocks(2);
        await staking.setRewards(
          wei("200"),
          await getCurrentBlock(),
          100
        );
        await advanceBlocks(2);
        await staking.withdraw(wei("20"), {
          from: SECOND_ADDRESS,
        });
        await advanceBlocks(2);

        await assertEarnedRoundedDownEqual(FIRST_ADDRESS, "791");
        await assertEarnedRoundedDownEqual(SECOND_ADDRESS, "783");
        await assertEarnedRoundedDownEqual(THIRD_ADDRESS, "425");
      });
    });

    describe("getAPY", () => {
      it("should return 0 if no reward", async () => {
        const apy = await staking.getAPY();
        expect(apy.toString()).to.be.equal("0");
      });

      it("should return correct reward", async () => {
        await staking.stake(wei("100"), { from: FIRST_ADDRESS });
        await staking.setRewards("42277524042300", await getCurrentBlock(), "100");
        let apy = await staking.getAPY();
        expect(apy.toString()).to.be.equal("10000000");

        await mintAndApproveStaked(FIRST_ADDRESS, stakingTokensAmount);
        await staking.stake(wei("100"), { from: FIRST_ADDRESS });
        apy = await staking.getAPY();
        expect(apy.toString()).to.be.equal("5000000");
      });
    });
  });
});
