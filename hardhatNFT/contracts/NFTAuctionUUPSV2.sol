// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {NFTAuctionUUPS} from "./NFTAuctionUUPS.sol";



// 继承NFTAuctionUUPS合约，添加新的功能（UUPS升级版本V2）
contract NFTAuctionUUPSV2 is NFTAuctionUUPS {

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
