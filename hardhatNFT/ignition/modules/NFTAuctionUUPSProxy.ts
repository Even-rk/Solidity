// 从 Hardhat Ignition 导入构建模块的函数
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// 部署 UUPS 版拍卖合约：实现合约 + ERC1967Proxy
// UUPS 模式没有 ProxyAdmin，升级操作由代理合约内部逻辑处理（_authorizeUpgrade 校验 owner）
// 构建 UUPS 代理拍卖模块
const NFTAuctionUUPSProxy = buildModule("NFTAuctionUUPSProxy", (m) => {
  // 获取第一个账户作为合约所有者
  const owner = m.getAccount(0);

  // 部署 NFTAuctionUUPS 实现合约
  const auctionImpl = m.contract("NFTAuctionUUPS");

  // 编码 initialize 函数调用，用于代理部署时初始化
  const encodedFunctionCall = m.encodeFunctionCall(
    // 目标合约是拍卖实现合约
    auctionImpl,
    // 要调用的函数名是 initialize
    "initialize",
    // 传入参数：所有者地址
    [owner],
  );

  // 部署 ERC1967 代理合约
  const proxy = m.contract("ERC1967Proxy", [
    // 代理指向的实现合约地址
    auctionImpl,
    // 初始化函数的编码调用数据
    encodedFunctionCall,
  ]);

  // 将代理地址关联到 NFTAuctionUUPS 合约接口，方便后续交互
  const auction = m.contractAt("NFTAuctionUUPS", proxy, {
    // 指定此绑定的唯一ID
    id: "MetaNFTAuctionUUPSAtProxy",
  });

  // 导出部署好的拍卖合约实例和代理合约实例
  return { auction, proxy };
});

// 构建元数据模块，用于导出最终部署结果
const metaNFTAuctionUUPSModule = buildModule(
  // 指定模块名称为 MetaNFTAuctionUUPSModule
  "NFTAuctionUUPSModule",
  // 模块定义函数
  (m) => {
    // 引用之前构建的 NFTAuctionUUPSProxy 模块，获取部署结果
    const { auction, proxy } = m.useModule(NFTAuctionUUPSProxy);

    // 重新导出拍卖合约和代理合约实例供外部使用
    return { auction, proxy };
  },
);

// 默认导出元数据模块，供 Hardhat Ignition 部署使用
export default metaNFTAuctionUUPSModule;
