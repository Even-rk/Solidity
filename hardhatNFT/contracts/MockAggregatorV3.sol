// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockAggregatorV3 {
    int256 public price;

    constructor(int256 initialPrice) {
        price = initialPrice;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (uint80(1), price, 0, 0, uint80(1));
    }


    function setPrice(int256 newPrice) external {
        price = newPrice;
    }


    function getPrice() external view returns (int256) {
        return price;
    }
}
