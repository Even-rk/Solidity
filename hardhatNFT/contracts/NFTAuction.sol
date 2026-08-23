// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";


// NFT拍卖市场合约，支持ETH出价的基本拍卖功能
contract NFTAuction is Initializable {
    // 合约所有者
    address public owner;
    // 代币地址 => 预言机地址
    mapping(address => address) public tokenToOracle;
    // 拍卖结构体
    struct Auction {
        address nftContract;              // NFT 合约地址
        uint256 nftTokenId;               // NFT token ID
        address payable seller;           // 卖家地址
        uint256 startingPrice;            // 起拍价 (美元)
        address paymentToken;             // 支付代币地址 （默认ETH），可支持其他EFT支付
        uint256 startTime;                // 拍卖开始时间
        uint256 duration;                 // 拍卖持续时间
        address highestBidder;            // 最高出价者地址
        uint256 highestBid;               // 最高出价者出价金额
        address highestPaymentToken;      // 最高出价支付代币地址 （默认ETH），可支持其他EFT支付
    }
    // 拍卖ID => 拍卖信息
    mapping(uint256 => Auction) public auctions;
    // 下一个拍卖id计数器
    uint256 private _nextAuctionId = 0;
    // 拍卖创建，记录拍卖id、NFT合约地址、NFT token ID、卖家地址、起拍价、结束时间
    event AuctionCreated(uint256 indexed auctionId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 startingPrice, uint256 endTime);
    // 出价，记录拍卖id、出价者地址、出价金额
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    // 拍卖结束，记录拍卖id、最高出价者地址、最高出价金额
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 amount);

    // 初始化
    constructor() {
        // 禁用初始化器，防止重复初始化
        _disableInitializers();
        // 初始化合约所有者为部署者
        owner = msg.sender;
    }

    // 仅合约所有者才能调用
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // 设置代币预言机地址
    function setTokenToFeed(address token, address feed) external onlyOwner {
        tokenToOracle[token] = feed;
    }

    // 预言机获取当前价格
    function getChainlinkDataFeedLatestAnswer(address token) public view returns (int256) {
        AggregatorV3Interface dataFeed;
        // 从映射中获取代币的预言机地址
        address oracle = tokenToOracle[token];
        // 验证预言机地址是否有效
        require(oracle != address(0), "oracle must be set");
        // 转换为 AggregatorV3Interface 接口
        dataFeed = AggregatorV3Interface(oracle);
        // prettier-ignore
        (
        /* uint80 roundId */
        ,
        int256 answer,
        /*uint256 startedAt*/
        ,
        /*uint256 updatedAt*/
        ,
        /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        return answer;
    }

    // 转化为美元
    function convertToUSD(uint256 price, uint256 amount, uint256 decimalsPrice) public pure returns (uint256) {
        return  amount * price / 10**decimalsPrice;
    }

    // 拍卖是否结束
    function isAuctionEnded(uint256 _auctionId) public view returns (bool) {
        return block.timestamp >= auctions[_auctionId].startTime + auctions[_auctionId].duration;
    }

    // 创建拍卖
    function crreateAuction(
        address nftContract,        // NFT 合约地址
        uint256 nftTokenId,         // NFT token ID
        uint256 startingPrice,      // 起拍价
        uint256 duration,           // 拍卖持续时间
        address seller,             // 卖家地址
        address paymentToken        // 支付代币地址
    ) external onlyOwner {
        // NFT 合约地址必须是 ERC721 合约地址
        require(ERC721(nftContract).ownerOf(nftTokenId) == seller, "seller must be owner owner of nft");
        // 拍卖持续时间必须大于60秒
        require(duration > 60, "duration must be greater than 60");
        // 起拍价必须大于0
        require(startingPrice > 0, "startingPrice must be greater than 0");
        // 判断paymentToken是否是0地址
        if (paymentToken != address(0)) {
            // 如果是非0地址，验证是否是 ERC20 
            require(ERC20(paymentToken).totalSupply() > 0, "paymentToken must be ERC20");
        }
        // 存储拍卖信息
        auctions[_nextAuctionId] = Auction(
            nftContract,                 // NFT 合约地址
            nftTokenId,                  // NFT token ID
            payable(seller),             // 卖家地址
            startingPrice * 10 ** 8,     // 起拍价 (美元)，*10**8 为了和预言机同步
            paymentToken,                // 支付代币地址
            block.timestamp,             // 拍卖开始时间
            duration,                    // 拍卖持续时间
            address(0),                  // 最高出价者地址
            0,                           // 最高出价者出价金额
            address(0)                   // 最高出价支付代币地址
        );
        // 发送拍卖创建事件
        emit AuctionCreated(_nextAuctionId, nftContract, nftTokenId, seller, startingPrice, block.timestamp + duration);
        // 拍卖ID计数器
        _nextAuctionId++;
    }


    // 出价
    function bid(uint256 _auctionId, uint256 amount, address paymentToken) external payable {
        // 最终出价的美元金额
        uint256 amountUSD;
        // 拍卖ID必须存在
        require(auctions[_auctionId].nftContract != address(0), "auctionId must exist");
        // 拍卖必须未结束
        require(!isAuctionEnded(_auctionId), "auction must not be ended");
        // 判断paymentToken是否是0地址，0表示是ETH支付
        bool isETH = paymentToken == address(0);
        if (isETH) { // ETH支付
            // 获取ETH价格
            int256 ethPrice = getChainlinkDataFeedLatestAnswer(paymentToken);
            // 计算出价金额
            amountUSD = uint256(amount) * uint256(ethPrice) / 10**18;
        }
        else {
           // 如果是非0地址，验证是否是 ERC20 
            require(ERC20(paymentToken).totalSupply() > 0, "paymentToken must be ERC20");
            // 获取代币价格
            int256 tokenPrice = getChainlinkDataFeedLatestAnswer(paymentToken);
            // 获取 decimals 位数
            uint8 decimalsPrice = ERC20(paymentToken).decimals();
            // 计算出价金额
            amountUSD = convertToUSD(uint256(tokenPrice), uint256(amount), decimalsPrice);
        }
        // 验证出价金额是否大于等于起拍价
        require(amountUSD >= auctions[_auctionId].startingPrice, "amount must be greater than startingPrice");
        // 验证出价金额是否大于最高出价者
        require(amountUSD > auctions[_auctionId].highestBid, "amount must be greater than highestBid");
        // 退还原最高出价者出价金额
        if (auctions[_auctionId].highestPaymentToken != address(0)) {
            ERC20(auctions[_auctionId].highestPaymentToken).transfer(auctions[_auctionId].highestBidder, auctions[_auctionId].highestBid);
        }
        else {
            (bool success, ) = payable(auctions[_auctionId].highestBidder).call{value: auctions[_auctionId].highestBid}("");
            require(success, "ETH transfer failed");
        }
        // 更新拍卖信息
        auctions[_auctionId].highestBidder = msg.sender;
        auctions[_auctionId].highestBid = amountUSD;
        auctions[_auctionId].highestPaymentToken = paymentToken;
        // 发送出价事件
        emit BidPlaced(_auctionId, msg.sender, amountUSD);
    }


    // 结束拍卖
    function endAuction(uint256 _auctionId) external {
        // 拍卖ID必须存在
        require(auctions[_auctionId].nftContract != address(0), "auctionId must exist");
        // 拍卖必须已结束
        require(isAuctionEnded(_auctionId), "auction must be ended");

        // 检查是否有出价者
        bool hasBidder = auctions[_auctionId].highestBidder != address(0);
        if (!hasBidder) {
            // 没有出价者，退还 NFT 给卖家
            ERC721(auctions[_auctionId].nftContract).transferFrom(auctions[_auctionId].seller, auctions[_auctionId].seller, auctions[_auctionId].nftTokenId);
        } else {
            // NFT转给买家
            ERC721(auctions[_auctionId].nftContract).transferFrom(auctions[_auctionId].seller, auctions[_auctionId].highestBidder, auctions[_auctionId].nftTokenId);

            // 最高出价者的资金转给卖家
            if (auctions[_auctionId].highestPaymentToken != address(0)) {
                ERC20(auctions[_auctionId].highestPaymentToken).transfer(auctions[_auctionId].seller, auctions[_auctionId].highestBid);
            }
            else {
                (bool success, ) = payable(auctions[_auctionId].seller).call{value: auctions[_auctionId].highestBid}("");
                require(success, "ETH transfer failed");
            }
        }

        // 发送拍卖结束事件
        emit AuctionEnded(_auctionId, auctions[_auctionId].highestBidder, auctions[_auctionId].highestBid);

    }
}