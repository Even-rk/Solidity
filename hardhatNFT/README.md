# NFT 拍卖市场 - Hardhat 项目

本项目是一个基于 Solidity 的 NFT 拍卖市场智能合约，支持使用 ETH 进行拍卖出价，集成了 Chainlink 价格预言机实现 USD 价格兑换。

## 项目概述

本项目基于 Hardhat 3 开发，使用 `mocha` + `ethers` 进行测试和交互。包含：

- **NFTAuction**: NFT 拍卖主合约，支持创建拍卖、出价、结束拍卖全流程
- **NFTERC721**: 基础 ERC721 NFT 合约，用于 mint 测试 NFT
- **NFTAuctionUUPS**: 支持 UUPS 代理升级的拍卖合约版本
- **TypeScript 交互脚本**: 完整演示拍卖流程
- 集成 Chainlink Price Feed 实现 ETH/USD 价格兑换

## 核心功能

### 合约功能

1. **创建拍卖**

   - 仅管理员可以创建拍卖
   - 支持自定义起拍价（USD）、拍卖持续时间
   - 支持 ETH 或 ERC20 支付
   - 自动转移 NFT 到拍卖合约

2. **出价**

   - 任何人都可以出价
   - 自动验证出价金额高于当前最高出价
   - 自动退还之前最高出价者的资金
   - 支持事件监听

3. **结束拍卖**

   - 拍卖时间到后任何人都可以结束
   - 自动将 NFT 转给最高出价者
   - 自动将资金转给卖家
   - 触发拍卖结束事件

4. **价格预言机**
   - 集成 Chainlink Price Feed
   - 支持 USD 计价，自动兑换为对应 ETH 金额
   - 可添加多个代币价格预言机

### 项目结构

```
contracts/          # Solidity 合约源码
scripts/            # TypeScript 交互脚本
test/               # 测试文件
ignition/           # Hardhat Ignition 部署模块
hardhat.config.ts   # Hardhat 配置文件
```

## 环境配置

1. 安装依赖

```shell
npm install
```

2. 配置环境变量

设置 Sepolia 测试网账户私钥：

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

或者在 `.env` 文件中设置：

```
SEPOLIA_PRIVATE_KEY=你的私钥
```

确保你的 Sepolia 账户有足够的 ETH 用于支付 Gas。

## 部署合约

使用 Hardhat Ignition 部署到 Sepolia:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/NFTAuction.ts
```

部署完成后，更新 `scripts/NFTAuction.ts` 中的合约地址：

- `NFTAUCTION_ADDRESS`: NFTAuction 代理地址
- `NFT_CONTRACT_ADDRESS`: NFTERC721 地址

## 运行交互演示

部署完成后，可以运行交互脚本演示完整拍卖流程：

```shell
npx hardhat run scripts/NFTAuction.ts --network sepolia
```

脚本会自动执行以下步骤：

1. **读取合约数据**: 验证管理员权限，读取当前拍卖计数器
2. **设置价格预言机**: 如果未设置，自动设置 Sepolia 测试网的 ETH/USD 预言机地址
3. **准备 NFT**: 自动检查当前账户是否有可用 NFT，如果没有自动 mint 新的
4. **授权**: 授权拍卖合约转移 NFT
5. **创建拍卖**: 创建一个 20 USD 起拍，持续 2 分钟的拍卖
6. **出价**: 发送 25 USD 对应金额的 ETH 出价
7. **监听事件**: 监听合约事件并打印详细信息
8. **等待结束**: 等待 2 分钟后自动结束拍卖
9. **完成**: 打印最终状态并退出

## 事件监听

脚本监听了三个合约事件，并打印详细信息：

- `AuctionCreated`: 拍卖创建时触发，输出拍卖 ID、NFT 信息、起拍价、结束时间
- `BidPlaced`: 新出价时触发，输出拍卖 ID、出价者、出价金额
- `AuctionEnded`: 拍卖结束时触发，输出拍卖 ID、获胜者、最终成交价

## 测试

运行所有测试：

```shell
npx hardhat test
```

只运行 Solidity 测试：

```shell
npx hardhat test solidity
```

只运行 TypeScript 测试：

```shell
npx hardhat test mocha
```

## 合约地址 (Sepolia 测试网)

- NFTAuction: `0xF1b4D4dC5dF2f54396B8A63Fbf68A60CE867f34c`
- NFTERC721: `0x086310121A4da389f8742B50C47AFA30E5Fce542`

## 相关链接

- [Hardhat 3 文档](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3)
- [Chainlink Price Feed 文档](https://docs.chainlink/datafeeds/)
- [OpenZeppelin 合约库](https://docs.openzeppelin.com/contracts/)
