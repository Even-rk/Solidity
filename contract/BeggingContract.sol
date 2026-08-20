// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BeggingContract {
    // 地址
    address owner;
    // 捐赠记录
    mapping(address => uint256) donations;

    // 初始化地址
    constructor() {
        owner = msg.sender;
    }

    // 仅允许所有者调用
    modifier onlyOwner() {
        require(msg.sender == owner,"Not owner");
        _;
    }

    // 接受捐赠并记录
    function donate() external payable {
        require(msg.value > 0, "Donation must be greater than 0");
        donations[msg.sender] += msg.value;
    }

    // 所有者提取所有资金
    function withdraw() external onlyOwner {
        // 判断是否有资金
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        // 提取资金
        (bool success, ) = payable(msg.sender).call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    // 查询某个地址的捐赠金额
    function getDonation(address _addr) external view returns (uint256) {
        return donations[_addr];
    }
}
