// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

interface IStakingRegistry {
	event StakingCreated(
		address indexed owner,
		address indexed rewardToken,
		address indexed stakingAddress
	);
	event BytesData(bytes bytesData);

	function setStakingImpl(address _newStakingImpl) external;

	/**
	 *  @notice Create a new staking contract.
	 *  @dev create a new proxy of PartnersStaking.
	 *  @param _stakingToken - address of token to stake.
	 *  @param _rewardToken - address of token to pay rewardfor a stake.
	 *  @return proxy Address of recently created staking contract.
	 */
	function createStaking(
		address _stakingToken,
		address _rewardToken,
		address _owner
	) external returns (address proxy);
}
