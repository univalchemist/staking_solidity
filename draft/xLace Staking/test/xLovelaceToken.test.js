const {
  BN,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { ZERO_ADDRESS } = constants;

const xLovelaceToken = artifacts.require("xLovelaceToken");

contract("xLovelaceToken", function (accounts) {
  const [initialHolder, recipient, stakingContract] = accounts;

  const name = "Staking Lovelace";
  const symbol = "xLACE";
  const initialSupply = new BN("100");

  beforeEach(async function () {
    this.token = await xLovelaceToken.new(stakingContract);
    await this.token.mint(initialHolder, initialSupply, {
      from: stakingContract,
    });
  });

  it("has a name", async function () {
    expect(await this.token.name()).to.equal(name);
  });

  it("has a symbol", async function () {
    expect(await this.token.symbol()).to.equal(symbol);
  });

  it("has 18 decimals", async function () {
    expect(await this.token.decimals()).to.be.bignumber.equal("18");
  });

  it("should set staking contract", async function () {
    expect(await this.token.stakingContract()).to.equal(stakingContract);
  });

  describe("mint", function () {
    const amount = new BN(50);

    it("revert if sender not a stakingContract", async function () {
      await expectRevert(
        this.token.mint(recipient, amount),
        "xLovelaceToken: permission denied"
      );
    });

    it("rejects a null account", async function () {
      await expectRevert(
        this.token.mint(ZERO_ADDRESS, amount, { from: stakingContract }),
        "ERC20: mint to the zero address"
      );
    });

    describe("for a non zero account", function () {
      beforeEach("minting", async function () {
        const { logs } = await this.token.mint(recipient, amount, {
          from: stakingContract,
        });
        this.logs = logs;
      });

      it("increments totalSupply", async function () {
        const expectedSupply = initialSupply.add(amount);
        expect(await this.token.totalSupply()).to.be.bignumber.equal(
          expectedSupply
        );
      });

      it("increments recipient balance", async function () {
        expect(await this.token.balanceOf(recipient)).to.be.bignumber.equal(
          amount
        );
      });

      it("emits Transfer event", async function () {
        const event = expectEvent.inLogs(this.logs, "Transfer", {
          from: ZERO_ADDRESS,
          to: recipient,
        });

        expect(event.args.value).to.be.bignumber.equal(amount);
      });
    });
  });

  describe("burn", function () {
    const amount = new BN(50);

    it("revert if sender not a stakingContract", async function () {
      await expectRevert(
        this.token.burn(initialHolder, amount, { from: recipient }),
        "xLovelaceToken: permission denied"
      );
    });

    it("rejects a null account", async function () {
      await expectRevert(
        this.token.burn(ZERO_ADDRESS, amount, { from: stakingContract }),
        "ERC20: burn from the zero address"
      );
    });

    describe("for a non zero account", function () {
      it("rejects burning more than balance", async function () {
        await expectRevert(
          this.token.burn(initialHolder, initialSupply.addn(1), {
            from: stakingContract,
          }),
          "ERC20: burn amount exceeds balance"
        );
      });

      const describeBurn = function (description, amount) {
        describe(description, function () {
          beforeEach("burning", async function () {
            const { logs } = await this.token.burn(initialHolder, amount, {
              from: stakingContract,
            });
            this.logs = logs;
          });

          it("decrements totalSupply", async function () {
            const expectedSupply = initialSupply.sub(amount);
            expect(await this.token.totalSupply()).to.be.bignumber.equal(
              expectedSupply
            );
          });

          it("decrements initialHolder balance", async function () {
            const expectedBalance = initialSupply.sub(amount);
            expect(
              await this.token.balanceOf(initialHolder)
            ).to.be.bignumber.equal(expectedBalance);
          });

          it("emits Transfer event", async function () {
            const event = expectEvent.inLogs(this.logs, "Transfer", {
              from: initialHolder,
              to: ZERO_ADDRESS,
            });

            expect(event.args.value).to.be.bignumber.equal(amount);
          });
        });
      };

      describeBurn("for entire balance", initialSupply);
      describeBurn("for less amount than balance", initialSupply.subn(1));
    });
  });
});
