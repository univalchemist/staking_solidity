// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

import "../xLovelaceToken.sol";

contract xLovelaceTokenMock is xLovelaceToken {
	constructor(address _stakingContract) xLovelaceToken(_stakingContract) {}

	function mintArbitrary(address _to, uint256 _amount) public {
		_mint(_to, _amount);
	}
}
