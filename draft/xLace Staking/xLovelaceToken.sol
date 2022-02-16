// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IxLovelaceToken.sol";

contract xLovelaceToken is IxLovelaceToken, ERC20 {
	address public stakingContract;

	modifier onlyLovelaceStaking() {
		require(stakingContract == _msgSender(), "xLovelaceToken: permission denied");
		_;
	}

	constructor(address _stakingContract) ERC20("Staking Lovelace", "xLACE") {
		stakingContract = _stakingContract;
	}

	function mint(address account, uint256 amount) public override onlyLovelaceStaking {
		_mint(account, amount);
	}

	function burn(address account, uint256 amount) public override onlyLovelaceStaking {
		_burn(account, amount);
	}
}
