// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {PositionGuardVault} from "./PositionGuardVault.sol";

/// @notice Vault provenance registry. Controller/market cannot be changed by an operator.
contract PositionGuardFactory {
    address public immutable controller;
    address public immutable market;
    mapping(address => bool) public isVault;
    event VaultCreated(address indexed owner, address indexed vault, address indexed keeper);
    constructor(address controller_, address market_) {
        require(controller_.code.length != 0 && market_.code.length != 0, "contracts required");
        controller = controller_; market = market_;
    }
    function create(address keeper, uint256 triggerWad, uint256 maxRepay, uint256 expiresAt, uint256 cooldown) external returns (address vault) {
        vault = address(new PositionGuardVault(msg.sender, keeper, controller, market, triggerWad, maxRepay, expiresAt, cooldown));
        isVault[vault] = true;
        emit VaultCreated(msg.sender, vault, keeper);
    }
}
