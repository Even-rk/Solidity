// 引入依赖
import { expect } from "chai"; // 断言库
import { ethers } from "ethers";
import { network } from "hardhat"; // Hardhat 网络连接

describe("NFTAuction", async () => {
  // V1版本拍卖合约实例（绑定代理地址）
  let auction: any;
  // V2版本拍卖合约实例（用于升级测试）
  let auctionV2: any;
  // ERC721标准NFT合约实例
  let nft: any;
  // USDC稳定币合约实例（符合ERC20标准）
  let usdcToken: any;
  // ETH/USD价格预言机合约实例（Chainlink兼容）
  let ethOracle: any;
  // USDC/USD价格预言机合约实例（Chainlink兼容）
  let usdcOracle: any;
  // 代理管理员合约实例，负责代理合约的权限管理
  let proxyAdmin: any;
  // 透明可升级代理合约实例，连接逻辑合约与链上状态
  let proxy: any;
  // 拍卖合约管理员签名者，拥有合约管理权限
  let admin: any;
  // 代理合约管理员签名者，负责代理合约的升级管理
  let pASigner: any;
  // NFT卖家签名者，发起拍卖的测试账户
  let seller: any;
  // 第一个竞拍者签名者，参与出价的测试账户
  let bider1: any;
  // 第二个竞拍者签名者，参与出价的测试账户
  let bider2: any;
  // Hardhat网络连接实例，用于控制EVM状态和获取测试环境工具
  let networkConnection: any;
  beforeEach(async () => {
    // 创建network连接，获取ethers和networkHelpers
    // ethers: Ethers.js库实例，提供合约交互、签名、部署等功能
    // networkHelpers: Hardhat提供的辅助工具，用于操控EVM状态（如快进时间、挖块、快照等）
    networkConnection = await network.create();
    const { ethers } = networkConnection;
    // getSigners: 获取测试账户列表，每个账户都是已资助的签名者，可以用于发送交易
    // getContractFactory: 获取合约工厂，用于部署合约
    // deployContract: 部署合约
    // provider: Ethers提供者，用于读取区块链数据（如区块、余额、日志等）
    const { getSigners, getContractFactory, deployContract, provider } = ethers;
    // 测试账户
    // admin: 合约管理员，负责初始化合约状态
    // pASigner: 代理管理员，负责管理合约的代理
    // seller: NFT卖家，负责上传NFT并设置拍卖参数
    // bider1: 第一个出价者，负责出价
    // bider2: 第二个出价者，负责出价
    const [_admin, _pASigner, _seller, _bider1, _bider2] = await getSigners();
    // 赋值给全局变量（用于后续管理员测试）
    admin = _admin;
    pASigner = _pASigner;
    // 赋值给全局变量（用于后续出价人测试）
    bider1 = _bider1;
    bider2 = _bider2;
    // 赋值给全局变量（用于后续卖家测试）
    seller = _seller;
    // 部署NFTAuction合约
    const NFTAuction = await deployContract("NFTAuction");
    // 编码合约初始化数据，用于代理合约
    const initData = NFTAuction.interface.encodeFunctionData("initialize", [
      admin.address,
    ]);
    // 获取代理合约工厂
    const tupFactory = await getContractFactory("TransparentUpgradeableProxy");
    // 部署代理合约
    proxy = await tupFactory.deploy(
      await NFTAuction.getAddress(),
      pASigner.address,
      initData,
    );
    // 将逻辑合约链接到代理合约，并获取可调用的合约实例
    // 这里使用attach方法，将代理合约的地址和NFTAuction合约的ABI绑定，创建一个可调用的合约实例
    auction = NFTAuction.attach(await proxy.getAddress());

    // 计算 EIP-1967 标准定义的代理管理员地址存储槽位置
    const EIP1967 = ethers.keccak256(ethers.toUtf8Bytes("eip1967.proxy.admin"));

    // 指定存储槽查询原始数据
    const proxyAdminAddr = await provider.getStorage(
      await proxy.getAddress(),
      EIP1967,
    );
    // 提取代理管理员地址
    const proxyAdminAddress = ethers.getAddress(
      "0x" + proxyAdminAddr.slice(-40),
    );

    // 获取代理合约的实例
    const ProxyAdminFactory = await getContractFactory("ProxyAdmin");
    // 将代理管理员工厂与实际部署的代理管理员地址绑定
    proxyAdmin = ProxyAdminFactory.attach(proxyAdminAddress);
    // 部署ERC721合约
    nft = await deployContract("NFTERC721", ["NFT", "NFT"]);
    // 部署USDC代币合约（ERC20）,名称USDC，符号USDC，6位小数，总供应量1000000
    usdcToken = await deployContract("MockERC20", [
      "USDC",
      "USDC",
      6,
      ethers.parseUnits("1000000", 6), // ethers.parseEther("0.000001")
    ]);
    // 部署ETH价格预言机合约,设置ETH价格为3000美元（保留8位小数）
    // MockAggregatorV3 构造只需要一个参数：初始价格
    ethOracle = await deployContract("MockAggregatorV3", [3000 * 10 ** 8]);
    // 部署USDC价格预言机合约,设置USDC价格为1美元（保留8位小数）
    usdcOracle = await deployContract("MockAggregatorV3", [1 * 10 ** 8]);

    // 管理员设置ETH（0地址表示ETH）对应的预言机地址
    const zeroAddress = ethers.ZeroAddress;
    const ethOracleAddress = await ethOracle.getAddress();
    await auction.connect(admin).setTokenToFeed(zeroAddress, ethOracleAddress);
    // 管理员设置USDC对应的预言机地址
    const usdcAddress = await usdcToken.getAddress();
    const usdcOracleAddress = await usdcOracle.getAddress();
    await auction.connect(admin).setTokenToFeed(usdcAddress, usdcOracleAddress);

    // 设置usdc余额
    const usdcBalance = ethers.parseUnits("10000", 6);

    // 给bider1和bider2分配USDC
    await usdcToken.transfer(bider1.address, usdcBalance);
    await usdcToken.transfer(bider2.address, usdcBalance);

    // 授权bider1和bider2使用USDC代币
    const auctionAddress = await auction.getAddress();
    await usdcToken.connect(bider1).approve(auctionAddress, usdcBalance);
    await usdcToken.connect(bider2).approve(auctionAddress, usdcBalance);

    // 为卖家铸造NFT id 1
    await nft.mint(seller.address);
    // 为卖家铸造NFT id 2
    await nft.mint(seller.address);
    // 为卖家铸造NFT id 3
    await nft.mint(seller.address);
    // 卖家授权拍卖合约管理NFT
    await nft.connect(seller).setApprovalForAll(auctionAddress, true);
  });

  // 测试拍卖合约的基本功能
  // 1，测试版本号
  describe("getVersion", function () {
    // 应该返回正确的版本字符串"NFTAuctionV1"
    it("should return NFTAuctionV1", async function () {
      console.log("合约版本:", await auction.getVersion());
      // 调用getVersion并断言返回值正确
      expect(await auction.getVersion()).to.equal("NFTAuctionV1");
    });
  });
  // 2，测试预言机价格
  describe("getChainlinkDataFeedLatestAnswer", function () {
    // 应该返回正确的价格
    it("should return correct price", async function () {
      // ETH美元价格
      const ethPrice = await auction.getChainlinkDataFeedLatestAnswer(
        ethers.ZeroAddress,
      );
      console.log("ETH美元价格:", ethPrice); // 300000000000
      // USDC美元价格
      const usdcPrice = await auction.getChainlinkDataFeedLatestAnswer(
        await usdcToken.getAddress(),
      );
      console.log("USDC美元价格:", usdcPrice); // 100000000
      // 断言ETH价格大于0
      expect(ethPrice).to.be.gt(0);
      // 断言USDC价格大于0
      expect(usdcPrice).to.be.gt(0);
    });
  });

  // 3，测试初始化函数
  describe("initialize", function () {
    // 代理部署时已经调用过一次 initialize 完成初始化，再次调用应该失败
    it("should fail when initialized twice", async function () {
      // OpenZeppelin Initializable 重复初始化会抛出自定义错误 InvalidInitialization()
      await expect(
        auction.connect(admin).initialize(admin.address),
      ).to.be.revertedWithCustomError(auction, "InvalidInitialization");
    });
  });

  // 4，测试创建拍卖
  describe("createAuction", function () {
    // 测试用例：非管理员调用创建拍卖应该失败
    it("should fail when not admin when non-admin", async function () {
      // 调用createAuction函数创建拍卖
      await expect(
        auction.connect(seller).createAuction(
          await nft.getAddress(), // NFT合约地址
          1, // NFT id
          1000, // 拍卖价格
          3600, // 拍卖持续时间
          seller.address, // 卖家地址
          await usdcToken.getAddress(), // 拍卖代币地址
        ),
      ).to.be.revertedWith("not admin"); // 返回错误信息是否为"not admin"
    });

    // 测试用例：拍卖id应该递增
    it("should increment auction id", async function () {
      // 调用createAuction函数创建拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        3600, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      console.log("第一次拍卖id:", await auction._auctionId());
      // 断言拍卖id递增为1
      expect(await auction._auctionId()).to.equal(1n);

      // 第二次调用createAuction函数创建拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        2, // NFT id
        2000, // 拍卖价格
        7600, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      console.log("第二次拍卖id:", await auction._auctionId());
      // 断言拍卖id递增为2
      expect(await auction._auctionId()).to.equal(2n);
    });
  });

  // 5，测试出价
  describe("bid", function () {
    // 拍卖结束后出价应该失败
    it("should fail when not bidder when non-bidder", async function () {
      // 创建一个拍卖，duration必须大于60秒
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        120, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      // 获取拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 增加时间到拍卖结束时间
      await networkConnection.provider.request({
        method: "evm_increaseTime",
        params: [120 + 1], // 超过结束时间
      });
      // 挖矿使时间变化生效
      await networkConnection.provider.request({
        method: "evm_mine",
        params: [],
      });
      // 调用bid函数出价
      await expect(
        auction
          .connect(seller)
          .bid(auctionId, 1000, await usdcToken.getAddress()),
      ).to.be.revertedWith("auction must not be ended"); // 拍卖已结束，期望错误：拍卖必须未结束才能出价
    });

    // 测试低于拍卖价出价失败（USDC）
    it("should fail when bid with usdc below min bid price", async function () {
      // 创建一个拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格（美元）
        120, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      // 获取拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 出价者1出价900usdc
      const amount1 = ethers.parseUnits("900", 6);
      const args1 = [auctionId, amount1, await usdcToken.getAddress()];
      // 断言出价失败
      await expect(auction.connect(bider1).bid(...args1)).to.be.revertedWith(
        "amount must be greater than startingPrice",
      );
    });

    // 测试低于拍卖价出价失败（ETH）
    it("should fail when bid with ETH below min bid pricee", async function () {
      // 创建一个拍卖，起拍价 1000 美元
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格（美元）
        120, // 拍卖持续时间
        seller.address, // 卖家地址
        ethers.ZeroAddress, // 支付代币为ETH
      );
      // 获取拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // ETH价格是 3000 美元，所以 0.3 ETH = 900 美元 < 起拍价 1000 美元
      const amount1 = ethers.parseUnits("0.3", 18);
      const args1 = [
        auctionId,
        amount1,
        ethers.ZeroAddress,
        { value: amount1 },
      ];
      // 断言出价失败
      await expect(auction.connect(bider1).bid(...args1)).to.be.revertedWith(
        "amount must be greater than startingPrice",
      );
    });

    // 出价高于前面的出价者，应该退还前面最高价的出价金额
    it("should refund previous bidder when bid higher than previous bidder", async function () {
      // 创建一个拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格（美元）
        3600, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      // 获取拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 出价者1出价1100usdc
      const amount1 = ethers.parseUnits("1100", 6);
      const args1 = [auctionId, amount1, await usdcToken.getAddress()];
      await auction.connect(bider1).bid(...args1);
      // 断言bider1的usdc余额减少1100usdc 10000usdc减去1100usdc等于8900usdc
      const balance = ethers.parseUnits("8900", 6);
      expect(await usdcToken.balanceOf(bider1.address)).to.equal(balance);
      // 出价者2出价1200usdc
      const amount2 = ethers.parseUnits("1200", 6);
      const args2 = [auctionId, amount2, await usdcToken.getAddress()];
      await auction.connect(bider2).bid(...args2);
      // 断言bider2的usdc余额减少1200usdc 10000usdc减去1200usdc等于8800usdc
      const balance2 = ethers.parseUnits("8800", 6);
      expect(await usdcToken.balanceOf(bider2.address)).to.equal(balance2);
      // 出价者2高于出价者1，应该退还bider1的出价金额1100usd，看剩余金额是否是10000
      expect(await usdcToken.balanceOf(bider1.address)).to.equal(
        ethers.parseUnits("10000", 6),
      );
    });

    // 测试eth出价，出价后，合约余额应该增加
    it("should increase contract balance when bid with eth", async function () {
      // 创建一个拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        3600, // 拍卖持续时间
        seller.address, // 卖家地址
        await usdcToken.getAddress(), // 拍卖代币地址
      );
      // 获取拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 出价者1出价1eth
      const amount1 = ethers.parseUnits("1", 18);
      const args1 = [
        auctionId,
        amount1,
        ethers.ZeroAddress,
        { value: amount1 },
      ];
      await auction.connect(bider1).bid(...args1);
      // 断言合约余额增加1eth - 使用provider获取合约地址的ETH余额
      const auctionAddress = await auction.getAddress();
      const balance = await networkConnection.ethers.provider.getBalance(
        auctionAddress,
      );
      expect(balance).to.equal(amount1);
    });
  });

  // 6，测试结束拍卖
  describe("endAuction", function () {
    // 拍卖时间过时才能结束拍卖
    it("should end auction when auction time is over", async function () {
      // 调用createAuction函数创建拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        3600, // 拍卖持续时间
        seller.address, // 卖家地址
        ethers.ZeroAddress, // 拍卖代币地址
      );
      // 拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 断言结束拍卖失败，拍卖必须超时才能结束
      await expect(auction.endAuction(auctionId)).to.revertedWith(
        "auction must be ended",
      );
    });

    // 拍卖结束后，无出价者，应该退还起拍价
    it("should refund starting price when no bidder", async function () {
      // 获取卖家的nft余额
      const sellerBalance = await nft.balanceOf(seller.address);
      // 创建一个拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        120, // 拍卖持续时间
        seller.address, // 卖家地址
        ethers.ZeroAddress, // 拍卖代币地址
      );
      // 拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 增加时间到拍卖结束时间
      await networkConnection.provider.request({
        method: "evm_increaseTime",
        params: [120 + 1], // 超过结束时间
      });
      // 挖矿使时间变化生效
      await networkConnection.provider.request({
        method: "evm_mine",
        params: [],
      });
      // 结束拍卖
      await auction.endAuction(auctionId);
      // 卖家的nft余额应该不变，因为没有出价者，所以退还了nft
      expect(await nft.balanceOf(seller.address)).to.equal(sellerBalance);
    });

    // 拍卖结束后，有出价者，nft转给出价者，卖家得到出价金额
    it("should transfer nft to bidder and refund starting price to seller when bidder exists", async function () {
      // 创建一个拍卖
      await auction.connect(admin).createAuction(
        await nft.getAddress(), // NFT合约地址
        1, // NFT id
        1000, // 拍卖价格
        120, // 拍卖持续时间
        seller.address, // 卖家地址
        ethers.ZeroAddress, // 拍卖代币地址
      );
      // 拍卖id
      const auctionId = (await auction._auctionId()) - 1n;
      // 出价者1出价1100usdc
      const amount1 = ethers.parseUnits("1100", 6);
      const args1 = [
        auctionId,
        amount1,
        await usdcToken.getAddress(),
        { value: amount1 },
      ];
      await auction.connect(bider1).bid(...args1);
      // 增加时间到拍卖结束时间
      await networkConnection.provider.request({
        method: "evm_increaseTime",
        params: [120 + 1], // 超过结束时间
      });
      // 挖矿使时间变化生效
      await networkConnection.provider.request({
        method: "evm_mine",
        params: [],
      });
      // 结束拍卖
      await auction.endAuction(auctionId);
      // 断言nft应该转给出价者
      expect(await nft.balanceOf(bider1.address)).to.equal(1n);
      // 断言卖家的usdc余额应该增加1100usdc
      expect(await usdcToken.balanceOf(seller.address)).to.equal(amount1);
    });
  });
});
