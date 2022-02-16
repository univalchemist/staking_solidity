// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import "./interfaces/IStakingRegistry.sol";

contract StakingRegistry is IStakingRegistry, Ownable {
	address public stakingImpl;

	mapping(address => address) public stakingRegistry;

	constructor(address _stakingImpl) {
		require(_stakingImpl != address(0), "StakingRegistry: wrong staking implementation");
		stakingImpl = _stakingImpl;
	}

	function setStakingImpl(address _newStakingImpl) external override onlyOwner {
		require(_newStakingImpl != address(0), "StakingRegistry: wrong staking implementation");
		stakingImpl = _newStakingImpl;
	}

	function createStaking(address _stakingToken, address _rewardToken, address _owner)
		public
		override
		onlyOwner
		returns (address proxy)
	{
		bytes memory bytesData = abi.encodeWithSignature(
			"initialize(address,address,address)",
			_stakingToken,
			_rewardToken,
            _owner
		);

		proxy = address(new TransparentUpgradeableProxy(stakingImpl, owner(), bytesData));

		stakingRegistry[_rewardToken] = proxy;

		emit StakingCreated(_owner, _rewardToken, proxy);
		emit BytesData(bytesData);
	}
}
