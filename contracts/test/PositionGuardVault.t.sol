// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {PositionGuardVault} from "../src/PositionGuardVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}
contract MockToken is ERC20 {
    constructor() ERC20("Test USD", "tUSD") {}
    function mint(address to, uint256 value) external { _mint(to, value); }
}
contract MockMarket {
    MockToken public underlying;
    address public comptroller;
    uint256 public collateral = 150e18;
    uint256 public debt = 100e18;
    uint256 public errorCode;
    bool public skipRepay;
    constructor(MockToken t, address c) { underlying = t; comptroller = c; }
    function getAccountSnapshot(address) external view returns(uint256,uint256,uint256,uint256) { return (0,collateral,debt,1e18); }
    function accrueInterest() external pure returns(uint256) { return 0; }
    function repayBorrowBehalf(address, uint256 amount) external returns(uint256) {
        if(errorCode != 0) return errorCode;
        uint256 paid = amount < debt ? amount : debt;
        underlying.transferFrom(msg.sender,address(this),paid);
        if (!skipRepay) debt -= paid;
        return 0;
    }
    function setCollateral(uint256 x) external { collateral = x; }
    function setError(uint256 x) external { errorCode = x; }
    function setSkip(bool x) external { skipRepay = x; }
}
contract MockController {
    address public asset;
    uint256 public price = 1e18;
    function setAsset(address a) external { asset = a; }
    function getAssetsIn(address) external view returns(address[] memory a) { a = new address[](1); a[0] = asset; }
    function markets(address) external pure returns(bool,uint256,uint256) { return (true,0.70e18,0.76e18); }
    function oracle() external view returns(address) { return address(this); }
    function getUnderlyingPrice(address) external view returns(uint256) { return price; }
    function setPrice(uint256 x) external { price = x; }
    function getAccountLiquidity(address user) external view returns(uint256,uint256,uint256) {
        (,uint256 balance,uint256 debt,uint256 exchange)=MockMarket(asset).getAccountSnapshot(user);
        uint256 collateral=(((exchange*price/1e18)*0.76e18/1e18)*balance)/1e18;
        uint256 borrowed=price*debt/1e18;
        return (0,collateral>borrowed?collateral-borrowed:0,borrowed>collateral?borrowed-collateral:0);
    }
}

contract MockMarketplace {
    struct Listing {uint256 erc8004AgentId;address owner;address agentWallet;uint8 category;uint128 priceUsd8PerPeriod;uint32 periodSeconds;bool active;bool curated;string metadataURI;}
    struct Sub {uint256 listingId;address subscriber;address payToken;uint128 deposited;uint128 claimed;uint64 startedAt;uint64 endsAt;bool cancelled;uint16 feeBps;}
    address public owner;
    bool public cancelled;
    constructor(address owner_) {owner=owner_;}
    function getListing(uint256) external view returns(Listing memory) {return Listing(1,owner,owner,3,1000000,3600,true,false,"");}
    function getSub(uint256) external view returns(Sub memory) {return Sub(1,owner,address(0),1e18,0,uint64(block.timestamp-1),uint64(block.timestamp+3600),cancelled,100);}
    function cancel() external {cancelled=true;}
}

contract PositionGuardVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant KEEPER = address(0x1234);
    MockToken token; MockController controller; MockMarket market; PositionGuardVault vault;
    function setUp() public {
        vm.warp(100000);
        token = new MockToken(); controller = new MockController();
        market = new MockMarket(token, address(controller)); controller.setAsset(address(market));
        vault = new PositionGuardVault(address(this),KEEPER,address(controller),address(market),1.20e18,25e18,block.timestamp+7 days,60);
        token.mint(address(this),100e18); token.approve(address(vault),100e18); vault.fund(50e18);
    }
    function testRepaymentImprovesRiskAndClearsAllowance() public {
        (,,uint256 hf) = vault.risk(); require(hf==1.14e18,"liquidation threshold, not borrowing factor");
        vm.prank(KEEPER); vault.execute(24e18);
        (,,uint256 afterHf) = vault.risk(); require(afterHf==1.5e18,"target");
        require(vault.remainingBudget()==26e18,"budget");
        require(token.allowance(address(vault),address(market))==0,"allowance");
    }
    function testRejectsUnauthorizedKeeper() public {
        vm.expectRevert(PositionGuardVault.Forbidden.selector); vm.prank(address(0xBAD)); vault.execute(1e18);
    }
    function testRejectsCapBreach() public {
        vm.expectRevert(PositionGuardVault.InvalidAmount.selector); vault.execute(26e18);
    }
    function testRejectsHealthyPosition() public {
        market.setCollateral(200e18); vm.expectRevert(PositionGuardVault.Inactive.selector); vault.execute(1e18);
    }
    function testPauseAndExpiry() public {
        vault.setPaused(true); vm.expectRevert(PositionGuardVault.Inactive.selector); vault.execute(1e18);
        vault.setPaused(false); vm.warp(vault.expiresAt()); vm.expectRevert(PositionGuardVault.Inactive.selector); vault.execute(1e18);
    }
    function testCooldown() public {
        vault.execute(1e18); vm.expectRevert(PositionGuardVault.Inactive.selector); vault.execute(1e18);
        vm.warp(block.timestamp+60); vault.execute(1e18);
    }
    function testProtocolFailureRollsBack() public {
        market.setError(7); vm.expectRevert(PositionGuardVault.ProtocolFailure.selector); vault.execute(1e18);
        require(vault.remainingBudget()==50e18,"budget changed");
    }
    function testNoImprovementRollsBackTransfer() public {
        market.setSkip(true); vm.expectRevert(PositionGuardVault.NoImprovement.selector); vault.execute(1e18);
        require(token.balanceOf(address(vault))==50e18,"tokens moved");
    }
    function testOwnerCanWithdrawAndRevoke() public {
        vault.withdraw(50e18); require(vault.remainingBudget()==0,"remaining");
        vm.expectRevert(PositionGuardVault.InvalidAmount.selector); vault.execute(1);
    }
    function testKeeperCannotWithdraw() public {
        vm.expectRevert(PositionGuardVault.Forbidden.selector); vm.prank(KEEPER); vault.withdraw(1);
    }
    function testInvalidOracleFailsClosed() public {
        controller.setPrice(0); vm.expectRevert(PositionGuardVault.ProtocolFailure.selector); vault.execute(1);
    }
    function testFuzzBudgetAndCap(uint96 input) public {
        uint256 amount = uint256(input)%(25e18-1e12)+1e12;
        uint256 beforeBudget = vault.remainingBudget();
        vault.execute(amount);
        require(beforeBudget-vault.remainingBudget()==amount,"budget invariant");
        require(vault.remainingBudget()<=50e18,"reserve invariant");
    }
    function testDustWithoutMeasurableImprovementReverts() public {
        vm.expectRevert(PositionGuardVault.NoImprovement.selector); vault.execute(1);
    }
}
