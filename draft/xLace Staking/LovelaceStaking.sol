// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "./interfaces/IxLovelaceToken.sol";
import "./interfaces/ILovelaceStaking.sol";

contract LovelaceStaking is ILovelaceStaking, OwnableUpgradeable {
	using SafeMathUpgradeable for uint256;

	IERC20 public lovelaceToken;
	IxLovelaceToken public override xLovelaceToken;
	uint256 public lastUpdateBlock;
	uint256 public rewardPerBlock;
	uint256 public totalPool;

	modifier updateRewardPool() {
		if (totalPool == 0) {
			lastUpdateBlock = block.number;
		}
		totalPool = totalPool.add(_calculateReward());
		lastUpdateBlock = block.number;
		_;
	}

	function initialize(
		uint256 _rewardPerBlock,
		address _lovelace,
		address _xLovelace
	) external initializer {
		__Ownable_init();

		lastUpdateBlock = block.number;
		rewardPerBlock = _rewardPerBlock;

		lovelaceToken = IERC20(_lovelace);
		xLovelaceToken = IxLovelaceToken(_xLovelace);
	}

	function stake(uint256 _amountLACE) external override updateRewardPool {
		require(_amountLACE > 0, "Staking: cant stake 0 tokens");
		lovelaceToken.transferFrom(_msgSender(), address(this), _amountLACE);

		uint256 amountxLACE = _convertToxLACE(_amountLACE);
		xLovelaceToken.mint(_msgSender(), amountxLACE);

		totalPool = totalPool.add(_amountLACE);

		emit StakedLACE(_amountLACE, amountxLACE, _msgSender());
	}

	function withdraw(uint256 _amountxLACE) external override updateRewardPool {
		require(
			xLovelaceToken.balanceOf(_msgSender()) >= _amountxLACE,
			"Withdraw: not enough xLACE tokens to withdraw"
		);

		uint256 amountLACE = _convertToLACE(_amountxLACE);
		xLovelaceToken.burn(_msgSender(), _amountxLACE);

		totalPool = totalPool.sub(amountLACE);
		require(
			lovelaceToken.balanceOf(address(this)) >= amountLACE,
			"Withdraw: failed to transfer LACE tokens"
		);
		lovelaceToken.transfer(_msgSender(), amountLACE);

		emit WithdrawnLACE(amountLACE, _amountxLACE, _msgSender());
	}

	function stakingReward(uint256 _amount) public view override returns (uint256) {
		return _convertToLACE(_amount);
	}

	function getStakedLACE(address _address) public view override returns (uint256) {
		uint256 balance = xLovelaceToken.balanceOf(_address);
		return balance > 0 ? _convertToLACE(balance) : 0;
	}

	function setRewardPerBlock(uint256 _amount) external override onlyOwner updateRewardPool {
		rewardPerBlock = _amount;
	}

	function revokeUnusedRewardPool() external override onlyOwner updateRewardPool {
		uint256 contractBalance = lovelaceToken.balanceOf(address(this));

		require(contractBalance > totalPool, "There are no unused tokens to revoke");

		uint256 unusedTokens = contractBalance.sub(totalPool);

		lovelaceToken.transfer(msg.sender, unusedTokens);
		emit UnusedRewardPoolRevoked(msg.sender, unusedTokens);
	}

	function _convertToxLACE(uint256 _amount) internal view returns (uint256) {
		uint256 TSxLovelaceToken = xLovelaceToken.totalSupply();
		uint256 stakingPool = totalPool.add(_calculateReward());

		if (stakingPool > 0 && TSxLovelaceToken > 0) {
			_amount = TSxLovelaceToken.mul(_amount).div(stakingPool);
		}

		return _amount;
	}

	function _convertToLACE(uint256 _amount) internal view returns (uint256) {
		uint256 TSxLovelaceToken = xLovelaceToken.totalSupply();
		uint256 stakingPool = totalPool.add(_calculateReward());

		return stakingPool.mul(_amount).div(TSxLovelaceToken);
	}

	function _calculateReward() internal view returns (uint256) {
		uint256 blocksPassed = block.number.sub(lastUpdateBlock);
		return rewardPerBlock.mul(blocksPassed);
	}
}
