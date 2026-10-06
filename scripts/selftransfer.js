// A real, confirmed USDt0 transfer on Arbitrum One — from the demo wallet to ITSELF.
//
// The user asked to film a transaction that actually confirms on a block explorer. A
// self-transfer is the smallest honest way to do that: the tokens come back, so the only real
// cost is gas, and the resulting tx is a genuine on-chain transfer that Arbiscan will show.
//
// The recipient is asserted to equal the sender before anything is signed. If that check ever
// fails the script exits without sending. The seed is read from SEED_FILE and never printed.
import { readFileSync } from 'node:fs'
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const RPC_ARBITRUM = 'https://arb1.arbitrum.io/rpc'
const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
const USDT0_DECIMALS = 6
const AMOUNT = 100_000n // 0.1 USDt0 — dust, and it returns to the same account

const formatUnits = (value, decimals) => {
  const base = 10n ** BigInt(decimals)
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / base}${frac ? '.' + frac : ''}`
}

const rpc = async (method, params) => {
  const r = await fetch(RPC_ARBITRUM, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  return (await r.json()).result
}

const seedFile = process.env.SEED_FILE
if (!seedFile) {
  console.error('SEED_FILE is not set')
  process.exit(1)
}

const accounts = []
let wdk

try {
  // The seed phrase stays inside this expression; it is never logged or copied anywhere.
  wdk = new WDK(readFileSync(seedFile, 'utf8').trim())
    .registerWallet('arbitrum', WalletManagerEvm, { provider: RPC_ARBITRUM })

  const account = await wdk.getAccount('arbitrum', 0)
  accounts.push(account)
  const self = await account.getAddress()
  console.log(`Account 0 on Arbitrum One\n  ${self}`)

  // 1. what we have to work with
  const eth = await account.getBalance()
  const usdt0 = await account.getTokenBalance(USDT0_ARBITRUM)
  console.log(`\nBefore`)
  console.log(`  ETH    ${formatUnits(eth, 18)}`)
  console.log(`  USDt0  ${formatUnits(usdt0, USDT0_DECIMALS)}`)

  // 2. the guard: this script may only ever pay the wallet itself
  const recipient = self
  if (recipient.toLowerCase() !== self.toLowerCase()) {
    throw new Error('recipient is not the wallet itself — refusing to send')
  }
  if (usdt0 < AMOUNT) throw new Error(`not enough USDt0: have ${usdt0}, need ${AMOUNT}`)

  // 3. quote before sending, same as the read-only run does
  const quote = await account.quoteTransfer({ token: USDT0_ARBITRUM, recipient, amount: AMOUNT })
  console.log(`\nQuote: ${formatUnits(AMOUNT, USDT0_DECIMALS)} USDt0 -> self`)
  console.log(`  estimated fee  ${formatUnits(quote.fee, 18)} ETH`)
  if (eth <= quote.fee) throw new Error('not enough ETH for gas')

  // 4. send it
  const sent = await account.transfer({ token: USDT0_ARBITRUM, recipient, amount: AMOUNT })
  console.log(`\nSent`)
  console.log(`  tx hash  ${sent.hash}`)

  // 5. wait for the receipt, polling the chain directly
  let receipt = null
  for (let i = 0; i < 60 && !receipt; i++) {
    receipt = await rpc('eth_getTransactionReceipt', [sent.hash])
    if (!receipt) await new Promise((r) => setTimeout(r, 2000))
  }
  if (!receipt) throw new Error('no receipt after 120 s')

  const block = parseInt(receipt.blockNumber, 16)
  const gasUsed = BigInt(receipt.gasUsed)
  const gasPrice = BigInt(receipt.effectiveGasPrice)
  console.log(`\nConfirmed`)
  console.log(`  status      ${receipt.status === '0x1' ? 'success' : 'FAILED'}`)
  console.log(`  block       ${block}`)
  console.log(`  gas used    ${gasUsed}`)
  console.log(`  fee paid    ${formatUnits(gasUsed * gasPrice, 18)} ETH`)
  console.log(`  explorer    https://arbiscan.io/tx/${sent.hash}`)

  const after = await account.getTokenBalance(USDT0_ARBITRUM)
  console.log(`\nAfter`)
  console.log(`  USDt0  ${formatUnits(after, USDT0_DECIMALS)}  (unchanged — it paid itself)`)
} catch (err) {
  console.error(`selftransfer.js failed: ${err.message}`)
  process.exitCode = 1
} finally {
  for (const account of accounts) account.dispose()
  wdk?.dispose()
}
