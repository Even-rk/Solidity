// 从 Hardhat Ignition 导入构建模块的函数
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// 导入之前部署的代理模块，获取已部署的代理实例
import NFTAuctionUUPSProxy from "./NFTAuctionUUPSProxy.js";

// UUPS 升级：直接调用代理上的 upgradeToAndCall（由合约内部 _authorizeUpgrade 校验 owner）
// 构建 UUPS 升级模块，用于将合约升级到 V2 版本
const NFTAuctionUUPSUpgrade = buildModule("NFTAuctionUUPSUpgrade", (m) => {
  // 获取第一个账户作为部署者和所有者
  const owner = m.getAccount(0);

  // 引用代理模块，获取已部署的拍卖合约实例和代理合约实例
  const { auction, proxy } = m.useModule(NFTAuctionUUPSProxy);

  // 部署新版本的实现合约 NFTAuctionUUPSV2
  const auctionV2 = m.contract("NFTAuctionUUPSV2");

  // UUPS 升级交易发给代理地址本身，不需要 ProxyAdmin
  // 通过代理调用 upgradeToAndCall 函数完成升级
  m.call(auction, "upgradeToAndCall", [auctionV2, "0x"], {
    // 由所有者发起升级交易
    from: owner,
  });

  // 将代理地址关联到新版本合约接口 NFTAuctionUUPSV2，方便后续交互
  const upgradedAuction = m.contractAt("NFTAuctionUUPSV2", proxy, {
    // 指定此绑定的唯一ID
    id: "NFTAuctionUUPSV2AtProxy",
  });

  // 导出升级后的合约实例和代理合约实例
  return { upgradedAuction, proxy };
});

// 默认导出升级模块，供 Hardhat Ignition 执行升级使用
export default NFTAuctionUUPSUpgrade;
