// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTERC721 is ERC721 {
    // 下一个要铸造的 tokenId
    uint256 private _nextTokenId;

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}   

    // 构建
    function mint(address to) public returns (uint256) {
        _mint(to, _nextTokenId);
        _nextTokenId++;
        return _nextTokenId - 1;
    }

    // burn
    function burn(uint256 tokenId) external {
        require(msg.sender == ownerOf(tokenId), "not owner");
        _burn(tokenId);
    }
}
