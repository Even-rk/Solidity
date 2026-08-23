import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAuctionModule = buildModule("NFTAuctionModule", (m) => {
  const nftAuction = m.contract("NFTAuction");
  return { nftAuction };
});
export default NFTAuctionModule;
