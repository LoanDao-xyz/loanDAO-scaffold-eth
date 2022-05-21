// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10 <0.9.0;

library Maths {

    function subMin0(uint256 x, uint256 y) internal pure returns (uint256) {
        return x > y ? x - y : 0;
    }
}
