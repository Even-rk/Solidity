import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "ethers";

describe("NFTAuction", function () {
  let auction: any;
  let auctionV2: any;
  let nft: any;
  let usdc: any;
  let ethOracle: any;
  let usdcOracle: any;

  let admin: any;
  let seller: any;
  let bidder1: any;
  let bidder2: any;
  let networkConnection: any;

  beforeEach(async function () {
    networkConnection = await hre.network.create();
    const signers = await networkConnection.ethers.getSigners();
    [admin, seller, bidder1, bidder2] = signers;

    const NFTAuctionFactory = await networkConnection.ethers.getContractFactory(
      "NFTAuction",
    );
    const NFTERC721Factory = await networkConnection.ethers.getContractFactory(
      "NFTERC721",
    );
    const MockERC20Factory = await networkConnection.ethers.getContractFactory(
      "MockERC20",
    );
    const MockAggregatorV3Factory =
      await networkConnection.ethers.getContractFactory("MockAggregatorV3");

    // 获取 ERC1967Proxy factory
    const ERC1967ProxyFactory =
      await networkConnection.ethers.getContractFactory(
        "MyERC1967Proxy",
        admin,
      );

    // 部署逻辑合约
    const impl = await NFTAuctionFactory.deploy();
    await impl.waitForDeployment();

    // 部署代理
    nft = await NFTERC721Factory.deploy("MyNFT", "MNFT");
    await nft.waitForDeployment();
    usdc = await MockERC20Factory.deploy(
      "USDC",
      "USDC",
      6,
      ethers.parseUnits("1000000", 6),
    );
    await usdc.waitForDeployment();
    // ETH price: $3000, 8 decimals
    ethOracle = await MockAggregatorV3Factory.deploy(300000000000n);
    await ethOracle.waitForDeployment();
    // USDC price: $1, 8 decimals
    usdcOracle = await MockAggregatorV3Factory.deploy(100000000n);
    await usdcOracle.waitForDeployment();

    // 通过代理部署
    const initData = impl.interface.encodeFunctionData("initialize", [
      admin.address,
    ]);
    const proxy = await ERC1967ProxyFactory.deploy(
      await impl.getAddress(),
      initData,
    );
    await proxy.waitForDeployment();

    // Attach to proxy with correct ABI - factory already has the ABI
    auction = NFTAuctionFactory.attach(await proxy.getAddress());
    auction = auction.connect(admin);

    // mint NFT 给卖家并授权
    await nft.connect(admin).mint(seller.address);
    await nft.connect(admin).mint(seller.address);
    await nft.connect(admin).mint(seller.address);
    await nft
      .connect(seller)
      .setApprovalForAll(await auction.getAddress(), true);

    // 设置代币预言机 - 修复：函数名是 setTokenToFeed，不是 setTokenOracle
    await auction.setTokenToFeed(
      ethers.ZeroAddress,
      await ethOracle.getAddress(),
    );
    await auction.setTokenToFeed(
      await usdc.getAddress(),
      await usdcOracle.getAddress(),
    );

    // 给 bidder 分发 USDC
    await usdc
      .connect(admin)
      .transfer(bidder1.address, ethers.parseUnits("10000", 6));
    await usdc
      .connect(admin)
      .transfer(bidder2.address, ethers.parseUnits("10000", 6));
    await usdc
      .connect(bidder1)
      .approve(await auction.getAddress(), ethers.MaxUint256);
    await usdc
      .connect(bidder2)
      .approve(await auction.getAddress(), ethers.MaxUint256);
  });

  describe("getVersion", function () {
    it("should return NFTAuctionV1", async function () {
      expect(await auction.getVersion()).to.equal("NFTAuctionV1");
    });
  });

  describe("getChainlinkDataFeedLatestAnswer", function () {
    it("should return correct prices", async function () {
      const ethPrice = await auction.getChainlinkDataFeedLatestAnswer(
        ethers.ZeroAddress,
      );
      const usdcPrice = await auction.getChainlinkDataFeedLatestAnswer(
        await usdc.getAddress(),
      );

      expect(ethPrice).to.equal(300000000000n);
      expect(usdcPrice).to.equal(100000000n);
    });
  });

  describe("convertToUSD", function () {
    it("should convert correctly to USD", async function () {
      // 1 ETH * 3000 = 3000 * 1e18 USD (wei representation)
      const ethAmount = ethers.parseEther("1");
      const ethPrice = await ethOracle.getPrice();
      const usdAmount = await auction.convertToUSD(
        BigInt(Number(ethPrice)),
        ethAmount,
        8,
      );
      // formula: (1e18 * 3000e8) / 1e8 = 3000 * 1e18
      expect(usdAmount).to.equal(3000n * 10n ** 18n);
    });
  });

  describe("convertUSDToAmount", function () {
    it("should convert correctly from USD", async function () {
      // 3000 USD => 1 ETH
      // ethPrice 是 3000 * 1e8 (8 decimals), 3000 USD = 3000 * 1e8
      // formula: (3000 * 1e8) * 1e18 / (3000 * 1e8) = 1e18 = 1 ETH
      const ethPrice = await ethOracle.getPrice();
      const amount = await auction.convertUSDToAmount(
        BigInt(Number(ethPrice)),
        3000n * 10n ** 8n,
        18,
      );
      expect(amount).to.equal(ethers.parseEther("1"));
    });
  });

  describe("initialize", function () {
    it("should fail when initialized twice", async function () {
      const auctionWithAdmin = auction.connect(admin);
      await expect(
        auctionWithAdmin.initialize(admin.address),
      ).to.be.revertedWithCustomError(auction, "InvalidInitialization");
    });
  });

  describe("setTokenToFeed", function () {
    it("should fail when not called by admin", async function () {
      const newOracle = await (
        await networkConnection.ethers.getContractFactory("MockAggregatorV3")
      ).deploy(200000000000n);
      const auctionWithSeller = auction.connect(seller);
      await expect(
        auctionWithSeller.setTokenToFeed(
          ethers.ZeroAddress,
          await newOracle.getAddress(),
        ),
      ).to.be.revertedWith("not admin");
    });
  });

  describe("createAuction", function () {
    it("should increment auctionId correctly", async function () {
      // 获取初始 auctionId
      const auctionsCountBefore = await auction._nextAuctionId();
      // 修复：createAuction 需要 seller 参数，startingPrice 单位是 USD，合约会自动 * 1e8
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          1,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );
      const auctionsCountAfter = await auction._nextAuctionId();
      expect(auctionsCountAfter).to.equal(auctionsCountBefore + 1n);
    });
  });

  describe("bid", function () {
    it("should fail when auction has ended", async function () {
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        1,
        1000,
        61, // 修复：需要 > 60
        seller.address,
        await usdc.getAddress(),
      );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;
      const auc = await auction.auctions(currentAuctionId);
      const auctionEndTime = Number(auc.startTime) + Number(auc.duration);

      await networkConnection.ethers.provider.send(
        "evm_setNextBlockTimestamp",
        [auctionEndTime],
      );
      await networkConnection.ethers.provider.send("evm_mine");

      const auctionWithBidder1 = auction.connect(bidder1);
      // 修复：传入实际代币金额（USDC 6 decimals），1001 USD = 1001 * 1e6
      await expect(
        auctionWithBidder1.bid(
          currentAuctionId,
          1001n * 10n ** 6n,
          await usdc.getAddress(),
        ),
      ).to.be.revertedWith("auction must not be ended");
    });

    it("should fail when bid is lower than highest bid", async function () {
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          1,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;

      const auctionWithBidder1 = auction.connect(bidder1);
      // 1500 USD => 1500 * 1e6 USDC
      await auctionWithBidder1.bid(
        currentAuctionId,
        1500n * 10n ** 6n,
        await usdc.getAddress(),
      );

      const auctionWithBidder2 = auction.connect(bidder2);
      // 1200 USD => 1200 * 1e6 USDC，低于最高出价，应该失败
      await expect(
        auctionWithBidder2.bid(
          currentAuctionId,
          1200n * 10n ** 6n,
          await usdc.getAddress(),
        ),
      ).to.be.revertedWith("amount must be greater than highestBid");
    });

    it("should correctly track bidding result with ERC20", async function () {
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          1,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;

      const auctionWithBidder1 = auction.connect(bidder1);
      await auctionWithBidder1.bid(
        currentAuctionId,
        1500n * 10n ** 6n,
        await usdc.getAddress(),
      );
      const auctionWithBidder2 = auction.connect(bidder2);
      await auctionWithBidder2.bid(
        currentAuctionId,
        2000n * 10n ** 6n,
        await usdc.getAddress(),
      );
      const auctionWithBidder1Again = auction.connect(bidder1);
      await auctionWithBidder1Again.bid(
        currentAuctionId,
        2500n * 10n ** 6n,
        await usdc.getAddress(),
      );

      const auctionData = await auction.auctions(currentAuctionId);
      expect(auctionData.highestBidder).to.equal(bidder1.address);
      // 合约中 startingPrice 会 * 1e8，highestBid 存储的是 USD * 1e8
      expect(auctionData.highestBid).to.equal(2500n * 10n ** 8n);
    });

    it("should correctly track bidding result with ETH", async function () {
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          1,
          1000,
          3600,
          seller.address,
          ethers.ZeroAddress,
        );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;

      // 1 ETH = 3000 USD => 1500 USD = 0.5 ETH，传入实际 ETH 金额
      // 确保从 bidder 地址发送 ETH
      const tx1 = await auction
        .connect(bidder1)
        .bid(currentAuctionId, ethers.parseEther("0.5"), ethers.ZeroAddress, {
          value: ethers.parseEther("0.5"),
        });
      await tx1.wait();
      // 2000 USD = ~0.6666666667 ETH，确保从 bidder2 发送 ETH
      const tx2 = await auction
        .connect(bidder2)
        .bid(
          currentAuctionId,
          ethers.parseEther("0.666666666666666667"),
          ethers.ZeroAddress,
          {
            value: ethers.parseEther("0.666666666666666667"),
          },
        );
      await tx2.wait();

      const auctionData = await auction.auctions(currentAuctionId);
      expect(auctionData.highestBidder).to.equal(bidder2.address);
      // 合约中 highestBid 存储的是 USD * 1e8，2000 USD = 2000 * 1e8
      expect(auctionData.highestBid).to.equal(2000n * 10n ** 8n);
    });
  });

  describe("endAuction", function () {
    it("should complete auction correctly with ERC20", async function () {
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        1,
        1000,
        61, // 修复：需要 > 60
        seller.address,
        await usdc.getAddress(),
      );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;

      const auctionWithBidder1 = auction.connect(bidder1);
      await auctionWithBidder1.bid(
        currentAuctionId,
        1500n * 10n ** 6n,
        await usdc.getAddress(),
      );
      const auctionWithBidder2 = auction.connect(bidder2);
      await auctionWithBidder2.bid(
        currentAuctionId,
        2000n * 10n ** 6n,
        await usdc.getAddress(),
      );

      // 时间推进到结束
      const auc = await auction.auctions(currentAuctionId);
      const auctionEndTime = Number(auc.startTime) + Number(auc.duration);
      await networkConnection.ethers.provider.send(
        "evm_setNextBlockTimestamp",
        [auctionEndTime],
      );
      await networkConnection.ethers.provider.send("evm_mine");

      const sellerBalanceBefore = await usdc.balanceOf(seller.address);
      await auction.endAuction(currentAuctionId);
      const sellerBalanceAfter = await usdc.balanceOf(seller.address);

      // 卖家收到 2000 USDC (6 decimals)
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
        2000n * 10n ** 6n,
      );

      // NFT 属于 bidder2
      expect(await nft.ownerOf(1)).to.equal(bidder2.address);
    });

    it("should complete auction correctly with ETH", async function () {
      await auction.connect(seller).createAuction(
        await nft.getAddress(),
        1,
        1000,
        61, // 修复：需要 > 60
        seller.address,
        ethers.ZeroAddress,
      );
      const currentAuctionId = (await auction._nextAuctionId()) - 1n;

      // 1 ETH = 3000 USD，出价 1500 USD = 0.5 ETH
      // 确保从 bidder1 发送 ETH
      const tx = await auction
        .connect(bidder1)
        .bid(currentAuctionId, ethers.parseEther("0.5"), ethers.ZeroAddress, {
          value: ethers.parseEther("0.5"),
        });
      await tx.wait();

      // 时间推进到结束
      const auc = await auction.auctions(currentAuctionId);
      const auctionEndTime = Number(auc.startTime) + Number(auc.duration);
      await networkConnection.ethers.provider.send(
        "evm_setNextBlockTimestamp",
        [auctionEndTime],
      );
      await networkConnection.ethers.provider.send("evm_mine");

      const sellerBalanceBefore =
        await networkConnection.ethers.provider.getBalance(seller.address);
      await auction.endAuction(currentAuctionId);
      const sellerBalanceAfter =
        await networkConnection.ethers.provider.getBalance(seller.address);

      // 卖家收到约 0.5 ETH
      expect(sellerBalanceAfter > sellerBalanceBefore).to.be.true;
      // NFT 属于 bidder1
      expect(await nft.ownerOf(1)).to.equal(bidder1.address);
    });
  });

  describe("upgrade", function () {
    it("should upgrade contract successfully", async function () {
      // 修复：我们只 mint 了 3 个 token (0, 1, 2)，使用 tokenId 2
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          2,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );
      const oldAuctionId = await auction._nextAuctionId();

      const NFTAuctionV2Factory =
        await networkConnection.ethers.getContractFactory("NFTAuctionV2");
      const newImpl = await NFTAuctionV2Factory.deploy();

      // UUPS upgrade by admin (auction already connected with admin)
      await auction.upgradeToAndCall(await newImpl.getAddress(), "0x");

      auctionV2 = await networkConnection.ethers.getContractAt(
        "NFTAuctionV2",
        await auction.getAddress(),
        admin,
      );

      expect(await auctionV2._nextAuctionId()).to.equal(oldAuctionId);
      expect(await auctionV2.getVersion()).to.equal("NFTAuctionV2");
      expect(await auctionV2.newFeature()).to.equal(
        "this is newFeature in NFTAuctionV2",
      );
    });

    it("should fail when non-admin tries to upgrade", async function () {
      // 修复：我们只 mint 了 3 个 token (0, 1, 2)，使用 tokenId 2
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          2,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );

      const NFTAuctionV2Factory =
        await networkConnection.ethers.getContractFactory("NFTAuctionV2");
      const newImpl = await NFTAuctionV2Factory.deploy();

      const auctionWithSeller = auction.connect(seller);
      await expect(
        auctionWithSeller.upgradeToAndCall(await newImpl.getAddress(), "0x"),
      ).to.be.revertedWith("not admin");
    });

    it("should change oracle after upgrade", async function () {
      // 修复：我们只 mint 了 3 个 token (0, 1, 2)，使用 tokenId 2
      await auction
        .connect(seller)
        .createAuction(
          await nft.getAddress(),
          2,
          1000,
          3600,
          seller.address,
          await usdc.getAddress(),
        );

      const newEthOracle = await (
        await networkConnection.ethers.getContractFactory("MockAggregatorV3")
      ).deploy(350000000000n);

      const NFTAuctionV2Factory =
        await networkConnection.ethers.getContractFactory("NFTAuctionV2");
      const newImpl = await NFTAuctionV2Factory.deploy();

      // UUPS upgrade by admin
      await auction.upgradeToAndCall(await newImpl.getAddress(), "0x");

      auctionV2 = await networkConnection.ethers.getContractAt(
        "NFTAuctionV2",
        await auction.getAddress(),
        admin,
      );

      // 修复：函数名是 setTokenToFeed，不是 setTokenOracle
      await auctionV2.setTokenToFeed(
        ethers.ZeroAddress,
        await newEthOracle.getAddress(),
      );

      const newPrice = await auctionV2.getChainlinkDataFeedLatestAnswer(
        ethers.ZeroAddress,
      );
      expect(newPrice).to.equal(350000000000n);
    });
  });
});
