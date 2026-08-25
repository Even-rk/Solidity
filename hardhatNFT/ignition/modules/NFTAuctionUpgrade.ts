import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import NFTAuctionProxyModule from "./NFTAuctionProxy.js";

const NFTAuctionUpgradeModule = buildModule("NFTAuctionUpgradeModule", (m) => {
  // 获取代理合约管理员
  const proxyAdminOwner = m.getAccount(0);

  // 获取代理合约管理员合约和代理合约实例
  const { proxyAdminContract, proxy } = m.useModule(NFTAuctionProxyModule);

  // 部署拍卖合约V2
  const auctionV2 = m.contract("NFTAuctionV2");

  // 升级代理合约实现合约为拍卖合约V2
  m.call(proxyAdminContract, "upgradeAndCall", [proxy, auctionV2, "0x"], {
    from: proxyAdminOwner,
  });

  // 获取拍卖合约V2实例
  const auction = m.contractAt("NFTAuctionV2", proxy, {
    id: "NFTAuctionV2AtProxy",
  });

  return { auction, proxyAdminContract, proxy };
});

export default NFTAuctionUpgradeModule;
