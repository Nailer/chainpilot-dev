// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IVenusController {
    function getAssetsIn(address) external view returns (address[] memory);
    function markets(address) external view returns (bool, uint256, uint256);
    function oracle() external view returns (address);
    function getAccountLiquidity(address) external view returns (uint256, uint256, uint256);
}
interface IVenusMarket {
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
    function getAccountSnapshot(address) external view returns (uint256, uint256, uint256, uint256);
    function accrueInterest() external returns (uint256);
    function repayBorrowBehalf(address, uint256) external returns (uint256);
}
interface IVenusOracle { function getUnderlyingPrice(address) external view returns (uint256); }

/// @notice Single-owner, single-market repayment reserve for Venus isolated pools.
/// @dev No arbitrary calls, swaps, borrowing, collateral withdrawals or keeper withdrawals.
///      Deployment must use verified Venus isolated-pool contracts. Not Venus Core.
contract PositionGuardVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable owner;
    address public immutable keeper;
    IVenusController public immutable controller;
    IVenusMarket public immutable market;
    IERC20 public immutable token;
    uint256 public immutable triggerWad;
    uint256 public immutable maxRepay;
    uint256 public immutable expiresAt;
    uint256 public immutable cooldown;
    uint256 public remainingBudget;
    uint256 public lastExecutedAt;
    bool public paused;

    event Funded(uint256 amount, uint256 remainingBudget);
    event Repaid(address indexed borrower, address indexed market, uint256 amount, uint256 healthBefore, uint256 healthAfter);
    event Paused(bool paused);
    event Withdrawn(uint256 amount);
    error Forbidden();
    error InvalidConfiguration();
    error Inactive();
    error InvalidAmount();
    error ProtocolFailure();
    error NoImprovement();

    constructor(address owner_, address keeper_, address controller_, address market_, uint256 triggerWad_, uint256 maxRepay_, uint256 expiresAt_, uint256 cooldown_) {
        if (owner_ == address(0) || keeper_ == address(0) || controller_.code.length == 0 || market_.code.length == 0 ||
            triggerWad_ <= 1e18 || triggerWad_ > 3e18 || maxRepay_ == 0 || expiresAt_ <= block.timestamp || cooldown_ < 60) revert InvalidConfiguration();
        controller = IVenusController(controller_);
        market = IVenusMarket(market_);
        (bool listed,,) = controller.markets(market_);
        if (!listed || market.comptroller() != controller_ || market.underlying().code.length == 0) revert InvalidConfiguration();
        owner = owner_; keeper = keeper_;
        token = IERC20(market.underlying());
        triggerWad = triggerWad_; maxRepay = maxRepay_;
        expiresAt = expiresAt_; cooldown = cooldown_;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert Forbidden(); _; }

    function fund(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        // Fee-on-transfer tokens are not supported.
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert InvalidAmount();
        remainingBudget += amount;
        emit Funded(amount, remainingBudget);
    }

    function setPaused(bool value) external onlyOwner { paused = value; emit Paused(value); }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        remainingBudget -= Math.min(amount, remainingBudget);
        token.safeTransfer(owner, amount);
        emit Withdrawn(amount);
    }

    /// @notice Mirrors Venus isolated-pool liquidation-threshold accounting, with stored interest.
    function risk() public view returns (uint256 adjustedCollateral, uint256 debt, uint256 health) {
        address[] memory assets = controller.getAssetsIn(owner);
        if (assets.length > 32) revert InvalidConfiguration();
        IVenusOracle oracle = IVenusOracle(controller.oracle());
        for (uint256 i; i < assets.length; ++i) {
            (bool listed,,uint256 threshold) = controller.markets(assets[i]);
            (uint256 err,uint256 balance,uint256 borrowBalance,uint256 exchangeRate) = IVenusMarket(assets[i]).getAccountSnapshot(owner);
            uint256 price = oracle.getUnderlyingPrice(assets[i]);
            if (!listed || err != 0 || price == 0 || threshold > 1e18) revert ProtocolFailure();
            uint256 vTokenPrice = Math.mulDiv(exchangeRate, price, 1e18);
            uint256 weightedPrice = Math.mulDiv(threshold, vTokenPrice, 1e18);
            adjustedCollateral += Math.mulDiv(weightedPrice, balance, 1e18);
            debt += Math.mulDiv(price, borrowBalance, 1e18);
        }
        health = debt == 0 ? type(uint256).max : Math.mulDiv(adjustedCollateral, 1e18, debt);
    }

    function execute(uint256 amount) external nonReentrant returns (uint256 spent) {
        if (msg.sender != keeper && msg.sender != owner) revert Forbidden();
        if (paused || block.timestamp >= expiresAt || (lastExecutedAt != 0 && block.timestamp < lastExecutedAt + cooldown)) revert Inactive();
        if (amount == 0 || amount > maxRepay || amount > remainingBudget || amount > token.balanceOf(address(this))) revert InvalidAmount();
        address[] memory assets = controller.getAssetsIn(owner);
        if (assets.length > 32) revert InvalidConfiguration();
        for (uint256 i; i < assets.length; ++i) {
            if (IVenusMarket(assets[i]).accrueInterest() != 0) revert ProtocolFailure();
        }
        (,,uint256 beforeHealth) = risk();
        if (beforeHealth >= triggerWad) revert Inactive();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.forceApprove(address(market), amount);
        if (market.repayBorrowBehalf(owner, amount) != 0) revert ProtocolFailure();
        token.forceApprove(address(market), 0);
        spent = beforeBalance - token.balanceOf(address(this));
        if (spent == 0 || spent > amount) revert ProtocolFailure();
        (,,uint256 afterHealth) = risk();
        if (afterHealth <= beforeHealth) revert NoImprovement();
        remainingBudget -= spent;
        lastExecutedAt = block.timestamp;
        emit Repaid(owner, address(market), spent, beforeHealth, afterHealth);
    }
}
