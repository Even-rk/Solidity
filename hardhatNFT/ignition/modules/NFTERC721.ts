import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTERC721Module = buildModule("NFTERC721Module", (m) => {
  const nft721 = m.contract("NFTERC721", ["NFTERC721", "NFT"]);
  return { nft721 };
});
export default NFTERC721Module;
