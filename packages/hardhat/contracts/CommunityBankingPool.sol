// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20 } from "./solmate/tokens/ERC20.sol";
import { ERC4626 } from "./solmate/mixins/ERC4626.sol";

contract CommunityBankingPool is ERC4626, Ownable {

    uint256 totalInternalDebt;

    mapping (address => uint256) internalDebt; // account => debt

    constructor(
        ERC20 _underlying,
        string memory _name,
        string memory _symbol
    ) ERC4626(_underlying, _name, _symbol) {}

    /*///////////////////////////////////////////////////////////////
                      BORROW/REPAYMENT INTERFACE
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after a successful borrow.
    /// @param from The address that triggered the borrow.
    /// @param amount The amount being borrowed.
    event Borrow(address indexed from, uint256 amount);

    /// @notice Borrow underlying tokens from the Fuse Pool.
    /// @dev Must only be called by a trusted party
    /// @param amount The amount to borrow.
    function borrow(address from, uint256 amount) external onlyOwner returns (bool) {
        // Update the internal borrow balance of the borrower.
        // Cannot overflow because the sum of all user
        // balances won't be greater than type(uint256).max
        unchecked {
            internalDebt[from] += amount;
        }

        // Add to the total internal debt.
        totalInternalDebt += amount;

        // Transfer tokens to the borrower.
        asset.transfer(from, amount);

        // Emit the event.
        emit Borrow(from, amount);

        return true;
    }

    /*//////////////////////////////////////////////////////////////
                            ACCOUNTING LOGIC
    //////////////////////////////////////////////////////////////*/

    function totalAssets() public view virtual override returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /*///////////////////////////////////////////////////////////////
                        INTEREST ACCRUAL LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the total amount of underlying tokens being loaned out to borrowers.
    function totalBorrows() public view returns (uint256) {
        return totalInternalDebt;
    }
}
