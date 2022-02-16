// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
	constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

	function mintArbitrary(address _to, uint256 _amount) public {
		_mint(_to, _amount);
	}
}
