// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./interfaces/ILPStaking.sol";
import "./interfaces/IERC20Metadata.sol";
import "./Staking.sol";

contract LPStaking is Staking {
	using SafeMath for uint256;
	using SafeERC20 for IERC20;

	uint256 public constant APY_PRECISION = 10**25;
	uint256 public constant PERCENTAGE_100 = 100 * APY_PRECISION;

	constructor(
		address _stakingToken,
		address _rewardsToken,
		address _owner
	) Staking(_stakingToken, _rewardsToken, _owner) {}

	/// @notice returns APY% with 10**5 precision
	function getAPY() external view override returns (uint256 APY) {
		address token = address(stakingToken);
		uint256 totalSupply = IUniswapV2Pair(token).totalSupply();
		(uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(token).getReserves();
		uint256 reserveLACE = IUniswapV2Pair(token).token0() == address(rewardsToken)
			? reserve0
			: reserve1;

		if (totalSupply == 0 || reserveLACE == 0 || block.number > lastBlockWithReward) {
			return 0;
		}

		APY = rewardPerBlock.mul(BLOCKS_PER_YEAR).mul(PERCENTAGE_100).div(
			totalStaked.add(PRECISION).mul(reserveLACE.mul(2).mul(10**20).div(totalSupply))
		);
	}
}
