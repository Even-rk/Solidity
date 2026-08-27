import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAuctionUUPS = buildModule("NFTAuctionUUPS", (m) => {
  const nftAuction = m.contract("NFTAuctionUUPS");
  return { nftAuction };
});
export default NFTAuctionUUPS;
