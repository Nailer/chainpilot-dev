// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PositionGuardVault} from "../src/PositionGuardVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ForkVm {
    function envOr(string calldata, bool) external returns(bool);
    function envOr(string calldata, string calldata) external returns(string memory);
    function skip(bool) external;
    function createSelectFork(string calldata) external returns(uint256);
    function startPrank(address) external;
    function stopPrank() external;
    function record() external;
    function accesses(address) external returns(bytes32[] memory,bytes32[] memory);
    function load(address,bytes32) external view returns(bytes32);
    function store(address,bytes32,bytes32) external;
}
interface ForkMarket {
    function underlying() external view returns(address);
    function mint(uint256) external returns(uint256);
    function borrow(uint256) external returns(uint256);
    function borrowBalanceStored(address) external view returns(uint256);
}
interface ForkController {function enterMarkets(address[] calldata) external returns(uint256[] memory);}

/// @notice Integration acceptance against real Venus code/state on a LOCAL fork.
/// @dev Never broadcasts, never counts as campaign activity. RPC is opt-in in CI.
contract VenusForkTest {
    ForkVm constant vm=ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant CONTROLLER=0x23a73971A6B9f6580c048B9CB188869B2A2aA2aD;
    address constant MARKET=0x80CC30811e362aC9aB857C3d7875CbcCc0b65750;
    address constant BORROWER=address(0xCAFE1234);
    function _localTokenBalance(address token,address user,uint256 amount) internal {
        vm.record(); IERC20(token).balanceOf(user);
        (bytes32[] memory reads,)=vm.accesses(token);
        bool found;
        for(uint256 i;i<reads.length;i++){
            bytes32 old=vm.load(token,reads[i]);vm.store(token,reads[i],bytes32(amount));
            if(IERC20(token).balanceOf(user)==amount){found=true;break;}
            vm.store(token,reads[i],old);
        }
        require(found,"cannot seed local fork balance");
    }
    function testRealVenusRepaymentOnLocalFork() public {
        if(!vm.envOr("RUN_VENUS_FORK",false)){vm.skip(true);return;}
        vm.createSelectFork(vm.envOr("BSC_RPC_URL",string("https://bsc-testnet-rpc.publicnode.com")));
        address underlying=ForkMarket(MARKET).underlying();
        _localTokenBalance(underlying,BORROWER,200e6);
        vm.startPrank(BORROWER);
        IERC20(underlying).approve(MARKET,100e6);
        require(ForkMarket(MARKET).mint(100e6)==0,"supply failed");
        address[] memory assets=new address[](1);assets[0]=MARKET;
        require(ForkController(CONTROLLER).enterMarkets(assets)[0]==0,"enter failed");
        require(ForkMarket(MARKET).borrow(50e6)==0,"borrow failed");
        PositionGuardVault vault=new PositionGuardVault(BORROWER,BORROWER,CONTROLLER,MARKET,2.9e18,25e6,block.timestamp+1 days,60);
        IERC20(underlying).approve(address(vault),25e6);vault.fund(25e6);
        (,,uint256 beforeHf)=vault.risk();
        require(beforeHf<2.9e18,"fixture not below trigger");
        uint256 debtBefore=ForkMarket(MARKET).borrowBalanceStored(BORROWER);
        uint256 spent=vault.execute(10e6);
        (,,uint256 afterHf)=vault.risk();
        require(spent==10e6,"unexpected reserve debit");
        require(afterHf>beforeHf,"health did not improve");
        require(ForkMarket(MARKET).borrowBalanceStored(BORROWER)<debtBefore,"debt did not decrease");
        require(IERC20(underlying).allowance(address(vault),MARKET)==0,"allowance remains");
        vm.stopPrank();
    }
}
