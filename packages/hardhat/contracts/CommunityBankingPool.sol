// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10 <0.9.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { ERC721Burnable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ISuperfluid, ISuperfluidToken, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { CFAv1Library } from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import { IConstantFlowAgreementV1 } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import { SuperAppBase } from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import { FixedPointMathLib } from "./solmate/utils/FixedPointMathLib.sol";
import { SafeCastLib } from "./solmate/utils/SafeCastLib.sol";
import { Maths } from "./utils/Maths.sol";

contract CommunityBankingPool is ERC721, ERC721Enumerable, ERC721Burnable, Ownable, SuperAppBase {

    using Maths for uint256;
    using FixedPointMathLib for uint256;
    using SafeCastLib for uint256;

    uint256 counter;
    ISuperToken public immutable ASSET;

    constructor(
        ISuperToken _underlying,
        string memory _name,
        string memory _symbol,
        InterestRateModel memory _interestRateModel,
        ISuperfluid _sfHost
    )
        ERC721(_name, _symbol)
    {
        ASSET = _underlying;
        currentInterestRateModel = _interestRateModel;
        SF_HOST = _sfHost;
        // Init the Superfluid helper lib
        cfaV1 = CFAv1Library.InitData(
            _sfHost,
            IConstantFlowAgreementV1(address(_sfHost.getAgreementClass(CFA_ID)))
        );
        // Register Superfluid SuperApp
        _sfHost.registerApp(CONFIG_WORD);
    }

    /*//////////////////////////////////////////////////////////////
                        DEPOSIT/WITHDRAWAL LOGIC
    //////////////////////////////////////////////////////////////*/

    event Deposit(uint256 cfId, CFParams params);
    event Withdraw(uint256 cfId);

    function deposit(uint256 amount) external {
        // Transfer amount to the Pool
        ASSET.transferFrom(msg.sender, address(this), amount);
        // Choose the CF params
        CFParams memory params = CFParams({
            cfType: CFType.LPPosition,
            amount: amount,
            rate: currentInterestRateModel.supplyRate,
            term: 0,
            target: msg.sender
        });
        // Create the CF
        uint256 cfId = createCF(params);

        emit Deposit(cfId, params);
    }

    function withdraw(uint256 cfId) external {
        // Transfer the CF amount to target
        CFParams memory params = cfParams[cfId];
        ASSET.transferFrom(address(this), params.target, params.amount);
        // Delete the CF
        deleteCF(cfId);

        emit Withdraw(cfId);
    }

    /*///////////////////////////////////////////////////////////////
                      BORROW/REPAYMENT INTERFACE
    //////////////////////////////////////////////////////////////*/

    event Borrow(uint256 cfId, CFParams params);
    event Repay(uint256 cfId);

    function borrow(address borrower, uint256 amount) external onlyOwner {
        // Add to the total borrowed amount
        totalInternalDebt += amount;
        // Transfer amount to the borrower
        ASSET.transferFrom(address(this), borrower, amount);
        // Choose the CF params
        CFParams memory params = CFParams({
            cfType: CFType.Loan,
            amount: amount,
            rate: currentInterestRateModel.borrowRate,
            term: currentInterestRateModel.term,
            target: borrower
        });
        // Create the CF
        uint256 cfId = createCF(params);

        emit Borrow(cfId, params);
    }

    function repay(uint256 cfId) external {
        CFParams memory params = cfParams[cfId];
        // Subtract to the total borrowed amount
        totalInternalDebt -= params.amount;
        // Calculate the borrow balance
        uint256 amount = borrowBalance(cfId);
        // Transfer amount from sender to the Pool
        if (amount != 0) ASSET.transferFrom(msg.sender, address(this), amount);
        // Delete the CF
        deleteCF(cfId);

        emit Repay(cfId);
    }

    /*///////////////////////////////////////////////////////////////
                          DEBT ACCOUNTING LOGIC
    //////////////////////////////////////////////////////////////*/

    uint256 totalInternalDebt;

    /// @notice Returns the total amount of underlying tokens being loaned out to borrowers.
    function totalBorrows() public view returns (uint256) {
        return totalInternalDebt;
    }

    /*///////////////////////////////////////////////////////////////
                          CASHFLOW LOGIC
    //////////////////////////////////////////////////////////////*/

    enum CFType {
        LPPosition,
        Loan
    }

        struct CFParams {
        /// @dev The type of Cashflow
        CFType cfType;
        /// @dev The amount of underlying token
        uint256 amount;
        /// @dev The rate per year (as a percentage, and scaled by 1e18)
        uint256 rate;
        /// @dev The cf term in seconds. 0 = no deadline
        uint256 term;
        /// @dev Either the loan or interests target account
        address target;
    }

    uint256 constant SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

    /// @dev Maps CF ids to their parameters
    mapping(uint256 => CFParams) cfParams;

    /// You cannot transfer this Cashflow
    error ForbiddenTransfer();

    /// @dev To create a CF
    function createCF(CFParams memory params) internal returns (uint256 cfId) {
        // Generate a CF id
        cfId = ++counter; // Start at 1 and more gas efficient
        // Mint the CF
        _safeMint(params.target, cfId);
        // Save the CF params
        cfParams[cfId] = params;
        // Create the Superfluid CFA
        if (params.cfType == CFType.LPPosition) {
            // Stream the interests from Pool to CF owner
            // flowRate = amount * supplyRate / SECONDS_PER_YEAR
            uint96 flowRate = (
                params.amount.mulWadDown(params.rate) / SECONDS_PER_YEAR
            ).safeCastTo96();
            cfaV1.createFlow(params.target, ASSET, int96(flowRate));
        } else { // Loan
            // Stream repayment from CF owner to Pool
            // flowRate = amount * (1 + borrowRate) / term
            uint96 flowRate = (
                (params.amount + params.amount.mulWadDown(params.rate)) / params.term
            ).safeCastTo96();
            createFlowByOperator(cfaV1, params.target, address(this), ASSET, int96(flowRate));
        }
    }

    /// @dev To delete a CF
    function deleteCF(uint256 cfId) internal {
        // Get the CF params
        CFParams memory params = cfParams[cfId];
        // Burn the CF
        _burn(cfId);
        // Delete the Superfluid CFA
        if (params.cfType == CFType.LPPosition) {
            cfaV1.deleteFlow(address(this), params.target, ASSET);
        } else { // Loan
            deleteFlowByOperator(cfaV1, params.target, address(this), ASSET);
        }
    }

    function cashflows(address account) external view returns (uint256[] memory cfIds, CFParams[] memory params) {
        // Get the balance of account
        uint256 balance = balanceOf(account);
        cfIds = new uint256[](balance);
        params = new CFParams[](balance);
        // Loop over each of their token
        for (uint256 i; i < balance; ++i) {
            uint256 cfId = tokenOfOwnerByIndex(account, i);
            cfIds[i] = cfId;
            params[i] = cfParams[cfId];
        }
    }

    function borrowBalance(uint256 cfId) public view returns (uint256) {
        CFParams memory params = cfParams[cfId];
        uint256 alreadyRepaidAmount = streamedAmount(params.target, address(this));
        return params.amount.subMin0(alreadyRepaidAmount);
    }

    /*///////////////////////////////////////////////////////////////
                          SUPERFLUID LOGIC
    //////////////////////////////////////////////////////////////*/


    using CFAv1Library for CFAv1Library.InitData;

    bytes32 constant CFA_ID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    uint256 immutable CONFIG_WORD = SuperAppDefinitions.APP_LEVEL_FINAL |
        // change from 'before agreement stuff to after agreement
        SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP |
        SuperAppDefinitions.AFTER_AGREEMENT_UPDATED_NOOP;
    ISuperfluid immutable SF_HOST;
    CFAv1Library.InitData cfaV1;

//    /// @dev Maps loan ids to agreement ids
//    mapping (uint256 => bytes32) agreementIdByLoan;
//
//    modifier onlyHost() {
//        require(
//            msg.sender == address(cfaV1Lib.host),
//            "RedirectAll: support only one host"
//        );
//        _;
//    }
//
//    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
//        require(_isSameToken(superToken), "RedirectAll: not accepted token");
//        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
//        _;
//    }

    function streamedAmount(address sender, address receiver) internal view returns (uint256) {
        (uint256 timestamp, int96 flowRate, ,) = cfaV1.cfa.getFlow(ASSET, sender, receiver);
        return (block.timestamp - timestamp) * uint256(uint96(flowRate));
    }

    /// @dev Missing in the current CFAV1LIB
    /**
     * @dev Creates flow as an operator with userData
     * @param cfaLibrary The cfaLibrary storage variable
     * @param sender The sender of the flow
     * @param receiver The receiver of the flow
     * @param token The token to flow
     * @param flowRate The desired flowRate
     */
    function createFlowByOperator(
        CFAv1Library.InitData storage cfaLibrary,
        address sender,
        address receiver,
        ISuperfluidToken token,
        int96 flowRate
    ) internal returns (bytes memory newCtx) {
        return cfaLibrary.host.callAgreement(
            cfaLibrary.cfa,
            abi.encodeWithSelector(
                cfaLibrary.cfa.createFlowByOperator.selector,
                token,
                sender,
                receiver,
                flowRate,
                new bytes(0) // placeholder
            ),
            new bytes(0) // placeholder
        );
    }

    /// @dev Missing in the current CFAV1LIB
    /**
     * @dev Deletes a flow as an operator with userData
     * @param cfaLibrary The cfaLibrary storage variable
     * @param sender The sender of the flow
     * @param receiver The receiver of the flow
     * @param token The token to flow
     */
    function deleteFlowByOperator(
        CFAv1Library.InitData storage cfaLibrary,
        address sender,
        address receiver,
        ISuperfluidToken token
    ) internal returns (bytes memory newCtx) {
        return cfaLibrary.host.callAgreement(
            cfaLibrary.cfa,
            abi.encodeWithSelector(
                cfaLibrary.cfa.deleteFlowByOperator.selector,
                token,
                sender,
                receiver,
                new bytes(0)
            ),
            new bytes(0)
        );
    }

//   function _isSameToken(ISuperToken superToken) private view returns (bool) {
//       return address(superToken) == address(asset);
//   }

//   function _isCFAv1(address agreementClass) private view returns (bool) {
//       return ISuperAgreement(agreementClass).agreementType() == CFA_ID;
//   }

//   /// @dev Superfluid SuperApp callback
//   function afterAgreementCreated(
//       ISuperToken _superToken,
//       address _agreementClass,
//       bytes32 _agreementId,
//       bytes calldata _agreementData,
//       bytes calldata, //_cbdata
//       bytes calldata _ctx
//   )
//       external
//       override
//       onlyHost
//       onlyExpected(_superToken, _agreementClass)
//       returns (bytes memory newCtx)
//   {
//       ISuperfluid.Context memory decompiledCtx = SF_HOST.decodeCtx(_ctx);

//       // @dev If there is no existing outflow, then create new flow to equal inflow
//       newCtx = cfaV1Lib.createFlowWithCtx(
//           newCtx,
//           _receiver,
//           _acceptedToken,
//           inFlowRate
//       );
//   }

//   /// @dev Superfluid SuperApp callback
//   function afterAgreementTerminated(
//       ISuperToken _superToken,
//       address _agreementClass,
//       bytes32, // _agreementId,
//       bytes calldata, // _agreementData
//       bytes calldata, // _cbdata,
//       bytes calldata _ctx
//   ) external override onlyHost returns (bytes memory newCtx) {
//       // According to the app basic law, we should never revert in a termination callback
//       if (!_isSameToken(_superToken) || !_isCFAv1(_agreementClass))
//           return _ctx;
//       return _updateOutflow(_ctx);
//   }

    /*///////////////////////////////////////////////////////////////
                          IRM CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    struct InterestRateModel {
        /// @dev The supply rate per year (as a percentage, and scaled by 1e18)
        uint256 supplyRate;
        /// @dev The borrow rate per year (as a percentage, and scaled by 1e18)
        uint256 borrowRate;
        /// @dev The loan term in seconds
        uint256 term;
    }

    InterestRateModel currentInterestRateModel;

    /// @notice Emitted when the InterestRateModel is changed.
    /// @param newInterestRateModel The new IRM.
    event InterestRateModelUpdated(InterestRateModel newInterestRateModel);

    /// @notice Sets a new Interest Rate Model.
    /// @param newInterestRateModel The new IRM.
    function setInterestRateModel(InterestRateModel memory newInterestRateModel) external onlyOwner {
        // Update the Interest Rate Model.
        currentInterestRateModel = newInterestRateModel;

        // Emit the event.
        emit InterestRateModelUpdated(newInterestRateModel);
    }

    /// @notice Get the current interest rate model.
    /// @return The borrow rate per block (as a percentage, and scaled by 1e18).
    function getInterestRateModel() external view returns (InterestRateModel memory) {
        return currentInterestRateModel;
    }

    /*//////////////////////////////////////////////////////////////
                            ACCOUNTING LOGIC
    //////////////////////////////////////////////////////////////*/

    function totalAmount() public view returns (uint256) {
        return ASSET.balanceOf(address(this));
    }

    // The following functions are overrides required by Solidity.

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
