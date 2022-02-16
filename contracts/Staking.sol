// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IStaking.sol";

contract Staking is IStaking, Ownable, ReentrancyGuard, Pausable {
	using SafeMath for uint256;
	using SafeERC20 for IERC20;

	uint256 public constant PRECISION = 10**18;
	uint256 public constant PRECISION_5 = 10**5;
	uint256 public constant BLOCKS_PER_YEAR = 10_512_000; // BSC(3sec), ETH(13sec) 2_365_323

	IERC20 public stakingToken;
	IERC20 public rewardsToken;

	uint256 public rewardPerBlock;
	uint256 public firstBlockWithReward;
	uint256 public lastBlockWithReward;
	uint256 public lastUpdateBlock;
	uint256 public rewardPerTokenStored;
	uint256 public rewardTokensLocked;
	uint256 public cooldownPeriod;

	mapping(address => uint256) public rewards;

	uint256 public totalStaked;
	mapping(address => UserInfo) public usersInfo;

	modifier updateReward(address _account) {
		rewardPerTokenStored = rewardPerToken();
		lastUpdateBlock = block.number;
		if (_account != address(0)) {
			usersInfo[_account].rewards = earned(_account);
			usersInfo[_account].rewardPerTokenPaid = rewardPerTokenStored;
		}
		_;
	}

	constructor(
		address _stakingToken,
		address _rewardsToken,
		address _owner
	) {
		stakingToken = IERC20(_stakingToken);
		rewardsToken = IERC20(_rewardsToken);

		transferOwnership(_owner);
	}

	/// @notice returns APY% with 10**5 precision
	function getAPY() external view virtual override returns (uint256 APY) {
		if (totalStaked > 0)
			APY = rewardPerBlock.mul(BLOCKS_PER_YEAR).mul(100).mul(PRECISION_5).div(totalStaked);
	}

	function setRewards(
		uint256 _rewardPerBlock,
		uint256 _startingBlock,
		uint256 _blocksAmount
	) external override onlyOwner updateReward(address(0)) {
		uint256 unlockedTokens = _getFutureRewardTokens();

		rewardPerBlock = _rewardPerBlock;
		firstBlockWithReward = _startingBlock;
		lastBlockWithReward = firstBlockWithReward.add(_blocksAmount).sub(1);

		uint256 lockedTokens = _getFutureRewardTokens();
		rewardTokensLocked = rewardTokensLocked.sub(unlockedTokens).add(lockedTokens);
		require(
			rewardTokensLocked <= rewardsToken.balanceOf(address(this)),
			"Not enough tokens for the rewards"
		);

		emit RewardsSet(_rewardPerBlock, _startingBlock, lastBlockWithReward);
	}

	function setCooldownPeriod(uint256 _cooldownPeriod) external override onlyOwner {
		require(_cooldownPeriod < 30 days, "Cooldown period too high");
		cooldownPeriod = _cooldownPeriod;
	}

	function recoverNonLockedRewardTokens() external override onlyOwner {
		uint256 nonLockedTokens = rewardsToken.balanceOf(address(this)).sub(rewardTokensLocked);

		rewardsToken.safeTransfer(owner(), nonLockedTokens);
		emit RewardTokensRecovered(nonLockedTokens);
	}

	function pause() external override onlyOwner {
		super._pause();
	}

	function unpause() external override onlyOwner {
		super._unpause();
	}

	function exit() external override {
		withdraw(usersInfo[_msgSender()].staked);
		getReward();
	}

	function stake(uint256 _amount)
		external
		override
		whenNotPaused
		nonReentrant
		updateReward(_msgSender())
	{
		_updateCooldown(_amount);
		require(_amount > 0, "Stake: can't stake 0");

		stakingToken.safeTransferFrom(_msgSender(), address(this), _amount);

		totalStaked = totalStaked.add(_amount);
		usersInfo[_msgSender()].staked = usersInfo[_msgSender()].staked.add(_amount);

		emit Staked(_msgSender(), _amount);
	}

	function withdraw(uint256 _amount) public override nonReentrant updateReward(_msgSender()) {
		_updateCooldown(0);
		uint256 staked = usersInfo[_msgSender()].staked;
		uint256 locked = usersInfo[_msgSender()].locked;

		require(_amount > 0, "Withdraw: amount should be greater then 0");
		require(staked >= _amount, " Withdraw: insufficient staked amount");
		require(staked.sub(locked) >= _amount, "Withdraw: cooldown not reached");

		totalStaked = totalStaked.sub(_amount);
		usersInfo[_msgSender()].staked = staked.sub(_amount);
		stakingToken.safeTransfer(_msgSender(), _amount);

		emit Withdrawn(_msgSender(), _amount);
	}

	function getReward() public override nonReentrant updateReward(_msgSender()) {
		uint256 reward = usersInfo[_msgSender()].rewards;
		if (reward > 0) {
			usersInfo[_msgSender()].rewards = 0;
			rewardsToken.safeTransfer(_msgSender(), reward);
			rewardTokensLocked = rewardTokensLocked.sub(reward);

			emit RewardPaid(_msgSender(), reward);
		}
	}

	function blocksWithRewardsPassed() public view override returns (uint256) {
		uint256 from = Math.max(lastUpdateBlock, firstBlockWithReward);
		uint256 to = Math.min(block.number, lastBlockWithReward);

		return from >= to ? 0 : to.sub(from);
	}

	function rewardPerToken() public view override returns (uint256) {
		uint256 totalPoolStaked = totalStaked;

		if (totalPoolStaked == 0) {
			return rewardPerTokenStored;
		}

		uint256 accumulatedReward = blocksWithRewardsPassed()
			.mul(rewardPerBlock)
			.mul(PRECISION)
			.div(totalPoolStaked);
		return rewardPerTokenStored.add(accumulatedReward);
	}

	function earned(address _account) public view override returns (uint256) {
		uint256 rewardsDifference = rewardPerToken().sub(usersInfo[_account].rewardPerTokenPaid);
		uint256 newlyAccumulated = usersInfo[_account].staked
			.mul(rewardsDifference)
			.div(PRECISION);
		
		return usersInfo[_account].rewards.add(newlyAccumulated);
	}

	function _getFutureRewardTokens() internal view returns (uint256) {
		uint256 blocksLeft = _calculateBlocksLeft(firstBlockWithReward, lastBlockWithReward);
		return blocksLeft.mul(rewardPerBlock);
	}

	function _calculateBlocksLeft(uint256 _from, uint256 _to) internal view returns (uint256) {
		if (block.number >= _to) return 0;
		if (block.number < _from) return _to.sub(_from).add(1);

		return _to.sub(block.number);
	}

	function _updateCooldown(uint256 _amount) internal {
		if (cooldownPeriod > 0) {
			uint256 timePassed = block.timestamp.sub(usersInfo[_msgSender()].lastUpdate);

			if (timePassed >= cooldownPeriod) {
				usersInfo[_msgSender()].locked = _amount;
			} else {
				uint256 share = timePassed.mul(PRECISION).div(cooldownPeriod);
				uint256 locked = usersInfo[_msgSender()].locked;

				usersInfo[_msgSender()].locked = locked
					.add(_amount)
					.sub(locked.mul(share).div(PRECISION));
			}

			usersInfo[_msgSender()].lastUpdate = block.timestamp;
		}
	}
}
