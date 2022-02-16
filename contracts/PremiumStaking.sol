// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract PremiumStaking {
	using SafeMath for uint256;
	uint256 public constant PRECISION = 10_000_000;
	uint256 public constant SECONDS_IN_YEAR = 365 days;

	mapping(address => uint256) private _stakes;

	string public name;
	address public tokenAddress;
	uint256 public stakingStarts;
	uint256 public stakingEnds;
	uint256 public withdrawStarts;
	uint256 public withdrawEnds;
	uint256 public stakedTotal;
	uint256 public stakingCap;
	uint256 public totalReward;
	uint256 public earlyWithdrawReward;
	uint256 public rewardBalance;
	uint256 public stakedBalance;
	uint256 public stakingOpened;

	ERC20 public ERC20Interface;
	event Staked(
		address indexed token,
		address indexed staker_,
		uint256 requestedAmount_,
		uint256 stakedAmount_
	);
	event PaidOut(
		address indexed token,
		address indexed staker_,
		uint256 amount_,
		uint256 reward_
	);
	event Refunded(address indexed token, address indexed staker_, uint256 amount_);

	/**
	 */
	constructor(
		string memory name_,
		address tokenAddress_,
		uint256 stakingStarts_,
		uint256 stakingEnds_,
		uint256 withdrawStarts_,
		uint256 withdrawEnds_,
		uint256 stakingCap_
	) {
		name = name_;
		require(tokenAddress_ != address(0), "PremiumStaking: 0 address");
		tokenAddress = tokenAddress_;

		require(stakingStarts_ > 0, "PremiumStaking: zero staking start time");
		if (stakingStarts_ < block.timestamp) {
			stakingStarts = block.timestamp;
		} else {
			stakingStarts = stakingStarts_;
		}

		require(
			stakingEnds_ > stakingStarts,
			"PremiumStaking: staking end must be after staking starts"
		);
		stakingEnds = stakingEnds_;

		require(
			withdrawStarts_ >= stakingEnds,
			"PremiumStaking: withdrawStarts must be after staking ends"
		);
		withdrawStarts = withdrawStarts_;

		require(
			withdrawEnds_ > withdrawStarts,
			"PremiumStaking: withdrawEnds must be after withdraw starts"
		);
		withdrawEnds = withdrawEnds_;

		require(stakingCap_ > 0, "PremiumStaking: stakingCap must be positive");
		stakingCap = stakingCap_;

		stakingOpened = 2 weeks;
	}
	
	/// @notice returns APY% with 10**5 precision
	function getAPY() public view returns(uint256 APY) {
		uint256 stakingDuration = stakingEnds.sub(stakingStarts);

		APY = totalReward
			.mul(PRECISION)
			.div(stakingCap)
			.mul(SECONDS_IN_YEAR)
			.div(stakingDuration);
	}

	/// @notice returns earned tokens by user with 10**5 precision
	function earned(address staker) external view returns(uint256 reward) {
		uint256 stakedPeriod = block.timestamp.sub(stakingStarts);
		uint256 stakingDuration = stakingEnds.sub(stakingStarts);
		
		if (stakedPeriod < stakingDuration) {
			reward = stakeOf(staker)
				.mul(
					stakedPeriod
					.mul(totalReward.mul(PRECISION).div(stakingCap))
					.div(stakingDuration)
				)
				.div(PRECISION);
		} else {
			reward = totalReward.mul(stakeOf(staker)).div(stakingCap);
		}
	}

	function addReward(uint256 rewardAmount, uint256 withdrawableAmount)
		public
		_before(withdrawStarts)
		_hasAllowance(msg.sender, rewardAmount)
		returns (bool)
	{
		require(rewardAmount > 0, "PremiumStaking: reward must be positive");
		require(withdrawableAmount >= 0, "PremiumStaking: withdrawable amount cannot be negative");
		require(
			withdrawableAmount <= rewardAmount,
			"PremiumStaking: withdrawable amount must be less than or equal to the reward amount"
		);
		address from = msg.sender;
		if (!_payMe(from, rewardAmount)) {
			return false;
		}

		totalReward = totalReward.add(rewardAmount);
		rewardBalance = totalReward;
		earlyWithdrawReward = earlyWithdrawReward.add(withdrawableAmount);
		return true;
	}

	function stakeOf(address account) public view returns (uint256) {
		return _stakes[account];
	}

	/**
	 * Requirements:
	 * - `amount` Amount to be staked
	 */
	function stake(uint256 amount)
		public
		_positive(amount)
		_realAddress(msg.sender)
		returns (bool)
	{
		address from = msg.sender;
		return _stake(from, amount);
	}

	function withdraw(uint256 amount)
		public
		_after(withdrawStarts)
		_positive(amount)
		_realAddress(msg.sender)
		returns (bool)
	{
		address from = msg.sender;
		require(amount <= _stakes[from], "PremiumStaking: not enough balance");
		if (block.timestamp < withdrawEnds) {
			return _withdrawEarly(from, amount);
		} else {
			return _withdrawAfterClose(from, amount);
		}
	}

	function _withdrawEarly(address from, uint256 amount)
		private
		_realAddress(from)
		returns (bool)
	{
		// This is the formula to calculate reward:
		// r = (earlyWithdrawReward / stakedTotal) * (block.timestamp - stakingEnds) / (withdrawEnds - stakingEnds)
		// w = (1+r) * a
		uint256 denom = (withdrawEnds.sub(stakingEnds)).mul(stakedTotal);
		uint256 reward = (
			((block.timestamp.sub(stakingEnds)).mul(earlyWithdrawReward)).mul(amount)
		)
		.div(denom);
		uint256 payOut = amount.add(reward);
		rewardBalance = rewardBalance.sub(reward);
		stakedBalance = stakedBalance.sub(amount);
		_stakes[from] = _stakes[from].sub(amount);
		if (_payDirect(from, payOut)) {
			emit PaidOut(tokenAddress, from, amount, reward);
			return true;
		}
		return false;
	}

	function _withdrawAfterClose(address from, uint256 amount)
		private
		_realAddress(from)
		returns (bool)
	{
		uint256 reward = (rewardBalance.mul(amount)).div(stakedBalance);
		uint256 payOut = amount.add(reward);
		_stakes[from] = _stakes[from].sub(amount);
		if (_payDirect(from, payOut)) {
			emit PaidOut(tokenAddress, from, amount, reward);
			return true;
		}
		return false;
	}

	function _stake(address staker, uint256 amount)
		private
		_after(stakingStarts)
		_before(stakingStarts.add(stakingOpened))
		_positive(amount)
		_hasAllowance(staker, amount)
		returns (bool)
	{
		// check the remaining amount to be staked
		uint256 remaining = amount;
		if (remaining > (stakingCap.sub(stakedBalance))) {
			remaining = stakingCap.sub(stakedBalance);
		}
		// These requires are not necessary, because it will never happen, but won't hurt to double check
		// this is because stakedTotal and stakedBalance are only modified in this method during the staking period
		require(remaining > 0, "PremiumStaking: Staking cap is filled");
		require(
			(remaining + stakedTotal) <= stakingCap,
			"PremiumStaking: this will increase staking amount pass the cap"
		);
		if (!_payMe(staker, remaining)) {
			return false;
		}
		emit Staked(tokenAddress, staker, amount, remaining);

		if (remaining < amount) {
			// Return the unstaked amount to sender (from allowance)
			uint256 refund = amount.sub(remaining);
			if (_payTo(staker, staker, refund)) {
				emit Refunded(tokenAddress, staker, refund);
			}
		}

		// Transfer is completed
		stakedBalance = stakedBalance.add(remaining);
		stakedTotal = stakedTotal.add(remaining);
		_stakes[staker] = _stakes[staker].add(remaining);
		return true;
	}

	function _payMe(address payer, uint256 amount) private returns (bool) {
		return _payTo(payer, address(this), amount);
	}

	function _payTo(
		address allower,
		address receiver,
		uint256 amount
	) private _hasAllowance(allower, amount) returns (bool) {
		// Request to transfer amount from the contract to receiver.
		// contract does not own the funds, so the allower must have added allowance to the contract
		// Allower is the original owner.
		ERC20Interface = ERC20(tokenAddress);
		return ERC20Interface.transferFrom(allower, receiver, amount);
	}

	function _payDirect(address to, uint256 amount) private _positive(amount) returns (bool) {
		ERC20Interface = ERC20(tokenAddress);
		return ERC20Interface.transfer(to, amount);
	}

	modifier _realAddress(address addr) {
		require(addr != address(0), "PremiumStaking: zero address");
		_;
	}

	modifier _positive(uint256 amount) {
		require(amount >= 0, "PremiumStaking: negative amount");
		_;
	}

	modifier _after(uint256 eventTime) {
		require(block.timestamp >= eventTime, "PremiumStaking: bad timing for the request");
		_;
	}

	modifier _before(uint256 eventTime) {
		require(block.timestamp < eventTime, "PremiumStaking: bad timing for the request");
		_;
	}

	modifier _hasAllowance(address allower, uint256 amount) {
		// Make sure the allower has provided the right allowance.
		ERC20Interface = ERC20(tokenAddress);
		uint256 ourAllowance = ERC20Interface.allowance(allower, address(this));
		require(amount <= ourAllowance, "PremiumStaking: Make sure to add enough allowance");
		_;
	}
}
