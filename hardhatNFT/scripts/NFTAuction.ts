import { network } from "hardhat";

const { ethers } = await network.create();
// NFTAuction 代理地址
const NFTAUCTION_ADDRESS = "0xF1b4D4dC5dF2f54396B8A63Fbf68A60CE867f34c";
// nft 合约地址
const NFT_CONTRACT_ADDRESS = "0x086310121A4da389f8742B50C47AFA30E5Fce542";

async function main() {
  // 获取当前交互账户
  console.log("=== 开始 NFTAuction 合约交互演示 ===\n");
  const [signer] = await ethers.getSigners();
  console.log("当前交互账户:", signer.address);
  console.log(
    "当前账户 ETH 余额:",
    ethers.formatEther(await signer.provider.getBalance(signer.address)),
    "ETH\n",
  );

  // 链接到已经部署的合约
  const nftAuction = await ethers.getContractAt(
    "NFTAuction",
    NFTAUCTION_ADDRESS,
    signer,
  );
  console.log("已连接到 NFTAuction 合约:", NFTAUCTION_ADDRESS);

  // 监听合约事件
  console.log("\n=== 事件监听 ===");
  // 创建拍卖
  nftAuction.on(nftAuction.filters.AuctionCreated(), (...args) => {
    console.log("AuctionCreated 事件触发:", args);
  });
  // 出价
  nftAuction.on(nftAuction.filters.BidPlaced(), (...args) => {
    console.log("BidPlaced 事件触发:", args);
  });
  // 结束拍卖
  nftAuction.on(nftAuction.filters.AuctionEnded(), (...args) => {
    console.log("AuctionEnded 事件触发:", args);
  });
  console.log("✓ 事件监听器已启动");

  // 读取合约数据
  console.log("\n=== 读取合约数据 ===");

  // 读取合约管理员
  const admin = await nftAuction.admin();
  console.log("合约管理员:", admin);
  console.log(
    "当前账户是否是管理员:",
    admin.toLowerCase() === signer.address.toLowerCase() ? "是" : "否",
  );

  // 读取当前拍卖ID计数器
  const auctionIdCounter = await nftAuction._auctionId();
  console.log("当前拍卖ID计数器:", auctionIdCounter.toString());

  // 设置 ETH 预言机地址
  console.log("\n=== 设置 ETH 预言机地址 ===");

  // Sepolia 测试网 ETH/USD 预言机地址 (Chainlink)
  const ETH_USD_PRICE = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  // 检查是否已经设置
  const existingOracle = await nftAuction.tokenToOracle(ethers.ZeroAddress);
  console.log("当前 ETH 预言机地址:", existingOracle);

  if (existingOracle === ethers.ZeroAddress) {
    console.log("正在设置 ETH 预言机...");
    const setTx = await nftAuction.setTokenToFeed(
      ethers.ZeroAddress,
      ETH_USD_PRICE,
    );
    await setTx.wait();
    console.log("✓ ETH 预言机设置完成");
  } else {
    console.log("✓ ETH 预言机已设置，跳过");
  }

  // 创建拍卖
  console.log("\n=== 创建拍卖交易 ===");

  // 连接到我们的 NFT 合约
  const nftContract = await ethers.getContractAt(
    "NFTERC721",
    NFT_CONTRACT_ADDRESS,
    signer,
  );

  // 检查 tokenId 从 0 开始，因为 _nextTokenId 初始是 0
  // 检查你是否拥有 tokenId = 0 的 NFT（第一个 mint 出来的 NFT 是 tokenId 0
  let tokenIdToUse = 0n;
  const owner = await nftContract.ownerOf(0n).catch(() => null);
  if (
    !owner ||
    (owner.toLowerCase() !== signer.address.toLowerCase() &&
      owner.toLowerCase() !== NFTAUCTION_ADDRESS.toLowerCase())
  ) {
    console.log("当前账户没有可用的 NFT，正在自动 mint 新的...");
    // mint 新的 NFT 到当前账户，mint 函数直接返回新 tokenId
    const mintTx = await nftContract.mint(signer.address);
    const receipt = await mintTx.wait();
    // 从交易日志中获取 mint 返回的 tokenId
    const iface = nftContract.interface;
    for (const log of receipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog && parsedLog.name === "Transfer") {
          // Transfer 事件的第三个参数就是 tokenId
          tokenIdToUse = parsedLog.args.tokenId;
          break;
        }
      } catch {}
    }
    console.log(`✓ 已 mint 新的 NFT 到当前账户，tokenId = ${tokenIdToUse}`);
  } else if (owner.toLowerCase() === NFTAUCTION_ADDRESS.toLowerCase()) {
    console.log(`tokenId = 0 已经在拍卖合约中，需要 mint 新的 NFT...`);
    // mint 新的 NFT 到当前账户，mint 函数直接返回新 tokenId
    const mintTx = await nftContract.mint(signer.address);
    const receipt = await mintTx.wait();
    // 从交易日志中获取 mint 返回的 tokenId
    const iface = nftContract.interface;
    for (const log of receipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog && parsedLog.name === "Transfer") {
          // Transfer 事件的第三个参数就是 tokenId
          tokenIdToUse = parsedLog.args.tokenId;
          break;
        }
      } catch {}
    }
    console.log(`✓ 已 mint 新的 NFT 到当前账户，tokenId = ${tokenIdToUse}`);
  } else {
    console.log("✓ 当前账户拥有 tokenId = 0 的 NFT");
    tokenIdToUse = 0n;
  }

  // 授权拍卖合约转移你的 NFT
  const isApproved = await nftContract.isApprovedForAll(
    signer.address,
    NFTAUCTION_ADDRESS,
  );
  // 判断是否已授权
  if (!isApproved) {
    console.log("正在授权拍卖合约转移 NFT...");
    const approveTx = await nftContract.setApprovalForAll(
      NFTAUCTION_ADDRESS,
      true,
    );
    await approveTx.wait();
    console.log("✓ 授权完成，拍卖合约现在可以转移你的 NFT");
  } else {
    console.log("✓ 已授权，跳过");
  }

  // 创建拍卖
  const createTx = await nftAuction.createAuction(
    NFT_CONTRACT_ADDRESS, // NFT 合约地址
    tokenIdToUse, // NFT token ID (动态获取可用的)
    20, // 起拍价 20 USD
    120, // 持续时间 2 分钟
    signer.address, // 卖家地址（当前账户）
    ethers.ZeroAddress, // 使用 ETH 支付
  );

  console.log("创建拍卖交易已发送，哈希:", createTx.hash);
  // 等待交易被区块确认
  const createReceipt = await createTx.wait();
  console.log("交易已确认，区块号:", createReceipt.blockNumber);

  // 解析交易事件
  const event = createReceipt.logs
    .map((log) => {
      try {
        return nftAuction.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "AuctionCreated");

  // 从事件中直接获取拍卖ID
  let auctionId;
  if (event) {
    auctionId = event.args.auctionId;
    console.log("✓ 拍卖创建成功，拍卖ID:", auctionId.toString());
  } else {
    // 如果没找到事件，回退到从计数器读取
    const currentAuctionIdCounter = await nftAuction._auctionId();
    auctionId = currentAuctionIdCounter - 1n;
    console.log("✓ 拍卖创建成功，拍卖ID:", auctionId.toString());
  }

  // 出价
  console.log("\n=== 出价 ===");
  const bidUSD = 25; // 出价 25 USD
  const bidAmountWei = ethers.parseEther("0.015"); // 0.015 ETH ≈ 30 USD，足够支付 25 USD

  console.log(
    `出价 ${bidUSD} USD，发送 ${ethers.formatEther(bidAmountWei)} ETH`,
  );

  // 发送出价交易(ETH 支付)
  const bidTx = await nftAuction.bid(
    auctionId,
    bidAmountWei, // 出价金额（ETH 的 wei 单位）
    ethers.ZeroAddress, // ETH 支付
    { value: bidAmountWei }, // 这里发送 ETH！这很重要！
  );

  console.log("出价交易已发送，哈希:", bidTx.hash);
  await bidTx.wait();
  console.log("✓ 出价成功！");
  // 再次读取拍卖信息，看看最高出价是否更新
  const updatedAuction = await nftAuction.auctions(auctionId);
  console.log(
    "更新后的最高出价:",
    ethers.formatUnits(updatedAuction.highestBid, 8),
    "USD",
  );
  console.log("最高出价者:", updatedAuction.highestBidder);

  // 结束拍卖 - 等待自动结束拍卖
  console.log("等待自动结束拍卖...");
  await new Promise((resolve) => {
    setTimeout(async () => {
      await nftAuction.endAuction(auctionId);
      console.log("✓ 拍卖已结束");
      resolve(null);
    }, 140000); // 等待 2 分钟以上
  });

  console.log("当前拍卖数量:", (await nftAuction._auctionId()).toString());
}

// ======================================
// 错误处理
// ======================================
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 错误:", error);
    process.exit(1);
  });
