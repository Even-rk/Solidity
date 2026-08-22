import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const NFTAutionModule = buildModule("NFTAutionModule", (m) => {
  const NFTAution = m.contract("NFTAution");

  return { NFTAution };
});
export default NFTAutionModule;
