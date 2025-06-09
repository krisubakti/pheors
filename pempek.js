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
  bold: '\x1b[1m',
  bright: '\x1b[1m',
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  wallet: (msg) => console.log(`${colors.yellow}[➤] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.blue}${colors.bold}`);
    console.log('████████ ███████ ███      ███ ████████ ███████ ██   ██    ██       █████  ██   ██  █████  ████████ ');
    console.log('██    ██ ██      ████    ████ ██    ██ ██      ██  ██     ██      ██   ██ ██   ██ ██   ██    ██    ');
    console.log('████████ █████   ██ ██  ██ ██ ████████ █████   █████      ██      ███████ ███████ ███████    ██    ');
    console.log('██       ██      ██   ██   ██ ██       ██      ██  ██     ██      ██   ██ ██   ██ ██   ██    ██    ');
    console.log('██       ███████ ██        ██ ██       ███████ ██   ██    ███████ ██   ██ ██   ██ ██   ██    ██    ');
    console.log('                                                                                                  ');
    console.log('                                                                                                  ');
  },
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Simple function to try transaction with timeout
const tryTransactionWithTimeout = async (txPromise, timeoutMs = 25000) => {
  return Promise.race([
    txPromise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Transaction timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Simple receipt checker
const waitForReceipt = async (tx, provider, maxAttempts = 6) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sleep(3000); // Wait 3 seconds between attempts
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt && receipt.blockNumber) {
        return receipt;
      }
    } catch (error) {
      // Continue trying
    }
  }
  throw new Error('Receipt not found after multiple attempts');
};

const networkConfig = {
  name: 'Pharos Testnet',
  chainId: 688688,
  primaryRpc: 'https://testnet.dplabs-internal.com',  // ← Update ini
  fallbackRpc: 'https://testnet.dplabs-internal.com', // ← Dan ini
  currencySymbol: 'PHRS',
};

const tokens = {
  USDC: '0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37',
  WPHRS: '0x76aaada469d23216be5f7c596fa25f282ff9b364',
};

const contractAddress = '0x1a4de519154ae51200b0ad7c90f7fac75547888a';
const positionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

const tokenDecimals = {
  WPHRS: 18,
  USDC: 18,
};

const contractAbi = [
  'function multicall(uint256 deadlineOrFlags, bytes[] calldata data) payable',
];

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) public returns (bool)',
];

const positionManagerAbi = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
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

// Simplified provider setup - always try new RPC first
const setupProvider = (proxy = null) => {
  const providerOptions = {
    timeout: 30000,
    retryCount: 2,
    retryDelay: 3000,
  };

  // Always try the new RPC first
  try {
    logger.info(`Menggunakan RPC baru: ${networkConfig.primaryRpc}${proxy ? ' dengan proxy' : ' tanpa proxy'}`);
    
    if (proxy) {
      const agent = new HttpsProxyAgent(proxy);
      return new ethers.JsonRpcProvider(networkConfig.primaryRpc, {
        chainId: networkConfig.chainId,
        name: networkConfig.name,
      }, providerOptions);
    } else {
      return new ethers.JsonRpcProvider(networkConfig.primaryRpc, {
        chainId: networkConfig.chainId,
        name: networkConfig.name,
      }, providerOptions);
    }
  } catch (error) {
    logger.warn(`RPC baru gagal, mencoba fallback: ${error.message}`);
    
    // Fallback to old RPC
    if (proxy) {
      const agent = new HttpsProxyAgent(proxy);
      return new ethers.JsonRpcProvider(networkConfig.fallbackRpc, {
        chainId: networkConfig.chainId,
        name: networkConfig.name,
      }, providerOptions);
    } else {
      return new ethers.JsonRpcProvider(networkConfig.fallbackRpc, {
        chainId: networkConfig.chainId,
        name: networkConfig.name,
      }, providerOptions);
    }
  }
};

