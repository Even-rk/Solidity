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

    // 为卖家铸造NFT id 1
    await nft.mint(seller.address);
    // 为卖家铸造NFT id 2
    await nft.mint(seller.address);
    // 为卖家铸造NFT id 3
    await nft.mint(seller.address);
    // 卖家授权拍卖合约管理NFT
    const auctionAddress = await auction.getAddress();
    await nft.connect(seller).setApprovalForAll(auctionAddress, true);
  });

  // 测试拍卖合约的基本功能
  // 1，测试版本号
  describe("getVersion", function () {
    // 测试用例：应该返回正确的版本字符串"NFTAuctionV1"
    it("should return NFTAuctionV1", async function () {
      console.log("合约版本:", await auction.getVersion());
      // 调用getVersion并断言返回值正确
      expect(await auction.getVersion()).to.equal("NFTAuctionV1");
    });
  });
  // 2，测试预言机价格
  describe("getChainlinkDataFeedLatestAnswer", function () {
    // 测试用例：应该返回正确的价格
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
});
