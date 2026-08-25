import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NFTAuctionProxyModule = buildModule("NFTAuctionProxyModule", (m) => {
  // 获取代理合约管理员
  const proxyAdmin = m.getAccount(0);

  // 部署实现合约
  const auctionImpl = m.contract("NFTAuction");

  // 编码初始化函数调用
  const encodedFunctionCall = m.encodeFunctionCall(auctionImpl, "initialize", [
    proxyAdmin,
  ]);

  // 部署代理
  const proxy = m.contract("TransparentUpgradeableProxy", [
    auctionImpl,
    proxyAdmin,
    encodedFunctionCall,
  ]);

  // 读取代理合约管理员地址
  const proxyAdminAddress = m.readEventArgument(
    proxy,
    "AdminChanged",
    "newAdmin",
  );

  // 获取代理合约管理员合约
  const proxyAdminContract = m.contractAt("ProxyAdmin", proxyAdminAddress);

  return { proxyAdminContract, proxy };
});

// 部署拍卖合约
const NFTAuctionModule = buildModule("NFTAuctionModule", (m) => {
  const { proxy, proxyAdminContract } = m.useModule(NFTAuctionProxyModule);

  const auction = m.contractAt("NFTAuction", proxy);

  return { auction, proxy, proxyAdminContract };
});

export default NFTAuctionModule;
