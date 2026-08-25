import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAuctionV2Module = buildModule("NFTAuctionV2Module", (m) => {
  const nftAuction = m.contract("NFTAuctionV2");
  return { nftAuction };
});
export default NFTAuctionV2Module;
4;
