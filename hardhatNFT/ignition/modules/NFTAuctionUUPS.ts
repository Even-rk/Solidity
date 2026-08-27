import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAuctionUUPSProxy = buildModule("NFTAuctionUUPSProxy", (m) => {
  const nftAuction = m.contract("NFTAuctionUUPSProxy");
  return { nftAuction };
});
export default NFTAuctionUUPSProxy;
