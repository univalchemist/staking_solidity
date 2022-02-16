const PremiumStakingMock = artifacts.require('PremiumStakingMock');
const ERC20Mock = artifacts.require('ERC20Mock');
const abiDecoder = require('abi-decoder');
const { time, expectRevert } = require('@openzeppelin/test-helpers');

const STAKING_CAP = 1000;

let staking;
let token;
let owner, contractAddress;
let user1, user2;

contract('PremiumStaking', async (accounts) => {

    beforeEach(async () => {
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];

        token = await ERC20Mock.new('', '');
        staking = await PremiumStakingMock.new("Test Staking", token.address, STAKING_CAP);
        contractAddress = staking.address;
        // Approve the owner
        await token.mintArbitrary(owner, '1000000');
        await token.approve(contractAddress, STAKING_CAP);
        const allowance = await token.allowance(owner, contractAddress);

        abiDecoder.addABI(PremiumStakingMock['abi']);
    });

    async function allow(addr, amount) {
        await token.transfer(addr, amount);
        await token.approve(contractAddress, amount, { from: addr });
        const allowance = await token.allowance(addr, contractAddress);
        assert(allowance.toString() === amount.toString(), 'Allowance didn\'t happen');
    }

    async function addReward() {
        return staking.addReward('1000', '500');
    }

    async function vars() {
        const stakedTotal = (await staking.stakedTotal()).toString();
        const totalReward = (await staking.totalReward()).toString();
        const earlyWithdrawReward = (await staking.earlyWithdrawReward()).toString();
        const rewardBalance = (await staking.rewardBalance()).toString();
        const stakedBalance = (await staking.stakedBalance()).toString();
        return { stakedTotal, totalReward, earlyWithdrawReward, rewardBalance, stakedBalance };
    }

    async function balance(addr) {
        const res = await token.balanceOf(addr);
        return res.toString();
    }

    async function setUpStakes() {
        await addReward();
        await allow(user1, '200');
        const tx = await staking.stake('100', { from: user1 });
        // await getTransactionLogs(await tx.transactionHash);
        let stake = await staking.stakeOf(user1);

        await staking.stake('100', { from: user1 });
        stake = await staking.stakeOf(user1);
        console.log('ac1 staked ', stake.toString());

        await allow(user2, '1000');
        await staking.stake('1000', { from: user2 });
        stake = await staking.stakeOf(user2);
        const allowance = await token.allowance(user2, contractAddress);
        console.log('ac2 staked ', stake.toString(), ' and has allowance of ', allowance.toString(), ' it tried to stake 1000 ' +
            'but cap was full and 200 goes back to account');
    }

    // async function getTransactionLogs(txId) {
    //     const receipts = await web3.eth.getTransactionReceipt(txId);
    //     const decodedLogs = await abiDecoder.decodeLogs(await receipts.logs);
    //     await decodedLogs.forEach(async l => {
    //         if (l) {
    //             console.log(await JSON.stringify(await l));
    //         }
    //     });
    //     return await decodedLogs.filter(Boolean);
    // }

    describe('PremiumStaking', () => {
        it('Sets the reward', async () => {
            const totalRewBefore = await staking.totalReward();
            expect(await totalRewBefore.toString()).to.be.eq('0');
            await staking.addReward('100', '10');
            let totalRewAfter = await staking.totalReward();
            expect(await totalRewAfter.toString()).to.be.eq('100');
            let earlyWithdrawReward = await staking.earlyWithdrawReward();
            expect(await earlyWithdrawReward.toString()).to.be.eq('10');

            await staking.addReward('50', '40');
            totalRewAfter = await staking.totalReward();
            expect(await totalRewAfter.toString()).to.be.eq('150');
            earlyWithdrawReward = await staking.earlyWithdrawReward();
            expect(await earlyWithdrawReward.toString()).to.be.eq('50');
        });

        it('Withdraw right after it opens gives no reward', async function () {
            this.timeout(0);
            await setUpStakes();

            // Now moving to the first moment of withdawal phase
            await staking.setEarlyWithdrawalPeriod(0);            
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '1000'
            });
            const balanceBefore = await balance(user2);
            expect(await balanceBefore.toString()).to.be.eq('200');

            // Withdraw at the first moment
            const tx = await staking.withdraw('400', { from: user2 });
            // await getTransactionLogs(tx.transactionHash);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '600',
            });
            let bal = await balance(user2);
            expect(await bal.toString()).to.be.eq('600');
        });

        it('Withdraw halfway before it ends', async function () {
            this.timeout('0');
            await setUpStakes();

            // Now moving to the half way of withdawal phase
            await staking.setEarlyWithdrawalPeriod(30000);

            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '1000',
            });

            await staking.withdraw('400', { from: user2 });
            let bal = await balance(user2);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '900',
                stakedBalance: '600',
            });
            expect(await bal.toString()).to.be.eq('700');
        });

        it('Withdraw right before close', async function () {
            this.timeout('0');
            await setUpStakes();

            // Now moving to the end of withdrawal phase
            await staking.setEarlyWithdrawalPeriod(59990);

            const balanceBefore = await balance(user2);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '1000',
            });
            expect(await balanceBefore.toString()).to.be.eq('200');

            await staking.withdraw(400, { from: user2 });
            let bal = await balance(user2);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '801',
                stakedBalance: '600',
            });
            expect(await bal.toString()).to.be.eq('799');

            // Now continue after close
            await staking.setEarlyWithdrawalPeriod(60000);

            // Withdraw another 400
            await staking.withdraw('400', { from: user2 });
            after = await vars();
            bal = await balance(user2);
            // After close reward and stake balance don't change
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '801',
                stakedBalance: '600',
            });
            // Here ac2 expects ~ 66% of the remaining reward
            // because my balance at the time is ~ 66% of the remaining balance
            expect(await bal.toString()).to.be.eq((801 * 400 / 600 + 400 + 799).toString());

            let stakes = await staking.stakeOf(user2);
            expect(await stakes.toString()).to.be.eq('0');

            // Withdraw ac1
            await staking.withdraw('200', { from: user1 });
            bal = await balance(user1);
            expect(await bal.toString()).to.be.eq((801 * 200 / 600 + 200).toString());
            stakes = await staking.stakeOf(user1);
            expect(await stakes.toString()).to.be.eq('0'); // Remaining stakes is zero
        });

        it('Withdraw after close', async function () {
            this.timeout('0');
            await setUpStakes();

            // Now moving to the first moment after maturity
            await staking.setEarlyWithdrawalPeriod('60000');

            const balanceBefore = await balance(user2);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '1000',
            });
            expect(await balanceBefore).to.be.eq('200');

            await staking.withdraw(400, { from: user2 });
            let bal = await balance(user2);
            expect(await vars()).to.be.deep.equal({
                stakedTotal: '1000',
                totalReward: '1000',
                earlyWithdrawReward: '500',
                rewardBalance: '1000',
                stakedBalance: '1000',
            });
            expect(await bal.toString()).to.be.eq((400 + 400 + 200).toString()); // reward + amount + existing balance
        });

        it('annual rate calculation', async function () {
            this.timeout('0');
            await setUpStakes();

            // Calculate the withdraw reward rate.
            // wRate = withdrawReward/stakingCap
            // dT = withdrawEnd - stakingEnd // milliseconds
            // yearMs = 365 * 24 * 3600 * 1000
            // earlyWdRewardAnualRate = wRate * yearMs / dT
            const { stakedTotal, earlyWithdrawReward } = await vars();
            const dT = 60000;
            const yearMs = 265 * 24 * 3600 * 1000;
            const wRate = Number(earlyWithdrawReward) / Number(stakedTotal);
            const earlyWdRewardAnualRate = wRate * yearMs / dT;

            // Now do an actual withdraw and see if the reward matches expectation
            const withdrawTime = dT / 2;
            await staking.setEarlyWithdrawalPeriod(withdrawTime);
            let preBal = await balance(user2);
            await staking.withdraw(400, { from: user2 });
            const withdrawed = await balance(user2) - preBal;
            const reward = withdrawed - 400;

            console.log('Amount withdrawn:', withdrawed, ' reward', reward);
            expect((wRate * withdrawTime / dT).toString()).to.be.eq((reward / 400).toString());
            const actualAnnualRate = reward / 400 * (yearMs / withdrawTime);
            console.log('Actual annual rate:', actualAnnualRate, ' vs ', earlyWdRewardAnualRate);
            expect(actualAnnualRate.toString()).to.be.eq(earlyWdRewardAnualRate.toString());
        });

        it('maximum rate calculation', async function () {
            this.timeout(0);
            await setUpStakes();
            const { stakedTotal, totalReward } = await vars();
            const dT = 60000;
            const yearMs = 265 * 24 * 3600 * 1000;
            const annualize = r => r * yearMs / dT;

            // Reward at maturity will be translated to annual rate at follows:
            // Minimum reward at maturity is when no early withdrawal happens, hense:
            // minRewardRateAtMat = annualize( totalReward / stakedTotal )
            // maxRewardAtMat = totalReward
            const minRewardRateAtMat = totalReward / stakedTotal;
            const annualizedMinRewardRateAtMat = annualize(minRewardRateAtMat);

            // Now do an actual withdraw and see if the reward matches expectation
            const withdrawTime = dT + 1;
            await staking.setEarlyWithdrawalPeriod(withdrawTime);
            let preBal = await balance(user2);
            await staking.withdraw('400', { from: user2 });
            const withdrawed = await balance(user2) - preBal;
            const reward = withdrawed - 400;

            console.log('Amount withdrawn:', withdrawed, ' reward', reward);
            expect(minRewardRateAtMat.toString()).to.be.eq((reward / 400).toString());
            const actualAnnualRate = reward / 400 * (yearMs / dT);
            console.log('Actual annual rate:', actualAnnualRate, ' vs ', annualizedMinRewardRateAtMat);
            expect(actualAnnualRate.toString()).to.be.eq((annualizedMinRewardRateAtMat).toString());
        });

        describe('getAPY', () => {
            it('should return 0 if no reward', async () => {
                const apy = await staking.getAPY();
                expect(apy.toString()).to.be.equal("0");
            });

            it('should return correct APY', async () => {
                await staking.addReward('100', '100');
                const apy = await staking.getAPY();
                expect(apy.toString()).to.be.equal("525600000"); // 5 decimals
            });
        });

        describe('earned', () => {
            it('should return 0 if no reward', async () => {
                const reward = await staking.earned(owner);
                expect(reward.toString()).to.be.equal("0");
            });

            it('should return 0 if no staked tokens', async () => {
                await staking.addReward('100', '100');
                await staking.setEarlyWithdrawalPeriod('30000');
                const reward = await staking.earned(owner);

                expect(reward.toString()).to.be.equal("0");
            });

            it('should return correct reward if not finished', async () => {
                await staking.addReward('100', '100');
                await staking.stake('200');
                
                await time.increase(await time.duration.seconds(30000));
                let reward = await staking.earned(owner);
                expect(reward.toString()).to.be.equal("10");

                await time.increase(await time.duration.seconds(15000));
                reward = await staking.earned(owner);
                expect(reward.toString()).to.be.equal("15");
            });

            it('should return correct reward if not finished', async () => {
                await staking.addReward('100', '100');
                await staking.stake('200');
                
                await time.increase(await time.duration.seconds(70000));
                reward = await staking.earned(owner);
                expect(reward.toString()).to.be.equal("20");
            });
        });

        describe('stake', () => {
            it('should revert if staking was closed', async () => {
                await time.increase(await time.duration.days(15));
                
                await expectRevert(
                    staking.stake('100'),
                    "PremiumStaking: bad timing for the request"
                );
            });
        });

        // it('stake more than cap', () => { });

        // it('withdraw more than balance', () => { });

        // it('withdraw before period opens', () => { });

        // it('stake after period closes', () => { });

        // it('stake after period closes', () => { });

        // it('stake without allocation', () => { });
    });
});