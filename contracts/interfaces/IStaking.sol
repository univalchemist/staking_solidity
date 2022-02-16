// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

interface IStaking {
	struct UserInfo {
		uint256 staked;
		uint256 locked;
		uint256 lastUpdate;
		uint256 rewardPerTokenPaid;
		uint256 rewards;
	}

	event RewardsSet(
		uint256 rewardPerBlock,
		uint256 firstBlockWithReward,
		uint256 lastBlockWithReward
	);
	event Staked(address indexed user, uint256 amount);
	event Withdrawn(address indexed user, uint256 amount);
	event RewardPaid(address indexed user, uint256 reward);
	event RewardRestaked(address indexed user, uint256 reward, uint256 stakingTokens);
	event RewardTokensRecovered(uint256 amount);

	function getAPY() external view returns (uint256 APY);

	function setRewards(
		uint256 _rewardPerBlock,
		uint256 _startingBlock,
		uint256 _blocksAmount
	) external;

	function setCooldownPeriod(uint256 _cooldownPeriod) external;

	function recoverNonLockedRewardTokens() external;

	function pause() external;

	function unpause() external;

	function exit() external;

	function stake(uint256 _amount) external;

	function withdraw(uint256 _amount) external;

	function getReward() external;

	function blocksWithRewardsPassed() external view returns (uint256);

	function rewardPerToken() external view returns (uint256);

	function earned(address _account) external view returns (uint256);
}
