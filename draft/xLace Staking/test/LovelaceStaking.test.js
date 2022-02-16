const LovelaceStaking = artifacts.require("LovelaceStaking");
const LovelaceMock = artifacts.require("./mock/LovelaceMock");
const xLovelaceToken = artifacts.require("xLovelaceTokenMock");

const {
  expectEvent,
  expectRevert,
  time,
  BN,
} = require("@openzeppelin/test-helpers");
const Web3 = require("web3");
const web3 = new Web3();

const { expect } = require("chai");

const wei = web3.utils.toWei;

contract("LovelaceStaking", async ([owner, user1, user2, user3, user4]) => {
  let lovelaceStaking;
  let lovelaceToken;
  let xlovelaceToken;

  beforeEach(async () => {
    lovelaceStaking = await LovelaceStaking.new();

    lovelaceToken = await LovelaceMock.new();
    xlovelaceToken = await xLovelaceToken.new(lovelaceStaking.address);

    await lovelaceToken.mintArbitrary(owner, wei("100000000"));

    await lovelaceStaking.initialize(
      wei("10"),
      lovelaceToken.address,
      xlovelaceToken.address
    );

    await lovelaceToken.transfer(owner, wei("100000"));
    await lovelaceToken.transfer(lovelaceStaking.address, wei("100000"));

    await lovelaceToken.transfer(user1, wei("100000"));
    await lovelaceToken.transfer(user2, wei("100000"));
    await lovelaceToken.transfer(user3, wei("100000"));
    await lovelaceToken.transfer(user4, wei("100000"));
  });

  describe("basic init", () => {
    describe("constructor", () => {
      it("should set reward per block", async () => {
        expect(await lovelaceStaking.rewardPerBlock()).to.be.a.bignumber.equal(
          wei("10")
        );
      });

      it("should set lastUpdateBlock", async () => {
        expect(await lovelaceStaking.lastUpdateBlock()).to.be.a.bignumber.above(
          "0"
        );
      });

      it("should set LACE token", async () => {
        expect(await lovelaceStaking.lovelaceToken()).to.be.equal(
          lovelaceToken.address
        );
      });

      it("should set xLACE token", async () => {
        expect(await lovelaceStaking.xLovelaceToken()).to.be.equal(
          xlovelaceToken.address
        );
      });
    });
  });

  describe("Functions", () => {
    describe("initialize", () => {
      it("can call only once", async () => {
        await expectRevert(
          lovelaceStaking.initialize(
            wei("1"),
            lovelaceToken.address,
            xlovelaceToken.address,
            { from: owner }
          ),
          "Initializable: contract is already initialized"
        );
      });

      it("should set owner correctly", async () => {
        expect(await lovelaceStaking.owner()).to.be.equal(owner);

        const newStaking = await LovelaceStaking.new({ from: user1 });
        await newStaking.initialize(wei("2"), user1, user2, { from: user1 });

        expect(await newStaking.owner()).to.be.equal(user1);
      });

      it("should set correct parameters", async () => {
        const newStaking = await LovelaceStaking.new();
        await newStaking.initialize(wei("2"), user1, user2);

        expect(await newStaking.rewardPerBlock()).to.be.a.bignumber.equal(
          wei("2")
        );
        expect(await newStaking.lovelaceToken()).to.be.equal(user1);
        expect(await newStaking.xLovelaceToken()).to.be.equal(user2);
      });
    });

    describe("stake", () => {
      beforeEach(async () => {
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user1,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user2,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user3,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user4,
        });
      });

      it("should revert if stake 0 tokens", async () => {
        await expectRevert(
          lovelaceStaking.stake("0", { from: owner }),
          "Staking: cant stake 0 tokens"
        );
      });

      it("should revert if transfer fail, not enough allowance ", async () => {
        await expectRevert(
          lovelaceStaking.stake(wei("10"), { from: owner }),
          "ERC20: transfer amount exceeds allowance"
        );
      });

      describe("should transfer LACE tokens", () => {
        it("should transfer LACE tokens", async () => {
          expect(await lovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            wei("100000")
          );
          expect(
            await lovelaceToken.balanceOf(lovelaceStaking.address)
          ).to.be.a.bignumber.equal(wei("100000"));

          await lovelaceStaking.stake(wei("100"), { from: user1 });
          expect(await lovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            wei("99900")
          );
          expect(
            await lovelaceToken.balanceOf(lovelaceStaking.address)
          ).to.be.a.bignumber.equal(wei("100100"));
        });

        it("should catch event Transfer", async () => {
          await lovelaceStaking.stake(wei("100"), { from: user1 });

          const logs = await lovelaceToken
            .getPastEvents("Transfer", { toBlock: "latest" })
            .then((events) => {
              return events[0].args;
            });
          expect(await logs["from"]).to.be.equal(user1);
          expect(await logs["to"]).to.be.equal(lovelaceStaking.address);
          expect(await logs["value"]).to.be.a.bignumber.equal(wei("100"));
        });
      });

      describe("should mint correct amount of xLACE tokens:", () => {
        it("for first stake", async () => {
          expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            "0"
          );

          await lovelaceStaking.stake(wei("10"), { from: user1 });
          expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            wei("10")
          );
        });

        it("for next stakes", async () => {
          expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            "0"
          );

          await lovelaceStaking.stake(wei("100"), { from: user1 });
          expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
            wei("100")
          );
          // rewardPool = 0, cuz we are start adding a reward after first stake
          expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            wei("100")
          );

          await lovelaceStaking.stake(wei("100"), { from: user2 });
          expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
            wei("210")
          );
          expect(
            await xlovelaceToken.balanceOf(user2)
          ).to.be.a.bignumber.closeTo(
            wei("90.9090909090909"),
            wei("0.000000000001")
          );

          await lovelaceStaking.stake(wei("200"), { from: user3 });
          expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
            wei("420")
          );
          expect(
            await xlovelaceToken.balanceOf(user3)
          ).to.be.a.bignumber.closeTo(
            wei("173.5537190082640"),
            wei("0.000000000001")
          );

          await lovelaceStaking.stake(wei("100"), { from: user4 });
          expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
            wei("530")
          );
          expect(
            await xlovelaceToken.balanceOf(user4)
          ).to.be.a.bignumber.closeTo(
            wei("84.7587930040361"),
            wei("0.000000000001")
          );
        });
      });

      it("should increase totalPool", async () => {
        expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
          wei("0")
        );
        await lovelaceStaking.stake(wei("100"), { from: user1 });
        expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
          wei("100")
        );
      });

      it("should update lastUpdateBlock", async () => {
        await lovelaceStaking.stake(wei("100"), { from: user1 });
        const latestBlock = await time.latestBlock();
        expect(await lovelaceStaking.lastUpdateBlock()).to.be.a.bignumber.equal(
          latestBlock
        );
        await lovelaceStaking.stake(wei("100"), { from: user1 });
        expect(await lovelaceStaking.lastUpdateBlock()).to.be.a.bignumber.equal(
          new BN(latestBlock).add(new BN(1))
        );
      });

      it("should catch event", async () => {
        const { logs } = await lovelaceStaking.stake(wei("10"), {
          from: user1,
        });

        expectEvent.inLogs(logs, "StakedLACE", {
          StakedLACE: wei("10"),
          mintedxLACE: wei("10"),
          recipient: user1,
        });
      });
    });

    describe("withdraw", () => {
      beforeEach(async () => {
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user1,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user2,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user3,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user4,
        });

        await lovelaceStaking.stake(wei("100"), { from: user1 });
        await lovelaceStaking.stake(wei("100"), { from: user2 });
        await lovelaceStaking.stake(wei("200"), { from: user3 });
        await lovelaceStaking.stake(wei("100"), { from: user4 });
      });

      it("should revert if not enough xLACE tokens", async () => {
        await expectRevert(
          lovelaceStaking.withdraw(wei("10")),
          "Withdraw: not enough xLACE tokens to withdraw"
        );
        await expectRevert(
          lovelaceStaking.withdraw(wei("150"), { from: user1 }),
          "Withdraw: not enough xLACE tokens to withdraw"
        );
      });

      it("should revert if not enough LACE tokens to send", async () => {
        await lovelaceStaking.revokeUnusedRewardPool();
        await lovelaceStaking.stake(wei("100"), { from: user1 });
        await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user2), {
          from: user2,
        });
        await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user3), {
          from: user3,
        });
        await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user4), {
          from: user4,
        });
        await time.advanceBlock();

        await expectRevert(
          lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user1), {
            from: user1,
          }),
          "Withdraw: failed to transfer LACE tokens"
        );
      });

      it("should burn correct amount of xLACE tokens", async () => {
        expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
          wei("449.221602921392"),
          wei("0.000000000001")
        );

        await lovelaceStaking.withdraw(wei("50"), { from: user1 });
        expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
          wei("50")
        );
        expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
          wei("399.221602921392"),
          wei("0.000000000001")
        );

        await lovelaceStaking.withdraw(wei("10"), { from: user2 });
        expect(await xlovelaceToken.balanceOf(user2)).to.be.a.bignumber.closeTo(
          wei("80.9090909090909"),
          wei("0.000000000001")
        );
        expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
          wei("389.221602921392"),
          wei("0.000000000001")
        );

        await lovelaceStaking.withdraw(wei("70"), { from: user3 });
        expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.closeTo(
          wei("103.5537190082640"),
          wei("0.000000000001")
        );
        expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
          wei("319.221602921392"),
          wei("0.000000000001")
        );

        await lovelaceStaking.withdraw(wei("4"), { from: user4 });
        expect(await xlovelaceToken.balanceOf(user4)).to.be.a.bignumber.closeTo(
          wei("80.7587930040361"),
          wei("0.000000000001")
        );
        expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
          wei("315.221602921392"),
          wei("0.000000000001")
        );
      });

      describe("should transfer LACE tokens", () => {
        it("should transfer LACE tokens", async () => {
          expect(await lovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
            wei("99900")
          );
          expect(
            await lovelaceToken.balanceOf(lovelaceStaking.address)
          ).to.be.a.bignumber.equal(wei("100500"));

          await lovelaceStaking.withdraw(
            await xlovelaceToken.balanceOf(user1),
            {
              from: user1,
            }
          );
          expect(
            await lovelaceToken.balanceOf(user1)
          ).to.be.a.bignumber.closeTo(
            wei("100020.207932229496"),
            wei("0.000000000001")
          );
          expect(
            await lovelaceToken.balanceOf(lovelaceStaking.address)
          ).to.be.a.bignumber.closeTo(
            wei("100379.792067770504"),
            wei("0.000000000001")
          );
        });

        it("should catch event Transfer", async () => {
          await lovelaceStaking.withdraw(
            await xlovelaceToken.balanceOf(user1),
            {
              from: user1,
            }
          );

          const logs = await lovelaceToken
            .getPastEvents("Transfer", { toBlock: "latest" })
            .then((events) => {
              return events[0].args;
            });
          expect(await logs["from"]).to.be.equal(lovelaceStaking.address);
          expect(await logs["to"]).to.be.equal(user1);
          expect(await logs["value"]).to.be.a.bignumber.closeTo(
            wei("120.207932229496"),
            wei("0.000000000001")
          );
        });
      });

      it("should decrease totalPool", async () => {
        expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
          wei("530")
        );
        await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user1), {
          from: user1,
        });
        expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.closeTo(
          wei("419.792067770504"), // +10 reward from block
          wei("0.000000000001")
        );
      });

      it("should update lastUpdateBlock", async () => {
        const latestBlock = await time.latestBlock();
        expect(await lovelaceStaking.lastUpdateBlock()).to.be.a.bignumber.equal(
          latestBlock
        );
        await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user1), {
          from: user1,
        });
        expect(await lovelaceStaking.lastUpdateBlock()).to.be.a.bignumber.equal(
          new BN(latestBlock).add(new BN(1))
        );
      });

      it("should catch event", async () => {
        await lovelaceStaking.withdraw(wei("10"), { from: user1 });

        const logs = await lovelaceStaking
          .getPastEvents("WithdrawnLACE", { toBlock: "latest" })
          .then((events) => {
            return events[0].args;
          });
        expect(await logs["WithdrawnLACE"]).to.be.a.bignumber.closeTo(
          wei("12.0207932229496"),
          wei("0.000000000001")
        );
        expect(await logs["burnedxLACE"]).to.be.a.bignumber.equal(wei("10"));
        expect(await logs["recipient"]).to.be.equal(user1);
      });
    });

    describe("stakingReward", () => {
      beforeEach(async () => {
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user1,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user2,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user3,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user4,
        });

        await lovelaceStaking.stake(wei("100"), { from: user1 });
        await lovelaceStaking.stake(wei("100"), { from: user2 });
        await lovelaceStaking.stake(wei("200"), { from: user3 });
        await lovelaceStaking.stake(wei("100"), { from: user4 });
      });
      describe("should return correct amount of LACE tokens", () => {
        it("when lastUpdateBlock == last mined block", async () => {
          await time.advanceBlock();
          expect(
            await lovelaceStaking.stakingReward(wei("10"))
          ).to.be.a.bignumber.closeTo(
            wei("12.0207932229496"),
            wei("0.000000000001")
          );
        });

        it("when lastUpdateBlock < last mined block", async () => {
          await time.advanceBlock();
          await time.advanceBlock();
          await time.advanceBlock();

          expect(
            await lovelaceStaking.stakingReward(wei("10"))
          ).to.be.a.bignumber.closeTo(
            wei("12.46600778676"),
            wei("0.00000000001")
          );
        });
      });
    });

    describe("getStakedLACE", () => {
      beforeEach(async () => {
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user1,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user2,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user3,
        });
        await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
          from: user4,
        });

        await lovelaceStaking.stake(wei("100"), { from: user1 });
        await lovelaceStaking.stake(wei("100"), { from: user2 });
        await lovelaceStaking.stake(wei("200"), { from: user3 });
        await lovelaceStaking.stake(wei("100"), { from: user4 });
      });
      describe("should return correct amount of LACE tokens", () => {
        it("should return 0 if user has no stake", async () => {
          expect(
            await lovelaceStaking.getStakedLACE(owner)
          ).to.be.a.bignumber.equal(wei("0"));
        });

        it("when lastUpdateBlock == last mined block", async () => {
          await time.advanceBlock();
          expect(
            await lovelaceStaking.getStakedLACE(user1)
          ).to.be.a.bignumber.closeTo(
            wei("120.207932229496"),
            wei("0.000000000001")
          );
        });

        it("when lastUpdateBlock < last mined block", async () => {
          await time.advanceBlock();
          await time.advanceBlock();
          await time.advanceBlock();

          expect(
            await lovelaceStaking.getStakedLACE(user1)
          ).to.be.a.bignumber.closeTo(
            wei("124.6600778676"),
            wei("0.0000000001")
          );
        });
      });
    });

    describe("setRewardPerBlock", () => {
      it("should revet if sender not owner", async () => {
        await expectRevert(
          lovelaceStaking.setRewardPerBlock(wei("50"), { from: user1 }),
          "Ownable: caller is not the owner"
        );
      });

      it("should set reward per block", async () => {
        expect(await lovelaceStaking.rewardPerBlock()).to.be.a.bignumber.equal(
          wei("10")
        );
        await lovelaceStaking.setRewardPerBlock(wei("12"));
        expect(await lovelaceStaking.rewardPerBlock()).to.be.a.bignumber.equal(
          wei("12")
        );
      });
    });

    describe("revokeUnusedRewardPool", () => {
      beforeEach(async () => {
        await lovelaceToken.approve(lovelaceStaking.address, wei("100"), {
          from: user1,
        });
        await lovelaceStaking.stake(wei("100"), { from: user1 });
      });

      it("should revet if sender not owner", async () => {
        await expectRevert(
          lovelaceStaking.revokeUnusedRewardPool({ from: user1 }),
          "Ownable: caller is not the owner"
        );
      });

      it("should revert if not enough funds to revoke", async () => {
        await lovelaceStaking.setRewardPerBlock(wei("100000"));
        await time.advanceBlock();

        await expectRevert(
          lovelaceStaking.revokeUnusedRewardPool(),
          "There are no unused tokens to revoke"
        );
      });

      it("should revoke unused tokens from reward poll", async () => {
        expect(
          await lovelaceToken.balanceOf(lovelaceStaking.address)
        ).to.be.a.bignumber.equal(wei("100100"));
        expect(await lovelaceToken.balanceOf(owner)).to.be.a.bignumber.equal(
          wei("99500000")
        );

        await lovelaceStaking.revokeUnusedRewardPool();
        expect(
          await lovelaceToken.balanceOf(lovelaceStaking.address)
        ).to.be.a.bignumber.equal(wei("110"));
        expect(await lovelaceToken.balanceOf(owner)).to.be.a.bignumber.equal(
          wei("99599990")
        );
      });

      it("should cath event UnusedRewardPoolRevoked", async () => {
        await lovelaceStaking.revokeUnusedRewardPool();

        const logs = await lovelaceStaking
          .getPastEvents("UnusedRewardPoolRevoked", { toBlock: "latest" })
          .then((events) => {
            return events[0].args;
          });
        expect(await logs["recipient"]).to.be.equal(owner);
        expect(await logs["amount"]).to.be.a.bignumber.equal(wei("99990"));
      });
    });
  });

  describe("integrations", () => {
    beforeEach(async () => {
      await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
        from: user1,
      });
      await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
        from: user2,
      });
      await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
        from: user3,
      });
      await lovelaceToken.approve(lovelaceStaking.address, wei("1000"), {
        from: user4,
      });
    });

    it("make a few stake, then unstake all", async () => {
      await lovelaceStaking.stake(wei("100"), { from: user1 });
      await lovelaceStaking.stake(wei("100"), { from: user2 });
      await lovelaceStaking.stake(wei("200"), { from: user3 });
      await lovelaceStaking.stake(wei("100"), { from: user4 });
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("449.221602921392"),
        wei("0.000000000001")
      );
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("530")
      );

      await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user1), {
        from: user1,
      });
      await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user2), {
        from: user2,
      });
      await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user3), {
        from: user3,
      });
      await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user4), {
        from: user4,
      });
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.equal("0");
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("0")
      );
    });

    it("make a few stake and unstake", async () => {
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("0")
      );

      await lovelaceStaking.stake(wei("100"), { from: user1 });
      // xLACE TS - 100
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("100")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.equal(
        wei("100")
      );
      expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
        wei("100")
      );
      expect(await lovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
        wei("99900")
      );

      await lovelaceStaking.stake(wei("100"), { from: user2 });
      // xLACE TS - 190.909090909090
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("210")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("190.909090909090"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user2)).to.be.a.bignumber.closeTo(
        wei("90.909090909090"),
        wei("0.000000000001")
      );
      expect(await lovelaceToken.balanceOf(user2)).to.be.a.bignumber.equal(
        wei("99900")
      );

      await lovelaceStaking.stake(wei("200"), { from: user3 });
      // xLACE TS - 364.462809917355
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.equal(
        wei("420")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("364.462809917355"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.closeTo(
        wei("173.553719008264"),
        wei("0.000000000001")
      );
      expect(await lovelaceToken.balanceOf(user3)).to.be.a.bignumber.equal(
        wei("99800")
      );

      await lovelaceStaking.withdraw(await xlovelaceToken.balanceOf(user2), {
        from: user2,
      });
      // xLACE TS - 273.5537190082640, LACE +107.256235827664
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.closeTo(
        wei("322.743764172336"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("273.553719008264"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user2)).to.be.a.bignumber.equal(
        "0"
      );
      expect(await lovelaceToken.balanceOf(user2)).to.be.a.bignumber.closeTo(
        wei("100007.256235827664"),
        wei("0.000000000001")
      );

      await lovelaceStaking.stake(wei("50"), { from: user1 });
      // xLACE TS - 314.659480928206, xLACE 141.105761919941
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.closeTo(
        wei("382.743764172336"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("314.659480928206"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user1)).to.be.a.bignumber.closeTo(
        wei("141.105761919941"),
        wei("0.000000000001")
      );
      expect(await lovelaceToken.balanceOf(user1)).to.be.a.bignumber.equal(
        wei("99850")
      );

      await lovelaceStaking.stake(wei("50"), { from: user4 });
      // xLACE TS - 354.718612305036, xLACE 40.059131376829
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.closeTo(
        wei("442.743764172336"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("354.718612305036"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user4)).to.be.a.bignumber.closeTo(
        wei("40.059131376829"),
        wei("0.000000000001")
      );
      expect(await lovelaceToken.balanceOf(user4)).to.be.a.bignumber.equal(
        wei("99950")
      );

      await lovelaceStaking.withdraw(wei("50"), { from: user3 });
      // xLACE TS - 304.718612305036, xLACE 123.5537190082640, LACE + 63.817311591054
      expect(await lovelaceStaking.totalPool()).to.be.a.bignumber.closeTo(
        wei("388.926452581282"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.totalSupply()).to.be.a.bignumber.closeTo(
        wei("304.718612305036"),
        wei("0.000000000001")
      );
      expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.closeTo(
        wei("123.553719008264"),
        wei("0.000000000001")
      );
      expect(await lovelaceToken.balanceOf(user3)).to.be.a.bignumber.closeTo(
        wei("99863.817311591054"),
        wei("0.000000000001")
      );
    });

    it("should be able to transfer xLACE tokens and unstake it", async () => {
      await lovelaceStaking.stake(wei("100"), { from: user1 });
      await lovelaceStaking.stake(wei("100"), { from: user2 });

      expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.equal(
        "0"
      );
      expect(await xlovelaceToken.balanceOf(user2)).to.be.a.bignumber.closeTo(
        wei("90.909090909090"),
        wei("0.000000000001")
      );

      await xlovelaceToken.transfer(user3, wei("50"), { from: user2 });
      expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.equal(
        wei("50")
      );
      expect(await xlovelaceToken.balanceOf(user2)).to.be.a.bignumber.closeTo(
        wei("40.909090909090"),
        wei("0.000000000001")
      );

      expect(await lovelaceToken.balanceOf(user3)).to.be.a.bignumber.equal(
        wei("100000")
      );
      await lovelaceStaking.withdraw(wei("30"), { from: user3 });
      expect(await xlovelaceToken.balanceOf(user3)).to.be.a.bignumber.equal(
        wei("20")
      );
      expect(await lovelaceToken.balanceOf(user3)).to.be.a.bignumber.closeTo(
        wei("100036.142857142857"),
        wei("0.000000000001")
      );
    });
  });
});
