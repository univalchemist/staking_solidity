// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "../PremiumStaking.sol";

contract PremiumStakingMock is PremiumStaking {
	uint256 public GAP = 60000;
	uint256 public SEC = 1000;

	constructor(
		string memory name_,
		address tokenAddress_,
		uint256 stakingCap_
	)
		PremiumStaking(
			name_,
			tokenAddress_,
			block.timestamp,
			block.timestamp + GAP,
			block.timestamp + GAP,
			block.timestamp + GAP * 2,
			stakingCap_
		)
	{}

	function setStakingPeriod() public {
		setStakingStart(block.timestamp - SEC);
	}

	function setEarlyWithdrawalPeriod(uint256 offset) public {
		setStakingStart(block.timestamp - GAP - offset);
	}

	function setAfterWithdrawal() public {
		setStakingStart(block.timestamp - GAP * 2 - SEC);
	}

	function setStakingStart(uint256 time) private {
		stakingStarts = time;
		stakingEnds = time + GAP;
		withdrawStarts = time + GAP;
		withdrawEnds = time + GAP * 2;
	}
}
