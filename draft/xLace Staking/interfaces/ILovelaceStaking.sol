// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "./IxLovelaceToken.sol";

interface ILovelaceStaking {
	event StakedLACE(uint256 StakedLACE, uint256 mintedxLACE, address indexed recipient);

	event WithdrawnLACE(uint256 WithdrawnLACE, uint256 burnedxLACE, address indexed recipient);

	event UnusedRewardPoolRevoked(address recipient, uint256 amount);

	function xLovelaceToken() external returns (IxLovelaceToken);

	function stake(uint256 _amountLACE) external;

	function withdraw(uint256 _amountxLACE) external;

	function stakingReward(uint256 _amount) external view returns (uint256);

	function getStakedLACE(address _address) external view returns (uint256);

	function setRewardPerBlock(uint256 _amount) external;

	function revokeUnusedRewardPool() external;
}
