// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {NFTAuction} from "./NFTAuction.sol";



// 继承NFTAuction合约，添加新的功能
contract NFTAuctionV2 is NFTAuction {

    // 重写版本号
    function getVersion() external pure override returns (string memory) {
        return "NFTAuctionV2UUPS";
    }

    // 添加新的功能
    function newFeature() external pure returns (string memory) {
        // 新的功能实现
        return "this is newFeature in NFTAuctionUUPSV2";
    }
}
