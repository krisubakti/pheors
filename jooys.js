require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');
const axios = require('axios');

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  wallet: (msg) => console.log(`${colors.yellow}[⇄] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[‼] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✕] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[◊] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[↻] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[→] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                                  ║');
    console.log('║  ██████╗ ██╗  ██╗ █████╗ ██████╗  ██████╗ ███████╗    ██████╗  ██████╗ ████████╗ ║');
    console.log('║  ██╔══██╗██║  ██║██╔══██╗██╔══██╗██╔═══██╗██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝ ║');
    console.log('║  ██████╔╝███████║███████║██████╔╝██║   ██║███████╗    ██████╔╝██║   ██║   ██║    ║');
    console.log('║  ██╔═══╝ ██╔══██║██╔══██║██╔══██╗██║   ██║╚════██║    ██╔══██╗██║   ██║   ██║    ║');
    console.log('║  ██║     ██║  ██║██║  ██║██║  ██║╚██████╔╝███████║    ██████╔╝╚██████╔╝   ██║    ║');
    console.log('║  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝    ╚═════╝  ╚═════╝    ╚═╝    ║');
    console.log('║                                                                                  ║');
    console.log(`║${colors.magenta}                               ⟦ TESTNET AUTOMATION ⟧                             ${colors.cyan}║`);
    console.log(`║${colors.white}                                    by &jooys                                     ${colors.cyan}║`);
    console.log(`║${colors.blue}                             https://t.me/endjoyss                                ${colors.cyan}║`);
    console.log('║                                                                                  ║');
    console.log('║                                                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
    console.log(`${colors.reset}`);
  },
  divider: () => console.log(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`),
  status: (msg) => console.log(`${colors.magenta}[◉] ${msg}${colors.reset}`),
  network: (msg) => console.log(`${colors.blue}[⟐] ${msg}${colors.reset}`),
  gas: (msg) => console.log(`${colors.cyan}[⚡] ${msg}${colors.reset}`),
  tx: (msg) => console.log(`${colors.green}[⟠] ${msg}${colors.reset}`),
  balance: (msg) => console.log(`${colors.yellow}[◈] ${msg}${colors.reset}`),
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const tryTransactionWithTimeout = async (txPromise, timeoutMs = 25000) => {
  return Promise.race([
    txPromise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Transaction timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

const waitForReceipt = async (tx, provider, maxAttempts = 6) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sleep(3000);
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt && receipt.blockNumber) {
        return receipt;
      }
    } catch (error) {
    }
  }
  throw new Error('Receipt not found after multiple attempts');
};

const networkConfig = {
  name: 'Pharos Testnet',
  chainId: 688688,
  primaryRpc: 'https://testnet.dplabs-internal.com',
  fallbackRpc: 'https://testnet.dplabs-internal.com',
  currencySymbol: 'PHRS',
};

const tokens = {
  USDC: '0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED',
  USDT: '0xD4071393f8716661958F766DF660033b3d35fD29',
  WPHRS: '0x76aaada469d23216be5f7c596fa25f282ff9b364',
};

const contractAddress = '0x1a4de519154ae51200b0ad7c90f7fac75547888a';
const positionManagerAddress = '0xf8a1d4ff0f9b9af7ce58e1fc1833688f3bfd6115';

const tokenDecimals = {
  WPHRS: 18,
  USDC: 6,
  USDT: 6,
};

const contractAbi = [
  'function multicall(uint256 deadlineOrFlags, bytes[] calldata data) payable',
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
];

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) public returns (bool)',
];

const positionManagerAbi = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function factory() external view returns (address)',
  'function WETH9() external view returns (address)'
];


const loadProxies = () => {
  try {
    const proxies = fs.readFileSync('proxies.txt', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
    return proxies;
  } catch (error) {
    logger.warn('File proxies.txt tidak ditemukan, menggunakan mode langsung');
    return [];
  }
};

const getRandomProxy = (proxies) => {
  return proxies[Math.floor(Math.random() * proxies.length)];
};

const setupProvider = async (proxy = null) => {
  const providerOptions = {
    timeout: 20000,
    retryCount: 1,
    retryDelay: 2000,
  };

  const rpcEndpoints = [
    networkConfig.fallbackRpc,
    'https://testnet.dplabs-internal.com',
    'https://rpc.pharos-testnet.phoenixlabs.dev',
  ];

  for (let i = 0; i < rpcEndpoints.length; i++) {
    const rpcUrl = rpcEndpoints[i];
    try {
      logger.network(`Mencoba RPC [${i + 1}/${rpcEndpoints.length}]: ${rpcUrl}${proxy ? ' dengan proxy' : ''}`);
      
      let provider;
      if (proxy) {
        const agent = new HttpsProxyAgent(proxy);
        provider = new ethers.JsonRpcProvider(rpcUrl, {
          chainId: networkConfig.chainId,
          name: networkConfig.name,
        }, providerOptions);
      } else {
        provider = new ethers.JsonRpcProvider(rpcUrl, {
          chainId: networkConfig.chainId,
          name: networkConfig.name,
        }, providerOptions);
      }

      const network = await provider.getNetwork();
      if (network.chainId === BigInt(networkConfig.chainId)) {
        logger.success(`RPC berhasil terhubung: ${rpcUrl}`);
        return provider;
      } else {
        throw new Error(`Wrong chainId: ${network.chainId}`);
      }
      
    } catch (error) {
      logger.warn(`RPC ${rpcUrl} gagal: ${error.message.substring(0, 80)}`);
      
      if (i === rpcEndpoints.length - 1) {
        logger.error('Semua RPC endpoint gagal, menggunakan fallback minimal');
        
        if (proxy) {
          const agent = new HttpsProxyAgent(proxy);
          return new ethers.JsonRpcProvider(networkConfig.fallbackRpc, networkConfig.chainId);
        } else {
          return new ethers.JsonRpcProvider(networkConfig.fallbackRpc, networkConfig.chainId);
        }
      }
      
      await sleep(2000);
    }
  }
};

const pairOptions = [
  { id: 1, from: 'WPHRS', to: 'USDC' },
  { id: 2, from: 'USDC', to: 'WPHRS' },
  { id: 3, from: 'USDC', to: 'USDT' },
  { id: 4, from: 'USDT', to: 'USDC' },
];

const feeTiers = [500, 3000, 10000];

const checkBalanceAndApproval = async (wallet, tokenAddress, tokenSymbol, amount, decimals, spender) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    const required = ethers.parseUnits(amount.toString(), decimals);

    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (allowance < required) {
      logger.step(`Menyetujui ${amount} ${tokenSymbol}...`);
      
      await sleep(1000);
      const nonce = await wallet.provider.getTransactionCount(wallet.address, 'latest');
      
      const approveTx = await tokenContract.approve(spender, ethers.MaxUint256, {
        nonce: nonce,
        gasPrice: ethers.toBigInt(1),
        gasLimit: ethers.toBigInt(100000),
      });
      
      logger.loading(`Menunggu konfirmasi approval ${tokenSymbol}...`);
      await approveTx.wait(1);
      logger.success(`Approval ${tokenSymbol} selesai.`);
      
      await sleep(2000);
    } else {
      logger.info(`Allowance sudah cukup untuk ${tokenSymbol}.`);
    }
    return true;
  } catch (error) {
    logger.error(`Approval gagal untuk ${tokenSymbol}: ${error.message}`);
    return false;
  }
};

const getSwapCalldata = (pair, amount, walletAddress) => {
  try {
    const fromTokenSymbol = pair.from;
    const toTokenSymbol = pair.to;
    const decimals = tokenDecimals[fromTokenSymbol];
    const scaledAmount = ethers.parseUnits(amount.toString(), decimals);

    const swapFunctionSelector = '0x04e45aaf';
    
    let innerCallData;

    const fromToken = tokens[fromTokenSymbol];
    const toToken = tokens[toTokenSymbol];

    if (!fromToken || !toToken) {
      logger.error(`Token tidak ditemukan: ${fromTokenSymbol} → ${toTokenSymbol}`);
      return [];
    }

    if (fromTokenSymbol === 'WPHRS' && toTokenSymbol === 'USDC') {
      innerCallData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint160'],
        [
          tokens.WPHRS,
          tokens.USDC,
          500,
          walletAddress,
          scaledAmount,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
        ]
      );
    } else if (fromTokenSymbol === 'USDC' && toTokenSymbol === 'WPHRS') {
      innerCallData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint160'],
        [
          tokens.USDC,
          tokens.WPHRS,
          500,
          walletAddress,
          scaledAmount,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
        ]
      );
    } else if (fromTokenSymbol === 'USDC' && toTokenSymbol === 'USDT') {
      innerCallData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint160'],
        [
          tokens.USDC,
          tokens.USDT,
          500,
          walletAddress,
          scaledAmount,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
        ]
      );
    } else if (fromTokenSymbol === 'USDT' && toTokenSymbol === 'USDC') {
      innerCallData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint160'],
        [
          tokens.USDT,
          tokens.USDC,
          500,
          walletAddress,
          scaledAmount,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
        ]
      );
    } else {
      logger.error(`Pair tidak valid: ${fromTokenSymbol} → ${toTokenSymbol}`);
      return [];
    }

    logger.info(`Swap: ${fromTokenSymbol} → ${toTokenSymbol} (Fee: 0.05% - working format)`);
    logger.balance(`Amount In: ${ethers.formatUnits(scaledAmount, decimals)} ${fromTokenSymbol}`);
    logger.info(`Function: 0x04e45aaf (working function dari bot lama)`);

    return [ethers.concat([swapFunctionSelector, innerCallData])];

  } catch (error) {
    logger.error(`Gagal membuat swap calldata: ${error.message}`);
    return [];
  }
};


const transferPHRS = async (wallet, provider, transferIndex, proxy = null) => {
  try {
    const min = 0.000009;
    const max = 0.001000;
    const amount = parseFloat((Math.random() * (max - min) + min).toFixed(18));

    const randomWallet = ethers.Wallet.createRandom();
    const toAddress = randomWallet.address;
    logger.step(`[Transfer ${transferIndex + 1}] Menyiapkan: ${amount.toFixed(6)} PHRS ke ${toAddress}`);
    logger.status(`[Transfer ${transferIndex + 1}] Task: "Send To Friends" (ID: 103) - Manual verified ✓`);

    let balance;
    try {
      balance = await provider.getBalance(wallet.address);
      logger.balance(`[Transfer ${transferIndex + 1}] Balance: ${ethers.formatEther(balance)} PHRS`);
    } catch (balanceError) {
      logger.warn(`[Transfer ${transferIndex + 1}] Retry balance check: ${balanceError.message.substring(0, 50)}`);
      await sleep(3000);
      
      try {
        balance = await provider.getBalance(wallet.address);
      } catch (retryError) {
        logger.error(`[Transfer ${transferIndex + 1}] Balance check failed: ${retryError.message.substring(0, 50)}`);
        return;
      }
    }

    const required = ethers.parseEther(amount.toFixed(18));

    if (balance < required) {
      logger.warn(`[Transfer ${transferIndex + 1}] Saldo tidak cukup: ${ethers.formatEther(balance)}`);
      return;
    }

    logger.status(`[Transfer ${transferIndex + 1}] ⟐ Sending GA tracking event...`);
    await sendGoogleAnalyticsEvent(wallet, proxy);
    await sleep(1000);

    try {
      let nonce;
      try {
        nonce = await provider.getTransactionCount(wallet.address, 'latest');
        logger.info(`[Transfer ${transferIndex + 1}] Nonce: ${nonce} (hex: 0x${nonce.toString(16)})`);
      } catch (nonceError) {
        logger.warn(`[Transfer ${transferIndex + 1}] Retry get nonce...`);
        await sleep(2000);
        nonce = await provider.getTransactionCount(wallet.address, 'latest');
      }
      
      const txPromise = wallet.sendTransaction({
        to: toAddress,
        value: required,
        gasLimit: ethers.toBigInt(21000),
        gasPrice: ethers.toBigInt(1),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 20000);
      logger.loading(`[Transfer ${transferIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      try {
        const receipt = await waitForReceipt(tx, provider, 5);
        if (receipt && receipt.status === 1) {
          logger.tx(`[Transfer ${transferIndex + 1}] BERHASIL! TxHash: ${receipt.hash}`);
          logger.gas(`[Transfer ${transferIndex + 1}] Gas used: ${receipt.gasUsed} / 21000`);
          logger.info(`[Transfer ${transferIndex + 1}] ⟦ Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash} ⟧`);
          
          await sleep(3000);
          
          logger.status(`[Transfer ${transferIndex + 1}] ◎ Verifying task completion...`);
          const verified = await verifyTransferTask(wallet, receipt.hash, proxy);
          
          if (verified) {
            logger.success(`[Transfer ${transferIndex + 1}] ◊ Task 103 "Send To Friends" VERIFIED!`);
          } else {
            logger.warn(`[Transfer ${transferIndex + 1}] ⚠ Task verification pending, check manually`);
          }
          
          await sleep(2000);
          await checkWalletProgress(wallet, proxy);
          
        } else {
          logger.error(`[Transfer ${transferIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
        }
      } catch (receiptError) {
        logger.success(`[Transfer ${transferIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
        logger.info(`[Transfer ${transferIndex + 1}] ℹ Manual check: https://testnet.pharosscan.xyz/tx/${tx.hash}`);
        
        await sleep(5000);
        logger.status(`[Transfer ${transferIndex + 1}] ◎ Attempting verification despite timeout...`);
        await verifyTransferTask(wallet, tx.hash, proxy);
      }
      
      await sleep(2000);
      
    } catch (txError) {
      if (txError.message.includes('403') || txError.message.includes('network')) {
        logger.error(`[Transfer ${transferIndex + 1}] RPC Error: ${txError.message.substring(0, 80)}`);
        logger.warn(`[Transfer ${transferIndex + 1}] Skip transfer karena masalah RPC`);
      } else if (txError.message.includes('nonce')) {
        logger.error(`[Transfer ${transferIndex + 1}] Nonce issue: ${txError.message.substring(0, 80)}`);
      } else if (txError.message.includes('insufficient funds')) {
        logger.error(`[Transfer ${transferIndex + 1}] Insufficient funds untuk gas`);
      } else {
        logger.error(`[Transfer ${transferIndex + 1}] Error: ${txError.message.substring(0, 100)}`);
      }
      await sleep(5000);
    }

  } catch (error) {
    logger.error(`[Transfer ${transferIndex + 1}] GAGAL: ${error.message.substring(0, 100)}`);
    await sleep(5000);
  }
};

const sendGoogleAnalyticsEvent = async (wallet, proxy = null) => {
  try {
    const timestamp = Date.now();
    const cid = `${Math.floor(Math.random() * 9999999999)}.${Math.floor(timestamp / 1000)}`;
    
    const params = new URLSearchParams({
      v: '2',
      tid: 'G-JHHZ1LLWBG',
      gtm: '45je5791v9219329312za200',
      _p: timestamp.toString(),
      gcd: '13l3l3l3l1l1',
      npa: '0',
      dma: '0',
      tag_exp: '101509157~103116026~103200004~103233427~103351869~103351871~104684208~104684211~104909302~104909304~104935091~104935093',
      cid: cid,
      ul: 'en-us',
      sr: '1920x1080',
      uaa: 'x86',
      uab: '64',
      uafvl: 'Not)A%253BBrand%3B8.0.0.0%7CChromium%3B138.0.7204.101%7CGoogle%2520Chrome%3B138.0.7204.101',
      uamb: '0',
      uam: '',
      uap: 'Windows',
      uapv: '19.0.0',
      uaw: '0',
      are: '1',
      frm: '0',
      pscdl: 'control_1.4',
      _eu: 'AAAAAAQ',
      _s: '2',
      sid: Math.floor(timestamp / 1000).toString(),
      sct: '19',
      seg: '1',
      dl: 'https%3A%2F%2Ftestnet.pharosnetwork.xyz%2Fexperience',
      dr: 'https%3A%2F%2Ftestnet.pharosnetwork.xyz%2Fexperience',
      dt: 'Pharos%20Testnet-%20Experience%20the%20Fastest%20EVM-Compatible%20Layer%201%20for%20Real-World%20Assets%20%26%20Crosschain%20Liquidity',
      en: 'sendToken',
      _ee: '1',
      'ep.event_category': 'Button',
      'ep.event_label': 'Send%20Token',
      _et: Math.floor(Math.random() * 50000).toString(),
      tfd: Math.floor(Math.random() * 300000).toString()
    });

    const gaUrl = `https://www.google-analytics.com/g/collect?${params.toString()}`;
    
    const headers = {
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'content-length': '0',
      'origin': 'https://testnet.pharosnetwork.xyz',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://testnet.pharosnetwork.xyz/',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-storage-access': 'active',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    };

    await axios({
      method: 'post',
      url: gaUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 10000,
    });

    logger.status(`⟐ Google Analytics sendToken event sent`);
    return true;
  } catch (error) {
    logger.warn(`GA tracking failed: ${error.message.substring(0, 50)}`);
    return false;
  }
};

const verifyTransferTask = async (wallet, txHash, proxy = null) => {
  try {
    logger.step(`◎ Verifying transfer task for tx: ${txHash.substring(0, 10)}...`);
    
    const message = "pharos";
    const signature = await wallet.signMessage(message);
    const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
    
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer null',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://testnet.pharosnetwork.xyz',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://testnet.pharosnetwork.xyz/',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    };

    const loginResponse = await axios({
      method: 'post',
      url: loginUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 20000,
    });

    if (loginResponse.data.code !== 0 || !loginResponse.data.data?.jwt) {
      throw new Error(`Login gagal: ${loginResponse.data.msg || 'No JWT'}`);
    }

    const jwt = loginResponse.data.data.jwt;
    const verifyHeaders = { ...headers, authorization: `Bearer ${jwt}` };
    const verifyPayload = {
      address: wallet.address,
      task_id: 103,
      tx_hash: txHash
    };

    logger.status(`◎ Sending verification request: task_id=${verifyPayload.task_id}, tx=${txHash.substring(0, 10)}...`);

    const verifyResponse = await axios({
      method: 'post',
      url: 'https://api.pharosnetwork.xyz/task/verify',
      headers: verifyHeaders,
      data: verifyPayload,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 15000,
    });

    if (verifyResponse.data.code === 0) {
      const taskData = verifyResponse.data.data;
      if (taskData.task_id === 103 && taskData.verified === true) {
        logger.success(`◊ Task 103 "Send To Friends" verified successfully!`);
        
        await sleep(1000);
        
        try {
          const profileResponse = await axios({
            method: 'get',
            url: `https://api.pharosnetwork.xyz/user/profile?address=${wallet.address}`,
            headers: {
              'accept': 'application/json, text/plain, */*',
              'accept-language': 'en-US,en;q=0.9',
              'cache-control': 'no-cache',
              'origin': 'https://testnet.pharosnetwork.xyz',
              'pragma': 'no-cache',
              'priority': 'u=1, i',
              'referer': 'https://testnet.pharosnetwork.xyz/',
              'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site',
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            },
            httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
            timeout: 10000,
          });

          if (profileResponse.data.code === 0) {
            const userInfo = profileResponse.data.data.user_info;
            logger.status(`⟐ Profile updated - Total Points: ${userInfo.TotalPoints}`);
          }
        } catch (profileError) {
          logger.warn(`Profile update failed: ${profileError.message.substring(0, 50)}`);
        }

        await sleep(500);

        try {
          const tasksResponse = await axios({
            method: 'get',
            url: `https://api.pharosnetwork.xyz/user/tasks?address=${wallet.address}`,
            headers: {
              'accept': 'application/json, text/plain, */*',
              'accept-language': 'en-US,en;q=0.9',
              'cache-control': 'no-cache',
              'origin': 'https://testnet.pharosnetwork.xyz',
              'pragma': 'no-cache',
              'priority': 'u=1, i',
              'referer': 'https://testnet.pharosnetwork.xyz/',
              'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site',
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            },
            httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
            timeout: 10000,
          });

          if (tasksResponse.data.code === 0) {
            const userTasks = tasksResponse.data.data.user_tasks;
            const task103 = userTasks.find(task => task.TaskId === 103);
            if (task103) {
              logger.success(`◊ Task 103 CompleteTimes: ${task103.CompleteTimes} (updated!)`);
            }
          }
        } catch (tasksError) {
          logger.warn(`Tasks update failed: ${tasksError.message.substring(0, 50)}`);
        }

        return true;
      } else {
        logger.warn(`⚠ Task verification response: ${JSON.stringify(taskData)}`);
        return false;
      }
    } else {
      logger.warn(`⚠ Verification failed: ${verifyResponse.data.msg}`);
      return false;
    }

  } catch (error) {
    logger.warn(`Verification check failed: ${error.message.substring(0, 80)}`);
    return false;
  }
};

const checkWalletProgress = async (wallet, proxy = null) => {
  try {
    logger.step(`⟦ Checking wallet progress ⟧`);
    
    const response = await axios({
      method: 'get',
      url: `https://pharoshub.xyz/api/check-wallet?address=${wallet.address}`,
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      },
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 15000,
    });

    if (response.data.success) {
      const data = response.data;
      logger.divider();
      logger.status(`⟐ Wallet Progress:`);
      logger.info(`  ◈ Total Points: ${data.total_points}`);
      logger.info(`  ◈ Rank: ${data.exact_rank}`);
      logger.info(`  ◈ Level: ${data.current_level} (next: ${data.next_level})`);
      logger.info(`  ◈ Send Count: ${data.send_count}`);
      logger.info(`  ◈ Swap Count: ${data.swap_count} (Zenith: ${data.zenith_swaps})`);
      logger.info(`  ◈ LP Count: ${data.lp_count} (Zenith: ${data.zenith_lp})`);
      logger.divider();
      return data;
    } else {
      logger.error(`✕ Failed to check wallet progress`);
      return null;
    }

  } catch (error) {
    logger.warn(`Progress check failed: ${error.message.substring(0, 80)}`);
    return null;
  }
};


const performSwap = async (wallet, provider, swapIndex) => {
  try {
    const pair = pairOptions[Math.floor(Math.random() * pairOptions.length)];
    let amount;
    if (pair.from === 'WPHRS') {
      amount = 0.001;
    } else if (pair.from === 'USDC') {
      amount = 0.1;
    } else if (pair.from === 'USDT') {
      amount = 0.1;
    } else {
      amount = 0.1;
    }
    const fromTokenSymbol = pair.from;
    const toTokenSymbol = pair.to;

    logger.step(`[Swap ${swapIndex + 1}] ${amount} ${fromTokenSymbol} → ${toTokenSymbol} (format working bot)`);

    const decimals = tokenDecimals[fromTokenSymbol];
    const fromTokenAddress = tokens[fromTokenSymbol];
    const tokenContract = new ethers.Contract(fromTokenAddress, erc20Abi, provider);
    const balance = await tokenContract.balanceOf(wallet.address);
    const requiredAmount = ethers.parseUnits(amount.toString(), decimals);

    if (balance < requiredAmount) {
      logger.warn(`[Swap ${swapIndex + 1}] Saldo ${fromTokenSymbol} tidak cukup`);
      return;
    }

    logger.balance(`[Swap ${swapIndex + 1}] Saldo ${fromTokenSymbol}: ${ethers.formatUnits(balance, decimals)}`);

    if (!(await checkBalanceAndApproval(wallet, fromTokenAddress, fromTokenSymbol, amount, decimals, contractAddress))) {
      return;
    }

    const swapCalldata = getSwapCalldata(pair, amount, wallet.address);
    if (!swapCalldata || swapCalldata.length === 0) {
      logger.error(`[Swap ${swapIndex + 1}] Data swap tidak valid`);
      return;
    }

    try {
      const mainContract = new ethers.Contract(contractAddress, contractAbi, wallet);
      const gasLimit = ethers.toBigInt(300000);
      const deadline = ethers.toBigInt(Math.floor(Date.now() / 1000) + 600);

      logger.loading(`[Swap ${swapIndex + 1}] Mengirim transaksi swap...`);
      
      const nonce = await provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = mainContract['multicall'](deadline, swapCalldata, {
        gasLimit: gasLimit,
        gasPrice: ethers.toBigInt(1),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 25000);
      logger.loading(`[Swap ${swapIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      try {
        const receipt = await waitForReceipt(tx, provider, 6);
        if (receipt && receipt.status === 1) {
          logger.tx(`[Swap ${swapIndex + 1}] BERHASIL! TxHash: ${receipt.hash}`);
          logger.info(`[Swap ${swapIndex + 1}] Cek dashboard untuk verifikasi task`);
        } else {
          logger.error(`[Swap ${swapIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
          logger.error(`[Swap ${swapIndex + 1}] Cek explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
        }
      } catch (receiptError) {
        logger.success(`[Swap ${swapIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
        logger.info(`[Swap ${swapIndex + 1}] Cek manual: https://testnet.pharosscan.xyz/tx/${tx.hash}`);
      }

      await sleep(3000);

    } catch (txError) {
      logger.error(`[Swap ${swapIndex + 1}] Error: ${txError.message.substring(0, 100)}`);
      await sleep(5000);
    }

  } catch (error) {
    logger.error(`[Swap ${swapIndex + 1}] GAGAL: ${error.message.substring(0, 100)}`);
    await sleep(5000);
  }
};

const addLiquidity = async (wallet, provider, lpIndex) => {
  try {
    logger.step(`[LP ${lpIndex + 1}] Mempersiapkan likuiditas dengan increaseLiquidity (sesuai transaksi manual)...`);

    const tokenSymbol = 'USDT';
    const amount = 0.1;
    const decimals = tokenDecimals.USDT;
    const existingTokenId = 318407;
    
    logger.info(`[LP ${lpIndex + 1}] Method: increaseLiquidity (sama dengan manual)`);
    logger.balance(`[LP ${lpIndex + 1}] Token: ${amount} ${tokenSymbol}`);
    logger.info(`[LP ${lpIndex + 1}] TokenId: ${existingTokenId} (dari transaksi manual)`);
    const tokenContract = new ethers.Contract(tokens.USDT, erc20Abi, provider);
    const balance = await tokenContract.balanceOf(wallet.address);
    const requiredAmount = ethers.parseUnits(amount.toString(), decimals);

    logger.balance(`[LP ${lpIndex + 1}] Saldo ${tokenSymbol}: ${ethers.formatUnits(balance, decimals)}, Required: ${amount}`);

    if (balance < requiredAmount) {
      logger.warn(`[LP ${lpIndex + 1}] Saldo ${tokenSymbol} tidak cukup untuk increaseLiquidity`);
      await performSwap(wallet, provider, lpIndex);
      return;
    }

    if (!(await checkBalanceAndApproval(wallet, tokens.USDT, tokenSymbol, amount, decimals, positionManagerAddress))) {
      return;
    }
    const deadline = Math.floor(Date.now() / 1000) + 1800;
    
    const increaseLiquidityParams = {
      tokenId: existingTokenId,
      amount0Desired: ethers.toBigInt(0),
      amount1Desired: requiredAmount,
      amount0Min: ethers.toBigInt(0),
      amount1Min: ethers.toBigInt(0), 
      deadline: deadline
    };

    logger.info(`[LP ${lpIndex + 1}] IncreaseLiquidity params:`);
    logger.info(`[LP ${lpIndex + 1}] → TokenId: ${existingTokenId}`);
    logger.info(`[LP ${lpIndex + 1}] → Amount1Desired: ${ethers.formatUnits(requiredAmount, decimals)} ${tokenSymbol}`);
    logger.info(`[LP ${lpIndex + 1}] → Deadline: ${new Date(deadline * 1000).toISOString()}`);

    try {
      const positionManager = new ethers.Contract(positionManagerAddress, positionManagerAbi, wallet);
      const gasLimit = ethers.toBigInt(250000);

      logger.loading(`[LP ${lpIndex + 1}] Mengirim transaksi increaseLiquidity...`);
      
      const nonce = await wallet.provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = positionManager.increaseLiquidity(increaseLiquidityParams, {
        gasLimit: gasLimit,
        gasPrice: ethers.toBigInt(1),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 35000);
      logger.loading(`[LP ${lpIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      try {
        const receipt = await waitForReceipt(tx, provider, 8);
        if (receipt && receipt.status === 1) {
          logger.tx(`[LP ${lpIndex + 1}] BERHASIL! IncreaseLiquidity TxHash: ${receipt.hash}`);
          logger.success(`[LP ${lpIndex + 1}] Liquidity berhasil ditambahkan ke position ${existingTokenId}!`);
          logger.info(`[LP ${lpIndex + 1}] Cek dashboard untuk verifikasi task`);
          logger.gas(`[LP ${lpIndex + 1}] Gas used: ${receipt.gasUsed} / ${gasLimit}`);
        } else {
          logger.error(`[LP ${lpIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
          logger.error(`[LP ${lpIndex + 1}] Cek explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
          
          logger.warn(`[LP ${lpIndex + 1}] Mencoba mint LP baru sebagai fallback...`);
          await addLiquidityMint(wallet, provider, lpIndex);
        }
      } catch (receiptError) {
        logger.success(`[LP ${lpIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
        logger.info(`[LP ${lpIndex + 1}] Cek manual: https://testnet.pharosscan.xyz/tx/${tx.hash}`);
      }

      await sleep(3000);

    } catch (txError) {
      logger.error(`[LP ${lpIndex + 1}] IncreaseLiquidity Error: ${txError.message.substring(0, 150)}`);
      
      if (txError.message.includes('Invalid token ID')) {
        logger.error(`[LP ${lpIndex + 1}] Error: TokenId ${existingTokenId} tidak valid atau tidak dimiliki wallet ini`);
        logger.warn(`[LP ${lpIndex + 1}] Mencoba mint LP baru...`);
        await addLiquidityMint(wallet, provider, lpIndex);
      } else if (txError.message.includes('INSUFFICIENT_FUNDS')) {
        logger.error(`[LP ${lpIndex + 1}] Error: Saldo tidak cukup untuk gas`);
      } else if (txError.message.includes('execution reverted')) {
        logger.error(`[LP ${lpIndex + 1}] Error: Contract execution reverted`);
        await addLiquidityMint(wallet, provider, lpIndex);
      } else {
        logger.warn(`[LP ${lpIndex + 1}] Mencoba swap sebagai alternatif...`);
        await performSwap(wallet, provider, lpIndex);
      }
    }

  } catch (error) {
    logger.error(`[LP ${lpIndex + 1}] GAGAL: ${error.message.substring(0, 100)}`);
    await performSwap(wallet, provider, lpIndex);
  }
};

const addLiquidityMint = async (wallet, provider, lpIndex) => {
  try {
    logger.step(`[LP ${lpIndex + 1}] Fallback: Mint LP baru WPHRS-USDC...`);

    const wphrsAmount = 0.001; 
    const usdcAmount = 0.5;
    const feeTier = 3000;

    logger.balance(`[LP ${lpIndex + 1}] Mint amounts: ${wphrsAmount} WPHRS + ${usdcAmount} USDC`);

    const wphrsContract = new ethers.Contract(tokens.WPHRS, erc20Abi, provider);
    const usdcContract = new ethers.Contract(tokens.USDC, erc20Abi, provider);

    const wphrsBalance = await wphrsContract.balanceOf(wallet.address);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);

    const requiredWphrs = ethers.parseUnits(wphrsAmount.toString(), 18);
    const requiredUsdc = ethers.parseUnits(usdcAmount.toString(), 18);

    if (wphrsBalance < requiredWphrs || usdcBalance < requiredUsdc) {
      logger.warn(`[LP ${lpIndex + 1}] Saldo tidak cukup untuk mint LP`);
      await performSwap(wallet, provider, lpIndex);
      return;
    }

    if (!(await checkBalanceAndApproval(wallet, tokens.WPHRS, 'WPHRS', wphrsAmount, 18, positionManagerAddress))) {
      return;
    }
    await sleep(2000);
    if (!(await checkBalanceAndApproval(wallet, tokens.USDC, 'USDC', usdcAmount, 18, positionManagerAddress))) {
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const currentTick = 61264;
    
    const tickSpacing = 60;
    const tickLower = Math.floor((currentTick - 3000) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((currentTick + 3000) / tickSpacing) * tickSpacing;

    const token0 = tokens.WPHRS < tokens.USDC ? tokens.WPHRS : tokens.USDC;
    const token1 = tokens.WPHRS < tokens.USDC ? tokens.USDC : tokens.WPHRS;
    const amount0Desired = tokens.WPHRS < tokens.USDC ? requiredWphrs : requiredUsdc;
    const amount1Desired = tokens.WPHRS < tokens.USDC ? requiredUsdc : requiredWphrs;

    const mintParams = {
      token0: token0,
      token1: token1,
      fee: feeTier,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: ethers.toBigInt(0),
      amount1Min: ethers.toBigInt(0),
      recipient: wallet.address,
      deadline: deadline
    };

    try {
      const positionManager = new ethers.Contract(positionManagerAddress, positionManagerAbi, wallet);
      const gasLimit = ethers.toBigInt(600000);

      logger.loading(`[LP ${lpIndex + 1}] Mengirim transaksi mint LP...`);
      
      const nonce = await wallet.provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = positionManager.mint(mintParams, {
        gasLimit: gasLimit,
        gasPrice: ethers.toBigInt(1),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 40000);
      logger.loading(`[LP ${lpIndex + 1}] Mint transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      const receipt = await waitForReceipt(tx, provider, 8);
      if (receipt && receipt.status === 1) {
        logger.tx(`[LP ${lpIndex + 1}] MINT BERHASIL! TxHash: ${receipt.hash}`);
        logger.info(`[LP ${lpIndex + 1}] Cek dashboard untuk verifikasi task`);
      } else {
        logger.error(`[LP ${lpIndex + 1}] MINT GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
      }

    } catch (mintError) {
      logger.error(`[LP ${lpIndex + 1}] Mint Error: ${mintError.message.substring(0, 100)}`);
      await performSwap(wallet, provider, lpIndex);
    }

  } catch (error) {
    logger.error(`[LP ${lpIndex + 1}] Mint Fallback GAGAL: ${error.message.substring(0, 100)}`);
    await performSwap(wallet, provider, lpIndex);
  }
};

const claimFaucet = async (wallet, proxy = null) => {
  try {
    logger.step(`Mengecek faucet untuk: ${wallet.address}`);

    const message = "pharos";
    const signature = await wallet.signMessage(message);

    const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
    
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer null',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://testnet.pharosnetwork.xyz',
      'pragma': 'no-cache',
      'referer': 'https://testnet.pharosnetwork.xyz/',
      'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    };

    const axiosConfig = {
      method: 'post',
      url: loginUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 25000,
    };

    await sleep(Math.random() * 3000 + 2000);

    logger.loading('Login untuk faucet...');
    const loginResponse = await axios(axiosConfig);
    const loginData = loginResponse.data;

    if (loginData.code !== 0 || !loginData.data?.jwt) {
      throw new Error(`Login gagal: ${loginData.msg || 'No JWT'}`);
    }

    const jwt = loginData.data.jwt;
    const statusHeaders = { ...headers, authorization: `Bearer ${jwt}` };

    logger.loading('Mengecek status faucet...');
    const statusResponse = await axios({
      method: 'get',
      url: `https://api.pharosnetwork.xyz/faucet/status?address=${wallet.address}`,
      headers: statusHeaders,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 20000,
    });

    const statusData = statusResponse.data;
    if (statusData.code !== 0 || !statusData.data) {
      throw new Error(`Status check gagal: ${statusData.msg}`);
    }

    if (!statusData.data.is_able_to_faucet) {
      const nextTime = new Date(statusData.data.avaliable_timestamp * 1000).toLocaleString('en-US', { timeZone: 'Asia/Makassar' });
      logger.warn(`Faucet cooldown sampai: ${nextTime}`);
      return false;
    }

    logger.loading('Mengklaim faucet...');
    const claimResponse = await axios({
      method: 'post',
      url: `https://api.pharosnetwork.xyz/faucet/daily?address=${wallet.address}`,
      headers: statusHeaders,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 20000,
    });

    if (claimResponse.data.code === 0) {
      logger.success(`Faucet berhasil diklaim`);
      return true;
    } else {
      throw new Error(`Claim gagal: ${claimResponse.data.msg}`);
    }

  } catch (error) {
    logger.error(`Faucet gagal: ${error.message.substring(0, 100)}`);
    return false;
  }
};

const performCheckIn = async (wallet, proxy = null) => {
  try {
    logger.step(`Check-in untuk: ${wallet.address}`);

    const message = "pharos";
    const signature = await wallet.signMessage(message);

    const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
    
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer null',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://testnet.pharosnetwork.xyz',
      'pragma': 'no-cache',
      'referer': 'https://testnet.pharosnetwork.xyz/',
      'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    };

    const axiosConfig = {
      method: 'post',
      url: loginUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 25000,
    };

    await sleep(Math.random() * 3000 + 2000);

    logger.loading('Login untuk check-in...');
    const loginResponse = await axios(axiosConfig);
    const loginData = loginResponse.data;

    if (loginData.code !== 0 || !loginData.data?.jwt) {
      throw new Error(`Login gagal: ${loginData.msg || 'No JWT'}`);
    }

    const jwt = loginData.data.jwt;
    const checkInHeaders = { ...headers, authorization: `Bearer ${jwt}` };

    logger.loading('Mengirim permintaan check-in...');
    const checkInResponse = await axios({
      method: 'post',
      url: `https://api.pharosnetwork.xyz/sign/in?address=${wallet.address}`,
      headers: checkInHeaders,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      timeout: 20000,
    });

    if (checkInResponse.data.code === 0) {
      logger.success(`Check-in berhasil`);
      return true;
    } else {
      const alreadyCheckedInMessage = "you have already signed in today";
      if (checkInResponse.data.msg && checkInResponse.data.msg.toLowerCase().includes(alreadyCheckedInMessage)) {
        logger.warn(`Sudah check-in hari ini`);
        return false;
      } else {
        throw new Error(`Check-in gagal: ${checkInResponse.data.msg}`);
      }
    }

  } catch (error) {
    logger.error(`Check-in gagal: ${error.message.substring(0, 100)}`);
    return false;
  }
};

const countdown = async (minutes) => {
  const seconds = minutes * 60;
  logger.info(`⏱ Countdown ${minutes} menit...`);

  for (let i = seconds; i >= 0; i--) {
    const mins = Math.floor(i / 60);
    const secs = i % 60;
    process.stdout.write(`\r${colors.cyan}⏳ Sisa: ${mins}m ${secs}s${colors.reset} `);
    await sleep(1000);
  }
  console.log('\n✓ Countdown selesai!');
};

const main = async () => {
  logger.banner();

  const proxies = loadProxies();
  const MAX_KEYS = 15;

  const privateKeys = [];
  for (let i = 1; i <= MAX_KEYS; i++) {
    const key = process.env[`PRIVATE_KEY_${i}`];
    if (key && key.trim() !== '') {
      privateKeys.push(key.trim());
    }
  }

  if (!privateKeys.length) {
    logger.error('Tidak ada private key di .env');
    return;
  }

  logger.info(`Memuat ${privateKeys.length} private key.`);
  logger.divider();
  logger.status(`⚡ ENHANCED TRACKING SYSTEM (HAR-Based):`);
  logger.info(`  ⟐ Google Analytics sendToken event tracking (exact HAR match)`);
  logger.info(`  ◎ Auto task verification dengan JSON body: {address, task_id: 103, tx_hash}`);
  logger.info(`  ⟦ Full API sequence: verify → profile → tasks (seperti manual) ⟧`);
  logger.info(`  ◊ Headers & payloads disesuaikan dengan browser HAR`);
  logger.divider();
  logger.status(`⚡ LIQUIDITY APPROACH: Based on manual transaction analysis`);
  logger.info(`Primary LP: increaseLiquidity(tokenId: 318407) + 0.1 USDT • Method: 0x219f5d17`);
  logger.info(`Fallback LP: mint() WPHRS-USDC jika increaseLiquidity gagal`);
  logger.info(`Swap: Function 0x04e45aaf • Fee 0.05% • WPHRS-USDC pairs`);
  logger.gas(`Gas: 1 Gwei (sesuai manual) • Position Manager: ${positionManagerAddress.substring(0,10)}...`);
  logger.warn(`Bot akan coba increaseLiquidity dulu, fallback ke mint jika gagal`);
  logger.divider();

  if (proxies.length > 0) {
    logger.info(`Memuat ${proxies.length} proxy.`);
  } else {
    logger.warn('Mode langsung (tanpa proxy).');
  }

  const numSwapsPerWallet = parseInt(process.env.NUM_SWAPS_PER_WALLET) || 3;
  const isSwapEnabled = process.env.ENABLE_SWAP?.toLowerCase() === 'true';
  const numLpPerWallet = parseInt(process.env.NUM_LP_PER_WALLET) || 1;
  const isLpEnabled = process.env.ENABLE_LP?.toLowerCase() === 'true';
  const numTransfersPerWallet = parseInt(process.env.NUM_TRANSFERS_PER_WALLET) || 3;
  const delayBetweenActionsMs = (parseInt(process.env.DELAY_ACTIONS_SEC) || 10) * 1000;
  const delayBetweenWalletsMs = (parseInt(process.env.DELAY_WALLETS_SEC) || 30) * 1000;
  const mainLoopDelayMinutes = parseInt(process.env.MAIN_LOOP_DELAY_MIN) || 45;

  logger.info(`⚙ Konfigurasi: Swaps=${numSwapsPerWallet}, LP=${numLpPerWallet}, Transfers=${numTransfersPerWallet}, ActionDelay=${delayBetweenActionsMs/1000}s, WalletDelay=${delayBetweenWalletsMs/1000}s, LoopDelay=${mainLoopDelayMinutes}min`);

  let walletIndex = 0;
  
  while (true) {
    for (const privateKey of privateKeys) {
      walletIndex++;
      logger.divider();
      logger.status(`\n⟦ Wallet ${walletIndex}/${privateKeys.length} ⟧`);
      
      try {
        const proxy = proxies.length ? getRandomProxy(proxies) : null;
        const provider = await setupProvider(proxy);
        const wallet = new ethers.Wallet(privateKey, provider);

        logger.wallet(`Wallet: ${wallet.address}`);
        
        logger.status(`⟐ Initial wallet progress check...`);
        await checkWalletProgress(wallet, proxy);
        await sleep(2000);
        
        try {
          const balance = await provider.getBalance(wallet.address);
          logger.balance(`Balance: ${ethers.formatEther(balance)} PHRS`);
        } catch (balanceError) {
          logger.warn(`Tidak bisa cek balance: ${balanceError.message.substring(0, 50)}`);
        }
        
        await sleep(2000);

        await claimFaucet(wallet, proxy);
        await sleep(delayBetweenActionsMs);
        await performCheckIn(wallet, proxy);
        await sleep(delayBetweenActionsMs);

        logger.step(`Memulai ${numTransfersPerWallet} transfer PHRS...`);
        for (let i = 0; i < numTransfersPerWallet; i++) {
          await transferPHRS(wallet, provider, i, proxy);
          if (i < numTransfersPerWallet - 1) {
            await sleep(delayBetweenActionsMs);
          }
        }
        logger.success(`${numTransfersPerWallet} transfer selesai.`);
        await sleep(delayBetweenActionsMs);

        if (isSwapEnabled) {
          logger.step(`Memulai ${numSwapsPerWallet} swap...`);
          for (let i = 0; i < numSwapsPerWallet; i++) {
            await performSwap(wallet, provider, i);
            if (i < numSwapsPerWallet - 1) {
              await sleep(delayBetweenActionsMs);
            }
          }
          logger.success(`${numSwapsPerWallet} swap selesai.`);
        } else {
          logger.warn('Swap dinonaktifkan (ENABLE_SWAP=false).');
        }

        await sleep(delayBetweenActionsMs);

        if (isLpEnabled) {
          logger.step(`Memulai ${numLpPerWallet} LP...`);
          
          let shouldAttemptLP = true;
          
          if (shouldAttemptLP) {
            for (let i = 0; i < numLpPerWallet; i++) {
              await addLiquidity(wallet, provider, i);
              if (i < numLpPerWallet - 1) {
                await sleep(delayBetweenActionsMs);
              }
            }
            logger.success(`${numLpPerWallet} LP attempt selesai.`);
          } else {
            logger.warn('LP dilewati karena Position Manager issues. Gunakan ENABLE_LP=false jika terus bermasalah.');
          }
        } else {
          logger.warn('LP dinonaktifkan (ENABLE_LP=false).');
        }
        
        logger.status(`⟐ Final wallet progress summary...`);
        await checkWalletProgress(wallet, proxy);
        logger.success(`◊ Wallet ${walletIndex} completed all tasks!`);
        
        if (privateKeys.length > 1 && walletIndex < privateKeys.length) {
          logger.info(`⏳ Delay ${delayBetweenWalletsMs/1000}s sebelum wallet berikutnya...`);
          await sleep(delayBetweenWalletsMs);
        }

      } catch (walletError) {
        logger.error(`Wallet ${walletIndex} error: ${walletError.message.substring(0, 100)}`);
        logger.warn('Melanjutkan ke wallet berikutnya...');
        await sleep(5000);
      }
    }
    
    walletIndex = 0;
    logger.divider();
    logger.success('◊ Semua wallet selesai dalam siklus ini!');
    await countdown(mainLoopDelayMinutes);
  }
};

main().catch(error => {
  logger.error(`Bot error kritis: ${error.message}`);
  console.error(error);
  process.exit(1);
});