const pairOptions = [
  { id: 1, from: 'WPHRS', to: 'USDC' },
  { id: 2, from: 'USDC', to: 'WPHRS' },
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
        gasPrice: ethers.toBigInt(0),
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

const getMulticallData = (pair, amount, walletAddress) => {
  try {
    const fromTokenSymbol = pair.from;
    const toTokenSymbol = pair.to;
    const decimals = tokenDecimals[fromTokenSymbol];
    const scaledAmount = ethers.parseUnits(amount.toString(), decimals);

    const swapFunctionSelector = '0x04e45aaf';
    
    let innerCallData;

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
    } else {
      logger.error(`Pair tidak valid: ${fromTokenSymbol} -> ${toTokenSymbol}`);
      return [];
    }
    return [ethers.concat([swapFunctionSelector, innerCallData])];

  } catch (error) {
    logger.error(`Gagal membuat multicall data: ${error.message}`);
    return [];
  }
};

const transferPHRS = async (wallet, provider, transferIndex) => {
  try {
    const min = 0.000009;
    const max = 0.001000;
    const amount = parseFloat((Math.random() * (max - min) + min).toFixed(18));

    const randomWallet = ethers.Wallet.createRandom();
    const toAddress = randomWallet.address;
    logger.step(`[Transfer ${transferIndex + 1}] Menyiapkan: ${amount.toFixed(6)} PHRS ke ${toAddress}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    const required = ethers.parseEther(amount.toFixed(18));

    if (balance < required) {
      logger.warn(`[Transfer ${transferIndex + 1}] Saldo tidak cukup: ${ethers.formatEther(balance)}`);
      return;
    }

    try {
      // Send transaction with timeout
      const nonce = await provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = wallet.sendTransaction({
        to: toAddress,
        value: required,
        gasLimit: ethers.toBigInt(21000),
        gasPrice: ethers.toBigInt(0),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 20000);
      logger.loading(`[Transfer ${transferIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);
      
      // Wait for receipt with timeout
      try {
        const receipt = await waitForReceipt(tx, provider, 5);
        if (receipt && receipt.status === 1) {
          logger.success(`[Transfer ${transferIndex + 1}] BERHASIL! TxHash: ${receipt.hash}`);
        } else {
          logger.error(`[Transfer ${transferIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
        }
      } catch (receiptError) {
        logger.success(`[Transfer ${transferIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
      }
      
      await sleep(2000);
      
    } catch (txError) {
      logger.error(`[Transfer ${transferIndex + 1}] Error: ${txError.message.substring(0, 100)}`);
      await sleep(5000);
    }

  } catch (error) {
    logger.error(`[Transfer ${transferIndex + 1}] GAGAL: ${error.message.substring(0, 100)}`);
    await sleep(5000);
  }
};

const performSwap = async (wallet, provider, swapIndex) => {
  try {
    const pair = pairOptions[Math.floor(Math.random() * pairOptions.length)];
    const amount = pair.from === 'WPHRS' ? 0.001 : 0.1;
    const fromTokenSymbol = pair.from;
    const toTokenSymbol = pair.to;

    logger.step(`[Swap ${swapIndex + 1}] ${amount} ${fromTokenSymbol} -> ${toTokenSymbol}`);

    const decimals = tokenDecimals[fromTokenSymbol];
    const fromTokenAddress = tokens[fromTokenSymbol];

    // Check balance
    const tokenContract = new ethers.Contract(fromTokenAddress, erc20Abi, provider);
    const balance = await tokenContract.balanceOf(wallet.address);
    const requiredAmount = ethers.parseUnits(amount.toString(), decimals);

    if (balance < requiredAmount) {
      logger.warn(`[Swap ${swapIndex + 1}] Saldo ${fromTokenSymbol} tidak cukup`);
      return;
    }

    logger.info(`[Swap ${swapIndex + 1}] Saldo ${fromTokenSymbol}: ${ethers.formatUnits(balance, decimals)}`);

    // Check approval
    if (!(await checkBalanceAndApproval(wallet, fromTokenAddress, fromTokenSymbol, amount, decimals, contractAddress))) {
      return;
    }

    // Get multicall data
    const multicallPayload = getMulticallData(pair, amount, wallet.address);
    if (!multicallPayload || multicallPayload.length === 0) {
      logger.error(`[Swap ${swapIndex + 1}] Data multicall tidak valid`);
      return;
    }

    try {
      // Send swap transaction
      const mainContract = new ethers.Contract(contractAddress, contractAbi, wallet);
      const gasLimit = ethers.toBigInt(300000);
      const deadline = ethers.toBigInt(Math.floor(Date.now() / 1000) + 600);

      logger.loading(`[Swap ${swapIndex + 1}] Mengirim transaksi swap...`);
      
      const nonce = await provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = mainContract['multicall'](deadline, multicallPayload, {
        gasLimit: gasLimit,
        gasPrice: ethers.toBigInt(0),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 25000);
      logger.loading(`[Swap ${swapIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      // Wait for receipt
      try {
        const receipt = await waitForReceipt(tx, provider, 6);
        if (receipt && receipt.status === 1) {
          logger.success(`[Swap ${swapIndex + 1}] BERHASIL! TxHash: ${receipt.hash}`);
        } else {
          logger.error(`[Swap ${swapIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
        }
      } catch (receiptError) {
        logger.success(`[Swap ${swapIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
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
    logger.step(`[LP ${lpIndex + 1}] Mempersiapkan likuiditas WPHRS-USDC...`);

    const wphrsAmount = 0.001;
    const usdcAmount = 0.5;
    const feeTier = feeTiers[Math.floor(Math.random() * feeTiers.length)];

    logger.info(`[LP ${lpIndex + 1}] Fee tier: ${feeTier/10000}%`);

    // Check balances
    const wphrsContract = new ethers.Contract(tokens.WPHRS, erc20Abi, provider);
    const usdcContract = new ethers.Contract(tokens.USDC, erc20Abi, provider);

    const wphrsBalance = await wphrsContract.balanceOf(wallet.address);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);

    const requiredWphrs = ethers.parseUnits(wphrsAmount.toString(), 18);
    const requiredUsdc = ethers.parseUnits(usdcAmount.toString(), 18);

    if (wphrsBalance < requiredWphrs || usdcBalance < requiredUsdc) {
      logger.warn(`[LP ${lpIndex + 1}] Saldo tidak cukup untuk LP`);
      // Fallback to swap instead
      await performSwap(wallet, provider, lpIndex);
      return;
    }

    // Approve tokens
    if (!(await checkBalanceAndApproval(wallet, tokens.WPHRS, 'WPHRS', wphrsAmount, 18, positionManagerAddress))) {
      return;
    }
    await sleep(3000);
    if (!(await checkBalanceAndApproval(wallet, tokens.USDC, 'USDC', usdcAmount, 18, positionManagerAddress))) {
      return;
    }

    // Setup mint parameters
    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const currentTick = 61264;
    
    let tickLower, tickUpper;
    if (feeTier === 500) {
      const tickSpacing = 10;
      tickLower = Math.floor((currentTick - 500) / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil((currentTick + 500) / tickSpacing) * tickSpacing;
    } else if (feeTier === 3000) {
      const tickSpacing = 60;
      tickLower = Math.floor((currentTick - 3000) / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil((currentTick + 3000) / tickSpacing) * tickSpacing;
    } else {
      const tickSpacing = 200;
      tickLower = Math.floor((currentTick - 10000) / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil((currentTick + 10000) / tickSpacing) * tickSpacing;
    }

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
      // Send LP transaction
      const positionManager = new ethers.Contract(positionManagerAddress, positionManagerAbi, wallet);
      const gasLimit = ethers.toBigInt(1000000);

      logger.loading(`[LP ${lpIndex + 1}] Mengirim transaksi LP...`);
      
      const nonce = await wallet.provider.getTransactionCount(wallet.address, 'latest');
      
      const txPromise = positionManager.mint(mintParams, {
        gasLimit: gasLimit,
        gasPrice: ethers.toBigInt(0),
        nonce: nonce,
      });

      const tx = await tryTransactionWithTimeout(txPromise, 35000);
      logger.loading(`[LP ${lpIndex + 1}] Transaksi dikirim (${tx.hash}). Menunggu konfirmasi...`);

      // Wait for receipt
      try {
        const receipt = await waitForReceipt(tx, provider, 8);
        if (receipt && receipt.status === 1) {
          logger.success(`[LP ${lpIndex + 1}] BERHASIL! TxHash: ${receipt.hash}`);
        } else {
          logger.error(`[LP ${lpIndex + 1}] GAGAL ON-CHAIN. TxHash: ${receipt.hash}`);
        }
      } catch (receiptError) {
        logger.success(`[LP ${lpIndex + 1}] Transaksi dikirim: ${tx.hash} (konfirmasi timeout)`);
      }

      await sleep(3000);

    } catch (txError) {
      logger.error(`[LP ${lpIndex + 1}] LP Error: ${txError.message.substring(0, 100)}`);
      logger.warn(`[LP ${lpIndex + 1}] Mencoba swap sebagai alternatif...`);
      await performSwap(wallet, provider, lpIndex);
    }

  } catch (error) {
    logger.error(`[LP ${lpIndex + 1}] GAGAL: ${error.message.substring(0, 100)}`);
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
  logger.info(`Countdown ${minutes} menit...`);

  for (let i = seconds; i >= 0; i--) {
    const mins = Math.floor(i / 60);
    const secs = i % 60;
    process.stdout.write(`\r${colors.cyan}Sisa: ${mins}m ${secs}s${colors.reset} `);
    await sleep(1000);
  }
  console.log('\nCountdown selesai!');
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

  logger.info(`Konfigurasi: Swaps=${numSwapsPerWallet}, LP=${numLpPerWallet}, Transfers=${numTransfersPerWallet}, ActionDelay=${delayBetweenActionsMs/1000}s, WalletDelay=${delayBetweenWalletsMs/1000}s, LoopDelay=${mainLoopDelayMinutes}min`);

  let walletIndex = 0;
  
  while (true) {
    for (const privateKey of privateKeys) {
      walletIndex++;
      logger.info(`\n--- Wallet ${walletIndex}/${privateKeys.length} ---`);
      
      try {
        const proxy = proxies.length ? getRandomProxy(proxies) : null;
        const provider = setupProvider(proxy);
        const wallet = new ethers.Wallet(privateKey, provider);

        logger.wallet(`Wallet: ${wallet.address}`);
        await sleep(2000);

        // Faucet
        await claimFaucet(wallet, proxy);
        await sleep(delayBetweenActionsMs);

        // Check-in
        await performCheckIn(wallet, proxy);
        await sleep(delayBetweenActionsMs);

        // Transfers
        logger.step(`Memulai ${numTransfersPerWallet} transfer PHRS...`);
        for (let i = 0; i < numTransfersPerWallet; i++) {
          await transferPHRS(wallet, provider, i);
          if (i < numTransfersPerWallet - 1) {
            await sleep(delayBetweenActionsMs);
          }
        }
        logger.success(`${numTransfersPerWallet} transfer selesai.`);
        await sleep(delayBetweenActionsMs);

        // Swaps
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

        // LP
        if (isLpEnabled) {
          logger.step(`Memulai ${numLpPerWallet} LP...`);
          for (let i = 0; i < numLpPerWallet; i++) {
            await addLiquidity(wallet, provider, i);
            if (i < numLpPerWallet - 1) {
              await sleep(delayBetweenActionsMs);
            }
          }
          logger.success(`${numLpPerWallet} LP selesai.`);
        } else {
          logger.warn('LP dinonaktifkan (ENABLE_LP=false).');
        }
        
        // Delay between wallets
        if (privateKeys.length > 1 && walletIndex < privateKeys.length) {
          logger.info(`Delay ${delayBetweenWalletsMs/1000}s sebelum wallet berikutnya...`);
          await sleep(delayBetweenWalletsMs);
        }

      } catch (walletError) {
        logger.error(`Wallet ${walletIndex} error: ${walletError.message.substring(0, 100)}`);
        logger.warn('Melanjutkan ke wallet berikutnya...');
        await sleep(5000);
      }
    }
    
    walletIndex = 0;
    logger.success('Semua wallet selesai dalam siklus ini!');
    await countdown(mainLoopDelayMinutes);
  }
};

main().catch(error => {
  logger.error(`Bot error kritis: ${error.message}`);
  console.error(error);
  process.exit(1);
});
