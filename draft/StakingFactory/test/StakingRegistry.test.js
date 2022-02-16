const PartnersStaking = artifacts.require("PartnersStaking");
const StakingRegistry = artifacts.require("StakingRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");
const LovelaceMock = artifacts.require("LovelaceMock");

const { time, constants, expectRevert } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = constants;

contract("StakingRegistry", async ([owner, member]) => {
  describe("Tests", () => {
    let staking;
    let registry;

    let receipt;

    let event;
    let createdStaking;
    let stakingCotract;

    beforeEach(async () => {
      stakingToken = await LovelaceMock.new();
      rewardToken = await ERC20Mock.new("Reward", "RWD");

      staking = await PartnersStaking.new();
      registry = await StakingRegistry.new(staking.address);

      receipt = await registry.createStaking(
        stakingToken.address,
        rewardToken.address,
        member
      );

      event = receipt.logs.filter((x) => {
        return x.event == "StakingCreated";
      })[0];
      createdStaking = await event.args["stakingAddress"];

      stakingCotract = await PartnersStaking.at(createdStaking);
    });

    describe("Check constructor", () => {
      it("should revert if zero address", async () => {
        await expectRevert(
          StakingRegistry.new(ZERO_ADDRESS),
          "StakingRegistry: wrong staking implementation"
        );
      });

      it("should set token implementation", async () => {
        expect(await registry.stakingImpl()).to.be.equal(staking.address);
      });
    });

    describe("Check functions:", () => {
      describe("setStakingImpl", () => {
        it("should revert if not owner", async () => {
          await expectRevert(
            registry.setStakingImpl(rewardToken.address, { from: member }),
            "Ownable: caller is not the owner"
          );
        });

        it("should revert if zero address", async () => {
          await expectRevert(
            registry.setStakingImpl(ZERO_ADDRESS),
            "StakingRegistry: wrong staking implementation"
          );
        });

        it("should set staking implementation", async () => {
          expect(await registry.stakingImpl()).to.be.equal(staking.address);
          await registry.setStakingImpl(member);

          expect(await registry.stakingImpl()).to.be.equal(member);
        });
      });

      describe("createStaking", () => {
        it("should crete new staking contract", async () => {
          expect(createdStaking).to.match(/^0x[a-fA-F0-9]{40}$/);
        });

        it("should crete new staking contract with correct parameters", async () => {
          expect(
            await stakingCotract.stakingToken({ from: member })
          ).to.be.equal(stakingToken.address);
          expect(
            await stakingCotract.rewardsToken({ from: member })
          ).to.be.equal(rewardToken.address);
        });

        it("msg.sender should be the owner of created staking contract", async () => {
          expect(await stakingCotract.owner({ from: member })).to.be.equal(
            member
          );
        });

        it("should add new staking contract to registry", async () => {
          expect(
            await registry.stakingRegistry(rewardToken.address, {
              from: member,
            })
          ).to.be.equal(createdStaking);
        });

        it("should catch event", async () => {
          await registry.createStaking(
            stakingToken.address,
            rewardToken.address,
            member
          );

          const logs = await registry
            .getPastEvents("StakingCreated", { toBlock: "latest" })
            .then((events) => {
              return events[0].args;
            });

          expect(await logs["owner"]).to.be.equal(member);
          expect(await logs["rewardToken"]).to.be.equal(rewardToken.address);
          expect(await logs["stakingAddress"]).to.match(/^0x[a-fA-F0-9]{40}$/);
        });
      });
    });
  });
});
