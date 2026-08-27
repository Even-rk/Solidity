import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAuctionUUPSV2 = buildModule("NFTAuctionUUPSV2", (m) => {
  const nftAuction = m.contract("NFTAuctionUUPSV2");
  return { nftAuction };
});
export default NFTAuctionUUPSV2;
