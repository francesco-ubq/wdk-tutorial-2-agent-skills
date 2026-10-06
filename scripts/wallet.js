import { readFileSync } from 'node:fs'
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'

// Public RPCs from the skill's references/chains.md (rate-limited, fine for read-only use)
const RPC = {
  ethereum: 'https://eth.drpc.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  electrum: { host: 'electrum.blockstream.info', port: 50001 },
  tron: 'https://api.trongrid.io'
}

// USDt0 on Arbitrum (6 decimals), from references/wallet-evm.md
const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
const USDT0_DECIMALS = 6
const TRANSFER_AMOUNT = 1_000_000n // 1 USDt0

const formatUnits = (value, decimals) => {
  const base = 10n ** BigInt(decimals)
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / base}${frac ? '.' + frac : ''}`
}

const seedFile = process.env.SEED_FILE
if (!seedFile) {
  console.error('SEED_FILE is not set')
  process.exit(1)
}

const accounts = []
let wdk

try {
  // The seed phrase stays in this expression; it is never logged or copied anywhere.
  wdk = new WDK(readFileSync(seedFile, 'utf8').trim())
    .registerWallet('ethereum', WalletManagerEvm, { provider: RPC.ethereum })
    .registerWallet('arbitrum', WalletManagerEvm, { provider: RPC.arbitrum })
    .registerWallet('bitcoin', WalletManagerBtc, { ...RPC.electrum, network: 'bitcoin' })
    .registerWallet('tron', WalletManagerTron, { provider: RPC.tron })

  // 1. account 0 on each chain
  const chains = ['ethereum', 'arbitrum', 'bitcoin', 'tron']
  console.log('Account 0 addresses')
  for (const chain of chains) {
    const account = await wdk.getAccount(chain, 0)
    accounts.push(account)
    console.log(`  ${chain.padEnd(9)} ${await account.getAddress()}`)
  }
  const arbitrum = accounts[1]

  // 2. native ETH balance on Arbitrum
  const eth = await arbitrum.getBalance()
  console.log(`\nArbitrum ETH balance   ${formatUnits(eth, 18)} ETH`)

  // 3. USDt0 token balance on Arbitrum
  const usdt0 = await arbitrum.getTokenBalance(USDT0_ARBITRUM)
  console.log(`Arbitrum USDt0 balance ${formatUnits(usdt0, USDT0_DECIMALS)} USDt0`)

  // 4. quote only: 1 USDt0 to account index 1 (no transfer() is ever called)
  const recipientAccount = await wdk.getAccount('arbitrum', 1)
  accounts.push(recipientAccount)
  const recipient = await recipientAccount.getAddress()
  const quote = await arbitrum.quoteTransfer({
    token: USDT0_ARBITRUM,
    recipient,
    amount: TRANSFER_AMOUNT
  })
  console.log(`\nQuote: 1 USDt0 -> account 1 (${recipient})`)
  console.log(`  estimated fee        ${formatUnits(quote.fee, 18)} ETH`)
} catch (err) {
  console.error(`wallet.js failed: ${err.message}`)
  process.exitCode = 1
} finally {
  // 5. clear key material from every account and wallet
  for (const account of accounts) account.dispose()
  wdk?.dispose()
}
